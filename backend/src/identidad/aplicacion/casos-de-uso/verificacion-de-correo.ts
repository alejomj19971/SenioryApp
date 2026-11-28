import { Logger } from '@nestjs/common';
import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import type { UsuarioId } from '../../dominio/ids.js';
import { TokenDeRecuperacion } from '../../dominio/token-de-recuperacion.js';
import type { EnviadorDeRecuperacion } from '../puertos/salida/enviador-de-recuperacion.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { RepositorioTokensDeRecuperacion } from '../puertos/salida/repositorio-tokens-de-recuperacion.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';

// A diferencia del enlace de recuperación (30 minutos, es una llave a la cuenta), este solo confirma que un correo es de
// la persona: puede esperar en la bandeja un día sin riesgo.
export const DURACION_DEL_ENLACE_DE_VERIFICACION_MS = 24 * 60 * 60_000;
// Entre un enlace y el siguiente de la misma cuenta: pedir uno no debe servir para llenar de correos una bandeja.
export const ESPERA_ENTRE_ENLACES_DE_VERIFICACION_MS = 60_000;

export interface OpcionesDeVerificacionDeCorreo {
  // Dirección del frontend (primer origen permitido): el enlace apunta a su pantalla de confirmar.
  urlDelFrontend: string;
}

// Qué pasó al pedir el enlace. Ninguno es un error: quien lo pide (la propia persona, o el registro) decide qué decir.
export type ResultadoDeSolicitudDeVerificacion =
  | 'enviado'
  | 'ya_verificado'
  | 'demasiado_pronto'
  // No hay un canal de correo configurado, o la cuenta no existe/no está activa.
  | 'no_disponible'
  // El canal falló al enviar (queda auditado); la persona puede volver a pedirlo.
  | 'fallo_de_envio';

type Desenlace =
  | { tipo: 'sin_cuenta' }
  | { tipo: 'ya_verificado' }
  | { tipo: 'demasiado_pronto' }
  | {
      tipo: 'emitido';
      nombre: string;
      correo: string;
      token: string;
      expiraEn: Date;
    };

