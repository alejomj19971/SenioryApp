import {
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { DetectarNoShows } from '../../../aplicacion/casos-de-uso/detectar-no-shows.js';

// Cada `intervaloMs` cancela los servicios que quedaron «aceptado» sin que nadie marcara que inició, una
// vez que su franja ya terminó. Misma idea que el sondeo de expiraciones: una vuelta nunca empieza antes
// de que termine la anterior (setTimeout encadenado, no setInterval) y con intervalo 0 no arranca (solo
// pruebas; la configuración lo prohíbe en producción). Si hay varias instancias, todas pueden correrlo:
// marcar el no-show es seguro por bloqueo de fila.
export class SondeoDeNoShows
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private activo = false;
  private temporizador: NodeJS.Timeout | undefined;
  private vueltaEnCurso: Promise<void> | undefined;
  private readonly registroDeLog = new Logger('SondeoDeNoShows');

  constructor(
    private readonly detectar: DetectarNoShows,
    private readonly intervaloMs: number,
  ) {}

  onApplicationBootstrap(): void {
    this.iniciar();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.detener();
  }

  iniciar(): void {
    if (this.intervaloMs <= 0 || this.activo) return;
    this.activo = true;
    this.programarVuelta();
  }

  async detener(): Promise<void> {
    this.activo = false;
    clearTimeout(this.temporizador);
    await this.vueltaEnCurso;
  }

  private programarVuelta(): void {
    this.temporizador = setTimeout(() => {
      this.vueltaEnCurso = this.darVuelta();
    }, this.intervaloMs);
  }

  private async darVuelta(): Promise<void> {
    try {
      const { canceladas, fallidas } = await this.detectar.ejecutar();
      if (fallidas > 0) {
        this.registroDeLog.error(
          `No se pudieron marcar ${fallidas} no-show(s); se reintentan en la próxima vuelta`,
        );
      }
      if (canceladas > 0) {
        this.registroDeLog.log(`Servicios cancelados por no-show: ${canceladas}`);
      }
    } catch (error) {
      this.registroDeLog.error(
        `Falló una vuelta de la detección de no-shows: ${(error as Error).message}`,
      );
    }
    if (this.activo) this.programarVuelta();
  }
}
