import type { Conversacion } from '../../../dominio/conversacion.js';
import type { CursorDeMensajes } from '../../../dominio/cursor-de-mensajes.js';
import type { ConversacionId } from '../../../dominio/ids.js';
import type { Mensaje } from '../../../dominio/mensaje.js';

export interface PaginaDeMensajes {
  // Del más reciente al más antiguo.
  mensajes: Mensaje[];
  // Desde dónde pedir la página siguiente (más antigua); null si no hay más.
  siguiente: CursorDeMensajes | null;
}

export interface RepositorioConversaciones {
  // La conversación de esa pareja; si no existe, guarda `candidata`. Dos llamadas simultáneas no crean dos: la
  // segunda devuelve la que ganó. `creada` dice si esta llamada la creó.
  obtenerOCrear(
    candidata: Conversacion,
  ): Promise<{ conversacion: Conversacion; creada: boolean }>;

  buscarPorId(id: ConversacionId): Promise<Conversacion | null>;
  buscarPorPareja(
    familiarId: string,
    cuidadorId: string,
  ): Promise<Conversacion | null>;

  // Las más recientes primero (las que nunca tuvieron mensajes, al final).
  listarDeFamiliar(familiarId: string, limite: number): Promise<Conversacion[]>;
  listarDeCuidador(cuidadorId: string, limite: number): Promise<Conversacion[]>;

  // Anota que se escribió en ella. Nunca retrocede.
  registrarMensajeEn(id: ConversacionId, momento: Date): Promise<void>;
}

export interface RepositorioMensajes {
  // Lanza ConflictoDeEstado `mensaje.reenviado` si ese autor ya envió un mensaje con ese `idDeCliente` en esa
  // conversación. Tras eso la transacción en curso queda abortada.
  guardar(mensaje: Mensaje): Promise<void>;

  buscarPorIdDeCliente(
    conversacionId: ConversacionId,
    autorId: string,
    idDeCliente: string,
  ): Promise<Mensaje | null>;

  // Paginado hacia atrás: los de antes de `antes` (todos si es null).
  listar(
    conversacionId: ConversacionId,
    antes: CursorDeMensajes | null,
    limite: number,
  ): Promise<PaginaDeMensajes>;

  // Los mensajes de esas conversaciones escritos desde `desde` (incluido), del más antiguo al más reciente. Para el
  // flujo en vivo.
  listarDesde(
    conversacionIds: readonly ConversacionId[],
    desde: Date,
    limite: number,
  ): Promise<Mensaje[]>;
}

export const REPOSITORIO_CONVERSACIONES = Symbol('RepositorioConversaciones');
export const REPOSITORIO_MENSAJES = Symbol('RepositorioMensajes');
