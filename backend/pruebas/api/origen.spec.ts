import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { RelojFalso } from '../soporte/dobles.js';
import { ControladorDePrueba } from './controlador-de-prueba.js';

// M1 §4.4 y §6: verificación de `Origin` (CSRF). Las llamadas del BFF no traen el encabezado y se
// aceptan; un navegador que viene de un sitio ajeno sí lo trae, y se rechaza.

const PERMITIDOS = 'http://localhost:3000,https://staging.seniory.co';
const CUERPO_DE_PRUEBA = { horas: 4, jornada: 'tarde' };

describe('verificación de Origin', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const post = (origen?: string) => {
    const peticion = http().post('/api/v1/prueba/eco').send(CUERPO_DE_PRUEBA);
    return origen === undefined ? peticion : peticion.set('Origin', origen);
  };

  beforeAll(async () => {
    app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
      variables: { ORIGENES_PERMITIDOS: PERMITIDOS },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('peticiones que cambian algo (POST, PATCH, DELETE)', () => {
    it('sin Origin se aceptan: así llama el BFF, de servidor a servidor', async () => {
      expect((await post()).status).toBe(201);
    });

    it.each(PERMITIDOS.split(','))(
      'con el origen permitido %s se aceptan',
      async (origen) => {
        expect((await post(origen)).status).toBe(201);
      },
    );

    it.each([
      ['otro sitio', 'https://sitio-malicioso.example'],
      ['el mismo dominio con otro puerto', 'http://localhost:4000'],
      [
        'el mismo sitio con http en lugar de https',
        'http://staging.seniory.co',
      ],
      ['un subdominio', 'https://evil.staging.seniory.co'],
      [
        'un dominio que solo empieza igual',
        'https://staging.seniory.co.malicioso.example',
      ],
      ['el origen con una barra al final', 'http://localhost:3000/'],
      ['las mayúsculas cambiadas', 'HTTP://LOCALHOST:3000'],
      ['«null» (páginas aisladas y algunas redirecciones)', 'null'],
      ['un valor vacío', ''],
    ])('con %s se rechazan: 403', async (_caso, origen) => {
      const respuesta = await post(origen);

      expect(respuesta.status).toBe(403);
      expect(respuesta.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
      expect(respuesta.body).toMatchObject({
        status: 403,
        codigo: 'origen_no_permitido',
      });
    });

    it('rechaza también PATCH y DELETE', async () => {
      const origen = 'https://sitio-malicioso.example';

      expect(
        (
          await http()
            .patch('/api/v1/yo')
            .set('Origin', origen)
            .send({ nombre: 'X' })
        ).status,
      ).toBe(403);
      expect(
        (await http().delete('/api/v1/consentimientos/x').set('Origin', origen))
          .status,
      ).toBe(403);
    });

    it('una petición rechazada no llega al controlador: no se crea nada', async () => {
      const respuesta = await http()
        .post('/api/v1/auth/registro')
        .set('Origin', 'https://sitio-malicioso.example')
        .send({
          nombre: 'Intruso',
          correo: 'intruso@prueba.seniory.invalid',
          contrasena: 'una contraseña larga y única',
          versionPolitica: 'v1',
        });

      expect(respuesta.status).toBe(403);
    });

    it('el inicio de sesión también está protegido: no se puede forzar desde un sitio ajeno', async () => {
      const respuesta = await http()
        .post('/api/v1/auth/login')
        .set('Origin', 'https://sitio-malicioso.example')
        .send({
          correo: 'a@prueba.seniory.invalid',
          contrasena: 'una contraseña larga',
        });

      expect(respuesta.status).toBe(403);
    });

    it('fuera de producción, la documentación de Swagger (su propio origen) sí puede llamar', async () => {
      // Swagger vive en el mismo host que la API: su Origin coincide con el Host de la petición.
      const respuesta = await http()
        .post('/api/v1/prueba/eco')
        .set('Host', 'api.local:3001')
        .set('Origin', 'http://api.local:3001')
        .send(CUERPO_DE_PRUEBA);

      expect(respuesta.status).toBe(201);
    });

    it('un origen que solo se parece al propio no pasa', async () => {
      const respuesta = await http()
        .post('/api/v1/prueba/eco')
        .set('Host', 'api.local:3001')
        .set('Origin', 'http://api.local:3002')
        .send(CUERPO_DE_PRUEBA);

      expect(respuesta.status).toBe(403);
    });
  });

  describe('peticiones que no cambian nada', () => {
    it.each(['GET', 'HEAD'] as const)(
      '%s con un origen ajeno se acepta: leer no es lo que protege este control',
      async (metodo) => {
        const peticion =
          metodo === 'GET' ? http().get('/salud') : http().head('/salud');

        const respuesta = await peticion.set(
          'Origin',
          'https://sitio-malicioso.example',
        );

        expect(respuesta.status).toBe(200);
      },
    );
  });
});

describe('verificación de Origin en producción', () => {
  it('no admite el origen propio de la API: solo los orígenes configurados', async () => {
    const app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
      variables: {
        NODE_ENV: 'production',
        ORIGENES_PERMITIDOS: 'https://app.seniory.co',
        SECRETO_BFF: 's'.repeat(40),
        COOKIES_SEGURAS: 'true',
        INTERVALO_SONDEO_OUTBOX_MS: '1000',
      },
      // Producción exige el sondeo encendido. Con el reloj en 1970 no toma ningún evento de las demás
      // pruebas, que comparten la base.
      ajustar: (constructor) =>
        constructor
          .overrideProvider(RELOJ)
          .useValue(new RelojFalso('1970-01-02T00:00:00.000Z')),
    });
    try {
      const propio = await request(app.getHttpServer())
        .post('/api/v1/prueba/eco')
        .set('Host', 'api.local:3001')
        .set('Origin', 'http://api.local:3001')
        .send(CUERPO_DE_PRUEBA);
      const permitido = await request(app.getHttpServer())
        .post('/api/v1/prueba/eco')
        .set('Origin', 'https://app.seniory.co')
        .send(CUERPO_DE_PRUEBA);

      expect(propio.status).toBe(403);
      expect(permitido.status).toBe(201);
    } finally {
      await app.close();
    }
  });
});
