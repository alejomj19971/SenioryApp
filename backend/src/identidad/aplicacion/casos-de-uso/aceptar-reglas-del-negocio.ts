import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { NoAutenticado } from '../../../compartido/dominio/errores.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import { vistaDePerfil, type VistaDePerfil } from '../vistas.js';

// Al final de la bienvenida (M1), la familia ve una sola vez el instructivo con las reglas del negocio
// (jornadas sin hora exacta, cuándo se cobra, cancelación, verificación, alcance de la teleasistencia) y
// las acepta. Idempotente: si ya las había visto, no pasa nada (Usuario.aceptarReglasDelNegocio no pisa la
// fecha original).
export class AceptarReglasDelNegocio {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(usuarioId: string): Promise<VistaDePerfil> {
    return this.unidadDeTrabajo.ejecutar(async () => {
      const usuario = await this.usuarios.buscarPorIdParaActualizar(
        usuarioId as UsuarioId,
      );
      if (usuario?.estado !== 'activo') throw new NoAutenticado();
      usuario.aceptarReglasDelNegocio(this.reloj.ahora());
      await this.usuarios.actualizar(usuario);
      return vistaDePerfil(usuario);
    });
  }
}
