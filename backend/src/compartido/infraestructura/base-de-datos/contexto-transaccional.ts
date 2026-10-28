import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import type { UnidadDeTrabajo } from '../../aplicacion/puertos/unidad-de-trabajo.js';
import type { BaseDeDatos } from './base-de-datos.module.js';

export type Transaccion = Parameters<
  Parameters<BaseDeDatos['transaction']>[0]
>[0];

// Lo que reciben los repositorios para consultar: la transacción en curso o, si no hay, el pool.
export type Conexion = BaseDeDatos | Transaccion;

interface Estado {
  transaccion: Transaccion;
  alConfirmar: (() => void)[];
}

// Unidad de trabajo de Drizzle (M0 §4.8). La transacción abierta se guarda en un AsyncLocalStorage:
// todo lo que se ejecute dentro de `ejecutar` (aunque pase por varias funciones asíncronas) la ve
// sin recibirla como parámetro. Así el caso de uso no conoce Drizzle y los repositorios no cambian
// su firma.
export class ContextoTransaccional implements UnidadDeTrabajo {
  private readonly almacen = new AsyncLocalStorage<Estado>();
  private readonly registro = new Logger('UnidadDeTrabajo');

  constructor(private readonly bd: BaseDeDatos) {}

  // Si ya hay una transacción en curso, el trabajo se une a ella (una sola transacción por caso de
  // uso, aunque se aniden llamadas). Si `trabajo` lanza, se revierte todo y el error se propaga.
  async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    if (this.almacen.getStore() !== undefined) {
      return trabajo();
    }
    const alConfirmar: (() => void)[] = [];
    const resultado = await this.bd.transaction((transaccion) =>
      this.almacen.run({ transaccion, alConfirmar }, trabajo),
    );
    for (const accion of alConfirmar) {
      try {
        accion();
      } catch (error) {
        // El commit ya ocurrió: un fallo aquí no puede deshacerlo ni debe llegar al caso de uso.
        this.registro.error(
          `Falló una acción posterior al commit: ${(error as Error).message}`,
        );
      }
    }
    return resultado;
  }

  conexion(): Conexion {
    return this.almacen.getStore()?.transaccion ?? this.bd;
  }

  // Para lo que SOLO tiene sentido dentro de una transacción, como escribir en el outbox.
  transaccionActual(): Transaccion {
    return this.exigirEstado().transaccion;
  }

  // Registra algo que debe ocurrir solo si la transacción se confirma (por ejemplo, avisar al
  // despachador de que hay eventos nuevos). Si se revierte, no se ejecuta.
  alConfirmar(accion: () => void): void {
    this.exigirEstado().alConfirmar.push(accion);
  }

  private exigirEstado(): Estado {
    const estado = this.almacen.getStore();
    if (estado === undefined) {
      throw new Error(
        'Esta operación debe ejecutarse dentro de una unidad de trabajo (UnidadDeTrabajo.ejecutar)',
      );
    }
    return estado;
  }
}
