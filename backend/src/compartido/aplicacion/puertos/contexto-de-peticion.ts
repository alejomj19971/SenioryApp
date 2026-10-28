// Datos de la operación en curso que los casos de uso necesitan sin recibirlos por parámetro.
// En una petición HTTP vienen de `X-Request-Id`; al atender un evento, del propio evento. Así una
// misma cadena de acciones (petición → evento → reacción de otro módulo) comparte un solo ID en los
// logs, el outbox y la auditoría.
export interface ContextoDePeticion {
  idDeCorrelacion(): string;
}

export const CONTEXTO_DE_PETICION = Symbol('ContextoDePeticion');
