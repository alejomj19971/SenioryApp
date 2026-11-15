import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import {
  Contrasena,
  type DiccionarioDeContrasenasComunes,
} from '../../dominio/contrasena.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { HashDeContrasenas } from '../puertos/salida/hash-de-contrasenas.js';
import type { RepositorioDesafiosDeSegundoFactor } from '../puertos/salida/repositorio-desafios-de-segundo-factor.js';
import type { RepositorioSegundosFactores } from '../puertos/salida/repositorio-segundos-factores.js';
import type { RepositorioSesiones } from '../puertos/salida/repositorio-sesiones.js';
import type { RepositorioTokensDeRecuperacion } from '../puertos/salida/repositorio-tokens-de-recuperacion.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';

export interface EntradaDeRestablecimiento {
  // El token del enlace que recibió la persona.
  token: string;
  contrasenaNueva: string;
}

export interface ResultadoDeRestablecimiento {
  // Si tenía un segundo factor activo, demostrar que controla su correo también lo apaga: es el
  // respaldo para cuando se pierde el celular. Vuelve a activarse desde su panel cuando quiera.
  segundoFactorDesactivado: boolean;
}

type Desenlace =
  | {
      tipo: 'restablecida';
      usuarioId: UsuarioId;
      segundoFactorDesactivado: boolean;
    }
  | { tipo: 'rechazada'; usuarioId: UsuarioId | null; motivo: string };

// Un enlace expirado, ya usado, inventado o de una cuenta eliminada se ven igual desde afuera: quien
// prueba enlaces no debe poder distinguir cuál fue su error. El motivo real queda en la auditoría.
function enlaceNoValido(): ErrorDeValidacion {
  return new ErrorDeValidacion(
    'El enlace no es válido o ya venció. Pide uno nuevo.',
    'recuperacion.enlace_no_valido',
  );
}

// Elegir una contraseña nueva con el enlace que llegó al correo. Al terminar:
// - el enlace queda gastado (y cualquier otro pendiente de esa cuenta);
// - TODAS las sesiones de la cuenta se cierran: si alguien más la tenía abierta, queda fuera;
// - el bloqueo por intentos fallidos se levanta.
// No inicia sesión: la persona entra con su contraseña nueva.
export class RestablecerContrasena {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly tokens: RepositorioTokensDeRecuperacion,
    private readonly sesiones: RepositorioSesiones,
    private readonly segundosFactores: RepositorioSegundosFactores,
    private readonly desafios: RepositorioDesafiosDeSegundoFactor,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly hash: HashDeContrasenas,
    private readonly comunes: DiccionarioDeContrasenasComunes,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    entrada: EntradaDeRestablecimiento,
  ): Promise<ResultadoDeRestablecimiento> {
    const contrasena = Contrasena.crear(entrada.contrasenaNueva, this.comunes);
    const hashDelToken = this.tokensOpacos.hashDe(entrada.token);
    const ahora = this.reloj.ahora();

    // Primero se descarta un enlace falso sin gastar el costoso hash de la contraseña.
    const previo = await this.tokens.buscarPorHashDelToken(hashDelToken);
    if (previo === null || previo.evaluar(ahora) !== 'valido') {
      await this.auditarDenegado(
        previo?.usuarioId ?? null,
        previo === null ? 'enlace_desconocido' : previo.evaluar(ahora),
      );
      throw enlaceNoValido();
    }

    const nuevoHash = await this.hash.calcular(contrasena);
    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<Desenlace> => {
        // Con bloqueo: dos usos simultáneos del mismo enlace se atienden uno tras otro.
        const token =
          await this.tokens.buscarPorHashParaActualizar(hashDelToken);
        const instante = this.reloj.ahora();
        if (token === null || token.evaluar(instante) !== 'valido') {
          return {
            tipo: 'rechazada',
            usuarioId: token?.usuarioId ?? null,
            motivo: token?.evaluar(instante) ?? 'enlace_desconocido',
          };
        }
        const usuario = await this.usuarios.buscarPorIdParaActualizar(
          token.usuarioId,
        );
        if (usuario?.estado !== 'activo') {
          return {
            tipo: 'rechazada',
            usuarioId: token.usuarioId,
            motivo: 'cuenta_no_disponible',
          };
        }

        token.usar(instante);
        await this.tokens.actualizar(token);
        await this.tokens.invalidarPendientesDeUsuario(usuario.id, instante);
        usuario.credencial.restablecer(nuevoHash, instante);
        await this.usuarios.actualizar(usuario);
        await this.sesiones.revocarTodasDeUsuario(usuario.id, instante);

        // Demostrar que controla su correo (el enlace de recuperación) es el respaldo para cuando se
        // pierde el celular: apaga el segundo factor para que pueda volver a entrar, y lo reconfigura
        // desde su panel cuando quiera.
        const segundoFactor = await this.segundosFactores.buscarPorUsuarioId(
          usuario.id,
        );
        const segundoFactorDesactivado = segundoFactor !== null;
        if (segundoFactorDesactivado) {
          await this.segundosFactores.eliminar(usuario.id);
          await this.desafios.invalidarPendientesDeUsuario(
            usuario.id,
            instante,
          );
        }
        return {
          tipo: 'restablecida',
          usuarioId: usuario.id,
          segundoFactorDesactivado,
        };
      },
    );

    if (desenlace.tipo === 'rechazada') {
      await this.auditarDenegado(desenlace.usuarioId, desenlace.motivo);
      throw enlaceNoValido();
    }
    await this.auditoria.registrar({
      actorId: desenlace.usuarioId,
      accion: 'identidad.restablecer_contrasena',
      recursoTipo: 'usuario',
      recursoId: desenlace.usuarioId,
      resultado: 'permitido',
      metadatos: {
        segundoFactorDesactivado: desenlace.segundoFactorDesactivado,
      },
    });
    return { segundoFactorDesactivado: desenlace.segundoFactorDesactivado };
  }

  private auditarDenegado(
    usuarioId: UsuarioId | null,
    motivo: string,
  ): Promise<void> {
    return this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'identidad.restablecer_contrasena',
      recursoTipo: 'usuario',
      recursoId: usuarioId,
      resultado: 'denegado',
      metadatos: { motivo },
    });
  }
}
