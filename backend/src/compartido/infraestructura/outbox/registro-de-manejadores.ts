import type { ManejadorDeEventos } from '../../aplicacion/puertos/manejador-de-eventos.js';

// Quién reacciona a cada tipo de evento. Cada módulo registra sus manejadores al iniciar
// (onModuleInit); el despachador los consulta al entregar.
export class RegistroDeManejadores {
  private readonly porNombre = new Map<string, ManejadorDeEventos>();

  registrar(manejador: ManejadorDeEventos): void {
    if (this.porNombre.has(manejador.nombre)) {
      // Dos manejadores con el mismo nombre compartirían el registro de eventos consumidos:
      // uno de ellos dejaría de ejecutarse sin que nadie lo note.
      throw new Error(
        `Ya hay un manejador de eventos registrado con el nombre "${manejador.nombre}"`,
      );
    }
    this.porNombre.set(manejador.nombre, manejador);
  }

  para(tipo: string): ManejadorDeEventos[] {
    return [...this.porNombre.values()].filter(
      (manejador) => manejador.tipo === tipo,
    );
  }
}
