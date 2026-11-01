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
  especialidad: Especialidad;
  telefono: string; // formato E.164, ej. "+573001234567"
  servicioId: string; // el servicio activo con el que está cuidando ahora
}

// La bolsa de horas prepago (F7): un libro de movimientos que nunca queda negativo. Dinero en pesos enteros.
export interface MovimientoDeBolsa {
  id: string;
  tipo: string;
  cambio: number; // positivo si entra saldo, negativo si sale
  servicioId: string | null;
  fecha: string; // ISO
}

export interface Bolsa {
  saldoDisponible: number; // lo que se puede gastar ya
  saldoReservado: number; // apartado para servicios confirmados que aún no terminan
  movimientos: MovimientoDeBolsa[];
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

// Servicios (F3+F4): lo que la familia pide y el cuidador atiende. El dinero lo calcula SIEMPRE el servidor.
export type EstadoDeServicio = "solicitado" | "aceptado" | "en_curso" | "finalizado" | "cancelado";
export type MotivoDeCancelacion = "rechazada" | "expirada" | "cancelada_por_familia" | "pago_fallido";
export type MedioDePago = "pasarela" | "bolsa";

export interface ServicioBase {
  id: string;
  estado: EstadoDeServicio;
  fecha: string; // AAAA-MM-DD, día civil de Colombia
  jornada: Jornada;
  horas: number;
  medioDePago: MedioDePago;
  solicitudExpiraEn: string | null; // ISO; hasta cuándo puede aceptar el cuidador
  cuidador: { id: string; nombre: string } | null;
  adultoMayor: { id: string; nombre: string; edad: number } | null;
  solicitadoEn: string;
  aceptadoEn: string | null;
  iniciadoEn: string | null;
  finalizadoEn: string | null;
  canceladoEn: string | null;
  motivoDeCancelacion: MotivoDeCancelacion | null;
  calificacion: { calificacion: number; comentario: string } | null;
  tarifaHora: number;
}

// La familia ve lo que paga y NUNCA lo que recibe el cuidador.
export interface Servicio extends ServicioBase {
  subtotal: number;
  cargoDeServicio: number;
  totalFamilia: number;
}

// El cuidador ve lo que recibe y NUNCA lo que paga la familia.
export interface ServicioDelCuidador extends ServicioBase {
  pagoProfesional: number;
}

export interface Cotizacion {
  cuidadorId: string;
  horas: number;
  tarifaHora: number;
  subtotal: number;
  cargoPorcentaje: number; // 8 = 8 %
  cargo: number;
  totalFamilia: number;
}

export interface DatosDeSolicitud {
  cuidadorId: string;
  fecha: string; // AAAA-MM-DD
  jornada: Jornada;
  horas: number;
  medioDePago: MedioDePago;
}
