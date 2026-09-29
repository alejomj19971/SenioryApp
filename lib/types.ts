export type Especialidad =
  | "auxiliar"
  | "enfermeria"
  | "fisioterapia"
  | "acompanamiento";

export type Jornada = "manana" | "tarde" | "noche";

export interface Verificacion {
  antecedentes: boolean; // Policía, Procuraduría, Contraloría
  titulos: boolean; // títulos/certificaciones comprobados
  psicotecnica: boolean; // prueba psicotécnica aprobada
  fechaVerificacion: string; // ISO
}

export interface Resena {
  autor: string;
  calificacion: number; // 1–5
  comentario: string;
  fecha: string;
}

export interface Cuidador {
  id: string;
  nombre: string;
  foto: string;
  especialidad: Especialidad;
  titulo: string; // ej. "Técnica en Enfermería — SENA"
  aniosExperiencia: number;
  tarifaHora: number; // COP, lo que cobra el cuidador
  telefono: string; // formato E.164, ej. "+573001234567"
  zona: string; // barrio/comuna de Medellín o municipio del Valle de Aburrá
  disponibilidad: Jornada[];
  calificacion: number;
  serviciosCompletados: number;
  bio: string;
  verificacion: Verificacion;
  resenas: Resena[];
  hojaDeVida?: string; // ruta pública al PDF de la hoja de vida, ej. "/hojas-de-vida/nombre.pdf"
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
  cuidadorAsignadoId?: string;
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
