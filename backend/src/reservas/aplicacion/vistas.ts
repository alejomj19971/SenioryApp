import type { Jornada } from '../../compartido/dominio/jornada.js';
import type { MotivoDeCancelacion } from '../../compartido/eventos/reservas.js';
import type {
  EstadoDeServicio,
  MedioDePago,
} from '../dominio/valores-cerrados.js';

// Lo que ve cada parte del servicio. Son listas blancas y distintas según quién mira:
// - la familia ve lo que paga (subtotal, cargo y total), NUNCA lo que recibe el cuidador;
// - el cuidador ve lo que recibe, NUNCA lo que paga la familia ni el cargo de la plataforma.
// El teléfono de nadie está aquí. Una prueba de instantánea vigila que los conjuntos no crezcan sin que se note.

export interface VistaDeCalificacion {
  calificacion: number;
  comentario: string | null;
}

export interface VistaBasica {
  id: string;
  estado: EstadoDeServicio;
  // "AAAA-MM-DD" en la zona del negocio.
  fecha: string;
  jornada: Jornada;
  horas: number;
  medioDePago: MedioDePago;
  // Hasta cuándo puede aceptar el cuidador; null si ya no está pendiente.
  solicitudExpiraEn: string | null;
  cuidador: { id: string; nombre: string } | null;
  adultoMayor: { id: string; nombre: string; edad: number } | null;
  solicitadoEn: string;
  aceptadoEn: string | null;
  iniciadoEn: string | null;
  finalizadoEn: string | null;
  canceladoEn: string | null;
  motivoDeCancelacion: MotivoDeCancelacion | null;
  calificacion: VistaDeCalificacion | null;
}

export interface VistaDeServicioParaFamilia extends VistaBasica {
  tarifaHora: number;
  subtotal: number;
  cargoDeServicio: number;
  totalFamilia: number;
  politicaVersion: number;
}

export interface VistaDeServicioParaCuidador extends VistaBasica {
  tarifaHora: number;
  // Lo que recibe el cuidador por el servicio.
  pagoProfesional: number;
}

export type VistaDeServicio =
  VistaDeServicioParaFamilia | VistaDeServicioParaCuidador;

export interface PaginaDeVistasDeServicios {
  servicios: VistaDeServicio[];
  siguiente: string | null;
}

export interface VistaDeCuidadorEnTurno {
  servicio: VistaDeServicioParaFamilia;
  // El teléfono sale SOLO aquí: la familia con un servicio activo ahora mismo (H1, H4).
  cuidador: {
    id: string;
    nombre: string;
    telefono: string;
    fotoUrl: string | null;
    especialidad: string;
  };
}
