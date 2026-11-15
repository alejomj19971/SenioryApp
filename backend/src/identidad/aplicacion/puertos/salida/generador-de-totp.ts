// Códigos de un solo uso basados en el tiempo (TOTP, RFC 6238): la app autenticadora del administrador
// (Google Authenticator, Authy…) y el servidor calculan el mismo código de 6 dígitos a partir de un
// secreto compartido y la hora, sin hablarse entre sí.
export interface GeneradorDeTotp {
  // Un secreto nuevo, aleatorio, listo para cifrarse y guardarse.
  generarSecreto(): string;

  // La dirección «otpauth://» que la app autenticadora lee como código QR para configurarse.
  uriDeInscripcion(secreto: string, cuenta: string): string;

  // Acepta el código actual y, por el reloj de un celular algo desajustado, el de un paso antes o después
  // (±30 s).
  verificar(secreto: string, codigo: string, ahora: Date): boolean;
}

export const GENERADOR_DE_TOTP = Symbol('GeneradorDeTotp');
