// Cifra y descifra secretos de vida larga que SÍ hay que poder leer de vuelta (a diferencia de un hash,
// que nunca se deshace). Hoy solo lo usa el secreto TOTP del segundo factor: con la base de datos robada,
// sin la llave de cifrado (que vive solo en la configuración del servidor), el secreto no sirve para nada.
export interface CifradorDeSecretos {
  cifrar(textoPlano: string): Uint8Array;

  // Lanza si el texto cifrado no es válido (llave distinta, datos corruptos o manipulados).
  descifrar(cifrado: Uint8Array): string;
}

export const CIFRADOR_DE_SECRETOS = Symbol('CifradorDeSecretos');
