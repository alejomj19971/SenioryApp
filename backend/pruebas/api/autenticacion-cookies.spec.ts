import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { nuevoId } from '../soporte/bd.js';
import { crearAppDePrueba } from '../soporte/app.js';

// M1 §4.4: las cookies de sesión llevan Secure fuera de local.

const CONTRASENA = 'una contraseña larga y única';
const datos = () => ({
  nombre: 'Andrea Gómez',
  correo: `${nuevoId()}@prueba.seniory.invalid`,
  contrasena: CONTRASENA,
  versionPolitica: 'v1',
});

describe('cookies de sesión con COOKIES_SEGURAS=true', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba({ variables: { COOKIES_SEGURAS: 'true' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('el registro, la renovación y el cierre escriben las cookies con Secure', async () => {
    const http = () => request(app.getHttpServer());
    const registro = await http().post('/api/v1/auth/registro').send(datos());
    const cookies = registro.headers['set-cookie'] as unknown as string[];
    const refresco = cookies
      .find((c) => c.startsWith('seniory_refresco='))
      ?.split(';')[0] as string;
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) expect(cookie).toContain('; Secure');

    const renovacion = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresco);
    const cierre = await http().post('/api/v1/auth/logout');

    for (const respuesta of [renovacion, cierre]) {
      const escritas = respuesta.headers['set-cookie'] as unknown as string[];
      expect(escritas).toHaveLength(2);
      for (const cookie of escritas) expect(cookie).toContain('; Secure');
    }
  });
});
