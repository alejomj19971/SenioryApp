import type {
  EnviadorDeRecuperacion,
  MensajeDeRecuperacion,
} from '../../../aplicacion/puertos/salida/enviador-de-recuperacion.js';

const URL_BASE = 'https://api.resend.com';

type ClienteHttp = typeof fetch;

function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cuerpoHtml(mensaje: MensajeDeRecuperacion): string {
  const vence = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(mensaje.expiraEn);
  return `
    <p>Hola ${escaparHtml(mensaje.nombre)},</p>
    <p>Alguien pidió restablecer la contraseña de tu cuenta en Seniory. Si fuiste tú, entra al siguiente enlace (vence el ${vence}):</p>
    <p><a href="${mensaje.enlace}">Restablecer mi contraseña</a></p>
    <p>Si no fuiste tú, ignora este correo: tu contraseña sigue siendo la misma.</p>
  `.trim();
}

// El canal real de recuperación (Resend): un enlace de un solo uso, admitido en producción.
//
// Sin un dominio propio verificado en Resend, `desde` solo puede ser una dirección de su sandbox
// (onboarding@resend.dev), y esa, a su vez, solo entrega al correo de la cuenta de Resend — no a usuarios
// reales. Esta clase no conoce esa restricción: la aplica Resend y responde con un error claro si no se
// cumple; el error se propaga tal cual (lo audita quien llamó, ver SolicitarRecuperacion).
export class EnviadorDeRecuperacionResend implements EnviadorDeRecuperacion {
  readonly disponible = true;

  constructor(
    private readonly apiKey: string,
    private readonly desde: string,
    private readonly cliente: ClienteHttp = fetch,
  ) {}

  async enviar(mensaje: MensajeDeRecuperacion): Promise<void> {
    const respuesta = await this.cliente(`${URL_BASE}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.desde,
        to: [mensaje.correo],
        subject: 'Recupera tu contraseña de Seniory',
        html: cuerpoHtml(mensaje),
      }),
    });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      throw new Error(`Resend respondió ${respuesta.status}: ${cuerpo}`);
    }
  }
}
