import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  NoAutenticado,
  RecursoNoEncontrado,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import { idDesdeTexto } from '../../../compartido/dominio/id.js';
import type { PagoId } from '../../dominio/ids.js';
import type { PasarelaDePagos } from '../puertos/salida/pasarela-de-pagos.js';
import type {
  RepositorioAvisosDePasarela,
  RepositorioPagos,
} from '../puertos/salida/repositorios.js';
import type { ResolucionDePagos } from '../servicios/resolucion-de-pagos.js';

export interface AvisoRecibido {
  proveedor: string;
  // Los bytes EXACTOS que llegaron: la firma se calcula sobre ellos, no sobre el JSON ya interpretado.
  cuerpoCrudo: Buffer;
  cuerpo: unknown;
  encabezados: Readonly<Record<string, string | string[] | undefined>>;
}

export type ResultadoDelAviso =
  | 'procesado'
  // Ya se había recibido: se confirma sin repetir nada (E3).
  | 'duplicado'
  // No es de un pago nuestro o no es un aviso que nos interese.
  | 'ignorado'
  // El monto no es el del pago: no se aplica y queda en la auditoría.
  | 'monto_distinto'
  // Aprobaron un pago que ya habíamos cerrado (venció o se rechazó): se devuelve el dinero.
  | 'tardio';

// El aviso (webhook) con el que la pasarela cuenta cómo terminó un pago. Es la ÚNICA puerta por la que un pago
// pasa a aprobado, y por eso es estricto:
//
//  1. La firma se verifica sobre el cuerpo exacto y en tiempo constante; sin firma válida no se hace nada.
//  2. Se procesa una sola vez por (proveedor, id del aviso): reenvíos y carreras no repiten nada.
//  3. El monto del aviso debe ser el del pago; si no, no se aprueba.
//  4. Solo avanza: un aviso no puede devolver un pago aprobado a pendiente ni aprobar uno ya cerrado.
//
// Un aviso de un pago desconocido, de otro tipo o repetido se confirma igual (200): la pasarela reintenta lo que
// no se confirma, y reintentar no lo arregla.
export class ProcesarAvisoDePasarela {
  constructor(
    private readonly pasarela: PasarelaDePagos,
    private readonly pagos: RepositorioPagos,
    private readonly avisos: RepositorioAvisosDePasarela,
    private readonly resolucion: ResolucionDePagos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(recibido: AvisoRecibido): Promise<ResultadoDelAviso> {
    if (recibido.proveedor !== this.pasarela.nombre) {
      throw new RecursoNoEncontrado(
        'No conocemos ese proveedor de pagos',
        'pagos.proveedor_desconocido',
      );
    }
    if (!this.pasarela.habilitada) {
      throw new ServicioNoDisponible(
        'Los pagos no están disponibles por ahora',
        'pagos.pasarela_no_disponible',
      );
    }
    if (
      !this.pasarela.verificarFirma(recibido.cuerpoCrudo, recibido.encabezados)
    ) {
      await this.auditoria.registrar({
        actorId: null,
        accion: 'pagos.recibir_aviso',
        recursoTipo: 'pasarela',
        recursoId: null,
        resultado: 'denegado',
        metadatos: { proveedor: recibido.proveedor },
      });
      throw new NoAutenticado(
        'La firma del aviso no es válida',
        'pagos.firma_invalida',
      );
    }
    const aviso = await this.pasarela.interpretarAviso(recibido.cuerpo);
    if (aviso === null) {
      throw new ErrorDeValidacion(
        'El aviso no tiene el formato esperado',
        'pagos.aviso_invalido',
      );
    }

    const pagoId = idComoPago(aviso.referencia);
    let reembolsoTardio: {
      pagoId: string;
      referenciaProveedor: string;
      monto: number;
    } | null = null;

    const resultado = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<ResultadoDelAviso> => {
        const ahora = this.reloj.ahora();
        const pago =
          pagoId === null
            ? null
            : await this.pagos.buscarPorIdParaActualizar(pagoId);
        const registroId = this.ids.nuevo();
        const esNuevo = await this.avisos.registrar({
          id: registroId,
          proveedor: recibido.proveedor,
          idEventoExterno: aviso.idEventoExterno,
          pagoId: pago?.id ?? null,
          tipo: aviso.resultado,
          cuerpo: recibido.cuerpo,
          firmaValida: true,
          recibidoEn: ahora,
        });
        if (!esNuevo) return 'duplicado';
        if (pago === null || aviso.resultado === 'otro') return 'ignorado';
        if (aviso.monto !== null && aviso.monto !== pago.montoTotal) {
          return 'monto_distinto';
        }

        let resultadoDelAviso: ResultadoDelAviso = 'procesado';
        if (aviso.resultado === 'aprobado') {
          if (pago.estaPendiente()) {
            if (
              pago.referenciaProveedor === null &&
              aviso.referenciaProveedor !== null
            ) {
              pago.asociarReferencia(
                recibido.proveedor,
                aviso.referenciaProveedor,
                ahora,
              );
            }
            await this.resolucion.aprobar(pago, ahora);
            await this.pagos.actualizar(pago);
          } else if (
            pago.estado === 'rechazado' ||
            pago.estado === 'expirado'
          ) {
            // El dinero llegó cuando ya habíamos cerrado el pago: no se acredita nada, se devuelve.
            const referencia =
              aviso.referenciaProveedor ?? pago.referenciaProveedor;
            if (referencia !== null) {
              reembolsoTardio = {
                pagoId: pago.id,
                referenciaProveedor: referencia,
                monto: pago.montoTotal,
              };
            }
            resultadoDelAviso = 'tardio';
          }
        } else if (pago.estaPendiente()) {
          await this.resolucion.rechazar(pago, 'rechazado', ahora);
          await this.pagos.actualizar(pago);
        }
        await this.avisos.marcarProcesado(registroId, ahora);
        return resultadoDelAviso;
      },
    );

    await this.cerrarCabos(resultado, pagoId, reembolsoTardio);
    return resultado;
  }

  // Lo que no puede ir dentro de la transacción: hablar con la pasarela y dejar rastro en la auditoría.
  private async cerrarCabos(
    resultado: ResultadoDelAviso,
    pagoId: PagoId | null,
    reembolsoTardio: {
      pagoId: string;
      referenciaProveedor: string;
      monto: number;
    } | null,
  ): Promise<void> {
    if (resultado === 'monto_distinto' || resultado === 'tardio') {
      await this.auditoria.registrar({
        actorId: null,
        accion:
          resultado === 'tardio'
            ? 'pagos.aprobacion_tardia'
            : 'pagos.aviso_con_monto_distinto',
        recursoTipo: 'pago',
        recursoId: pagoId,
        resultado: 'error',
      });
    }
    if (reembolsoTardio !== null) {
      try {
        await this.pasarela.reembolsar({
          referenciaProveedor: reembolsoTardio.referenciaProveedor,
          monto: reembolsoTardio.monto,
          claveDeIdempotencia: `reembolso:${reembolsoTardio.pagoId}`,
        });
      } catch {
        // No se puede perder el aviso por esto, y el dinero sigue en la pasarela: queda en la auditoría para que
        // una persona lo devuelva a mano.
        await this.auditoria.registrar({
          actorId: null,
          accion: 'pagos.reembolso_tardio_fallido',
          recursoTipo: 'pago',
          recursoId: reembolsoTardio.pagoId,
          resultado: 'error',
        });
      }
    }
  }
}

function idComoPago(referencia: string): PagoId | null {
  try {
    return idDesdeTexto<'Pago'>(referencia);
  } catch {
    return null;
  }
}
