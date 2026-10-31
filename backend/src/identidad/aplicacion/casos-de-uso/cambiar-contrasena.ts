import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  NoAutenticado,
} from '../../../compartido/dominio/errores.js';
import {
  Contrasena,
  type DiccionarioDeContrasenasComunes,
} from '../../dominio/contrasena.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { HashDeContrasenas } from '../puertos/salida/hash-de-contrasenas.js';
import type { RepositorioSesiones } from '../puertos/salida/repositorio-sesiones.js';
import type { RepositorioTokensDeRecuperacion } from '../puertos/salida/repositorio-tokens-de-recuperacion.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type {
  EmisorDeSesiones,
  TokensDeSesion,
} from '../servicios/emisor-de-sesiones.js';

export interface EntradaDeCambioDeContrasena {
  contrasenaActual: string;
  contrasenaNueva: string;
}

type Desenlace =
  | { tipo: 'cambiada'; tokens: TokensDeSesion }
  | { tipo: 'rechazada'; motivo: 'actual_incorrecta' | 'cuenta_bloqueada' };

// Cambiar la contraseña conociendo la actual, con la sesión abierta. Al terminar se cierran TODAS las
// sesiones de la cuenta (en todos los dispositivos) y se abre una nueva para quien la cambió: así, si
// alguien más estaba dentro, queda fuera.
//
// Equivocarse con la contraseña actual cuenta como un intento fallido de inicio de sesión (y puede
// bloquear la cuenta): este endpoint no puede ser una vía para adivinar la contraseña con una sesión
// robada.
export class CambiarContrasena {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly sesiones: RepositorioSesiones,
    private readonly tokens: RepositorioTokensDeRecuperacion,
    private readonly emisorDeSesiones: EmisorDeSesiones,
    private readonly hash: HashDeContrasenas,
    private readonly comunes: DiccionarioDeContrasenasComunes,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    usuarioId: string,
    entrada: EntradaDeCambioDeContrasena,
  ): Promise<TokensDeSesion> {
    const actual = Contrasena.paraVerificar(entrada.contrasenaActual);
    const nueva = Contrasena.crear(entrada.contrasenaNueva, this.comunes);
    if (actual.revelar() === nueva.revelar()) {
      throw new ErrorDeValidacion(
        'La contraseña nueva debe ser distinta de la actual',
        'contrasena.igual_a_la_actual',
      );
    }
    const nuevoHash = await this.hash.calcular(nueva);
    const id = usuarioId as UsuarioId;

    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<Desenlace> => {
        // Con bloqueo: se serializa con los inicios de sesión de la misma cuenta.
        const usuario = await this.usuarios.buscarPorIdParaActualizar(id);
        if (usuario?.estado !== 'activo') throw new NoAutenticado();
        const ahora = this.reloj.ahora();
        if (usuario.credencial.estaBloqueada(ahora)) {
          return { tipo: 'rechazada', motivo: 'cuenta_bloqueada' };
        }
        if (!(await this.hash.verificar(usuario.credencial.hash, actual))) {
          usuario.credencial.registrarFallo(ahora);
          await this.usuarios.actualizar(usuario);
          return { tipo: 'rechazada', motivo: 'actual_incorrecta' };
        }

        usuario.credencial.restablecer(nuevoHash, ahora);
        await this.usuarios.actualizar(usuario);
        // Un enlace de recuperación pendiente ya no tiene sentido.
        await this.tokens.invalidarPendientesDeUsuario(usuario.id, ahora);
        await this.sesiones.revocarTodasDeUsuario(usuario.id, ahora);
        const { tokens } = await this.emisorDeSesiones.emitir(usuario, ahora);
        return { tipo: 'cambiada', tokens };
      },
    );

    if (desenlace.tipo === 'rechazada') {
      await this.auditoria.registrar({
        actorId: id,
        accion: 'identidad.cambiar_contrasena',
        recursoTipo: 'usuario',
        recursoId: id,
        resultado: 'denegado',
        metadatos: { motivo: desenlace.motivo },
      });
      // Igual para «incorrecta» y «bloqueada»: no se le dice a quien prueba cuántos intentos le quedan.
      throw new ErrorDeValidacion(
        'La contraseña actual no es correcta',
        'contrasena.actual_incorrecta',
      );
    }
    await this.auditoria.registrar({
      actorId: id,
      accion: 'identidad.cambiar_contrasena',
      recursoTipo: 'usuario',
      recursoId: id,
      resultado: 'permitido',
    });
    return desenlace.tokens;
  }
}
