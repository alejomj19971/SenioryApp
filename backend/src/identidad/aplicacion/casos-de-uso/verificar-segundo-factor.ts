import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { NoAutenticado } from '../../../compartido/dominio/errores.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { CifradorDeSecretos } from '../puertos/salida/cifrador-de-secretos.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { GeneradorDeTotp } from '../puertos/salida/generador-de-totp.js';
import type { RepositorioDesafiosDeSegundoFactor } from '../puertos/salida/repositorio-desafios-de-segundo-factor.js';
import type { RepositorioSegundosFactores } from '../puertos/salida/repositorio-segundos-factores.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type { EmisorDeSesiones } from '../servicios/emisor-de-sesiones.js';
import { vistaDeUsuario } from '../vistas.js';
import type { ResultadoDeAutenticacion } from './registrar-familiar.js';

type Desenlace =
  | { tipo: 'exito'; usuarioId: UsuarioId; resultado: ResultadoDeAutenticacion }
  | { tipo: 'rechazado'; usuarioId: UsuarioId | null; motivo: string };

// Siempre lo mismo, acierte o no el motivo: igual que con la contraseña, no hay que delatar si el
// desafío venció, ya se usó, o el código estaba mal.
function desafioInvalido(): NoAutenticado {
  return new NoAutenticado(
    'El código no es correcto o ya venció. Inicia sesión de nuevo.',
    'segundo_factor.desafio_invalido',
  );
}

// El último paso del login de un administrador con segundo factor: el desafío demuestra que ya pasó la
// contraseña: falta el código de su app autenticadora para que de verdad se le dé la sesión.
export class VerificarSegundoFactorDeInicioDeSesion {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly segundosFactores: RepositorioSegundosFactores,
    private readonly desafios: RepositorioDesafiosDeSegundoFactor,
    private readonly totp: GeneradorDeTotp,
    private readonly cifrador: CifradorDeSecretos,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly sesiones: EmisorDeSesiones,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    desafioToken: string,
    codigo: string,
  ): Promise<ResultadoDeAutenticacion> {
    const hash = this.tokensOpacos.hashDe(desafioToken);
    const desenlace = await this.unidadDeTrabajo.ejecutar(
      (): Promise<Desenlace> => this.verificar(hash, codigo),
    );

    if (desenlace.tipo === 'rechazado') {
      await this.auditoria.registrar({
        actorId: desenlace.usuarioId,
        accion: 'identidad.verificar_segundo_factor',
        recursoTipo: 'usuario',
        recursoId: desenlace.usuarioId,
        resultado: 'denegado',
        metadatos: { motivo: desenlace.motivo },
      });
      throw desafioInvalido();
    }
    await this.auditoria.registrar({
      actorId: desenlace.usuarioId,
      accion: 'identidad.verificar_segundo_factor',
      recursoTipo: 'usuario',
      recursoId: desenlace.usuarioId,
      resultado: 'permitido',
    });
    return desenlace.resultado;
  }

  private async verificar(
    hash: Uint8Array,
    codigo: string,
  ): Promise<Desenlace> {
    const ahora = this.reloj.ahora();
    const desafio = await this.desafios.buscarPorHashParaActualizar(hash);
    if (desafio === null || desafio.evaluar(ahora) !== 'valido') {
      return {
        tipo: 'rechazado',
        usuarioId: desafio?.usuarioId ?? null,
        motivo: desafio === null ? 'desafio_desconocido' : desafio.evaluar(ahora),
      };
    }
    const usuario = await this.usuarios.buscarPorIdParaActualizar(
      desafio.usuarioId,
    );
    if (usuario === null || !usuario.puedeIniciarSesion(ahora)) {
      return {
        tipo: 'rechazado',
        usuarioId: desafio.usuarioId,
        motivo: 'cuenta_no_disponible',
      };
    }
    const segundoFactor = await this.segundosFactores.buscarPorUsuarioId(
      usuario.id,
    );
    if (segundoFactor?.estaActivo !== true) {
      // Se desactivó entre que se pidió el desafío y ahora: no hay con qué verificar el código.
      return {
        tipo: 'rechazado',
        usuarioId: usuario.id,
        motivo: 'segundo_factor_inactivo',
      };
    }
    const secreto = this.cifrador.descifrar(segundoFactor.secretoCifrado);
    if (!this.totp.verificar(secreto, codigo, ahora)) {
      return {
        tipo: 'rechazado',
        usuarioId: usuario.id,
        motivo: 'codigo_incorrecto',
      };
    }

    desafio.usar(ahora);
    await this.desafios.actualizar(desafio);
    const { tokens } = await this.sesiones.emitir(usuario, ahora);
    return {
      tipo: 'exito',
      usuarioId: usuario.id,
      resultado: { usuario: vistaDeUsuario(usuario), tokens },
    };
  }
}
