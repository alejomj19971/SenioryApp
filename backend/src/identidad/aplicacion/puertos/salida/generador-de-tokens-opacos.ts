export interface TokenOpaco {
  // Lo que se entrega a la persona (en una cookie). Nunca se guarda.
  token: string;
  // SHA-256 del token: lo único que se guarda. Con la base de datos robada, los tokens no sirven.
  hash: Uint8Array;
}

// Tokens de refresco: aleatorios, sin información dentro.
export interface GeneradorDeTokensOpacos {
  generar(): TokenOpaco;
  hashDe(token: string): Uint8Array;
}

export const GENERADOR_DE_TOKENS_OPACOS = Symbol('GeneradorDeTokensOpacos');
