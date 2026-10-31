import {
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ExpirarSolicitudes } from '../../../aplicacion/casos-de-uso/expirar-solicitudes.js';

// Cada `intervaloMs` cancela las solicitudes de servicio que el cuidador no respondió a tiempo. Es la misma
// idea que el sondeo del outbox: una vuelta nunca empieza antes de que termine la anterior (setTimeout
// encadenado, no setInterval) y con intervalo 0 no arranca (solo pruebas; la configuración lo prohíbe en
// producción). Si hay varias instancias, todas pueden correrlo: expirar es seguro por bloqueo de fila.
export class SondeoDeExpiraciones
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private activo = false;
  private temporizador: NodeJS.Timeout | undefined;
  private vueltaEnCurso: Promise<void> | undefined;
  private readonly registroDeLog = new Logger('SondeoDeExpiraciones');

  constructor(
    private readonly expirar: ExpirarSolicitudes,
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
      const { expiradas, fallidas } = await this.expirar.ejecutar();
      if (fallidas > 0) {
        this.registroDeLog.error(
          `No se pudieron expirar ${fallidas} solicitud(es); se reintentan en la próxima vuelta`,
        );
      }
      if (expiradas > 0) {
        this.registroDeLog.log(`Solicitudes expiradas: ${expiradas}`);
      }
    } catch (error) {
      // Por ejemplo, la base no responde: se reintenta en la siguiente vuelta.
      this.registroDeLog.error(
        `Falló una vuelta de la expiración: ${(error as Error).message}`,
      );
    }
    if (this.activo) this.programarVuelta();
  }
}
