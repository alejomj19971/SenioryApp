// Lo que el backend RESPONDE en Reservas (M4) y en la cotización de Pagos (M3). Contrato de lo que el frontend lee;
// lo vigilan las pruebas de contrato contra el backend local. Las vistas son distintas según quién mira: la familia
// ve lo que paga y NUNCA lo que recibe el cuidador; el cuidador ve lo que recibe y NUNCA lo que paga la familia.

export type EstadoDeServicioDelBackend = "solicitado" | "aceptado" | "en_curso" | "finalizado" | "cancelado";
export type MotivoDeCancelacionDelBackend = "rechazada" | "expirada" | "cancelada_por_familia" | "pago_fallido";

export interface VistaBasicaDelBackend {
  id: string;
  estado: EstadoDeServicioDelBackend;
  // «AAAA-MM-DD» en Colombia.
  fecha: string;
  jornada: "manana" | "tarde" | "noche";
  horas: number;
  medioDePago: "pasarela" | "bolsa";
  // Hasta cuándo puede aceptar el cuidador; null si ya no está pendiente.
  solicitudExpiraEn: string | null;
  cuidador: { id: string; nombre: string } | null;
  adultoMayor: { id: string; nombre: string; edad: number } | null;
  solicitadoEn: string;
  aceptadoEn: string | null;
  iniciadoEn: string | null;
  finalizadoEn: string | null;
  canceladoEn: string | null;
  motivoDeCancelacion: MotivoDeCancelacionDelBackend | null;
  calificacion: { calificacion: number; comentario: string | null } | null;
}

export interface ServicioParaFamiliaDelBackend extends VistaBasicaDelBackend {
  tarifaHora: number;
  subtotal: number;
  cargoDeServicio: number;
  totalFamilia: number;
  politicaVersion: number;
}

export interface ServicioParaCuidadorDelBackend extends VistaBasicaDelBackend {
  tarifaHora: number;
  pagoProfesional: number;
}

// `POST /servicios` y las acciones de la familia
export interface RespuestaDeServicioParaFamilia {
  servicio: ServicioParaFamiliaDelBackend;
}
// Las acciones del cuidador
export interface RespuestaDeServicioParaCuidador {
  servicio: ServicioParaCuidadorDelBackend;
}

// `GET /servicios`
export interface PaginaDeServiciosDelBackend<T> {
  servicios: T[];
  siguiente: string | null;
}

// `GET /adultos-mayores/:id/cuidador-en-turno`: el teléfono sale SOLO aquí (H1, H4).
export interface CuidadorEnTurnoDelBackend {
  servicio: ServicioParaFamiliaDelBackend;
  cuidador: {
    id: string;
    nombre: string;
    telefono: string;
    fotoUrl: string | null;
    especialidad: "auxiliar" | "enfermeria" | "fisioterapia" | "acompanamiento";
  };
}
export interface RespuestaDeCuidadorEnTurno {
  cuidadorEnTurno: CuidadorEnTurnoDelBackend | null;
}

// `POST /pagos/cotizaciones`
export interface RespuestaDeCotizacion {
  cotizacion: {
    cuidadorId: string;
    horas: number;
    tarifaHora: number;
    subtotal: number;
    // Porcentaje legible (8 para 800 puntos básicos).
    cargoDeServicio: { porcentaje: number; monto: number };
    totalFamilia: number;
    politicaVersion: number;
  };
}
