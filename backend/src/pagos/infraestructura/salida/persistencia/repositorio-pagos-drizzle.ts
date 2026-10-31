import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioPagos } from '../../../aplicacion/puertos/salida/repositorios.js';
import type { PagoId } from '../../../dominio/ids.js';
import type { Pago } from '../../../dominio/pago.js';
import { pagoDeFila } from './mapeadores.js';
import { pagos } from './pagos.esquema.js';

export class RepositorioPagosDrizzle implements RepositorioPagos {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(pago: Pago): Promise<void> {
    try {
      await this.contexto.conexion().insert(pagos).values({
        id: pago.id,
        concepto: pago.concepto,
        servicioId: pago.servicioId,
        paqueteCodigo: pago.paqueteCodigo,
        pagadorId: pago.pagadorId,
        medio: pago.medio,
        montoTotal: pago.montoTotal,
        pagoProfesional: pago.pagoProfesional,
        ingresoPlataforma: pago.ingresoPlataforma,
        politicaVersion: pago.politicaVersion,
        estado: pago.estado,
        proveedor: pago.proveedor,
        referenciaProveedor: pago.referenciaProveedor,
        claveIdempotencia: pago.claveDeIdempotencia,
        aprobadoEn: pago.aprobadoEn,
        version: pago.version,
        creadoEn: pago.creadoEn,
        actualizadoEn: pago.actualizadoEn,
      });
    } catch (error) {
      // Tras este error la transacción en curso queda abortada: el caso de uso debe dejar que se revierta.
      if (esViolacionDeUnicidad(error, 'pagos_idempotencia_unica')) {
        throw new ConflictoDeEstado(
          'Ese pago ya fue creado',
          'pago.clave_repetida',
        );
      }
      throw error;
    }
  }

  async actualizar(pago: Pago): Promise<void> {
    const actualizados = await this.contexto
      .conexion()
      .update(pagos)
      .set({
        estado: pago.estado,
        proveedor: pago.proveedor,
        referenciaProveedor: pago.referenciaProveedor,
        aprobadoEn: pago.aprobadoEn,
        version: pago.version,
        actualizadoEn: pago.actualizadoEn,
      })
      // Bloqueo optimista: solo si nadie lo cambió desde que se leyó.
      .where(and(eq(pagos.id, pago.id), eq(pagos.version, pago.versionLeida)))
      .returning({ id: pagos.id });
    if (actualizados.length > 0) return;
    const existe = await this.contexto
      .conexion()
      .select({ id: pagos.id })
      .from(pagos)
      .where(eq(pagos.id, pago.id))
      .limit(1);
    if (existe.length === 0) {
      throw new RecursoNoEncontrado('El pago no existe', 'pago.no_encontrado');
    }
    throw new ConflictoDeEstado(
      'El pago cambió mientras se procesaba; vuelve a intentarlo',
      'pago.version_obsoleta',
    );
  }

  buscarPorId(id: PagoId): Promise<Pago | null> {
    return this.buscar(eq(pagos.id, id), false);
  }

  buscarPorIdParaActualizar(id: PagoId): Promise<Pago | null> {
    return this.buscar(eq(pagos.id, id), true);
  }

  buscarPorServicioParaActualizar(servicioId: string): Promise<Pago | null> {
    return this.buscar(eq(pagos.servicioId, servicioId), true);
  }

  buscarPorClave(pagadorId: string, clave: string): Promise<Pago | null> {
    return this.buscar(
      and(eq(pagos.pagadorId, pagadorId), eq(pagos.claveIdempotencia, clave)),
      false,
    );
  }

  private async buscar(
    condicion: SQL | undefined,
    bloquear: boolean,
  ): Promise<Pago | null> {
    const consulta = this.contexto
      .conexion()
      .select()
      .from(pagos)
      .where(condicion)
      .limit(1);
    // NO KEY UPDATE: la fila cambia (estado, referencia) pero nunca su clave.
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    return fila === undefined ? null : pagoDeFila(fila);
  }

  async listarDePagador(pagadorId: string, limite: number): Promise<Pago[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(pagos)
      .where(eq(pagos.pagadorId, pagadorId))
      .orderBy(desc(pagos.creadoEn), desc(pagos.id))
      .limit(limite);
    return filas.map(pagoDeFila);
  }

  async listarPendientesVencidos(
    creadosAntesDe: Date,
    limite: number,
  ): Promise<PagoId[]> {
    const filas = await this.contexto
      .conexion()
      .select({ id: pagos.id })
      .from(pagos)
      .where(
        and(eq(pagos.estado, 'pendiente'), lt(pagos.creadoEn, creadosAntesDe)),
      )
      .orderBy(pagos.creadoEn)
      .limit(limite);
    return filas.map((fila) => fila.id as PagoId);
  }
}
