import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { ConflictoDeEstado } from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type {
  PaginaDeMensajes,
  RepositorioConversaciones,
  RepositorioMensajes,
} from '../../../aplicacion/puertos/salida/repositorios.js';
import { Conversacion } from '../../../dominio/conversacion.js';
import type { CursorDeMensajes } from '../../../dominio/cursor-de-mensajes.js';
import type { ConversacionId, MensajeId } from '../../../dominio/ids.js';
import { Mensaje, type RolDeAutor } from '../../../dominio/mensaje.js';
import { conversaciones, mensajes } from './mensajeria.esquema.js';

function conversacionDeFila(
  fila: typeof conversaciones.$inferSelect,
): Conversacion {
  return Conversacion.reconstruir({
    id: fila.id as ConversacionId,
    familiarId: fila.familiarId,
    cuidadorId: fila.cuidadorId,
    creadaEn: fila.creadaEn,
    ultimoMensajeEn: fila.ultimoMensajeEn,
  });
}

function mensajeDeFila(fila: typeof mensajes.$inferSelect): Mensaje {
  return Mensaje.reconstruir({
    id: fila.id as MensajeId,
    conversacionId: fila.conversacionId as ConversacionId,
    autorId: fila.autorId,
    // El CHECK de la tabla garantiza que es uno de los dos.
    autorRol: fila.autorRol as RolDeAutor,
    texto: fila.texto,
    idDeCliente: fila.idDeCliente,
    creadoEn: fila.creadoEn,
  });
}

export class RepositorioConversacionesDrizzle implements RepositorioConversaciones {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async obtenerOCrear(
    candidata: Conversacion,
  ): Promise<{ conversacion: Conversacion; creada: boolean }> {
    // Dos aperturas simultáneas: una inserta y la otra no hace nada. Las dos terminan leyendo la misma fila.
    const insertadas = await this.contexto
      .conexion()
      .insert(conversaciones)
      .values({
        id: candidata.id,
        familiarId: candidata.familiarId,
        cuidadorId: candidata.cuidadorId,
        creadaEn: candidata.creadaEn,
        ultimoMensajeEn: null,
      })
      .onConflictDoNothing({
        target: [conversaciones.familiarId, conversaciones.cuidadorId],
      })
      .returning({ id: conversaciones.id });
    if (insertadas.length > 0) return { conversacion: candidata, creada: true };
    const existente = await this.buscarPorPareja(
      candidata.familiarId,
      candidata.cuidadorId,
    );
    if (existente === null) {
      throw new Error('La conversación no se pudo abrir ni leer');
    }
    return { conversacion: existente, creada: false };
  }

  async buscarPorId(id: ConversacionId): Promise<Conversacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(conversaciones)
      .where(eq(conversaciones.id, id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : conversacionDeFila(fila);
  }

  async buscarPorPareja(
    familiarId: string,
    cuidadorId: string,
  ): Promise<Conversacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(conversaciones)
      .where(
        and(
          eq(conversaciones.familiarId, familiarId),
          eq(conversaciones.cuidadorId, cuidadorId),
        ),
      )
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : conversacionDeFila(fila);
  }

  async listarDeFamiliar(
    familiarId: string,
    limite: number,
  ): Promise<Conversacion[]> {
    return this.listar(eq(conversaciones.familiarId, familiarId), limite);
  }

  async listarDeCuidador(
    cuidadorId: string,
    limite: number,
  ): Promise<Conversacion[]> {
    return this.listar(eq(conversaciones.cuidadorId, cuidadorId), limite);
  }

  private async listar(
    condicion: ReturnType<typeof eq>,
    limite: number,
  ): Promise<Conversacion[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(conversaciones)
      .where(condicion)
      // La de la última charla primero; las que nunca tuvieron mensajes, al final.
      .orderBy(
        desc(conversaciones.ultimoMensajeEn),
        desc(conversaciones.creadaEn),
        desc(conversaciones.id),
      )
      .limit(limite);
    return filas.map(conversacionDeFila);
  }

  async registrarMensajeEn(id: ConversacionId, momento: Date): Promise<void> {
    await this.contexto
      .conexion()
      .update(conversaciones)
      // Nunca retrocede: un mensaje con la hora de antes (carrera entre dos instancias) no la mueve para atrás.
      .set({
        ultimoMensajeEn: sql`greatest(coalesce(${conversaciones.ultimoMensajeEn}, ${momento.toISOString()}::timestamptz), ${momento.toISOString()}::timestamptz)`,
      })
      .where(eq(conversaciones.id, id));
  }
}

export class RepositorioMensajesDrizzle implements RepositorioMensajes {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(mensaje: Mensaje): Promise<void> {
    try {
      await this.contexto.conexion().insert(mensajes).values({
        id: mensaje.id,
        conversacionId: mensaje.conversacionId,
        autorId: mensaje.autorId,
        autorRol: mensaje.autorRol,
        texto: mensaje.texto,
        idDeCliente: mensaje.idDeCliente,
        creadoEn: mensaje.creadoEn,
      });
    } catch (error) {
      // Tras este error la transacción en curso queda abortada: el caso de uso debe dejar que se revierta.
      if (esViolacionDeUnicidad(error, 'mensajes_reenvio_unico')) {
        throw new ConflictoDeEstado(
          'Ese mensaje ya fue enviado',
          'mensaje.reenviado',
        );
      }
      throw error;
    }
  }

  async buscarPorIdDeCliente(
    conversacionId: ConversacionId,
    autorId: string,
    idDeCliente: string,
  ): Promise<Mensaje | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(mensajes)
      .where(
        and(
          eq(mensajes.conversacionId, conversacionId),
          eq(mensajes.autorId, autorId),
          eq(mensajes.idDeCliente, idDeCliente),
        ),
      )
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : mensajeDeFila(fila);
  }

  async listar(
    conversacionId: ConversacionId,
    antes: CursorDeMensajes | null,
    limite: number,
  ): Promise<PaginaDeMensajes> {
    const condiciones = [eq(mensajes.conversacionId, conversacionId)];
    if (antes !== null) {
      // Lo que va ANTES del último mensaje visto, en el orden (creado_en desc, id desc).
      condiciones.push(
        sql`(${mensajes.creadoEn}, ${mensajes.id}) < (${antes.creadoEn.toISOString()}::timestamptz, ${antes.id}::uuid)`,
      );
    }
    // Una fila de más para saber si hay otra página sin hacer una segunda consulta.
    const filas = await this.contexto
      .conexion()
      .select()
      .from(mensajes)
      .where(and(...condiciones))
      .orderBy(desc(mensajes.creadoEn), desc(mensajes.id))
      .limit(limite + 1);
    const pagina = filas.slice(0, limite).map(mensajeDeFila);
    const ultimo = pagina.at(-1);
    return {
      mensajes: pagina,
      siguiente:
        filas.length > limite && ultimo !== undefined
          ? { creadoEn: ultimo.creadoEn, id: ultimo.id }
          : null,
    };
  }

  async listarDesde(
    conversacionIds: readonly ConversacionId[],
    desde: Date,
    limite: number,
  ): Promise<Mensaje[]> {
    if (conversacionIds.length === 0) return [];
    const filas = await this.contexto
      .conexion()
      .select()
      .from(mensajes)
      .where(
        and(
          inArray(mensajes.conversacionId, [...conversacionIds]),
          gte(mensajes.creadoEn, desde),
        ),
      )
      .orderBy(asc(mensajes.creadoEn), asc(mensajes.id))
      .limit(limite);
    return filas.map(mensajeDeFila);
  }
}
