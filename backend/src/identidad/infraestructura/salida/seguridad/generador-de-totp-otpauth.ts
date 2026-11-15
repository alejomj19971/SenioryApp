import { Secret, TOTP } from 'otpauth';
import type { GeneradorDeTotp } from '../../../aplicacion/puertos/salida/generador-de-totp.js';

const EMISOR = 'Seniory';
const DIGITOS = 6;
const PERIODO_SEGUNDOS = 30;
// Acepta el paso actual y uno antes/después (±30 s): el reloj de un celular casi nunca está perfecto.
const VENTANA_DE_PASOS = 1;

export class GeneradorDeTotpOtpauth implements GeneradorDeTotp {
  generarSecreto(): string {
    // 20 bytes (160 bits): el tamaño que recomienda RFC 4226 para HMAC-SHA1.
    return new Secret({ size: 20 }).base32;
  }

  uriDeInscripcion(secreto: string, cuenta: string): string {
    return new TOTP({
      issuer: EMISOR,
      label: cuenta,
      secret: Secret.fromBase32(secreto),
      algorithm: 'SHA1',
      digits: DIGITOS,
      period: PERIODO_SEGUNDOS,
    }).toString();
  }

  verificar(secreto: string, codigo: string, ahora: Date): boolean {
    const totp = new TOTP({
      secret: Secret.fromBase32(secreto),
      algorithm: 'SHA1',
      digits: DIGITOS,
      period: PERIODO_SEGUNDOS,
    });
    const delta = totp.validate({
      token: codigo,
      timestamp: ahora.getTime(),
      window: VENTANA_DE_PASOS,
    });
    return delta !== null;
  }
}
