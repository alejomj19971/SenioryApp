import { FalloDeEnvio } from '../../../../src/notificaciones/aplicacion/puertos/salida/canal-de-notificacion.js';
import { CanalDeCorreoResend } from '../../../../src/notificaciones/infraestructura/salida/canales/canal-de-correo-resend.js';

const API_KEY = 're_prueba_123';
const DESDE = 'Seniory <onboarding@resend.dev>';

const MENSAJE = {
  destinatario: {
    usuarioId: '0198aaaa-0000-7000-8000-0000000000f1',
    nombre: 'Andrea Gómez',
    correo: 'andrea@ejemplo.co',
    telefono: null,
  },
  titulo: 'Servicio confirmado',
  cuerpo: 'Tu servicio del martes 11 de junio quedó confirmado.',
  prioridad: 'normal' as const,
};

interface Llamada {
  url: string;
  metodo: string | undefined;
  autorizacion: string | null;
  cuerpo: Record<string, unknown>;
}

function clienteFalso(respuesta: { estado: number; cuerpo: unknown }) {
  const llamadas: Llamada[] = [];
  const cliente = (async (url: unknown, init?: RequestInit) => {
    const encabezados = new Headers(init?.headers);
    llamadas.push({
      url: String(url),
      metodo: init?.method,
      autorizacion: encabezados.get('authorization'),
      cuerpo: JSON.parse(init?.body as string) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(respuesta.cuerpo), {
      status: respuesta.estado,
    });
  }) as unknown as typeof fetch;
  return { cliente, llamadas };
}

describe('CanalDeCorreoResend', () => {
  it('es el canal «correo»', () => {
    const { cliente } = clienteFalso({ estado: 200, cuerpo: { id: '1' } });
    expect(new CanalDeCorreoResend(API_KEY, DESDE, cliente).canal).toBe(
      'correo',
    );
  });

  it('manda el correo con el remitente, el destinatario, el título y el cuerpo, y responde «enviada»', async () => {
    const { cliente, llamadas } = clienteFalso({
      estado: 200,
      cuerpo: { id: 'abc' },
    });

    const resultado = await new CanalDeCorreoResend(
      API_KEY,
      DESDE,
      cliente,
    ).enviar(MENSAJE);

    expect(resultado).toBe('enviada');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({
      url: 'https://api.resend.com/emails',
      metodo: 'POST',
      autorizacion: `Bearer ${API_KEY}`,
    });
    expect(llamadas[0]!.cuerpo).toMatchObject({
      from: DESDE,
      to: [MENSAJE.destinatario.correo],
      subject: MENSAJE.titulo,
    });
    expect(String(llamadas[0]!.cuerpo.html)).toContain(MENSAJE.cuerpo);
  });

  it('escapa el cuerpo del aviso dentro del HTML', async () => {
    const { cliente, llamadas } = clienteFalso({
      estado: 200,
      cuerpo: { id: 'abc' },
    });

    await new CanalDeCorreoResend(API_KEY, DESDE, cliente).enviar({
      ...MENSAJE,
      cuerpo: '<script>alert(1)</script>',
    });

    const html = String(llamadas[0]!.cuerpo.html);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('lanza FalloDeEnvio (reintentable) si Resend responde un error', async () => {
    const { cliente } = clienteFalso({
      estado: 403,
      cuerpo: {
        message:
          'You can only send testing emails to your own email address',
      },
    });

    await expect(
      new CanalDeCorreoResend(API_KEY, DESDE, cliente).enviar(MENSAJE),
    ).rejects.toMatchObject({
      constructor: FalloDeEnvio,
      definitivo: false,
      message: expect.stringContaining('Resend respondió 403') as string,
    });
  });

  it('lanza FalloDeEnvio (reintentable) si no hay red', async () => {
    const cliente = (() =>
      Promise.reject(new Error('sin conexión'))) as unknown as typeof fetch;

    await expect(
      new CanalDeCorreoResend(API_KEY, DESDE, cliente).enviar(MENSAJE),
    ).rejects.toMatchObject({ constructor: FalloDeEnvio, definitivo: false });
  });
});
