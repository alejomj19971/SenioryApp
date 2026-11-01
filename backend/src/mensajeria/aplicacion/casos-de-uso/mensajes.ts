import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { UsuarioAutenticado } from '../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  ConflictoDeEstado,
  ReglaDeNegocioIncumplida,
} from '../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import type { Conversacion } from '../../dominio/conversacion.js';
import {
  codificarCursor,
  decodificarCursor,
  limiteDe,
} from '../../dominio/cursor-de-mensajes.js';
import type { ConversacionId, MensajeId } from '../../dominio/ids.js';
import { Mensaje, type RolDeAutor } from '../../dominio/mensaje.js';
import type {
  RepositorioConversaciones,
  RepositorioMensajes,
} from '../puertos/salida/repositorios.js';
import type {
  AccesoAConversaciones,
  Participante,
} from '../servicios/acceso-a-conversaciones.js';
import type { EventosDeMensajeria } from '../servicios/eventos-de-mensajeria.js';
import { vistaDeMensaje, type VistaDeMensaje } from '../vistas.js';

export interface EntradaDeMensaje {
  // Se valida en el dominio (texto plano, de 1 a 1000 caracteres).
  texto: unknown;
  idDeCliente: string;
}

export interface ResultadoDeEnvio {
  mensaje: VistaDeMensaje;
  // Falso cuando es el reenvío de un mensaje ya enviado (mismo `idDeCliente`): se devuelve el mismo.
  creado: boolean;
}

// Escribir en una conversación. Solo sus dos partes, y solo mientras haya un servicio vivo entre ellas; en cambio
// reenviar un mensaje que ya se envió siempre devuelve el mismo, aunque el servicio haya terminado (un reintento
// tras una mala conexión no debe fallar por eso).
//
// El mensaje se guarda con el aviso a Notificaciones en la misma transacción, y sin su texto: los eventos llevan
// solo ids.
export class EnviarMensaje {
  constructor(
    private readonly acceso: AccesoAConversaciones,
    private readonly conversaciones: RepositorioConversaciones,
    private readonly mensajes: RepositorioMensajes,
    private readonly reservas: ConsultaDeReservas,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeMensajeria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(
    usuario: UsuarioAutenticado,
    conversacionId: ConversacionId,
    entrada: EntradaDeMensaje,
  ): Promise<ResultadoDeEnvio> {
    const { conversacion, participante } = await this.acceso.exigirParticipante(
      usuario,
      conversacionId,
    );
    const ahora = this.reloj.ahora();
    // Valida el texto y el identificador ANTES de buscar o guardar nada.
    const mensaje = Mensaje.crear({
      id: this.ids.nuevo<'Mensaje'>() as MensajeId,
      conversacionId: conversacion.id,
      autorId: usuario.id,
      autorRol: participante.rol,
      texto: entrada.texto as string,
      idDeCliente: entrada.idDeCliente,
      creadoEn: ahora,
    });

    const previo = await this.mensajes.buscarPorIdDeCliente(
      conversacion.id,
      usuario.id,
      mensaje.idDeCliente,
    );
    if (previo !== null) {
      return { mensaje: vistaDeMensaje(previo, usuario.id), creado: false };
    }

    if (
      !(await this.reservas.hayServicioActivoEntre(
        conversacion.familiarId,
        conversacion.cuidadorId,
      ))
    ) {
      throw new ReglaDeNegocioIncumplida(
        'Ya no puedes escribir en esta conversación: no hay un servicio en marcha',
        'conversacion.sin_servicio_activo',
      );
    }
    const destinatarioId = await this.destinatarioDe(
      conversacion,
      participante.rol,
    );

    try {
      await this.unidadDeTrabajo.ejecutar(async () => {
        await this.mensajes.guardar(mensaje);
        await this.conversaciones.registrarMensajeEn(conversacion.id, ahora);
        await this.eventos.publicar(
          'mensajeria.mensaje_enviado',
          {
            mensajeId: mensaje.id,
            conversacionId: conversacion.id,
            autorId: usuario.id,
            destinatarioId,
          },
          ahora,
        );
      });
    } catch (error) {
      // Dos reenvíos simultáneos con el mismo identificador: el segundo pierde la carrera y devuelve el del primero.
      if (
        error instanceof ConflictoDeEstado &&
        error.codigo === 'mensaje.reenviado'
      ) {
        const ganador = await this.mensajes.buscarPorIdDeCliente(
          conversacion.id,
          usuario.id,
          mensaje.idDeCliente,
        );
        if (ganador !== null) {
          return {
            mensaje: vistaDeMensaje(ganador, usuario.id),
            creado: false,
          };
        }
      }
      throw error;
    }
    return { mensaje: vistaDeMensaje(mensaje, usuario.id), creado: true };
  }

  // La cuenta de la otra parte, para avisarle. Null si es un cuidador sin cuenta (solo datos de desarrollo).
  private async destinatarioDe(
    conversacion: Conversacion,
    autor: RolDeAutor,
  ): Promise<string | null> {
    if (autor === 'cuidador') return conversacion.familiarId;
    const cuidador = await this.directorio.obtenerContactoDeCuidador(
      conversacion.cuidadorId,
    );
    return cuidador?.usuarioId ?? null;
  }
}

export interface PaginaDeVistasDeMensajes {
  // Del más reciente al más antiguo; la interfaz los invierte para mostrarlos.
  mensajes: VistaDeMensaje[];
  // Para pedir los anteriores (`?antes=`); null si no hay más.
  siguiente: string | null;
}

// Los mensajes de una conversación, paginados hacia atrás. Leer siempre se puede (aunque el servicio haya
// terminado): son mensajes de la propia persona.
export class ListarMensajes {
  constructor(
    private readonly acceso: AccesoAConversaciones,
    private readonly mensajes: RepositorioMensajes,
  ) {}

