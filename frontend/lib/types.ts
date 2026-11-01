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

// Teleasistencia (F6): datos de salud. Solo los ven la familia vinculada (con autorización) y el cuidador con un servicio
// activo ahora; el backend lo verifica en cada consulta.
export type EstadoDeToma = "pendiente" | "tomada" | "omitida";

// Una toma de un medicamento en un día: lo que la persona ve y marca.
export interface TomaDelDia {
  tomaId: string;
  medicamentoId: string;
  nombre: string;
  dosis: string;
  indicaciones: string; // vacío si no hay
  hora: string; // «HH:mm» en hora de Colombia
  estado: EstadoDeToma;
}

export interface MedicamentoActivo {
  id: string;
  nombre: string;
  dosis: string;
  indicaciones: string;
  horarios: string[]; // «HH:mm»
}

export interface MedicamentosDelDia {
  fecha: string; // AAAA-MM-DD
  medicamentos: MedicamentoActivo[];
  tomas: TomaDelDia[]; // ordenadas por hora
}

// Cada medida es opcional (la presión va completa o no va). `fueraDeRango` no dice cuál medida ni cuánto.
export interface LecturaSignos {
  id: string;
  fecha: string; // ISO
  presionSistolica: number | null;
  presionDiastolica: number | null;
  frecuenciaCardiaca: number | null;
  glucosa: number | null;
  fueraDeRango: boolean;
}

export interface ResumenDeTeleasistencia {
  fecha: string;
  tomas: { total: number; tomadas: number; pendientes: number; omitidas: number };
  proximaToma: { nombre: string; hora: string } | null;
  ultimaLectura: { fecha: string; fueraDeRango: boolean } | null;
  alertasSinAtender: number;
}

// Lo que pasó al pedir ayuda: A QUIÉN se avisó de verdad. Nunca se promete más que eso.
export interface AlertaEnviada {
  id: string;
  generadaEn: string;
  avisadosA: string[];
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

// Mensajería (F8): el chat entre una familia y un cuidador. Texto plano; solo las dos partes lo ven.
export interface Conversacion {
  id: string;
  otraParte: { nombre: string; foto: string };
  ultimoMensajeEn: string | null; // ISO
  puedeEscribir: boolean;
}

// Un mensaje en pantalla. `enviando` y `fallido` solo existen en el navegador (lo que se acaba de escribir); lo que
// viene del servidor siempre es `enviado`. `idDeCliente` lo genera la pantalla para cada mensaje: reenviar el mismo no lo duplica.
export interface MensajeDeChat {
  id: string;
  idDeCliente?: string;
  autor: "yo" | "otro";
  texto: string;
  enviadoEn: string; // ISO
  estado: "enviado" | "enviando" | "fallido";
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

// Pagos (F7)
export type EstadoDePago = "pendiente" | "aprobado" | "rechazado" | "expirado" | "reembolsado";

export interface Pago {
  id: string;
  concepto: string;
  servicioId: string | null;
  paqueteCodigo: string | null;
  medio: string;
  montoTotal: number; // pesos enteros
  estado: EstadoDePago;
  venceEn: string | null; // ISO; solo mientras está pendiente
  creadoEn: string;
}

export interface PaqueteDeBolsa {
  codigo: string;
  horasReferencia: number;
  descuento: number; // 10 = 10 %
  credito: number; // lo que recibe la bolsa
  precio: number; // lo que paga la familia
}

// Lo que se le debe (o ya se le pagó) al cuidador por un servicio.
export interface Liquidacion {
  id: string;
  servicioId: string;
  monto: number;
  estado: "pendiente" | "enviada" | "pagada" | "fallida";
  pagadaEn: string | null;
  creadaEn: string;
}
