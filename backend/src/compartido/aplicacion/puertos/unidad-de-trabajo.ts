// Ejecuta un caso de uso dentro de una transacción. Los repositorios y el publicador de eventos usan
// automáticamente esa transacción, así que el caso de uso no conoce Drizzle ni recibe la conexión.
// Si `trabajo` lanza, se revierte todo, incluidos los eventos del outbox (M0 §4.8; adaptador en el PR 4).
export interface UnidadDeTrabajo {
  ejecutar<T>(trabajo: () => Promise<T>): Promise<T>;
}

export const UNIDAD_DE_TRABAJO = Symbol('UnidadDeTrabajo');
