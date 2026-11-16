import {
  FalloDeEnvio,
  type CanalDeNotificacion,
  type MensajeParaEnviar,
  type ResultadoDeEnvio,
} from '../../../aplicacion/puertos/salida/canal-de-notificacion.js';

const URL_BASE = 'https://api.resend.com';

type ClienteHttp = typeof fetch;

function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// El correo de un aviso del ciclo de vida (servicio confirmado, cancelado, etc.), fuera de la campana.
//
// Mismas credenciales que la recuperación de contraseña (RESEND_API_KEY/RESEND_CORREO_DESDE): es la misma
// cuenta de Resend. Sin un dominio propio verificado ahí, `desde` solo puede ser la dirección de su sandbox
// (onboarding@resend.dev), que a su vez solo entrega al correo de la cuenta de Resend — no a usuarios reales.
// Esta clase no conoce esa restricción: la aplica Resend y responde con un error claro si no se cumple.
export class CanalDeCorreoResend implements CanalDeNotificacion {
  readonly canal = 'correo' as const;

  constructor(
    private readonly apiKey: string,
    private readonly desde: string,
    private readonly cliente: ClienteHttp = fetch,
  ) {}

  async enviar(mensaje: MensajeParaEnviar): Promise<ResultadoDeEnvio> {
    let respuesta: Response;
    try {
      respuesta = await this.cliente(`${URL_BASE}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.desde,
          to: [mensaje.destinatario.correo],
          subject: mensaje.titulo,
          html: `<p>${escaparHtml(mensaje.cuerpo)}</p>`,
        }),
      });
    } catch (causa) {
      // Sin red o sin respuesta: reintentable, no es culpa del mensaje.
      throw new FalloDeEnvio((causa as Error).message, false);
    }
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      throw new FalloDeEnvio(`Resend respondió ${respuesta.status}: ${cuerpo}`, false);
    }
    return 'enviada';
  }
}
