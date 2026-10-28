import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { NoAutenticado } from '../../../compartido/dominio/errores.js';
import type { FamiliaDeSesionesId, UsuarioId } from '../../dominio/ids.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { RepositorioSesiones } from '../puertos/salida/repositorio-sesiones.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type {
  EmisorDeSesiones,
  TokensDeSesion,
} from '../servicios/emisor-de-sesiones.js';

type MotivoDeRechazo =
  | 'desconocido'
  | 'revocada'
  | 'expirada'
  | 'reutilizada'
  | 'cuenta_no_disponible';

type Desenlace =
  | { tipo: 'renovada'; tokens: TokensDeSesion }
  | {
      tipo: 'rechazada';
      usuarioId: UsuarioId | null;
      familiaId: FamiliaDeSesionesId | null;
      motivo: MotivoDeRechazo;
      // Si el rechazo revocó la familia (robo probable), hay que dejarlo en la auditoría.
      familiaRevocada: boolean;
    };

function sesionInvalida(): NoAutenticado {
  return new NoAutenticado(
    'Tu sesión terminó; inicia sesión de nuevo',
    'auth.sesion_invalida',
  );
}

// Cambia un token de refresco por un par nuevo. El token usado queda marcado como reemplazado: si
// alguien lo presenta otra vez pasada la ventana de gracia, se asume que fue copiado y se revoca toda
// la familia (la persona legítima solo tiene que volver a iniciar sesión).
export class RenovarSesion {
  constructor(
    private readonly sesiones: RepositorioSesiones,
    private readonly usuarios: RepositorioUsuarios,
    private readonly emisorDeSesiones: EmisorDeSesiones,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(tokenDeRefresco: string): Promise<TokensDeSesion> {
    const hash = this.tokensOpacos.hashDe(tokenDeRefresco);
    const desenlace = await this.unidadDeTrabajo.ejecutar(() =>
      this.renovar(hash),
    );

    if (desenlace.tipo === 'renovada') return desenlace.tokens;

    if (desenlace.familiaRevocada) {
      await this.auditoria.registrar({
        actorId: desenlace.usuarioId,
        accion: 'identidad.revocar_familia_de_sesiones',
        recursoTipo: 'sesion',
        recursoId: desenlace.familiaId,
        resultado: 'denegado',
        metadatos: { motivo: desenlace.motivo },
      });
    }
    throw sesionInvalida();
  }

  // El rechazo se DEVUELVE (no se lanza): revocar la familia tiene que confirmarse.
  private async renovar(hash: Uint8Array): Promise<Desenlace> {
    // Bloquea la fila: dos renovaciones simultáneas con el mismo token se atienden una tras otra.
    const sesion = await this.sesiones.buscarPorHashDelToken(hash);
    if (sesion === null) return rechazo(null, null, 'desconocido');

    const ahora = this.reloj.ahora();
    const uso = sesion.evaluarUso(ahora);
    if (uso === 'revocada' || uso === 'expirada') {
      return rechazo(sesion.usuarioId, sesion.familiaId, uso);
    }
    if (uso === 'reutilizada') {
      await this.sesiones.revocarFamilia(sesion.familiaId, ahora);
      return rechazo(sesion.usuarioId, sesion.familiaId, uso, true);
    }

    // El rol y el estado se leen de la base en cada renovación: un cambio de rol o una cuenta
    // eliminada se aplican como máximo cuando venza el token de acceso (15 minutos).
    const usuario = await this.usuarios.buscarPorId(sesion.usuarioId);
    if (usuario === null || usuario.estado !== 'activo') {
      await this.sesiones.revocarFamilia(sesion.familiaId, ahora);
      return rechazo(
        sesion.usuarioId,
        sesion.familiaId,
        'cuenta_no_disponible',
        true,
      );
    }

    const { sesionId, tokens } = await this.emisorDeSesiones.emitir(
      usuario,
      ahora,
      sesion.familiaId,
    );
    // En la ventana de gracia `rotar` no cambia nada: conserva la primera marca de reemplazo.
    sesion.rotar(ahora, sesionId);
    await this.sesiones.actualizar(sesion);
    return { tipo: 'renovada', tokens };
  }
}

function rechazo(
  usuarioId: UsuarioId | null,
  familiaId: FamiliaDeSesionesId | null,
  motivo: MotivoDeRechazo,
  familiaRevocada = false,
): Desenlace {
  return { tipo: 'rechazada', usuarioId, familiaId, motivo, familiaRevocada };
}
