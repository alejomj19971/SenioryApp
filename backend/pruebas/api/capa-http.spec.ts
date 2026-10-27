import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  VERIFICADOR_DE_TOKENS,
  type UsuarioAutenticado,
  type VerificadorDeTokens,
} from '../../src/compartido/aplicacion/puertos/verificador-de-tokens.js';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { NoAutenticado } from '../../src/compartido/dominio/errores.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { RelojFalso } from '../soporte/dobles.js';
import { ControladorDePrueba } from './controlador-de-prueba.js';

// M0 §6 (API): ruta no pública sin token → 401 en problem+json; campo no declarado → 400;
// X-Request-Id se devuelve; /salud/listo → 503 con la base detenida. Y el resto de M0 §4.10.

const FAMILIAR: UsuarioAutenticado = { id: nuevoId(), rol: 'familiar' };
const ADMINISTRADOR: UsuarioAutenticado = {
  id: nuevoId(),
  rol: 'administrador',
};
const SECRETO_BFF = 's'.repeat(40);

// Doble del verificador que implementará Identidad en M1.
const verificadorDePrueba: VerificadorDeTokens = {
  verificar: (token) => {
    if (token === 'token-familiar') return Promise.resolve(FAMILIAR);
    if (token === 'token-administrador') return Promise.resolve(ADMINISTRADOR);
    return Promise.reject(new NoAutenticado('La sesión no es válida'));
  },
};

