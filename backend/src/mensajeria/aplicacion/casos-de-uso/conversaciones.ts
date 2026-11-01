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
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import { Conversacion } from '../../dominio/conversacion.js';
import type { ConversacionId } from '../../dominio/ids.js';
import type { RepositorioConversaciones } from '../puertos/salida/repositorios.js';
import type { AccesoAConversaciones } from '../servicios/acceso-a-conversaciones.js';
import type { VistasDeConversaciones } from '../servicios/vistas-de-conversaciones.js';
import type { VistaDeConversacion } from '../vistas.js';

export const CONVERSACIONES_EN_EL_LISTADO = 50;

// La familia abre (u obtiene) su conversación con un cuidador. Si ya existe, la devuelve tal cual; si no, la crea,
// pero solo mientras haya un servicio vivo entre los dos: no se escribe a un cuidador con quien no se ha contratado
// nada. Dos aperturas simultáneas devuelven la misma conversación. El cuidador no abre conversaciones: contesta las
// que la familia empezó.
export class AbrirConversacion {
  constructor(
    private readonly conversaciones: RepositorioConversaciones,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly reservas: ConsultaDeReservas,
    private readonly vistas: VistasDeConversaciones,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(
    usuario: UsuarioAutenticado,
    cuidadorId: string,
  ): Promise<{ conversacion: VistaDeConversacion; creada: boolean }> {
    if (usuario.rol !== 'familiar') {
      throw new SinPermiso(
        'Solo las familias abren una conversación',
        'conversacion.solo_familias',
      );
    }
    const contacto =
      await this.directorio.obtenerContactoDeCuidador(cuidadorId);
    if (contacto === null) {
      throw new RecursoNoEncontrado(
        'No encontramos a ese cuidador',
        'cuidador.no_encontrado',
      );
    }

    const existente = await this.conversaciones.buscarPorPareja(
      usuario.id,
      cuidadorId,
    );
    if (existente !== null) {
      return {
        conversacion: await this.vistas.vistaDe(existente, {
          rol: 'familiar',
          id: usuario.id,
        }),
        creada: false,
      };
    }

    if (!(await this.reservas.hayServicioActivoEntre(usuario.id, cuidadorId))) {
      throw new ReglaDeNegocioIncumplida(
        'Solo puedes escribirle a un cuidador con quien tienes un servicio',
        'conversacion.sin_servicio_activo',
      );
    }
    const { conversacion, creada } = await this.conversaciones.obtenerOCrear(
      Conversacion.abrir({
        id: this.ids.nuevo<'Conversacion'>() as ConversacionId,
        familiarId: usuario.id,
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
      conversacion: await this.vistas.vistaDe(conversacion, {
        rol: 'familiar',
        id: usuario.id,
      }),
      creada,
    };
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