  async ejecutar(
    usuario: UsuarioAutenticado,
    conversacionId: ConversacionId,
    consulta: { antes?: string; limite?: number },
  ): Promise<PaginaDeVistasDeMensajes> {
    const limite = limiteDe(consulta.limite);
    const antes =
      consulta.antes === undefined ? null : decodificarCursor(consulta.antes);
    const { conversacion } = await this.acceso.exigirParticipante(
      usuario,
      conversacionId,
    );
    const pagina = await this.mensajes.listar(conversacion.id, antes, limite);
    return {
      mensajes: pagina.mensajes.map((m) => vistaDeMensaje(m, usuario.id)),
      siguiente:
        pagina.siguiente === null ? null : codificarCursor(pagina.siguiente),
    };
  }
}

export const MENSAJES_NUEVOS_POR_VUELTA = 100;
// Las conversaciones que se revisan en el flujo en vivo. Una persona con más que esto es un caso que no existe hoy.
const CONVERSACIONES_EN_VIVO = 200;

// Lo que escribió alguien en cualquiera de MIS conversaciones desde ese momento, del más antiguo al más reciente.
// Es lo que consulta el flujo en vivo en cada vuelta. Las conversaciones se vuelven a leer cada vez: si dejó de ser
// parte de una, sus mensajes dejan de llegar de inmediato.
export class ObtenerMensajesNuevos {
  constructor(
    private readonly acceso: AccesoAConversaciones,
    private readonly conversaciones: RepositorioConversaciones,
    private readonly mensajes: RepositorioMensajes,
  ) {}

  async ejecutar(usuario: UsuarioAutenticado, desde: Date): Promise<Mensaje[]> {
    const participante: Participante | null =
      await this.acceso.participanteDe(usuario);
    if (participante === null) return [];
    const propias =
      participante.rol === 'familiar'
        ? await this.conversaciones.listarDeFamiliar(
            participante.id,
            CONVERSACIONES_EN_VIVO,
          )
        : await this.conversaciones.listarDeCuidador(
            participante.id,
            CONVERSACIONES_EN_VIVO,
          );
    if (propias.length === 0) return [];
    return this.mensajes.listarDesde(
      propias.map((c) => c.id),
      desde,
      MENSAJES_NUEVOS_POR_VUELTA,
    );
  }
}
