import type { EventoDeIntegracion } from '../../eventos/evento-de-integracion.js';

// Reacción de un módulo a un evento de otro (M0 §4.8). Cada módulo registra los suyos en el
// RegistroDeManejadores al iniciar. El despachador lo ejecuta en su propia transacción y anota
// (nombre, evento) en `compartido.eventos_consumidos`: si el evento llega dos veces, no se repite.
export interface ManejadorDeEventos<
  Evento extends EventoDeIntegracion = EventoDeIntegracion,
> {
  // Estable para siempre: se guarda en la base. «modulo.que_hace», por ejemplo
  // 'notificaciones.avisar_servicio_confirmado'. Cambiarlo haría reprocesar eventos ya atendidos.
  readonly nombre: string;
  readonly tipo: Evento['tipo'];
  manejar(evento: Evento): Promise<void>;
}
