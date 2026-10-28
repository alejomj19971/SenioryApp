import {
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { DespachadorDeEventos } from './despachador-de-eventos.js';

// Busca periódicamente eventos pendientes: los que no se entregaron al instante (el proceso se
// reinició) y los reintentos programados. Si una vuelta encontró eventos, la siguiente empieza de
// inmediato; si no, espera `intervaloMs`. Con intervalo 0 no arranca (solo pruebas; la
// configuración lo prohíbe en producción).
//
// Una vuelta nunca empieza antes de que termine la anterior (setTimeout encadenado, no setInterval).
export class SondeoDelOutbox
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private activo = false;
  private temporizador: NodeJS.Timeout | undefined;
  private vueltaEnCurso: Promise<void> | undefined;
  private readonly registroDeLog = new Logger('SondeoDelOutbox');

  constructor(
    private readonly despachador: DespachadorDeEventos,
    private readonly intervaloMs: number,
  ) {}

  onApplicationBootstrap(): void {
    this.iniciar();
  }

  // Antes de onApplicationShutdown, que es cuando se cierra el pool de conexiones.
  async beforeApplicationShutdown(): Promise<void> {
    await this.detener();
  }

  iniciar(): void {
    if (this.intervaloMs <= 0 || this.activo) return;
    this.activo = true;
    this.programarVuelta(0);
  }

  async detener(): Promise<void> {
    this.activo = false;
    clearTimeout(this.temporizador);
    await this.vueltaEnCurso;
    await this.despachador.esperarEntregas();
  }

  private programarVuelta(esperaMs: number): void {
    this.temporizador = setTimeout(() => {
      this.vueltaEnCurso = this.darVuelta();
    }, esperaMs);
  }

  private async darVuelta(): Promise<void> {
    let procesados = 0;
    try {
      procesados = await this.despachador.procesarPendientes();
    } catch (error) {
      // Por ejemplo, la base no responde: se reintenta en la siguiente vuelta.
      this.registroDeLog.error(
        `Falló una vuelta del sondeo: ${(error as Error).message}`,
      );
    }
    if (this.activo) {
      this.programarVuelta(procesados > 0 ? 0 : this.intervaloMs);
    }
  }
}
