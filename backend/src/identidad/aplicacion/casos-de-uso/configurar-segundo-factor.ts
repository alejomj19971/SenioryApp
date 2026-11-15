import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  RecursoNoEncontrado,
} from '../../../compartido/dominio/errores.js';
import { idDesdeTexto } from '../../../compartido/dominio/id.js';
import { SegundoFactor } from '../../dominio/segundo-factor.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { CifradorDeSecretos } from '../puertos/salida/cifrador-de-secretos.js';
import type { GeneradorDeTotp } from '../puertos/salida/generador-de-totp.js';
import type { RepositorioDesafiosDeSegundoFactor } from '../puertos/salida/repositorio-desafios-de-segundo-factor.js';
import type { RepositorioSegundosFactores } from '../puertos/salida/repositorio-segundos-factores.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';

export interface ConfiguracionIniciada {
  uriDeInscripcion: string;
  // El secreto en texto plano, SOLO en esta respuesta (para que quien no pueda escanear el código QR lo
  // escriba a mano en su app). Nunca se guarda así; a partir de aquí solo existe cifrado.
  secretoManual: string;
}

// El propio administrador activa su segundo factor: genera un secreto nuevo (reemplaza cualquiera
// pendiente de antes, por si lo intentó y no terminó) y lo entrega como código QR y como texto. Todavía
// NO protege el login: eso solo pasa cuando `ConfirmarSegundoFactor` compruebe que quedó bien configurado.
export class IniciarConfiguracionDeSegundoFactor {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly segundosFactores: RepositorioSegundosFactores,
    private readonly totp: GeneradorDeTotp,
    private readonly cifrador: CifradorDeSecretos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(usuarioId: string): Promise<ConfiguracionIniciada> {
    const id = idDesdeTexto<'Usuario'>(usuarioId) as UsuarioId;
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) {
      throw new RecursoNoEncontrado(
        'No encontramos esa cuenta',
        'usuario.no_encontrado',
      );
    }
    const secreto = this.totp.generarSecreto();
    const ahora = this.reloj.ahora();
    const segundoFactor = SegundoFactor.iniciar(
      id,
      this.cifrador.cifrar(secreto),
      ahora,
    );
    await this.unidadDeTrabajo.ejecutar(() =>
      this.segundosFactores.guardarOReemplazar(segundoFactor),
    );
    await this.auditoria.registrar({
      actorId: id,
      accion: 'identidad.iniciar_segundo_factor',
      recursoTipo: 'usuario',
      recursoId: id,
      resultado: 'permitido',
    });
    return {
      uriDeInscripcion: this.totp.uriDeInscripcion(
        secreto,
        usuario.correo.valor,
      ),
      secretoManual: secreto,
    };
  }
}

function codigoInvalido(): ErrorDeValidacion {
  return new ErrorDeValidacion(
    'El código no es correcto. Revisa la hora de tu celular e inténtalo de nuevo.',
    'segundo_factor.codigo_invalido',
  );
}

// Confirma que el administrador configuró bien su app autenticadora: desde aquí, el login lo exige.
export class ConfirmarSegundoFactor {
  constructor(
    private readonly segundosFactores: RepositorioSegundosFactores,
    private readonly totp: GeneradorDeTotp,
    private readonly cifrador: CifradorDeSecretos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(usuarioId: string, codigo: string): Promise<void> {
    const id = idDesdeTexto<'Usuario'>(usuarioId) as UsuarioId;
    const ahora = this.reloj.ahora();
    await this.unidadDeTrabajo.ejecutar(async () => {
      const segundoFactor =
        await this.segundosFactores.buscarPorUsuarioIdParaActualizar(id);
      if (segundoFactor === null || segundoFactor.estaActivo) {
        await this.auditarDenegado(id, 'sin_configuracion_pendiente');
        throw codigoInvalido();
      }
      const secreto = this.cifrador.descifrar(segundoFactor.secretoCifrado);
      if (!this.totp.verificar(secreto, codigo, ahora)) {
        await this.auditarDenegado(id, 'codigo_incorrecto');
        throw codigoInvalido();
      }
      segundoFactor.activar(ahora);
      await this.segundosFactores.actualizar(segundoFactor);
    });
    await this.auditoria.registrar({
      actorId: id,
      accion: 'identidad.confirmar_segundo_factor',
      recursoTipo: 'usuario',
      recursoId: id,
      resultado: 'permitido',
    });
  }

  private auditarDenegado(usuarioId: UsuarioId, motivo: string): Promise<void> {
    return this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'identidad.confirmar_segundo_factor',
      recursoTipo: 'usuario',
      recursoId: usuarioId,
      resultado: 'denegado',
      metadatos: { motivo },
    });
  }
}

// El administrador lo apaga por su cuenta (por ejemplo, para reconfigurarlo desde cero). Cualquier
// desafío de login pendiente de esa cuenta queda sin servir: no tendría con qué verificarse.
export class DesactivarSegundoFactor {
  constructor(
    private readonly segundosFactores: RepositorioSegundosFactores,
    private readonly desafios: RepositorioDesafiosDeSegundoFactor,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(usuarioId: string): Promise<void> {
    const id = idDesdeTexto<'Usuario'>(usuarioId) as UsuarioId;
    const ahora = this.reloj.ahora();
    await this.unidadDeTrabajo.ejecutar(async () => {
      await this.segundosFactores.eliminar(id);
      await this.desafios.invalidarPendientesDeUsuario(id, ahora);
    });
    await this.auditoria.registrar({
      actorId: id,
      accion: 'identidad.desactivar_segundo_factor',
      recursoTipo: 'usuario',
      recursoId: id,
      resultado: 'permitido',
    });
  }
}
