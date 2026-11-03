import { Dinero } from '../../compartido/dominio/dinero.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import { JORNADAS, type Jornada } from '../../compartido/dominio/jornada.js';
import type { CuidadorId } from './ids.js';
import {
  CONTROLES_DE_VERIFICACION,
  type Especialidad,
  type EstadoDeCuidador,
} from './valores-cerrados.js';
import type { Verificacion } from './verificacion.js';

export const LARGO_MAXIMO_DE_NOMBRE = 100;
export const LARGO_MAXIMO_DE_TITULO = 150;
export const LARGO_MAXIMO_DE_ZONA = 100;
export const LARGO_MAXIMO_DE_BIO = 1000;
export const ANIOS_MAXIMOS_DE_EXPERIENCIA = 60;

// Mismo patrón que el CHECK `cuidadores_telefono_e164` de la base de datos.
const TELEFONO_E164 = /^\+[1-9]\d{7,14}$/;
// Caracteres de control y los que invierten el sentido de lectura (U+202A–202E y U+2066–2069).
const PROHIBIDOS = /[\p{Cc}‪-‮⁦-⁩]/u;

export interface DatosDeCuidador {
  id: CuidadorId;
  // La cuenta del cuidador en `identidad`; null solo en los datos de desarrollo.
  usuarioId: string | null;
  nombre: string;
  fotoUrl: string | null;
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: Dinero;
  // Nunca sale del módulo en listados (hallazgo H1): solo lo ve la familia con un servicio activo.
  telefono: string;
  zona: string;
  disponibilidad: readonly Jornada[];
  bio: string;
  // Solo el propio cuidador la activa.
  aceptacionAutomatica: boolean;
  estado: EstadoDeCuidador;
  visible: boolean;
  sumaCalificaciones: number;
  cantidadResenas: number;
  serviciosCompletados: number;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
  verificaciones: readonly Verificacion[];
}

export interface DatosParaRegistrarCuidador {
  id: CuidadorId;
  usuarioId: string | null;
  nombre: string;
  fotoUrl?: string | null;
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  telefono: string;
  zona: string;
  disponibilidad: readonly Jornada[];
  bio: string;
  ahora: Date;
}

export type CambioDeVisibilidad = 'visible' | 'oculto';

// Lo que el cuidador puede cambiar de su perfil. Lo que no viene se queda como está.
export interface CambiosDePerfil {
  especialidad?: Especialidad;
  titulo?: string;
  aniosExperiencia?: number;
  tarifaHora?: number;
  telefono?: string;
  zona?: string;
  disponibilidad?: readonly Jornada[];
  bio?: string;
  aceptacionAutomatica?: boolean;
}

// La persona que presta el cuidado y que las familias buscan.
//
// **Regla clave (E7): un cuidador solo es visible con sus tres controles aprobados y vigentes** y en
// estado activo. Es una regla del dominio, no un filtro suelto de la consulta; además la base de datos la
// vuelve a hacer cumplir con un trigger, por si un error de código intentara saltársela.
//
// La calificación y los servicios completados son valores DERIVADOS de lo que ocurre en Reservas: se
// recalculan con cada reseña y no se pueden editar.
export class Cuidador {
  private constructor(private datos: DatosDeCuidador) {}

