import type { ResumenServicio } from "@/lib/pricing";

export type Especialidad =
  | "auxiliar"
  | "enfermeria"
  | "fisioterapia"
  | "acompanamiento";

export type Jornada = "manana" | "tarde" | "noche";

// Los tres controles que hacen visible a un cuidador (E7): para quien se muestra siempre están los tres.
export interface Verificacion {
  antecedentes: boolean; // Policía, Procuraduría, Contraloría
  titulos: boolean; // títulos/certificaciones comprobados
  psicotecnica: boolean; // prueba psicotécnica aprobada
}

export interface Resena {
  id: string;
  autor: string; // abreviado, p. ej. «Andrea G.»
  calificacion: number; // 1–5
  comentario: string; // vacío si no escribió
  fecha: string; // ISO
}

// Lo que se muestra de un cuidador en la búsqueda. NUNCA lleva teléfono ni datos de contacto (H1): el directorio
// no los entrega; solo el cuidador en turno de un servicio contratado los trae (F4).
export interface CuidadorResumen {
  id: string;
  nombre: string;
  foto: string; // vacío si no tiene
  especialidad: Especialidad;
  titulo: string; // ej. "Técnica en Enfermería — SENA"
  aniosExperiencia: number;
  tarifaHora: number; // COP, lo que cobra el cuidador
  zona: string; // barrio/comuna de Medellín o municipio del Valle de Aburrá
  disponibilidad: Jornada[];
  calificacion: number | null; // promedio con un decimal; null si todavía no tiene reseñas
  cantidadResenas: number;
  serviciosCompletados: number;
  bio: string;
  verificacion: Verificacion;
}

export interface Cuidador extends CuidadorResumen {
  resenas: Resena[];
}

// El cuidador que atiende ahora a la persona mayor. Es el único que trae el teléfono (F4, desde Reservas).
export interface CuidadorEnTurno {
  id: string;
  nombre: string;
  foto: string;
  titulo: string;
  especialidad: Especialidad;
  telefono: string; // formato E.164, ej. "+573001234567"
}

export interface FiltrosCuidador {
  busqueda?: string;
  especialidad?: Especialidad;
  zona?: string;
  jornada?: Jornada;
  tarifaMaxima?: number;
}

export interface Medicamento {
  id: string;
  nombre: string;
  dosis: string;
  hora: string; // "08:00"
  tomado: boolean;
}

export interface LecturaSignos {
  fecha: string; // ISO
  presionSistolica: number;
  presionDiastolica: number;
  frecuenciaCardiaca: number;
  glucosa: number;
}

export interface AdultoMayor {
  id: string;
  nombre: string;
  edad: number;
  foto: string;
}

export interface Familiar {
  id: string;
  nombre: string;
  foto: string;
  adultoMayorId: string;
}

export interface Mensaje {
  id: string;
  autor: "familiar" | "cuidador";
  texto: string;
  fecha: string; // ISO
}

// Contratación (F0 §4.4): estos tipos cruzan entre el servidor y los componentes cliente, así que
// viven aquí y no en el servicio, que es solo de servidor.
export interface DatosContratacion {
  cuidadorId: string;
  fecha: string; // AAAA-MM-DD
  jornada: Jornada;
  horas: number;
}

export interface ContratacionConfirmada {
  id: string;
  cuidadorNombre: string;
  fecha: string;
  jornada: Jornada;
  horas: number;
  resumen: ResumenServicio;
}
