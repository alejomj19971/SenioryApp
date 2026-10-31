import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import type { PagoId } from '../../dominio/ids.js';
import { Pago } from '../../dominio/pago.js';
import type { PasarelaDePagos } from '../puertos/salida/pasarela-de-pagos.js';
import type {
  RepositorioPagos,
  RepositorioPaquetes,
} from '../puertos/salida/repositorios.js';
import type { ObtenerEnlaceDePago } from './obtener-enlace-de-pago.js';

export interface ResultadoDeCompra {
  pago: Pago;
  // A dónde pagar. Null si el pago ya no está pendiente (un reintento de una compra ya resuelta).
  urlDePago: string | null;
  // Falso cuando es el reintento de una compra ya hecha con la misma clave.
  creado: boolean;
}

// La familia compra un paquete de la bolsa de horas. Crea un pago pendiente y devuelve el enlace para pagar; la
// bolsa se acredita cuando la pasarela confirma el pago (ProcesarAvisoDePasarela), nunca antes.
//
// La clave de idempotencia (E3) la genera el cliente: reenviar la misma compra, también al mismo tiempo, devuelve
// el mismo pago. Una clave usada con OTRO paquete es un error, no una compra nueva.
export class ComprarBolsa {
  constructor(
    private readonly paquetes: RepositorioPaquetes,
    private readonly pagos: RepositorioPagos,
    private readonly pasarela: PasarelaDePagos,
    private readonly enlaces: ObtenerEnlaceDePago,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(
    familiarId: string,
    codigoDePaquete: string,
    claveDeIdempotencia: string,
  ): Promise<ResultadoDeCompra> {
    if (!this.pasarela.habilitada) {
      throw new ServicioNoDisponible(
        'Los pagos no están disponibles por ahora',
        'pagos.pasarela_no_disponible',
      );
    }
    const paquete = await this.paquetes.buscarActivo(codigoDePaquete);
    if (paquete === null) {
      throw new RecursoNoEncontrado(
        'No encontramos ese paquete',
        'paquete.no_encontrado',
      );
    }

    const existente = await this.pagos.buscarPorClave(
      familiarId,
      claveDeIdempotencia,
    );
    if (existente !== null) return this.repetir(existente, codigoDePaquete);

    const pago = Pago.paraBolsa({
      id: this.ids.nuevo<'Pago'>() as PagoId,
      paqueteCodigo: paquete.codigo,
      pagadorId: familiarId,
      montoTotal: paquete.precio,
      claveDeIdempotencia,
      ahora: this.reloj.ahora(),
    });
    try {
      await this.unidadDeTrabajo.ejecutar(() => this.pagos.guardar(pago));
    } catch (error) {
      // Dos envíos simultáneos con la misma clave: el segundo pierde la carrera y devuelve el del primero.
      if (
        error instanceof ConflictoDeEstado &&
        error.codigo === 'pago.clave_repetida'
      ) {
        const ganador = await this.pagos.buscarPorClave(
          familiarId,
          claveDeIdempotencia,
        );
        if (ganador !== null) return this.repetir(ganador, codigoDePaquete);
      }
      throw error;
    }

    await this.auditoria.registrar({
      actorId: familiarId,
      accion: 'pagos.comprar_bolsa',
      recursoTipo: 'pago',
      recursoId: pago.id,
      resultado: 'permitido',
    });
    const enlace = await this.enlaces.pedirEnlace(pago);
    return { pago, urlDePago: enlace.urlDePago, creado: true };
  }

  private async repetir(
    existente: Pago,
    codigoDePaquete: string,
  ): Promise<ResultadoDeCompra> {
    if (
      existente.concepto !== 'bolsa' ||
      existente.paqueteCodigo !== codigoDePaquete
    ) {
      throw new ConflictoDeEstado(
        'Esa clave ya se usó con otra compra',
        'idempotencia.clave_reutilizada',
      );
    }
    if (!existente.estaPendiente()) {
      return { pago: existente, urlDePago: null, creado: false };
    }
    try {
      const enlace = await this.enlaces.pedirEnlace(existente);
      return { pago: existente, urlDePago: enlace.urlDePago, creado: false };
    } catch (error) {
      // Venció mientras tanto: se devuelve tal cual, sin enlace.
      if (error instanceof ConflictoDeEstado) {
        return { pago: existente, urlDePago: null, creado: false };
      }
      throw error;
    }
  }
}
