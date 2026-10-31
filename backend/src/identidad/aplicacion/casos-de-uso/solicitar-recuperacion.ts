import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import { Correo } from '../../dominio/correo.js';
import type { UsuarioId } from '../../dominio/ids.js';
import { TokenDeRecuperacion } from '../../dominio/token-de-recuperacion.js';
import type { EnviadorDeRecuperacion } from '../puertos/salida/enviador-de-recuperacion.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { RepositorioTokensDeRecuperacion } from '../puertos/salida/repositorio-tokens-de-recuperacion.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';

// El enlace vive poco: es una llave a la cuenta que viaja por correo.
export const DURACION_DEL_ENLACE_MS = 30 * 60_000;
// Entre un enlace y el siguiente de la misma cuenta: evita llenar de correos a alguien (y cuesta menos
// que dejar que cualquiera dispare envíos a una dirección ajena).
export const ESPERA_ENTRE_ENLACES_MS = 60_000;

export interface OpcionesDeRecuperacion {
  // Dirección del frontend (primer origen permitido): el enlace apunta a su pantalla de restablecer.
  urlDelFrontend: string;
}

type Desenlace =
  | { tipo: 'sin_cuenta' }
  | { tipo: 'demasiado_pronto'; usuarioId: UsuarioId }
  | {
      tipo: 'emitido';
      usuarioId: UsuarioId;
      nombre: string;
      correo: string;
      token: string;
      expiraEn: Date;
    };

// «Olvidé mi contraseña»: envía a la persona un enlace de un solo uso para elegir otra.
//
// Responde LO MISMO exista o no la cuenta: si no, esta pantalla serviría para averiguar qué correos
// tienen cuenta. El envío no se espera (un servicio de correo lento delataría las cuentas que existen);
// si falla, queda auditado.
export class SolicitarRecuperacion {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly tokens: RepositorioTokensDeRecuperacion,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly enviador: EnviadorDeRecuperacion,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly opciones: OpcionesDeRecuperacion,
  ) {}

  async ejecutar(correoEscrito: string): Promise<void> {
    // Sin canal no hay nada que prometer: se dice la verdad (es igual para todas las cuentas).
    if (!this.enviador.disponible) {
      throw new ServicioNoDisponible(
        'La recuperación de contraseña no está disponible por ahora',
        'recuperacion.no_disponible',
      );
    }
    const correo = this.correoDe(correoEscrito);
    if (correo === null) {
      await this.auditarDenegado(null, 'correo_invalido');
      return;
    }

    const ahora = this.reloj.ahora();
    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<Desenlace> => {
        // Con bloqueo: dos peticiones simultáneas para la misma cuenta se atienden una tras otra, y la
        // segunda encuentra el enlace recién creado y no manda otro correo.
        const usuario =
          await this.usuarios.buscarPorCorreoParaActualizar(correo);
        if (usuario?.estado !== 'activo') return { tipo: 'sin_cuenta' };

        const ultimo = await this.tokens.buscarUltimoDeUsuario(usuario.id);
        if (
          ultimo !== null &&
          ahora.getTime() - ultimo.creadoEn.getTime() < ESPERA_ENTRE_ENLACES_MS
        ) {
          return { tipo: 'demasiado_pronto', usuarioId: usuario.id };
        }

        // Solo sirve el último enlace que se pidió.
        await this.tokens.invalidarPendientesDeUsuario(usuario.id, ahora);
        const opaco = this.tokensOpacos.generar();
        const token = TokenDeRecuperacion.emitir({
          id: this.ids.nuevo<'TokenDeRecuperacion'>(),
          usuarioId: usuario.id,
          hashDelToken: opaco.hash,
          ahora,
          duracionMs: DURACION_DEL_ENLACE_MS,
        });
        await this.tokens.guardar(token);
        return {
          tipo: 'emitido',
          usuarioId: usuario.id,
          nombre: usuario.nombre.valor,
          correo: usuario.correo.valor,
          token: opaco.token,
          expiraEn: token.expiraEn,
        };
      },
    );

    if (desenlace.tipo === 'sin_cuenta') {
      await this.auditarDenegado(null, 'cuenta_desconocida');
      return;
    }
    if (desenlace.tipo === 'demasiado_pronto') {
      await this.auditarDenegado(desenlace.usuarioId, 'demasiado_pronto');
      return;
    }

    await this.auditoria.registrar({
      actorId: desenlace.usuarioId,
      accion: 'identidad.solicitar_recuperacion',
      recursoTipo: 'usuario',
      recursoId: desenlace.usuarioId,
      resultado: 'permitido',
    });
    // Sin await a propósito: ver la nota de la clase.
    void this.enviar(desenlace);
  }

  private async enviar(
    desenlace: Extract<Desenlace, { tipo: 'emitido' }>,
  ): Promise<void> {
    try {
      await this.enviador.enviar({
        nombre: desenlace.nombre,
        correo: desenlace.correo,
        enlace: `${this.opciones.urlDelFrontend}/restablecer-contrasena?token=${encodeURIComponent(desenlace.token)}`,
        expiraEn: desenlace.expiraEn,
      });
    } catch {
      // El enlace ya no se puede reenviar (el token solo existe en este mensaje): la persona tendrá que
      // pedir otro. Queda constancia para que el equipo vea si el canal falla.
      await this.auditoria
        .registrar({
          actorId: desenlace.usuarioId,
          accion: 'identidad.solicitar_recuperacion',
          recursoTipo: 'usuario',
          recursoId: desenlace.usuarioId,
          resultado: 'error',
          metadatos: { motivo: 'envio_fallido' },
        })
        .catch(() => undefined);
    }
  }

  private auditarDenegado(
    usuarioId: UsuarioId | null,
    motivo: string,
  ): Promise<void> {
    return this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'identidad.solicitar_recuperacion',
      recursoTipo: 'usuario',
      recursoId: usuarioId,
      resultado: 'denegado',
      metadatos: { motivo },
    });
  }

  // Un correo mal escrito se trata igual que una cuenta que no existe.
  private correoDe(texto: string): Correo | null {
    try {
      return Correo.crear(texto);
    } catch (error) {
      if (error instanceof ErrorDeValidacion) return null;
      throw error;
    }
  }
}
