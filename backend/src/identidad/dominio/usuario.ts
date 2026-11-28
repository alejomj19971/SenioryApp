import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { Rol } from '../../compartido/dominio/rol.js';
import type { Correo } from './correo.js';
import type { Credencial } from './credencial.js';
import type { UsuarioId } from './ids.js';
import type { NombrePersona } from './nombre-persona.js';
import type { TelefonoE164 } from './telefono-e164.js';

// «suspendido»: un administrador retiró a la persona (hoy, a un cuidador). No entra ni renueva su sesión, pero la cuenta y
// sus datos siguen ahí; se puede reactivar. «eliminado» es definitivo.
export type EstadoDeUsuario = 'activo' | 'suspendido' | 'eliminado';

export interface DatosDeUsuario {
  id: UsuarioId;
  correo: Correo;
  nombre: NombrePersona;
  telefono: TelefonoE164 | null;
  rol: Rol;
  estado: EstadoDeUsuario;
  correoVerificadoEn: Date | null;
  // Cuándo aceptó el instructivo con las reglas del negocio (jornadas, cuándo se cobra, cancelación…),
  // al final de la bienvenida (M1). Solo se pide una vez; null hasta que lo vea.
  reglasDelNegocioVistasEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
  credencial: Credencial;
}

export interface DatosParaCrearUsuario {
  id: UsuarioId;
  correo: Correo;
  nombre: NombrePersona;
  telefono?: TelefonoE164 | null;
  credencial: Credencial;
  ahora: Date;
}

export interface CambiosDePerfil {
  nombre?: NombrePersona;
  // null borra el teléfono; undefined lo deja como está.
  telefono?: TelefonoE164 | null;
}

// Una persona con cuenta en Seniory: quién es, con qué rol y su credencial.
//
// El rol se decide al crear la cuenta y NO cambia: no hay forma de modificarlo desde aquí, ni
// siquiera para el propio usuario (escalada de privilegios). Un familiar se crea al registrarse; un
// administrador, solo por línea de comandos; un cuidador, desde el directorio (M9).
export class Usuario {
  private constructor(private datos: DatosDeUsuario) {}

  // Todo registro público crea un familiar: el rol no es un dato que el cliente pueda elegir.
  static registrarFamiliar(datos: DatosParaCrearUsuario): Usuario {
    return Usuario.crear(datos, 'familiar');
  }

  static crearAdministrador(datos: DatosParaCrearUsuario): Usuario {
    return Usuario.crear(datos, 'administrador');
  }

  // Una cuenta de cuidador la crea Directorio al cargar a un cuidador ya verificado; nadie se registra
  // solo con este rol (M9 abrirá la postulación).
  static registrarCuidador(datos: DatosParaCrearUsuario): Usuario {
    return Usuario.crear(datos, 'cuidador');
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeUsuario): Usuario {
    return new Usuario({ ...datos });
  }

  private static crear(datos: DatosParaCrearUsuario, rol: Rol): Usuario {
    if (datos.credencial.usuarioId !== datos.id) {
      throw new ErrorDeValidacion(
        'La credencial pertenece a otro usuario',
        'usuario.credencial_ajena',
      );
    }
    return new Usuario({
      id: datos.id,
      correo: datos.correo,
      nombre: datos.nombre,
      telefono: datos.telefono ?? null,
      rol,
      estado: 'activo',
      // Nace sin verificar: se confirma con el enlace que llega a ese correo (`verificarCorreo`).
      correoVerificadoEn: null,
      reglasDelNegocioVistasEn: null,
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
      credencial: datos.credencial,
    });
  }

  get id(): UsuarioId {
    return this.datos.id;
  }
  get correo(): Correo {
    return this.datos.correo;
  }
  get nombre(): NombrePersona {
    return this.datos.nombre;
  }
  get telefono(): TelefonoE164 | null {
    return this.datos.telefono;
  }
  get rol(): Rol {
    return this.datos.rol;
  }
  get estado(): EstadoDeUsuario {
    return this.datos.estado;
  }
  get correoVerificadoEn(): Date | null {
    return this.datos.correoVerificadoEn;
  }
  get reglasDelNegocioVistasEn(): Date | null {
    return this.datos.reglasDelNegocioVistasEn;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }
  get credencial(): Credencial {
    return this.datos.credencial;
  }

  // Una cuenta eliminada o bloqueada no entra, aunque la contraseña sea correcta.
  puedeIniciarSesion(ahora: Date): boolean {
    return (
      this.datos.estado === 'activo' &&
      !this.datos.credencial.estaBloqueada(ahora)
    );
  }

  // La persona demostró que el correo es suyo (abrió el enlace que le llegó). Idempotente: no pisa la fecha original.
  verificarCorreo(ahora: Date): void {
    if (this.datos.correoVerificadoEn !== null) return;
    this.datos.correoVerificadoEn = ahora;
    this.datos.actualizadoEn = ahora;
  }

  // Un administrador retiró a la persona: la cuenta deja de poder entrar. Solo se suspende una cuenta activa;
  // suspender una ya suspendida no hace nada, y una eliminada no se toca.
  suspender(ahora: Date): void {
    if (this.datos.estado !== 'activo') return;
    this.datos.estado = 'suspendido';
    this.datos.actualizadoEn = ahora;
  }

  // Lo contrario: solo vuelve una cuenta suspendida (una eliminada es definitiva).
  reactivar(ahora: Date): void {
    if (this.datos.estado !== 'suspendido') return;
    this.datos.estado = 'activo';
    this.datos.actualizadoEn = ahora;
  }

  // Idempotente: una vez vistas, un segundo llamado no hace nada (no se pisa la fecha original).
  aceptarReglasDelNegocio(ahora: Date): void {
    if (this.datos.reglasDelNegocioVistasEn !== null) return;
    this.datos.reglasDelNegocioVistasEn = ahora;
    this.datos.actualizadoEn = ahora;
  }

  actualizarPerfil(cambios: CambiosDePerfil, ahora: Date): void {
    let cambio = false;
    if (
      cambios.nombre !== undefined &&
      !cambios.nombre.igualA(this.datos.nombre)
    ) {
      this.datos.nombre = cambios.nombre;
      cambio = true;
    }
    if (
      cambios.telefono !== undefined &&
      !mismoTelefono(cambios.telefono, this.datos.telefono)
    ) {
      this.datos.telefono = cambios.telefono;
      cambio = true;
    }
    if (cambio) this.datos.actualizadoEn = ahora;
  }
}

function mismoTelefono(
  a: TelefonoE164 | null,
  b: TelefonoE164 | null,
): boolean {
  return a === null || b === null ? a === b : a.igualA(b);
}
