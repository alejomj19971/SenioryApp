import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { UsuarioAutenticado } from '../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { Conversacion } from '../../dominio/conversacion.js';
import type { ConversacionId } from '../../dominio/ids.js';
import type { RolDeAutor } from '../../dominio/mensaje.js';
import type { RepositorioConversaciones } from '../puertos/salida/repositorios.js';

// Quién es una persona frente al chat: la familia (su cuenta) o el cuidador (su perfil en el directorio).
export interface Participante {
  rol: RolDeAutor;
  // La cuenta de la familia, o el id del cuidador en el directorio.
  id: string;
}

// Quién puede entrar a una conversación. Solo sus dos partes: cualquier otra persona, o una que no existe,
// recibe «no encontrado» (igual en los dos casos, así no se revela que existe) y el intento queda auditado.
export class AccesoAConversaciones {
  constructor(
    private readonly conversaciones: RepositorioConversaciones,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly auditoria: Auditoria,
  ) {}

  // Null si la cuenta no es de ninguna de las dos partes posibles (un administrador, o un cuidador sin perfil).
  async participanteDe(
    usuario: UsuarioAutenticado,
  ): Promise<Participante | null> {
    if (usuario.rol === 'familiar') return { rol: 'familiar', id: usuario.id };
    if (usuario.rol === 'cuidador') {
      const cuidador = await this.directorio.obtenerCuidadorPorUsuario(
        usuario.id,
      );
      return cuidador === null
        ? null
        : { rol: 'cuidador', id: cuidador.cuidadorId };
    }
    return null;
  }

  async exigirParticipante(
    usuario: UsuarioAutenticado,
    conversacionId: ConversacionId,
  ): Promise<{ conversacion: Conversacion; participante: Participante }> {
    const conversacion = await this.conversaciones.buscarPorId(conversacionId);
    const participante = await this.participanteDe(usuario);
    if (
      conversacion === null ||
      participante === null ||
      !conversacion.esDe(participante.rol, participante.id)
    ) {
      await this.auditoria.registrar({
        actorId: usuario.id,
        accion: 'mensajeria.acceder_conversacion',
        recursoTipo: 'conversacion',
        recursoId: conversacionId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos esa conversación',
        'conversacion.no_encontrada',
      );
    }
    return { conversacion, participante };
  }
}