const crearApp = (variables: Record<string, string> = {}) =>
  crearAppDePrueba({
    controladores: [ControladorDePrueba],
    variables,
    ajustar: (constructor) =>
      constructor
        .overrideProvider(VERIFICADOR_DE_TOKENS)
        .useValue(verificadorDePrueba),
  });

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('capa HTTP', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('correlación (X-Request-Id)', () => {
    it('genera un UUID si no viene y lo devuelve en la respuesta', async () => {
      const respuesta = await http().get('/salud').expect(200);
      expect(respuesta.headers['x-request-id']).toMatch(FORMATO_UUID);
    });

    it('respeta el que envía el cliente si es un UUID válido', async () => {
      const id = nuevoId();
      await http()
        .get('/salud')
        .set('X-Request-Id', id.toUpperCase())
        .expect('X-Request-Id', id);
    });

    it('reemplaza un valor que no es UUID (no se copia texto arbitrario a los logs)', async () => {
      const respuesta = await http()
        .get('/salud')
        .set('X-Request-Id', "<script>alert('x')</script>");
      expect(respuesta.headers['x-request-id']).toMatch(FORMATO_UUID);
    });

    it('la auditoría guarda el ID de la petición que la originó', async () => {
      const id = nuevoId();
      const recursoId = nuevoId();
      await http()
        .post(`/api/v1/prueba/auditar/${recursoId}`)
        .set('X-Request-Id', id)
        .expect(201);

      const bd = conectarBd();
      const { rows } = await bd.query<{ id_de_correlacion: string }>(
        'select id_de_correlacion from compartido.auditoria where recurso_id = $1',
        [recursoId],
      );
      await bd.end();
      expect(rows[0]?.id_de_correlacion).toBe(id);
    });
  });

  describe('autenticación: deniega por defecto', () => {
    it('una ruta no pública sin token responde 401 en problem+json', async () => {
      const respuesta = await http()
        .get('/api/v1/prueba/privada')
        .expect(401)
        .expect('Content-Type', /application\/problem\+json/);

      expect(respuesta.body).toEqual({
        type: 'urn:seniory:problema:no_autenticado',
        title: 'Debes iniciar sesión',
        status: 401,
        codigo: 'no_autenticado',
        detail: 'Debes iniciar sesión',
        idDeCorrelacion: respuesta.headers['x-request-id'],
      });
    });

    it('un token inválido responde 401', async () => {
      await http()
        .get('/api/v1/prueba/privada')
        .set('Authorization', 'Bearer token-falso')
        .expect(401);
    });

    it('acepta el token de la cookie seniory_acceso y entrega el usuario al controlador', async () => {
      await http()
        .get('/api/v1/prueba/privada')
        .set('Cookie', 'seniory_acceso=token-familiar')
        .expect(200, FAMILIAR);
    });

    it('fuera de producción también acepta Authorization: Bearer', async () => {
      await http()
        .get('/api/v1/prueba/privada')
        .set('Authorization', 'Bearer token-familiar')
        .expect(200, FAMILIAR);
    });

    it('un rol insuficiente responde 403', async () => {
      const respuesta = await http()
        .get('/api/v1/prueba/solo-administradores')
        .set('Cookie', 'seniory_acceso=token-familiar')
        .expect(403);
      expect(respuesta.body.codigo).toBe('sin_permiso');

      await http()
        .get('/api/v1/prueba/solo-administradores')
        .set('Cookie', 'seniory_acceso=token-administrador')
        .expect(200, { ok: true });
    });
  });

  describe('validación de entrada', () => {
    it('acepta un cuerpo válido y entrega una instancia del DTO con los tipos convertidos', async () => {
      await http()
        .post('/api/v1/prueba/eco')
        .send({ horas: 4, jornada: 'tarde', direccion: { ciudad: 'Medellín' } })
        .expect(201, {
          horas: 4,
          jornada: 'tarde',
          direccion: { ciudad: 'Medellín' },
          clase: 'SolicitudDePruebaDto',
        });
    });

    it('rechaza un campo no declarado (evita la asignación masiva)', async () => {
      const respuesta = await http()
        .post('/api/v1/prueba/eco')
        .send({ horas: 4, jornada: 'tarde', rol: 'administrador' })
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/);

      expect(respuesta.body).toMatchObject({
        status: 400,
        codigo: 'validacion',
        title: 'Los datos enviados no son válidos',
        errores: [{ campo: 'rol', mensaje: 'Este campo no está permitido' }],
      });
    });

    it('lista cada campo inválido con su mensaje en español, incluidos los anidados', async () => {
      const respuesta = await http()
        .post('/api/v1/prueba/eco')
        .send({ horas: 12, jornada: 'madrugada', direccion: {} })
        .expect(400);

      expect(respuesta.body.errores).toEqual(
        expect.arrayContaining([
          { campo: 'horas', mensaje: 'Debe estar entre 1 y 8' },
          { campo: 'jornada', mensaje: 'Jornada inválida' },
          { campo: 'direccion.ciudad', mensaje: 'La ciudad es obligatoria' },
        ]),
      );
    });

    it('un JSON mal formado responde 400', async () => {
      const respuesta = await http()
        .post('/api/v1/prueba/eco')
        .set('Content-Type', 'application/json')
        .send('{"horas": 4,')
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/);
      expect(respuesta.body.codigo).toBe('solicitud_invalida');
    });

    it('un cuerpo de más de 100 KB responde 413', async () => {
      const respuesta = await http()
        .post('/api/v1/prueba/eco')
        .send({ horas: 4, jornada: 'tarde', nota: 'x'.repeat(110 * 1024) })
        .expect(413);
      expect(respuesta.body.codigo).toBe('cuerpo_demasiado_grande');
    });
  });

  describe('errores de dominio → problem+json', () => {
    it.each([
      ['validacion', 400, 'validacion', 'El monto no puede ser negativo'],
      ['no_autenticado', 401, 'no_autenticado', 'Debes iniciar sesión'],
      ['sin_permiso', 403, 'sin_permiso', 'No tienes permiso para esta acción'],
      ['no_encontrado', 404, 'no_encontrado', 'El servicio no existe'],
      [
        'conflicto',
        409,
        'reservas.franja_ocupada',
        'El cuidador ya tiene un servicio en esa franja',
      ],
      [
        'regla',
        422,
        'reservas.fecha_pasada',
        'No se puede reservar para una fecha pasada',
      ],
    ])('%s → %i con código %s', async (tipo, status, codigo, detail) => {
      const respuesta = await http()
        .get(`/api/v1/prueba/error/${tipo}`)
        .expect(status)
        .expect('Content-Type', /application\/problem\+json/);
      expect(respuesta.body).toMatchObject({
        type: `urn:seniory:problema:${codigo}`,
        status,
        codigo,
        detail,
      });
    });

    it('un error inesperado responde 500 sin detalles internos', async () => {
      const respuesta = await http()
        .get('/api/v1/prueba/error/inesperado')
        .expect(500);

      expect(respuesta.body).toEqual({
        type: 'urn:seniory:problema:error_interno',
        title: 'Ocurrió un error inesperado',
        status: 500,
        codigo: 'error_interno',
        idDeCorrelacion: respuesta.headers['x-request-id'],
      });
      expect(JSON.stringify(respuesta.body)).not.toContain('secreto');
    });

    it('una ruta inexistente responde 404 en problem+json', async () => {
      const respuesta = await http()
        .get('/api/v1/no-existe')
        .set('Cookie', 'seniory_acceso=token-familiar')
        .expect(404)
        .expect('Content-Type', /application\/problem\+json/);
      expect(respuesta.body.codigo).toBe('no_encontrado');
    });
  });

  describe('cabeceras de seguridad y CORS', () => {
    it('envía las cabeceras de helmet y oculta que es Express', async () => {
      const respuesta = await http().get('/salud');
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['x-powered-by']).toBeUndefined();
    });

    it('permite el origen configurado, con cookies', async () => {
      const respuesta = await http()
        .get('/salud')
        .set('Origin', 'http://localhost:3000');
      expect(respuesta.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
      expect(respuesta.headers['access-control-allow-credentials']).toBe(
        'true',
      );
    });

    it('no autoriza un origen desconocido', async () => {
      const respuesta = await http()
        .get('/salud')
        .set('Origin', 'https://sitio-malicioso.example');
      expect(respuesta.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('salud', () => {
    it('/salud responde 200 fuera del prefijo /api/v1, y no existe bajo el prefijo', async () => {
      await http().get('/salud').expect(200, { estado: 'ok' });
      await http().get('/api/v1/salud').expect(404);
    });

    it('/salud/listo responde 200 cuando la base responde', async () => {
      await http()
        .get('/salud/listo')
        .expect(200, { estado: 'listo', baseDeDatos: 'ok' });
    });

    it('/salud/listo responde 503 con la base detenida', async () => {
      const sinBase = await crearApp({
        URL_BASE_DE_DATOS: 'postgres://seniory:seniory@127.0.0.1:1/seniory',
      });
      try {
        await request(sinBase.getHttpServer())
          .get('/salud/listo')
          .expect(503, { estado: 'no_listo', baseDeDatos: 'sin_conexion' });
        // /salud sigue respondiendo: el proceso vive.
        await request(sinBase.getHttpServer()).get('/salud').expect(200);
      } finally {
        await sinBase.close();
      }
    });
  });

  it('publica la documentación OpenAPI fuera de producción', async () => {
    const respuesta = await http().get('/api/docs-json').expect(200);
    expect(respuesta.body.info.title).toBe('Seniory API');
  });
});

describe('límite de peticiones', () => {
  // Cada prueba arranca su propia aplicación: el contador vive en memoria.
  const conApp = async (
    prueba: (app: NestExpressApplication) => Promise<void>,
  ) => {
    const app = await crearApp({ SECRETO_BFF });
    try {
      await prueba(app);
    } finally {
      await app.close();
    }
  };

  it('tras 100 peticiones por minuto desde la misma IP responde 429', () =>
    conApp(async (app) => {
      for (let i = 0; i < 100; i++) {
        await request(app.getHttpServer()).post('/api/v1/prueba/eco').send({
          horas: 1,
          jornada: 'tarde',
        });
      }
      const respuesta = await request(app.getHttpServer())
        .post('/api/v1/prueba/eco')
        .send({ horas: 1, jornada: 'tarde' })
        .expect(429)
        .expect('Content-Type', /application\/problem\+json/);
      expect(respuesta.body.codigo).toBe('demasiadas_solicitudes');
    }));

  it('con el secreto del BFF cuenta por la IP real de cada persona', () =>
    conApp(async (app) => {
      for (let i = 0; i < 101; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/prueba/eco')
          .set('X-Seniory-BFF', SECRETO_BFF)
          .set('X-Cliente-IP', `181.50.${Math.floor(i / 250)}.${i % 250}`)
          .send({ horas: 1, jornada: 'tarde' })
          .expect(201);
      }
    }));

  it('con un secreto equivocado ignora X-Cliente-IP (no se puede evadir el límite)', () =>
    conApp(async (app) => {
      const codigos: number[] = [];
      for (let i = 0; i < 101; i++) {
        const respuesta = await request(app.getHttpServer())
          .post('/api/v1/prueba/eco')
          .set('X-Seniory-BFF', 'secreto-adivinado')
          .set('X-Cliente-IP', `181.50.0.${i}`)
          .send({ horas: 1, jornada: 'tarde' });
        codigos.push(respuesta.status);
      }
      expect(codigos.at(-1)).toBe(429);
    }));

  it('/salud no tiene límite (lo consultan los monitores)', () =>
    conApp(async (app) => {
      for (let i = 0; i < 105; i++) {
        await request(app.getHttpServer()).get('/salud').expect(200);
      }
    }));
});

describe('en producción', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // Producción exige el sondeo encendido. Con el reloj en 1970 no toma ningún evento de las demás
    // pruebas, que comparten la base.
    app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
      variables: {
        NODE_ENV: 'production',
        ORIGENES_PERMITIDOS: 'https://app.seniory.co',
        SECRETO_BFF,
        INTERVALO_SONDEO_OUTBOX_MS: '1000',
      },
      ajustar: (constructor) =>
        constructor
          .overrideProvider(VERIFICADOR_DE_TOKENS)
          .useValue(verificadorDePrueba)
          .overrideProvider(RELOJ)
          .useValue(new RelojFalso('1970-01-02T00:00:00.000Z')),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('no publica Swagger', async () => {
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
  });

  it('solo acepta el token por cookie, no por Authorization: Bearer', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/prueba/privada')
      .set('Authorization', 'Bearer token-familiar')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/prueba/privada')
      .set('Cookie', 'seniory_acceso=token-familiar')
      .expect(200);
  });
});