  // Un cuidador nuevo entra en borrador y oculto: se vuelve visible cuando se aprueban sus controles.
  static registrar(datos: DatosParaRegistrarCuidador): Cuidador {
    const { nombre, titulo, zona, telefono, bio, disponibilidad, tarifaHora } =
      validarPerfil(datos);
    return new Cuidador({
      id: datos.id,
      usuarioId: datos.usuarioId,
      nombre,
      fotoUrl: datos.fotoUrl ?? null,
      especialidad: datos.especialidad,
      titulo,
      aniosExperiencia: datos.aniosExperiencia,
      tarifaHora,
      telefono,
      zona,
      disponibilidad,
      bio,
      aceptacionAutomatica: false,
      estado: 'borrador',
      visible: false,
      sumaCalificaciones: 0,
      cantidadResenas: 0,
      serviciosCompletados: 0,
      version: 1,
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
      verificaciones: [],
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeCuidador): Cuidador {
    return new Cuidador({ ...datos });
  }

  get id(): CuidadorId {
    return this.datos.id;
  }
  get usuarioId(): string | null {
    return this.datos.usuarioId;
  }
  get nombre(): string {
    return this.datos.nombre;
  }
  get fotoUrl(): string | null {
    return this.datos.fotoUrl;
  }
  get especialidad(): Especialidad {
    return this.datos.especialidad;
  }
  get titulo(): string {
    return this.datos.titulo;
  }
  get aniosExperiencia(): number {
    return this.datos.aniosExperiencia;
  }
  get tarifaHora(): Dinero {
    return this.datos.tarifaHora;
  }
  get telefono(): string {
    return this.datos.telefono;
  }
  get zona(): string {
    return this.datos.zona;
  }
  get disponibilidad(): readonly Jornada[] {
    return this.datos.disponibilidad;
  }
  get bio(): string {
    return this.datos.bio;
  }
  get aceptacionAutomatica(): boolean {
    return this.datos.aceptacionAutomatica;
  }
  get estado(): EstadoDeCuidador {
    return this.datos.estado;
  }
  get visible(): boolean {
    return this.datos.visible;
  }
  get sumaCalificaciones(): number {
    return this.datos.sumaCalificaciones;
  }
  get cantidadResenas(): number {
    return this.datos.cantidadResenas;
  }
  get serviciosCompletados(): number {
    return this.datos.serviciosCompletados;
  }
  get version(): number {
    return this.datos.version;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }
  get verificaciones(): readonly Verificacion[] {
    return this.datos.verificaciones;
  }

  // Promedio de las reseñas con un decimal; null si todavía no tiene ninguna (no es «0 estrellas»).
  calificacion(): number | null {
    if (this.datos.cantidadResenas === 0) return null;
    return (
      Math.round(
        (this.datos.sumaCalificaciones / this.datos.cantidadResenas) * 10,
      ) / 10
    );
  }

  // E7: activo y con los tres controles aprobados y vigentes hoy.
  esVisible(hoy: FechaCivil): boolean {
    return (
      this.datos.estado === 'activo' &&
      CONTROLES_DE_VERIFICACION.every((control) =>
        this.datos.verificaciones.some(
          (verificacion) =>
            verificacion.control === control && verificacion.estaVigente(hoy),
        ),
      )
    );
  }

  // Agrega o reemplaza el control (un cuidador tiene uno vigente por cada tipo).
  conVerificacion(verificacion: Verificacion): void {
    this.datos.verificaciones = [
      ...this.datos.verificaciones.filter(
        (existente) => existente.control !== verificacion.control,
      ),
      verificacion,
    ];
  }

  // Pone `visible` de acuerdo con `esVisible(hoy)`. Devuelve qué cambió, para publicar el evento
  // (`CuidadorVisible` o `CuidadorOculto`), o null si todo sigue igual.
  recalcularVisibilidad(
    hoy: FechaCivil,
    ahora: Date,
  ): CambioDeVisibilidad | null {
    const deberiaSerVisible = this.esVisible(hoy);
    if (deberiaSerVisible === this.datos.visible) return null;
    this.datos.visible = deberiaSerVisible;
    this.tocar(ahora);
    return deberiaSerVisible ? 'visible' : 'oculto';
  }

  // El propio cuidador corrige su perfil. Los datos que respaldan la verificación (la especialidad y el título)
  // solo se pueden cambiar antes de que lo activen: después, cambiarlos dejaría un título aprobado que ya no es el
  // que se muestra. Un cuidador suspendido no edita nada.
  actualizarPerfil(cambios: CambiosDePerfil, ahora: Date): void {
    if (this.datos.estado === 'suspendido') {
      throw new ConflictoDeEstado(
        'Un cuidador suspendido no puede cambiar su perfil',
        'cuidador.suspendido',
      );
    }
    const cambiaDatoVerificado =
      cambios.especialidad !== undefined || cambios.titulo !== undefined;
    if (cambiaDatoVerificado && this.datos.estado === 'activo') {
      throw new ConflictoDeEstado(
        'La especialidad y el título ya fueron verificados: no se pueden cambiar',
        'cuidador.dato_verificado',
      );
    }
    const validado = validarPerfil({
      nombre: this.datos.nombre,
      titulo: cambios.titulo ?? this.datos.titulo,
      zona: cambios.zona ?? this.datos.zona,
      aniosExperiencia: cambios.aniosExperiencia ?? this.datos.aniosExperiencia,
      tarifaHora: cambios.tarifaHora ?? this.datos.tarifaHora.valor,
      telefono: cambios.telefono ?? this.datos.telefono,
      bio: cambios.bio ?? this.datos.bio,
      disponibilidad: cambios.disponibilidad ?? this.datos.disponibilidad,
    });
    this.datos.especialidad = cambios.especialidad ?? this.datos.especialidad;
    this.datos.titulo = validado.titulo;
    this.datos.zona = validado.zona;
    this.datos.aniosExperiencia = validado.aniosExperiencia;
    this.datos.tarifaHora = validado.tarifaHora;
    this.datos.telefono = validado.telefono;
    this.datos.bio = validado.bio;
    this.datos.disponibilidad = validado.disponibilidad;
    if (cambios.aceptacionAutomatica !== undefined) {
      this.datos.aceptacionAutomatica = cambios.aceptacionAutomatica;
    }
    this.tocar(ahora);
  }

  // El cuidador cambia su foto de perfil. A diferencia de los documentos de verificación, se muestra de inmediato
  // a las familias, sin revisión: es una foto, no una prueba de identidad o idoneidad.
  cambiarFoto(fotoUrl: string, ahora: Date): void {
    if (this.datos.estado === 'suspendido') {
      throw new ConflictoDeEstado(
        'Un cuidador suspendido no puede cambiar su foto',
        'cuidador.suspendido',
      );
    }
    this.datos.fotoUrl = fotoUrl;
    this.tocar(ahora);
  }

  // El cuidador terminó su perfil y sus documentos: pasa a revisión. Solo desde el borrador.
  enviarARevision(ahora: Date): void {
    if (this.datos.estado !== 'borrador') {
      throw new ConflictoDeEstado(
        `Un cuidador ${this.datos.estado} no puede enviarse a revisión`,
        'cuidador.no_enviable_a_revision',
      );
    }
    this.datos.estado = 'en_revision';
    this.tocar(ahora);
  }

  // Pasa a activo: puede mostrarse en cuanto tenga sus tres controles. Un cuidador suspendido no vuelve
  // por esta vía: se reactiva con una decisión explícita (M9).
  activar(ahora: Date): void {
    if (
      this.datos.estado !== 'borrador' &&
      this.datos.estado !== 'en_revision'
    ) {
      throw new ConflictoDeEstado(
        `Un cuidador ${this.datos.estado} no se puede activar`,
        'cuidador.no_activable',
      );
    }
    this.datos.estado = 'activo';
    this.tocar(ahora);
  }

  // Lo retira de las búsquedas de inmediato.
  suspender(ahora: Date): void {
    if (this.datos.estado === 'suspendido') return;
    this.datos.estado = 'suspendido';
    this.datos.visible = false;
    this.tocar(ahora);
  }

  // Suma una reseña a la calificación. Con los contadores juntos el promedio nunca se desfasa.
  registrarResena(calificacion: number, ahora: Date): void {
    if (
      !Number.isInteger(calificacion) ||
      calificacion < 1 ||
      calificacion > 5
    ) {
      throw new ErrorDeValidacion(
        'La calificación debe ser un número entero de 1 a 5',
        'resena.calificacion_invalida',
      );
    }
    this.datos.sumaCalificaciones += calificacion;
    this.datos.cantidadResenas += 1;
    this.tocar(ahora);
  }

  // Suma un servicio terminado al contador. Es un valor DERIVADO de lo que ocurre en Reservas: solo el
  // manejador del evento «servicio finalizado» lo llama.
  registrarServicioCompletado(ahora: Date): void {
    this.datos.serviciosCompletados += 1;
    this.tocar(ahora);
  }

  private tocar(ahora: Date): void {
    this.datos.actualizadoEn = ahora;
    this.datos.version += 1;
  }
}

interface PerfilParaValidar {
  nombre: string;
  titulo: string;
  zona: string;
  aniosExperiencia: number;
  tarifaHora: number;
  telefono: string;
  bio: string;
  disponibilidad: readonly Jornada[];
}

// Las reglas del perfil, las mismas al registrarlo y al editarlo. Devuelve los valores ya limpios.
function validarPerfil(datos: PerfilParaValidar) {
  const nombre = texto(datos.nombre, 'nombre', LARGO_MAXIMO_DE_NOMBRE);
  const titulo = texto(datos.titulo, 'titulo', LARGO_MAXIMO_DE_TITULO);
  const zona = texto(datos.zona, 'zona', LARGO_MAXIMO_DE_ZONA);
  if (
    !Number.isInteger(datos.aniosExperiencia) ||
    datos.aniosExperiencia < 0 ||
    datos.aniosExperiencia > ANIOS_MAXIMOS_DE_EXPERIENCIA
  ) {
    throw new ErrorDeValidacion(
      `Los años de experiencia deben ser un entero entre 0 y ${ANIOS_MAXIMOS_DE_EXPERIENCIA}`,
      'cuidador.experiencia_invalida',
    );
  }
  const tarifaHora = Dinero.pesos(datos.tarifaHora);
  if (tarifaHora.valor === 0) {
    throw new ErrorDeValidacion(
      'La tarifa por hora debe ser mayor que cero',
      'cuidador.tarifa_invalida',
    );
  }
  const telefono = datos.telefono.trim();
  if (!TELEFONO_E164.test(telefono)) {
    throw new ErrorDeValidacion(
      'El teléfono debe tener formato internacional, por ejemplo +573001234567',
      'cuidador.telefono_invalido',
    );
  }
  const bio = datos.bio.normalize('NFC').trim();
  if (Array.from(bio).length > LARGO_MAXIMO_DE_BIO) {
    throw new ErrorDeValidacion(
      `La presentación no puede pasar de ${LARGO_MAXIMO_DE_BIO} caracteres`,
      'cuidador.bio_muy_larga',
    );
  }
  const disponibilidad = JORNADAS.filter((jornada) =>
    datos.disponibilidad.includes(jornada),
  );
  if (disponibilidad.length === 0) {
    throw new ErrorDeValidacion(
      'El cuidador debe estar disponible en al menos una jornada',
      'cuidador.sin_disponibilidad',
    );
  }
  return {
    nombre,
    titulo,
    zona,
    aniosExperiencia: datos.aniosExperiencia,
    tarifaHora,
    telefono,
    bio,
    disponibilidad,
  };
}

function texto(valor: string, campo: string, maximo: number): string {
  const limpio = valor.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const largo = Array.from(limpio).length;
  if (largo < 1 || largo > maximo || PROHIBIDOS.test(limpio)) {
    throw new ErrorDeValidacion(
      `El ${campo} debe tener entre 1 y ${maximo} caracteres`,
      `cuidador.${campo}_invalido`,
    );
  }
  return limpio;
}
