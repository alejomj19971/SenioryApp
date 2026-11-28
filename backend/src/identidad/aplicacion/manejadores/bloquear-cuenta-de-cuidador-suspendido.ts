import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type {
  CuidadorReactivado,
  CuidadorSuspendido,
} from '../../../compartido/eventos/directorio.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { RepositorioSesiones } from '../puertos/salida/repositorio-sesiones.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';

// Cuando un administrador suspende a un cuidador, su cuenta deja de poder entrar: no inicia sesión, no renueva la sesión
// que tuviera abierta (se cierran todas) y su perfil deja de responder. Los datos se conservan; se puede reactivar.
//
// Solo toca una cuenta de CUIDADOR y solo si está activa: este aviso nunca debe poder suspender la cuenta de un familiar
// o de un administrador, ni resucitar una eliminada. Es idempotente: si el evento llega dos veces, la segunda no hace nada.
export class SuspenderCuentaDeCuidador implements ManejadorDeEventos<CuidadorSuspendido> {
  readonly nombre = 'identidad.suspender_cuenta_de_cuidador';
  readonly tipo = 'directorio.cuidador_suspendido';

  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly sesiones: RepositorioSesiones,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: CuidadorSuspendido): Promise<void> {
    const { usuarioId } = evento.datos;
    // Un cuidador cargado por el directorio puede no tener cuenta todavía: no hay nada que bloquear.
    if (usuarioId === null) return;
    const usuario = await this.usuarios.buscarPorIdParaActualizar(
      usuarioId as UsuarioId,
    );
    if (usuario?.rol !== 'cuidador' || usuario.estado !== 'activo') return;

    const ahora = this.reloj.ahora();
    usuario.suspender(ahora);
    await this.usuarios.actualizar(usuario);
    await this.sesiones.revocarTodasDeUsuario(usuario.id, ahora);
    await this.auditoria.registrar({
      actorId: null,
      accion: 'identidad.suspender_cuenta',
      recursoTipo: 'usuario',
      recursoId: usuario.id,
      resultado: 'permitido',
      metadatos: { cuidadorId: evento.datos.cuidadorId },
    });
  }
}

// Lo contrario: al reactivar al cuidador, su cuenta vuelve a poder entrar. Solo reabre una cuenta SUSPENDIDA de cuidador.
export class ReactivarCuentaDeCuidador implements ManejadorDeEventos<CuidadorReactivado> {
  readonly nombre = 'identidad.reactivar_cuenta_de_cuidador';
  readonly tipo = 'directorio.cuidador_reactivado';

  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: CuidadorReactivado): Promise<void> {
    const { usuarioId } = evento.datos;
    if (usuarioId === null) return;
    const usuario = await this.usuarios.buscarPorIdParaActualizar(
      usuarioId as UsuarioId,
    );
    if (usuario?.rol !== 'cuidador' || usuario.estado !== 'suspendido') return;

    usuario.reactivar(this.reloj.ahora());
    await this.usuarios.actualizar(usuario);
    await this.auditoria.registrar({
      actorId: null,
      accion: 'identidad.reactivar_cuenta',
      recursoTipo: 'usuario',
      recursoId: usuario.id,
      resultado: 'permitido',
      metadatos: { cuidadorId: evento.datos.cuidadorId },
    });
  }
}
