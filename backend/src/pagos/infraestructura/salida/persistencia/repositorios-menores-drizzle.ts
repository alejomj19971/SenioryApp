import { desc, eq } from 'drizzle-orm';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type {
  AvisoRegistrado,
  RepositorioAvisosDePasarela,
  RepositorioLiquidaciones,
  RepositorioPaquetes,
} from '../../../aplicacion/puertos/salida/repositorios.js';
import type { Liquidacion } from '../../../dominio/liquidacion.js';
import type { PaqueteDeBolsa } from '../../../dominio/paquete-de-bolsa.js';
import { liquidacionDeFila, paqueteDeFila } from './mapeadores.js';
import {
  eventosDePasarela,
  liquidaciones,
  paquetesDeBolsa,
} from './pagos.esquema.js';

export class RepositorioLiquidacionesDrizzle implements RepositorioLiquidaciones {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async crearSiNoExiste(liquidacion: Liquidacion): Promise<boolean> {
    const insertadas = await this.contexto
      .conexion()
      .insert(liquidaciones)
      .values({
        id: liquidacion.id,
        cuidadorId: liquidacion.cuidadorId,
        servicioId: liquidacion.servicioId,
        monto: liquidacion.monto,
        estado: liquidacion.estado,
        referenciaDispersion: liquidacion.referenciaDispersion,
        creadaEn: liquidacion.creadaEn,
        pagadaEn: liquidacion.pagadaEn,
      })
      // Una por servicio: reprocesar el evento no crea (ni paga) otra.
      .onConflictDoNothing({ target: liquidaciones.servicioId })
      .returning({ id: liquidaciones.id });
    return insertadas.length > 0;
  }

  async reclamarSiguientePendiente(): Promise<Liquidacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(liquidaciones)
      .where(eq(liquidaciones.estado, 'pendiente'))
      .orderBy(liquidaciones.creadaEn, liquidaciones.id)
      .limit(1)
      // Otra instancia que ya esté pagando una no bloquea a esta: se salta esa fila.
      .for('update', { skipLocked: true });
    const fila = filas[0];
    return fila === undefined ? null : liquidacionDeFila(fila);
  }

  async actualizar(liquidacion: Liquidacion): Promise<void> {
    await this.contexto
      .conexion()
      .update(liquidaciones)
      .set({
        estado: liquidacion.estado,
        referenciaDispersion: liquidacion.referenciaDispersion,
        pagadaEn: liquidacion.pagadaEn,
      })
      .where(eq(liquidaciones.id, liquidacion.id));
  }

  async buscarPorServicio(servicioId: string): Promise<Liquidacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(liquidaciones)
      .where(eq(liquidaciones.servicioId, servicioId))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : liquidacionDeFila(fila);
  }

  async listarDeCuidador(
    cuidadorId: string,
    limite: number,
  ): Promise<Liquidacion[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(liquidaciones)
      .where(eq(liquidaciones.cuidadorId, cuidadorId))
      .orderBy(desc(liquidaciones.creadaEn), desc(liquidaciones.id))
      .limit(limite);
    return filas.map(liquidacionDeFila);
  }
}

export class RepositorioAvisosDePasarelaDrizzle implements RepositorioAvisosDePasarela {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async registrar(aviso: AvisoRegistrado): Promise<boolean> {
    const insertados = await this.contexto
      .conexion()
      .insert(eventosDePasarela)
      .values({
        id: aviso.id,
        proveedor: aviso.proveedor,
        idEventoExterno: aviso.idEventoExterno,
        pagoId: aviso.pagoId,
        tipo: aviso.tipo,
        cuerpo: aviso.cuerpo,
        firmaValida: aviso.firmaValida,
        recibidoEn: aviso.recibidoEn,
      })
      // El mismo aviso (mismo proveedor y mismo identificador) se procesa una sola vez (E3).
      .onConflictDoNothing({
        target: [
          eventosDePasarela.proveedor,
          eventosDePasarela.idEventoExterno,
        ],
      })
      .returning({ id: eventosDePasarela.id });
    return insertados.length > 0;
  }

  async marcarProcesado(id: string, ahora: Date): Promise<void> {
    await this.contexto
      .conexion()
      .update(eventosDePasarela)
      .set({ procesadoEn: ahora })
      .where(eq(eventosDePasarela.id, id));
  }
}

export class RepositorioPaquetesDrizzle implements RepositorioPaquetes {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async listarActivos(): Promise<PaqueteDeBolsa[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(paquetesDeBolsa)
      .where(eq(paquetesDeBolsa.activo, true))
      .orderBy(paquetesDeBolsa.precio, paquetesDeBolsa.codigo);
    return filas.map(paqueteDeFila);
  }

  async buscarActivo(codigo: string): Promise<PaqueteDeBolsa | null> {
    const paquete = await this.buscar(codigo);
    return paquete?.activo === true ? paquete : null;
  }

  async buscar(codigo: string): Promise<PaqueteDeBolsa | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(paquetesDeBolsa)
      .where(eq(paquetesDeBolsa.codigo, codigo))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : paqueteDeFila(fila);
  }
}
