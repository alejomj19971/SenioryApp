import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { PagoId } from '../../dominio/ids.js';
import type {
  EstadoEnLaPasarela,
  PasarelaDePagos,
} from '../puertos/salida/pasarela-de-pagos.js';
import type { RepositorioPagos } from '../puertos/salida/repositorios.js';
import type { ResolucionDePagos } from '../servicios/resolucion-de-pagos.js';

export const PAGOS_POR_VUELTA = 100;

export interface ResultadoDeVencimientos {
  vencidos: number;
  // Los que, al preguntarle a la pasarela, resultaron estar pagados o rechazados: se avisó mal o no se avisó.
  recuperados: number;
  // Los que no se pudieron revisar (la pasarela no respondió): se reintentan en la vuelta siguiente.
  fallidos: number;
}

// La tarea programada que cierra los pagos que la familia dejó sin pagar. Antes de vencer uno que ya tiene cobro
// en la pasarela le PREGUNTA cómo va: un aviso perdido no puede hacer que se venza un pago que sí se hizo. Si la
// pasarela no responde, el pago no se toca. Vencer un pago de servicio anuncia `pago_rechazado` y Reservas cancela
// el servicio.
export class ExpirarPagos {
  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly pasarela: PasarelaDePagos,
    private readonly resolucion: ResolucionDePagos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly minutosParaPagar: number,
  ) {}

  async ejecutar(): Promise<ResultadoDeVencimientos> {
    const limite = new Date(
      this.reloj.ahora().getTime() - this.minutosParaPagar * 60_000,
    );
    const vencidos = await this.pagos.listarPendientesVencidos(
      limite,
      PAGOS_POR_VUELTA,
    );
    const resultado: ResultadoDeVencimientos = {
      vencidos: 0,
      recuperados: 0,
      fallidos: 0,
    };
    for (const id of vencidos) {
      try {
        const cierre = await this.resolver(id);
        if (cierre === 'vencido') resultado.vencidos += 1;
        if (cierre === 'recuperado') resultado.recuperados += 1;
      } catch {
        resultado.fallidos += 1;
      }
    }
    return resultado;
  }

  private async resolver(id: PagoId): Promise<'vencido' | 'recuperado' | null> {
    const pago = await this.pagos.buscarPorId(id);
    if (pago?.estaPendiente() !== true) return null;

    let remoto: EstadoEnLaPasarela = 'pendiente';
    if (pago.referenciaProveedor !== null) {
      // Con cobro en la pasarela no se vence a ciegas: si ella no está disponible, se espera.
      if (!this.pasarela.habilitada) return null;
      remoto = await this.pasarela.consultarEstado(pago.referenciaProveedor);
    }

    const cierre = await this.unidadDeTrabajo.ejecutar(async () => {
      const actual = await this.pagos.buscarPorIdParaActualizar(id);
      // Entre la lista y aquí pudo llegar el aviso de la pasarela.
      if (actual?.estaPendiente() !== true) return null;
      const ahora = this.reloj.ahora();
      if (remoto === 'aprobado') {
        await this.resolucion.aprobar(actual, ahora);
      } else if (remoto === 'rechazado') {
        await this.resolucion.rechazar(actual, 'rechazado', ahora);
      } else {
        await this.resolucion.rechazar(actual, 'expirado', ahora);
      }
      await this.pagos.actualizar(actual);
      return remoto === 'pendiente' ? 'vencido' : 'recuperado';
    });
    if (cierre === null) return null;
    await this.auditoria.registrar({
      actorId: null,
      accion:
        cierre === 'vencido'
          ? 'pagos.vencer_pago'
          : 'pagos.recuperar_pago_perdido',
      recursoTipo: 'pago',
      recursoId: id,
      resultado: 'permitido',
    });
    return cierre;
  }
}
