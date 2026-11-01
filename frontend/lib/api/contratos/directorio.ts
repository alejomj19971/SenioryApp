// Lo que el backend RESPONDE en Directorio (M2). Es el contrato de lo que el frontend lee; lo vigilan las pruebas
// de contrato contra el backend local. Solo lo importan los servicios. Es una LISTA BLANCA del lado del backend: el
// teléfono, la cuenta y los documentos de verificación no están, y una prueba falla si aparecen.

export type ControlDeVerificacionDelBackend = "antecedentes" | "titulos" | "psicotecnica";

export interface ResenaDelBackend {
  id: string;
  // Nombre abreviado («Andrea G.»).
  autor: string;
  calificacion: number;
  comentario: string | null;
  fecha: string;
}

export interface CuidadorDelBackend {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  especialidad: "auxiliar" | "enfermeria" | "fisioterapia" | "acompanamiento";
  titulo: string;
  aniosExperiencia: number;
  // Pesos colombianos enteros por hora.
  tarifaHora: number;
  zona: string;
  disponibilidad: ("manana" | "tarde" | "noche")[];
  bio: string;
  // Promedio con un decimal; null si todavía no tiene reseñas (no «0 estrellas»).
  calificacion: number | null;
  cantidadResenas: number;
  serviciosCompletados: number;
  aceptacionAutomatica: boolean;
  controlesVerificados: ControlDeVerificacionDelBackend[];
}

// `GET /cuidadores`
export interface PaginaDeCuidadoresDelBackend {
  cuidadores: CuidadorDelBackend[];
  // Se pasa tal cual como `cursor` para pedir la siguiente página; null si no hay más.
  siguiente: string | null;
}

// `GET /cuidadores/:id`
export interface RespuestaDeCuidador {
  cuidador: CuidadorDelBackend & { resenas: ResenaDelBackend[] };
}

// `GET /cuidadores/filtros`
export interface FiltrosDisponiblesDelBackend {
  // Solo zonas donde hoy hay alguien que se muestra.
  zonas: string[];
  // La tarifa más alta entre los cuidadores que se muestran (0 si no hay ninguno).
  tarifaMaxima: number;
  especialidades: string[];
  jornadas: string[];
}
