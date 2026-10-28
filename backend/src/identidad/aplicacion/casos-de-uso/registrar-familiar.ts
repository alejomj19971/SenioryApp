import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { ContextoDePeticion } from '../../../compartido/aplicacion/puertos/contexto-de-peticion.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { PublicadorDeEventos } from '../../../compartido/aplicacion/puertos/publicador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import type { UsuarioRegistrado } from '../../../compartido/eventos/identidad.js';
import { AceptacionDePolitica } from '../../dominio/aceptacion-de-politica.js';
import {
  Contrasena,
  type DiccionarioDeContrasenasComunes,
} from '../../dominio/contrasena.js';
import { Correo } from '../../dominio/correo.js';
import { Credencial } from '../../dominio/credencial.js';
import { NombrePersona } from '../../dominio/nombre-persona.js';
import { TelefonoE164 } from '../../dominio/telefono-e164.js';
import { Usuario } from '../../dominio/usuario.js';
import { VersionDeTexto } from '../../dominio/version-de-texto.js';
import type { HashDeContrasenas } from '../puertos/salida/hash-de-contrasenas.js';
import type { RepositorioAceptacionesDePolitica } from '../puertos/salida/repositorio-aceptaciones-de-politica.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type {
  EmisorDeSesiones,
  TokensDeSesion,
} from '../servicios/emisor-de-sesiones.js';
import { vistaDeUsuario, type VistaDeUsuario } from '../vistas.js';

export interface EntradaDeRegistro {
  nombre: string;
  correo: string;
  contrasena: string;
  telefono?: string | null;
  versionPolitica: string;
}

export interface ResultadoDeAutenticacion {
  usuario: VistaDeUsuario;
  tokens: TokensDeSesion;
}

// Crea una cuenta de familiar y deja la sesión iniciada. Siempre es un familiar: el rol no es un
// dato de entrada. Aceptar la política de tratamiento de datos es obligatorio (Ley 1581) y queda
// registrado con la versión exacta que se aceptó.
export class RegistrarFamiliar {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly aceptaciones: RepositorioAceptacionesDePolitica,
    private readonly hash: HashDeContrasenas,
    private readonly comunes: DiccionarioDeContrasenasComunes,
    private readonly sesiones: EmisorDeSesiones,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly publicador: PublicadorDeEventos,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly contexto: ContextoDePeticion,
    private readonly versionDePoliticaVigente: string,
  ) {}

  async ejecutar(
    entrada: EntradaDeRegistro,
  ): Promise<ResultadoDeAutenticacion> {
    const correo = Correo.crear(entrada.correo);
    const nombre = NombrePersona.crear(entrada.nombre);
    const telefono =
      entrada.telefono === undefined || entrada.telefono === null
        ? null
        : TelefonoE164.crear(entrada.telefono);
    const contrasena = Contrasena.crear(entrada.contrasena, this.comunes);
    const version = VersionDeTexto.crear(entrada.versionPolitica);
    if (version.valor !== this.versionDePoliticaVigente) {
      throw new ErrorDeValidacion(
        'Debes aceptar la versión vigente de la política de tratamiento de datos',
        'politica.version_no_vigente',
      );
    }

    // El hash es lo más lento del registro: se calcula antes de abrir la transacción para no tener
    // una conexión ocupada mientras la CPU trabaja.
    const hash = await this.hash.calcular(contrasena);

    const ahora = this.reloj.ahora();
    const usuarioId = this.ids.nuevo<'Usuario'>();
    const usuario = Usuario.registrarFamiliar({
      id: usuarioId,
      correo,
      nombre,
      telefono,
      credencial: Credencial.nueva(usuarioId, hash, ahora),
      ahora,
    });

    const tokens = await this.unidadDeTrabajo.ejecutar(async () => {
      await this.usuarios.guardar(usuario);
      await this.aceptaciones.guardar(
        AceptacionDePolitica.registrar({
          usuarioId,
          version,
          aceptadaEn: ahora,
        }),
      );
      const { tokens } = await this.sesiones.emitir(usuario, ahora);
      const evento: UsuarioRegistrado = {
        id: this.ids.nuevo(),
        tipo: 'identidad.usuario_registrado',
        version: 1,
        ocurridoEn: ahora.toISOString(),
        idDeCorrelacion: this.contexto.idDeCorrelacion(),
        datos: { usuarioId, rol: usuario.rol },
      };
      await this.publicador.publicar(evento);
      return tokens;
    });

    await this.auditoria.registrar({
      actorId: usuarioId,
      accion: 'identidad.registrar_usuario',
      recursoTipo: 'usuario',
      recursoId: usuarioId,
      resultado: 'permitido',
      metadatos: { versionPolitica: version.valor },
    });
    return { usuario: vistaDeUsuario(usuario), tokens };
  }
}
