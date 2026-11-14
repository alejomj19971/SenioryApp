import { EnviadorDeRecuperacionResend } from '../../../../src/identidad/infraestructura/salida/recuperacion/enviador-de-recuperacion-resend.js';

const API_KEY = 're_prueba_123';
const DESDE = 'Seniory <onboarding@resend.dev>';

const MENSAJE = {
  nombre: 'Andrea',
  correo: 'andrea@prueba.seniory.invalid',
  enlace: 'http://localhost:3000/restablecer-contrasena?token=abc',
  expiraEn: new Date('2026-03-01T12:30:00.000Z'),
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

describe('EnviadorDeRecuperacionResend', () => {
  it('está disponible', () => {
    const { cliente } = clienteFalso({ estado: 200, cuerpo: { id: '1' } });
    expect(
      new EnviadorDeRecuperacionResend(API_KEY, DESDE, cliente).disponible,
    ).toBe(true);
  });

  it('manda el correo con el remitente, el destinatario y el enlace', async () => {
    const { cliente, llamadas } = clienteFalso({
      estado: 200,
      cuerpo: { id: 'abc' },
    });

    await new EnviadorDeRecuperacionResend(API_KEY, DESDE, cliente).enviar(
      MENSAJE,
    );

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({
      url: 'https://api.resend.com/emails',
      metodo: 'POST',
      autorizacion: `Bearer ${API_KEY}`,
    });
    expect(llamadas[0]!.cuerpo).toMatchObject({
      from: DESDE,
      to: [MENSAJE.correo],
    });
    const html = String(llamadas[0]!.cuerpo.html);
    expect(html).toContain(MENSAJE.nombre);
    expect(html).toContain(MENSAJE.enlace);
  });

  it('escapa el nombre dentro del cuerpo HTML', async () => {
    const { cliente, llamadas } = clienteFalso({
      estado: 200,
      cuerpo: { id: 'abc' },
    });

    await new EnviadorDeRecuperacionResend(API_KEY, DESDE, cliente).enviar({
      ...MENSAJE,
      nombre: '<script>alert(1)</script>',
    });

    const html = String(llamadas[0]!.cuerpo.html);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('lanza si Resend responde un error (por ejemplo, la restricción del sandbox)', async () => {
    const { cliente } = clienteFalso({
      estado: 403,
      cuerpo: {
        message:
          'You can only send testing emails to your own email address',
      },
    });

    await expect(
      new EnviadorDeRecuperacionResend(API_KEY, DESDE, cliente).enviar(
        MENSAJE,
      ),
    ).rejects.toThrow('Resend respondió 403');
  });
});
