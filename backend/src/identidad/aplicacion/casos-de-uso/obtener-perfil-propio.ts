import { NoAutenticado } from '../../../compartido/dominio/errores.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type { RepositorioVinculos } from '../puertos/salida/repositorio-vinculos.js';
import type { VistasDeAdultosMayores } from '../servicios/vistas-de-adultos-mayores.js';
import {
  vistaDePerfil,
  type VistaDeAdultoMayor,
  type VistaDePerfil,
} from '../vistas.js';

export interface Perfil {
  usuario: VistaDePerfil;
  adultosMayores: VistaDeAdultoMayor[];
}

// El perfil de quien tiene la sesión: sus datos y las personas mayores a las que está vinculado.
export class ObtenerPerfilPropio {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly vinculos: RepositorioVinculos,
    private readonly vistas: VistasDeAdultosMayores,
  ) {}

  async ejecutar(usuarioId: string): Promise<Perfil> {
    const usuario = await this.usuarios.buscarPorId(usuarioId as UsuarioId);
    // Un token todavía vigente de una cuenta eliminada ya no sirve para nada.
    if (usuario?.estado !== 'activo') throw new NoAutenticado();
    const vinculos = await this.vinculos.listarActivosDeFamiliar(usuario.id);
    return {
      usuario: vistaDePerfil(usuario),
      adultosMayores: await this.vistas.de(vinculos),
    };
  }
}
