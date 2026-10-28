import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  NoAutenticado,
} from '../../../compartido/dominio/errores.js';
import { Contrasena } from '../../dominio/contrasena.js';
import { Correo } from '../../dominio/correo.js';
import type { UsuarioId } from '../../dominio/ids.js';
import type { Usuario } from '../../dominio/usuario.js';
import type { HashDeContrasenas } from '../puertos/salida/hash-de-contrasenas.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type { EmisorDeSesiones } from '../servicios/emisor-de-sesiones.js';
import { vistaDeUsuario } from '../vistas.js';
import type { ResultadoDeAutenticacion } from './registrar-familiar.js';

export interface EntradaDeInicioDeSesion {
  correo: string;
  contrasena: string;
}

type MotivoDeRechazo =
  | 'correo_invalido'
  | 'cuenta_desconocida'
  | 'cuenta_no_disponible'
  | 'contrasena_incorrecta';

type Desenlace =
  | { tipo: 'exito'; usuario: Usuario; resultado: ResultadoDeAutenticacion }
  | {
      tipo: 'rechazado';
      usuarioId: UsuarioId | null;
      motivo: MotivoDeRechazo;
      bloqueada: boolean;
    };

// Al cliente siempre le llega lo mismo, sin importar el motivo (correo sin cuenta, contraseña
// errónea, cuenta bloqueada o eliminada): así no se puede averiguar qué correos tienen cuenta. El
// motivo real solo queda en la auditoría.
function credencialesInvalidas(): NoAutenticado {
  return new NoAutenticado(
    'El correo o la contraseña no son correctos',
    'auth.credenciales_invalidas',
  );
}

export class IniciarSesion {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly hash: HashDeContrasenas,
    private readonly sesiones: EmisorDeSesiones,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    entrada: EntradaDeInicioDeSesion,
  ): Promise<ResultadoDeAutenticacion> {
    const desenlace = await this.unidadDeTrabajo.ejecutar(() =>
      this.intentar(entrada),
    );

    // Se registra FUERA de la transacción y después de confirmarla: un fallo debe quedar anotado, y el
    // contador de intentos también, aunque el cliente reciba un error.
    if (desenlace.tipo === 'exito') {
      await this.auditoria.registrar({
        actorId: desenlace.usuario.id,
        accion: 'identidad.iniciar_sesion',
        recursoTipo: 'usuario',
        recursoId: desenlace.usuario.id,
        resultado: 'permitido',
      });
      return desenlace.resultado;
    }
    await this.auditoria.registrar({
      actorId: desenlace.usuarioId,
      accion: 'identidad.iniciar_sesion',
      recursoTipo: 'usuario',
      recursoId: desenlace.usuarioId,
      resultado: 'denegado',
      metadatos: { motivo: desenlace.motivo, bloqueada: desenlace.bloqueada },
    });
    throw credencialesInvalidas();
  }

  // Dentro de la transacción la credencial queda bloqueada (FOR NO KEY UPDATE): intentos simultáneos
  // con la misma cuenta se atienden uno tras otro y ninguno se pierde en el contador de fallos. Por eso
  // un rechazo se DEVUELVE en vez de lanzarse: lanzar revertiría el fallo que acaba de anotarse.
  private async intentar(entrada: EntradaDeInicioDeSesion): Promise<Desenlace> {
    const contrasena = Contrasena.paraVerificar(entrada.contrasena);

    const correo = this.correoDe(entrada.correo);
    if (correo === null) {
      await this.hash.simularVerificacion(contrasena);
      return rechazo(null, 'correo_invalido');
    }

    const usuario = await this.usuarios.buscarPorCorreoParaActualizar(correo);
    if (usuario === null) {
      await this.hash.simularVerificacion(contrasena);
      return rechazo(null, 'cuenta_desconocida');
    }

    const ahora = this.reloj.ahora();
    if (!usuario.puedeIniciarSesion(ahora)) {
      // Bloqueada o eliminada: ni siquiera se mira la contraseña, y los intentos durante el bloqueo no
      // cuentan. Se gasta el mismo tiempo para no delatar la diferencia.
      await this.hash.simularVerificacion(contrasena);
      return rechazo(usuario.id, 'cuenta_no_disponible');
    }

    const correcta = await this.hash.verificar(
      usuario.credencial.hash,
      contrasena,
    );
    if (!correcta) {
      const fallo = usuario.credencial.registrarFallo(ahora);
      await this.usuarios.actualizar(usuario);
      return rechazo(usuario.id, 'contrasena_incorrecta', fallo.bloqueada);
    }

    usuario.credencial.registrarExito(ahora);
    await this.usuarios.actualizar(usuario);
    const { tokens } = await this.sesiones.emitir(usuario, ahora);
    return {
      tipo: 'exito',
      usuario,
      resultado: { usuario: vistaDeUsuario(usuario), tokens },
    };
  }

  // Un correo mal formado es un intento fallido más, no un error de validación: el cliente no debe
  // poder distinguirlo de una cuenta que no existe.
  private correoDe(texto: string): Correo | null {
    try {
      return Correo.crear(texto);
    } catch (error) {
      if (error instanceof ErrorDeValidacion) return null;
      throw error;
    }
  }
}

function rechazo(
  usuarioId: UsuarioId | null,
  motivo: MotivoDeRechazo,
  bloqueada = false,
): Desenlace {
  return { tipo: 'rechazado', usuarioId, motivo, bloqueada };
}
