import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Reservas (M4). Directorio ya reacciona a uno: la reseña de un
// servicio calificado.

// La familia calificó un servicio terminado. El comentario es texto que la propia persona decidió publicar
// en el perfil del cuidador, por eso es de los pocos textos libres que viajan en un evento.
export type ServicioCalificado = EventoDeIntegracion<
  'reservas.servicio_calificado',
  {
    servicioId: string;
    cuidadorId: string;
    familiarId: string;
    calificacion: number;
    comentario: string | null;
  }
>;