// Envía a la persona un enlace de un solo uso para confirmar que el correo con el que se registró es suyo. Sin esa
// confirmación no recibe avisos por correo: así nadie recibe mensajes de Seniory por haberse escrito su dirección (o
// haberla equivocado) en un registro ajeno.
//
// Solo sirve el último enlace que se pidió. Pedirlo para una cuenta ya verificada no hace nada.
export class SolicitarVerificacionDeCorreo {
  private readonly registroDeLog = new Logger('VerificacionDeCorreo');

  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly tokens: RepositorioTokensDeRecuperacion,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly enviador: EnviadorDeRecuperacion,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly opciones: OpcionesDeVerificacionDeCorreo,
  ) {}

  async ejecutar(
    usuarioId: string,
  ): Promise<ResultadoDeSolicitudDeVerificacion> {
    if (!this.enviador.disponible) return 'no_disponible';

    const ahora = this.reloj.ahora();
    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<Desenlace> => {
        // Con bloqueo: dos peticiones simultáneas de la misma cuenta se atienden una tras otra, y la segunda
        // encuentra el enlace recién creado y no manda otro correo.
        const usuario = await this.usuarios.buscarPorIdParaActualizar(
          usuarioId as UsuarioId,
        );
        if (usuario?.estado !== 'activo') return { tipo: 'sin_cuenta' };
        if (usuario.correoVerificadoEn !== null) {
          return { tipo: 'ya_verificado' };
        }

        const ultimo = await this.tokens.buscarUltimoDeUsuario(usuario.id);
        if (
          ultimo !== null &&
          ahora.getTime() - ultimo.creadoEn.getTime() <
            ESPERA_ENTRE_ENLACES_DE_VERIFICACION_MS
        ) {
          return { tipo: 'demasiado_pronto' };
        }

        await this.tokens.invalidarPendientesDeUsuario(usuario.id, ahora);
        const opaco = this.tokensOpacos.generar();
        const token = TokenDeRecuperacion.emitir({
          id: this.ids.nuevo<'TokenDeRecuperacion'>(),
          usuarioId: usuario.id,
          hashDelToken: opaco.hash,
          ahora,
          duracionMs: DURACION_DEL_ENLACE_DE_VERIFICACION_MS,
        });
        await this.tokens.guardar(token);
        return {
          tipo: 'emitido',
          nombre: usuario.nombre.valor,
          correo: usuario.correo.valor,
          token: opaco.token,
          expiraEn: token.expiraEn,
        };
      },
    );

    switch (desenlace.tipo) {
      case 'sin_cuenta':
        return 'no_disponible';
      case 'ya_verificado':
        return 'ya_verificado';
      case 'demasiado_pronto':
        return 'demasiado_pronto';
      case 'emitido':
        break;
    }

    try {
      // Fuera de la transacción: un proveedor lento no debe retener una conexión de la base de datos.
      await this.enviador.enviarVerificacion({
        nombre: desenlace.nombre,
        correo: desenlace.correo,
        enlace: `${this.opciones.urlDelFrontend}/verificar-correo?token=${encodeURIComponent(desenlace.token)}`,
        expiraEn: desenlace.expiraEn,
      });
    } catch (error) {
      await this.auditoria.registrar({
        actorId: usuarioId,
        accion: 'identidad.solicitar_verificacion_de_correo',
        recursoTipo: 'usuario',
        recursoId: usuarioId,
        resultado: 'error',
        metadatos: { motivo: 'fallo_de_envio' },
      });
      this.registroDeLog.error(
        `No se pudo enviar el enlace de verificación: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'fallo_de_envio';
    }
    await this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'identidad.solicitar_verificacion_de_correo',
      recursoTipo: 'usuario',
      recursoId: usuarioId,
      resultado: 'permitido',
    });
    return 'enviado';
  }

  // Para el registro: se pide el enlace sin que la persona espere el correo, y un fallo nunca tumba el registro (la
  // persona puede pedirlo otra vez desde su cuenta). No devuelve nada ni lanza nada.
  ejecutarEnSegundoPlano(usuarioId: string): void {
    void this.ejecutar(usuarioId).catch((error: unknown) => {
      this.registroDeLog.error(
        `La solicitud de verificación de correo falló: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}

// Un enlace vencido, ya usado, inventado o de una cuenta que no está activa se ven igual desde afuera: quien prueba
// enlaces no debe poder distinguir cuál fue su error. El motivo real queda en la auditoría.
function enlaceNoValido(): ErrorDeValidacion {
  return new ErrorDeValidacion(
    'El enlace no es válido o ya venció. Pide uno nuevo desde tu cuenta.',
    'verificacion_de_correo.enlace_no_valido',
  );
}

type DesenlaceDeConfirmacion =
  | { tipo: 'confirmado'; usuarioId: UsuarioId }
  | { tipo: 'rechazado'; usuarioId: UsuarioId | null; motivo: string };

// Abrir el enlace que llegó al correo: marca el correo como verificado y gasta el enlace (y cualquier otro pendiente de esa
// cuenta). No inicia sesión ni cambia nada más.
//
// Es idempotente a propósito: si el enlace ya se usó pero el correo YA está verificado (un doble clic, o un antivirus que
// abrió el enlace antes que la persona), se responde éxito en vez de un error que la asustaría.
export class ConfirmarCorreo {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly tokens: RepositorioTokensDeRecuperacion,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(token: string): Promise<void> {
    const hashDelToken = this.tokensOpacos.hashDe(token);
    const ahora = this.reloj.ahora();

    // Primero se descarta un enlace falso sin abrir una transacción.
    const previo = await this.tokens.buscarPorHashDelToken(hashDelToken);
    if (previo === null) {
      await this.auditarDenegado(null, 'enlace_desconocido');
      throw enlaceNoValido();
    }
    const estadoPrevio = previo.evaluar(ahora);
    if (estadoPrevio === 'usado') {
      const usuario = await this.usuarios.buscarPorId(previo.usuarioId);
      if (usuario?.correoVerificadoEn != null) return;
    }
    if (estadoPrevio !== 'valido') {
      await this.auditarDenegado(previo.usuarioId, estadoPrevio);
      throw enlaceNoValido();
    }

    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<DesenlaceDeConfirmacion> => {
        // Con bloqueo: dos usos simultáneos del mismo enlace se atienden uno tras otro.
        const bloqueado =
          await this.tokens.buscarPorHashParaActualizar(hashDelToken);
        const instante = this.reloj.ahora();
        if (bloqueado === null || bloqueado.evaluar(instante) !== 'valido') {
          return {
            tipo: 'rechazado',
            usuarioId: bloqueado?.usuarioId ?? null,
            motivo: bloqueado?.evaluar(instante) ?? 'enlace_desconocido',
          };
        }
        const usuario = await this.usuarios.buscarPorIdParaActualizar(
          bloqueado.usuarioId,
        );
        if (usuario?.estado !== 'activo') {
          return {
            tipo: 'rechazado',
            usuarioId: bloqueado.usuarioId,
            motivo: 'cuenta_no_disponible',
          };
        }

        bloqueado.usar(instante);
        await this.tokens.actualizar(bloqueado);
        await this.tokens.invalidarPendientesDeUsuario(usuario.id, instante);
        usuario.verificarCorreo(instante);
        await this.usuarios.actualizar(usuario);
        return { tipo: 'confirmado', usuarioId: usuario.id };
      },
    );

    if (desenlace.tipo === 'rechazado') {
      await this.auditarDenegado(desenlace.usuarioId, desenlace.motivo);
      throw enlaceNoValido();
    }
    await this.auditoria.registrar({
      actorId: desenlace.usuarioId,
      accion: 'identidad.confirmar_correo',
      recursoTipo: 'usuario',
      recursoId: desenlace.usuarioId,
      resultado: 'permitido',
    });
  }

  private auditarDenegado(
    usuarioId: UsuarioId | null,
    motivo: string,
  ): Promise<void> {
    return this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'identidad.confirmar_correo',
      recursoTipo: 'usuario',
      recursoId: usuarioId,
      resultado: 'denegado',
      metadatos: { motivo },
    });
  }
}
