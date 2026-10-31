import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { Liquidacion } from '../../dominio/liquidacion.js';
import type { DispersorDePagos } from '../puertos/salida/dispersor-de-pagos.js';
import type { RepositorioLiquidaciones } from '../puertos/salida/repositorios.js';

export const LIQUIDACIONES_POR_VUELTA = 20;

export interface ResultadoDeDispersion {
  pagadas: number;
  enviadas: number;
  rechazadas: number;
  // Hubo un error pasajero (el proveedor no respondió): la ronda se detiene y se reintenta en la siguiente.
  interrumpida: boolean;
}

// La tarea programada que le paga al cuidador lo que se le debe. Va de a una liquidación, cada una en su propia
// transacción con la fila bloqueada (`SKIP LOCKED`): dos instancias a la vez no pagan lo mismo. La orden lleva el
// identificador de la liquidación, así que si el servidor cae después de pagar y antes de confirmar, repetirla no
// paga dos veces.
//
// Sin dispersor (deshabilitado), no hace nada: las liquidaciones quedan pendientes, a la vista. No se finge un pago.
export class DispersarLiquidaciones {
  constructor(
    private readonly liquidaciones: RepositorioLiquidaciones,
    private readonly dispersor: DispersorDePagos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(): Promise<ResultadoDeDispersion> {
    const resultado: ResultadoDeDispersion = {
      pagadas: 0,
      enviadas: 0,
      rechazadas: 0,
      interrumpida: false,
    };
    if (!this.dispersor.habilitado) return resultado;

    for (let i = 0; i < LIQUIDACIONES_POR_VUELTA; i++) {
      let atendida: Liquidacion | null;
      try {
        atendida = await this.atenderSiguiente();
      } catch {
        // Un error pasajero revierte la transacción: la liquidación sigue pendiente. Seguir ahora volvería a
        // reclamar la misma una y otra vez, así que se detiene la ronda.
        resultado.interrumpida = true;
        break;
      }
      if (atendida === null) break;
      if (atendida.estado === 'pagada') resultado.pagadas += 1;
      else if (atendida.estado === 'enviada') resultado.enviadas += 1;
      else resultado.rechazadas += 1;
      await this.auditoria.registrar({
        actorId: null,
        accion: 'pagos.dispersar_liquidacion',
        recursoTipo: 'liquidacion',
        recursoId: atendida.id,
        resultado: atendida.estado === 'fallida' ? 'error' : 'permitido',
      });
    }
    return resultado;
  }

  private atenderSiguiente(): Promise<Liquidacion | null> {
    return this.unidadDeTrabajo.ejecutar(async () => {
      const liquidacion = await this.liquidaciones.reclamarSiguientePendiente();
      if (liquidacion === null) return null;
      const orden = await this.dispersor.dispersar({
        liquidacionId: liquidacion.id,
        cuidadorId: liquidacion.cuidadorId,
        monto: liquidacion.monto,
      });
      if (orden.estado === 'pagada') {
        liquidacion.registrarPago(orden.referencia, this.reloj.ahora());
      } else if (orden.estado === 'enviada') {
        liquidacion.registrarEnvio(orden.referencia);
      } else {
        liquidacion.fallar();
      }
      await this.liquidaciones.actualizar(liquidacion);
      return liquidacion;
    });
  }
}
