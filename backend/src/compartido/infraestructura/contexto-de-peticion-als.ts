import { AsyncLocalStorage } from 'node:async_hooks';
import { v7 as uuidv7 } from 'uuid';
import type { ContextoDePeticion } from '../aplicacion/puertos/contexto-de-peticion.js';

export interface DatosDePeticion {
  idDeCorrelacion: string;
  ipDelCliente?: string;
}

// El contexto vive en un AsyncLocalStorage: lo abre el middleware HTTP para cada petición y el
// despachador para cada evento, y lo ve todo lo que se ejecute dentro.
export class ContextoDePeticionAls implements ContextoDePeticion {
  private readonly almacen = new AsyncLocalStorage<DatosDePeticion>();

  ejecutar<T>(datos: DatosDePeticion, trabajo: () => T): T {
    return this.almacen.run(datos, trabajo);
  }

  // Fuera de una petición o de un evento (por ejemplo, una tarea programada que no abrió contexto)
  // se genera uno nuevo para no dejar el dato vacío.
  idDeCorrelacion(): string {
    return this.almacen.getStore()?.idDeCorrelacion ?? uuidv7();
  }

  ipDelCliente(): string | undefined {
    return this.almacen.getStore()?.ipDelCliente;
  }
}
