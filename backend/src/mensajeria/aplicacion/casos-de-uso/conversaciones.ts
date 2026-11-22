import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UsuarioAutenticado } from '../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
  SinPermiso,
} from '../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import { Conversacion } from '../../dominio/conversacion.js';
import type { ConversacionId } from '../../dominio/ids.js';
import type { RepositorioConversaciones } from '../puertos/salida/repositorios.js';
import type {
  AccesoAConversaciones,
  Participante,
} from '../servicios/acceso-a-conversaciones.js';
import type { VistasDeConversaciones } from '../servicios/vistas-de-conversaciones.js';
import type { VistaDeConversacion } from '../vistas.js';

export const CONVERSACIONES_EN_EL_LISTADO = 50;

// Cualquiera de las dos partes abre (u obtiene) su conversación con la otra. Si ya existe, la devuelve tal cual;
// si no, la crea, pero solo mientras haya un servicio vivo entre los dos: no se escribe con alguien con quien no
// se ha contratado nada. Dos aperturas simultáneas devuelven la misma conversación.
export class AbrirConversacion {
  constructor(
    private readonly conversaciones: RepositorioConversaciones,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly identidad: ConsultaDeIdentidad,
    private readonly reservas: ConsultaDeReservas,
    private readonly vistas: VistasDeConversaciones,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  // `otraParteId` es el cuidador si quien pide es la familia, o la familia si quien pide es el cuidador.
  async ejecutar(
    usuario: UsuarioAutenticado,
    otraParteId: string,
  ): Promise<{ conversacion: VistaDeConversacion; creada: boolean }> {
    const { familiarId, cuidadorId, participante } = await this.identificar(
      usuario,
      otraParteId,
    );

    const existente = await this.conversaciones.buscarPorPareja(
      familiarId,
      cuidadorId,
    );
    if (existente !== null) {
      return {
        conversacion: await this.vistas.vistaDe(existente, participante),
        creada: false,
      };
    }

    if (!(await this.reservas.hayServicioActivoEntre(familiarId, cuidadorId))) {
      throw new ReglaDeNegocioIncumplida(
        'Solo puedes escribir con alguien con quien tienes un servicio',
        'conversacion.sin_servicio_activo',
      );
    }
    const { conversacion, creada } = await this.conversaciones.obtenerOCrear(
      Conversacion.abrir({
        id: this.ids.nuevo<'Conversacion'>() as ConversacionId,
        familiarId,
        cuidadorId,
        ahora: this.reloj.ahora(),
      }),
    );
    if (creada) {
      await this.auditoria.registrar({
        actorId: usuario.id,
        accion: 'mensajeria.abrir_conversacion',
        recursoTipo: 'conversacion',
        recursoId: conversacion.id,
        resultado: 'permitido',
      });
    }
    return {
      conversacion: await this.vistas.vistaDe(conversacion, participante),
      creada,
    };
  }

  private async identificar(
    usuario: UsuarioAutenticado,
    otraParteId: string,
  ): Promise<{
    familiarId: string;
    cuidadorId: string;
    participante: Participante;
  }> {
    if (usuario.rol === 'familiar') {
      const cuidador =
        await this.directorio.obtenerContactoDeCuidador(otraParteId);
      if (cuidador === null) {
        throw new RecursoNoEncontrado(
          'No encontramos a ese cuidador',
          'cuidador.no_encontrado',
        );
      }
      return {
        familiarId: usuario.id,
        cuidadorId: otraParteId,
        participante: { rol: 'familiar', id: usuario.id },
      };
    }
    if (usuario.rol === 'cuidador') {
      const cuidador = await this.directorio.obtenerCuidadorPorUsuario(
        usuario.id,
      );
      if (cuidador === null) {
        throw new RecursoNoEncontrado(
          'No encontramos tu perfil de cuidador',
          'cuidador.no_encontrado',
        );
      }
      const familia = await this.identidad.obtenerContacto(otraParteId);
      if (familia === null) {
        throw new RecursoNoEncontrado(
          'No encontramos a esa familia',
          'familiar.no_encontrado',
        );
      }
      return {
        familiarId: otraParteId,
        cuidadorId: cuidador.cuidadorId,
        participante: { rol: 'cuidador', id: cuidador.cuidadorId },
      };
    }
    throw new SinPermiso(
      'Solo la familia o el cuidador abren una conversación',
      'conversacion.rol_no_permitido',
    );
  }
}

// Mis conversaciones, la de la última charla primero. Una cuenta que no es de familia ni de cuidador no tiene ninguna.
export class ListarMisConversaciones {
  constructor(
    private readonly conversaciones: RepositorioConversaciones,
    private readonly acceso: AccesoAConversaciones,
    private readonly vistas: VistasDeConversaciones,
  ) {}

  async ejecutar(usuario: UsuarioAutenticado): Promise<VistaDeConversacion[]> {
    const participante = await this.acceso.participanteDe(usuario);
    if (participante === null) return [];
    const propias =
      participante.rol === 'familiar'
        ? await this.conversaciones.listarDeFamiliar(
            participante.id,
            CONVERSACIONES_EN_EL_LISTADO,
          )
        : await this.conversaciones.listarDeCuidador(
            participante.id,
            CONVERSACIONES_EN_EL_LISTADO,
          );
    return Promise.all(
      propias.map((conversacion) =>
        this.vistas.vistaDe(conversacion, participante),
      ),
    );
  }
}
