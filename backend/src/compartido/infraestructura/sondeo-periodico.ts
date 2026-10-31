import {
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';

// Repite un trabajo cada `intervaloMs`. Una vuelta nunca empieza antes de que termine la anterior (setTimeout
// encadenado, no setInterval). Si una vuelta hizo trabajo (`trabajo` devuelve un número mayor que cero), la
// siguiente empieza de inmediato; si no, espera el intervalo. Con intervalo 0 no arranca (solo pruebas: la
// configuración lo prohíbe en producción).
//
// Un fallo del trabajo se registra y no detiene el sondeo: se reintenta en la siguiente vuelta.
export class SondeoPeriodico
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private activo = false;
  private temporizador: NodeJS.Timeout | undefined;
  private vueltaEnCurso: Promise<void> | undefined;
  private readonly registroDeLog: Logger;

  constructor(
    nombre: string,
    private readonly trabajo: () => Promise<number>,
    private readonly intervaloMs: number,
  ) {
    this.registroDeLog = new Logger(nombre);
  }

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
    this.programarVuelta(this.intervaloMs);
  }

  async detener(): Promise<void> {
    this.activo = false;
    clearTimeout(this.temporizador);
    await this.vueltaEnCurso;
  }

  private programarVuelta(esperaMs: number): void {
    this.temporizador = setTimeout(() => {
      this.vueltaEnCurso = this.darVuelta();
    }, esperaMs);
  }

  private async darVuelta(): Promise<void> {
    let hecho = 0;
    try {
      hecho = await this.trabajo();
    } catch (error) {
      // Por ejemplo, la base no responde: se reintenta en la siguiente vuelta.
      this.registroDeLog.error(`Falló una vuelta: ${(error as Error).message}`);
    }
    if (this.activo) this.programarVuelta(hecho > 0 ? 0 : this.intervaloMs);
  }
}
