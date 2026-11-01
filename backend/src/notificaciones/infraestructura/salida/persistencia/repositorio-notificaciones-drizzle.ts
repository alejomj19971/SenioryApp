import { and, asc, desc, eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type {
  CursorDeNotificaciones,
  IntentoDeEnvio,
  PaginaDeNotificaciones,
  RepositorioNotificaciones,
} from '../../../aplicacion/puertos/salida/repositorio-notificaciones.js';
import type {
  Notificacion,
  NotificacionId,
} from '../../../dominio/notificacion.js';
import type { Canal } from '../../../dominio/valores-cerrados.js';
import { notificacionDeFila } from './mapeadores.js';
import { intentosDeEnvio, notificaciones } from './notificaciones.esquema.js';

export class RepositorioNotificacionesDrizzle implements RepositorioNotificaciones {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async crear(avisos: readonly Notificacion[]): Promise<number> {
    if (avisos.length === 0) return 0;
    const creadas = await this.contexto
      .conexion()
      .insert(notificaciones)
      .values(
        avisos.map((aviso) => ({
          id: aviso.id,
          destinatarioId: aviso.destinatarioId,
          eventoId: aviso.eventoId,
          tipo: aviso.tipo,
          prioridad: aviso.prioridad,
          canal: aviso.canal,
          estado: aviso.estado,
          parametros: aviso.parametros,
          intentos: aviso.intentos,
          proximoIntentoEn: aviso.proximoIntentoEn,
          creadaEn: aviso.creadaEn,
        })),
      )
      // El mismo evento, destinatario, tipo y canal no se repite: reprocesar un evento es inofensivo.
      .onConflictDoNothing({
        target: [
          notificaciones.eventoId,
          notificaciones.destinatarioId,
          notificaciones.tipo,
          notificaciones.canal,
        ],
      })
      .returning({ id: notificaciones.id });
    return creadas.length;
  }

  async reclamarPendientes(
    ahora: Date,
    limite: number,
    reservaMs: number,
  ): Promise<Notificacion[]> {
    const bd = this.contexto.conexion();
    const vencidas = bd
      .select({ id: notificaciones.id })
      .from(notificaciones)
      .where(
        and(
          eq(notificaciones.estado, 'pendiente'),
          lte(notificaciones.proximoIntentoEn, ahora),
        ),
      )
      .orderBy(asc(notificaciones.proximoIntentoEn))
      .limit(limite)
      .for('update', { skipLocked: true });
    const filas = await bd
      .update(notificaciones)
      .set({ proximoIntentoEn: new Date(ahora.getTime() + reservaMs) })
      .where(inArray(notificaciones.id, vencidas))
      .returning();
    // Las más antiguas primero: una alerta que esperó no se queda atrás de las nuevas.
    return filas
      .map(notificacionDeFila)
      .sort((a, b) => a.creadaEn.getTime() - b.creadaEn.getTime());
  }

  async registrarIntento(
    aviso: Notificacion,
    intento: IntentoDeEnvio,
  ): Promise<void> {
    await this.contexto.ejecutar(async () => {
      const bd = this.contexto.conexion();
      await bd
        .update(notificaciones)
        .set({
          estado: aviso.estado,
          intentos: aviso.intentos,
          proximoIntentoEn: aviso.proximoIntentoEn,
          enviadaEn: aviso.enviadaEn,
          entregadaEn: aviso.entregadaEn,
          ultimoError: aviso.ultimoError,
        })
        .where(eq(notificaciones.id, aviso.id));
      await bd.insert(intentosDeEnvio).values({
        id: uuidv7(),
        notificacionId: aviso.id,
        intentadoEn: intento.intentadoEn,
        resultado: intento.resultado,
        respuestaProveedor: intento.respuesta,
      });
    });
  }

  async delMismoAviso(aviso: Notificacion): Promise<Notificacion[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(notificaciones)
      .where(
        and(
          eq(notificaciones.eventoId, aviso.eventoId),
          eq(notificaciones.destinatarioId, aviso.destinatarioId),
          eq(notificaciones.tipo, aviso.tipo),
        ),
      );
    return filas.map(notificacionDeFila);
  }

  async contarRecientes(destinatarioId: string, desde: Date): Promise<number> {
    const [fila] = await this.contexto
      .conexion()
      .select({ total: sql<number>`count(*)::int` })
      .from(notificaciones)
      .where(
        and(
          eq(notificaciones.destinatarioId, destinatarioId),
          sql`${notificaciones.creadaEn} >= ${desde.toISOString()}::timestamptz`,
        ),
      );
    return fila?.total ?? 0;
  }

  async existeAvisoDeConversacion(
    destinatarioId: string,
    tipo: string,
    conversacionId: string,
    desde: Date,
  ): Promise<boolean> {
    const filas = await this.contexto
      .conexion()
      .select({ id: notificaciones.id })
      .from(notificaciones)
      .where(
        and(
          eq(notificaciones.destinatarioId, destinatarioId),
          eq(notificaciones.tipo, tipo),
          sql`${notificaciones.parametros}->>'conversacionId' = ${conversacionId}`,
          sql`${notificaciones.creadaEn} >= ${desde.toISOString()}::timestamptz`,
        ),
      )
      .limit(1);
    return filas.length > 0;
  }

  async listarDe(
    destinatarioId: string,
    canal: Canal,
    limite: number,
    cursor: CursorDeNotificaciones | null,
  ): Promise<PaginaDeNotificaciones> {
    const condiciones: (SQL | undefined)[] = [
      eq(notificaciones.destinatarioId, destinatarioId),
      eq(notificaciones.canal, canal),
    ];
    if (cursor !== null) {
      // Lo que va DESPUÉS de la última fila vista, en el orden (creada_en desc, id desc).
      condiciones.push(
        sql`(${notificaciones.creadaEn}, ${notificaciones.id}) < (${cursor.creadaEn.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
    // Una fila de más para saber si hay otra página sin hacer una segunda consulta.
    const filas = await this.contexto
      .conexion()
      .select()
      .from(notificaciones)
      .where(and(...condiciones))
      .orderBy(desc(notificaciones.creadaEn), desc(notificaciones.id))
      .limit(limite + 1);
    const hayMas = filas.length > limite;
    const lista = (hayMas ? filas.slice(0, limite) : filas).map(
      notificacionDeFila,
    );
    const ultimo = lista.at(-1);
    return {
      notificaciones: lista,
      siguiente:
        hayMas && ultimo !== undefined
          ? { creadaEn: ultimo.creadaEn, id: ultimo.id }
          : null,
    };
  }

  async buscarPorId(id: NotificacionId): Promise<Notificacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(notificaciones)
      .where(eq(notificaciones.id, id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : notificacionDeFila(fila);
  }
}
