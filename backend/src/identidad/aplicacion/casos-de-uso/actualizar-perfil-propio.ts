import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  NoAutenticado,
} from '../../../compartido/dominio/errores.js';
import type { UsuarioId } from '../../dominio/ids.js';
import { NombrePersona } from '../../dominio/nombre-persona.js';
import { TelefonoE164 } from '../../dominio/telefono-e164.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import { vistaDePerfil, type VistaDePerfil } from '../vistas.js';

export interface CambiosDePerfilPropio {
  nombre?: string;
  // null borra el teléfono; undefined lo deja como está.
  telefono?: string | null;
}

// Cambia el nombre o el teléfono de quien tiene la sesión. El correo y el rol no se cambian aquí.
export class ActualizarPerfilPropio {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    usuarioId: string,
    cambios: CambiosDePerfilPropio,
  ): Promise<VistaDePerfil> {
    if (cambios.nombre === undefined && cambios.telefono === undefined) {
      throw new ErrorDeValidacion(
        'Indica al menos un dato por cambiar',
        'perfil.sin_cambios',
      );
    }
    const nombre =
      cambios.nombre === undefined
        ? undefined
        : NombrePersona.crear(cambios.nombre);
    const telefono =
      cambios.telefono === undefined || cambios.telefono === null
        ? cambios.telefono
        : TelefonoE164.crear(cambios.telefono);

    const perfil = await this.unidadDeTrabajo.ejecutar(async () => {
      // Con bloqueo: guardar la credencial leída sin él podría borrar un intento fallido de inicio
      // de sesión que ocurra en medio.
      const usuario = await this.usuarios.buscarPorIdParaActualizar(
        usuarioId as UsuarioId,
      );
      if (usuario?.estado !== 'activo') throw new NoAutenticado();
      usuario.actualizarPerfil({ nombre, telefono }, this.reloj.ahora());
      await this.usuarios.actualizar(usuario);
      return vistaDePerfil(usuario);
    });

    await this.auditoria.registrar({
      actorId: perfil.id,
      accion: 'identidad.actualizar_perfil',
      recursoTipo: 'usuario',
      recursoId: perfil.id,
      resultado: 'permitido',
      // Solo qué campos cambiaron, nunca sus valores.
      metadatos: {
        nombre: nombre !== undefined,
        telefono: telefono !== undefined,
      },
    });
    return perfil;
  }
}
