import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import {
  ImportarCuidador,
  type EntradaDeCuidadorImportado,
} from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import {
  como,
  conSesion,
  registrarFamiliar,
  SECRETO_BFF,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { REVISOR_DE_PRUEBA } from '../soporte/directorio.js';

// M2 §6 (API): el directorio que ve una familia. Lo que más importa: nadie ve a un cuidador sin sus tres
// controles, el teléfono nunca sale, y los archivos solo se entregan con una dirección firmada y vigente.

const INICIO = '2030-06-10T15:00:00.000Z';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();
const TELEFONO = '+573104445566';
const PDF = Buffer.from('%PDF-1.4\nHoja de vida de prueba\n%%EOF');

function entrada(
  zona: string,
  cambios: Partial<EntradaDeCuidadorImportado> = {},
): EntradaDeCuidadorImportado {
  const marca = nuevoId().slice(0, 8);
  return {
    nombre: `Marta ${marca}`,
    correo: `${marca}@cuidadores.seniory.invalid`,
    telefono: TELEFONO,
    especialidad: 'enfermeria',
    titulo: 'Enfermera profesional',
    aniosExperiencia: 6,
    tarifaHora: 25_000,
    zona,
    disponibilidad: ['manana', 'tarde'],
    bio: 'Cuido con paciencia.',
    controles: [
      { control: 'antecedentes', vigenteHasta: '2031-01-01' },
      { control: 'titulos', vigenteHasta: null },
      { control: 'psicotecnica', vigenteHasta: '2031-01-01' },
    ],
    ...cambios,
  };
}

// La ruta y la consulta de una dirección absoluta: es lo que el cliente de prueba necesita.
const rutaDe = (url: string) => {
  const direccion = new URL(url);
  return `${direccion.pathname}${direccion.search}`;
};

describe('directorio de cuidadores (API)', () => {
  let app: NestExpressApplication;
  let carpeta: string;
  let familiar: { cookie: string };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'seniory-archivos-'));
    app = await crearAppDePrueba({
      variables: {
        SECRETO_BFF,
        ALMACEN_DE_ARCHIVOS: 'local',
        DIRECTORIO_DE_ARCHIVOS: carpeta,
        SECRETO_DE_ARCHIVOS: 'a'.repeat(40),
      },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
    const persona = await registrarFamiliar(como(app));
    familiar = { cookie: conSesion(persona.sesion) };
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(() => reloj.fijar(INICIO));

  const importar = (datos: EntradaDeCuidadorImportado) =>
    app
      .get(ImportarCuidador, { strict: false })
      .ejecutar(datos, REVISOR_DE_PRUEBA);
  const zonaNueva = () => `Zona${nuevoId().slice(0, 8)}`;
  const get = (ruta: string) =>
    como(app).get(ruta).set('Cookie', familiar.cookie);
  const ocultar = (cuidadorId: string) =>
    bd.query(
      `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
      [cuidadorId],
    );

  describe('exige sesión', () => {
    it.each([
      '/api/v1/cuidadores',
      '/api/v1/cuidadores/filtros',
      `/api/v1/cuidadores/${nuevoId()}`,
      `/api/v1/cuidadores/${nuevoId()}/hoja-de-vida`,
    ])('GET %s sin sesión es 401', async (ruta) => {
      const respuesta = await como(app).get(ruta);

      expect(respuesta.status).toBe(401);
    });
  });

  describe('búsqueda', () => {
    it('devuelve solo a los cuidadores visibles, y sin teléfono ni datos internos', async () => {
      const zona = zonaNueva();
      const visible = await importar(entrada(zona));
      const suspendido = await importar(entrada(zona));
      await ocultar(suspendido.cuidadorId);

      const respuesta = await get(`/api/v1/cuidadores?zona=${zona}`);

      expect(respuesta.status).toBe(200);
      const cuerpo = respuesta.body as {
        cuidadores: Record<string, unknown>[];
        siguiente: string | null;
      };
      expect(cuerpo.cuidadores.map((c) => c.id)).toEqual([visible.cuidadorId]);
      expect(cuerpo.siguiente).toBeNull();
      // Ni el número, ni la palabra, ni la cuenta, ni el estado interno.
      const texto = JSON.stringify(respuesta.body);
      expect(texto).not.toContain(TELEFONO);
      expect(texto).not.toContain('573104445566');
      for (const campo of [
        'telefono',
        'usuarioId',
        'estado',
        'visible',
        'version',
      ]) {
        expect(cuerpo.cuidadores[0]).not.toHaveProperty(campo);
      }
    });

    it('la forma de un cuidador en la lista es exactamente esta (si crece, se nota)', async () => {
      const zona = zonaNueva();
      const datos = entrada(zona);
      const { cuidadorId } = await importar(datos);

      const respuesta = await get(`/api/v1/cuidadores?zona=${zona}`);

      expect(respuesta.body).toEqual({
        cuidadores: [
          {
            id: cuidadorId,
            nombre: datos.nombre,
            fotoUrl: null,
            especialidad: 'enfermeria',
            titulo: 'Enfermera profesional',
            aniosExperiencia: 6,
            tarifaHora: 25_000,
            zona,
            disponibilidad: ['manana', 'tarde'],
            bio: 'Cuido con paciencia.',
            calificacion: null,
            cantidadResenas: 0,
            serviciosCompletados: 0,
            aceptacionAutomatica: false,
            controlesVerificados: ['antecedentes', 'titulos', 'psicotecnica'],
          },
        ],
        siguiente: null,
      });
    });

    it('«jose» encuentra a «José»', async () => {
      const zona = zonaNueva();
      const jose = await importar(
        entrada(zona, { nombre: 'José Hernán Cárdenas' }),
      );
      await importar(entrada(zona, { nombre: 'Marta Ramírez' }));

      const respuesta = await get(
        `/api/v1/cuidadores?zona=${zona}&busqueda=jose`,
      );

      expect(
        (respuesta.body as { cuidadores: { id: string }[] }).cuidadores.map(
          (c) => c.id,
        ),
      ).toEqual([jose.cuidadorId]);
    });

    it('filtra por especialidad, jornada y tarifa máxima', async () => {
      const zona = zonaNueva();
      const esperado = await importar(
        entrada(zona, {
          especialidad: 'fisioterapia',
          disponibilidad: ['noche'],
          tarifaHora: 30_000,
        }),
      );
      await importar(entrada(zona, { especialidad: 'auxiliar' }));
      await importar(
        entrada(zona, {
          especialidad: 'fisioterapia',
          disponibilidad: ['noche'],
          tarifaHora: 60_000,
        }),
      );

      const respuesta = await get(
        `/api/v1/cuidadores?zona=${zona}&especialidad=fisioterapia&jornada=noche&tarifaMaxima=40000`,
      );

      expect(
        (respuesta.body as { cuidadores: { id: string }[] }).cuidadores.map(
          (c) => c.id,
        ),
      ).toEqual([esperado.cuidadorId]);
    });

    it('pagina con cursor: sin repetir ni saltarse a nadie', async () => {
      const zona = zonaNueva();
      const creados = [
        await importar(entrada(zona, { tarifaHora: 10_000 })),
        await importar(entrada(zona, { tarifaHora: 20_000 })),
        await importar(entrada(zona, { tarifaHora: 30_000 })),
      ];

      const primera = await get(`/api/v1/cuidadores?zona=${zona}&limite=2`);
      const cuerpo1 = primera.body as {
        cuidadores: { id: string }[];
        siguiente: string;
      };
      const segunda = await get(
        `/api/v1/cuidadores?zona=${zona}&limite=2&cursor=${cuerpo1.siguiente}`,
      );
      const cuerpo2 = segunda.body as {
        cuidadores: { id: string }[];
        siguiente: string | null;
      };

      expect(cuerpo1.cuidadores).toHaveLength(2);
      expect(cuerpo2.cuidadores).toHaveLength(1);
      expect(cuerpo2.siguiente).toBeNull();
      // Misma calificación (ninguna): el orden es por menor tarifa.
      expect(
        [...cuerpo1.cuidadores, ...cuerpo2.cuidadores].map((c) => c.id),
      ).toEqual(creados.map((c) => c.cuidadorId));
    });

    it.each([
      ['un límite de cero', 'limite=0'],
      ['un límite que pasa el máximo', 'limite=51'],
      ['un límite que no es número', 'limite=muchos'],
      ['una tarifa que no es número', 'tarifaMaxima=barata'],
      ['una tarifa negativa', 'tarifaMaxima=-5'],
      ['una especialidad inexistente', 'especialidad=brujeria'],
      ['una jornada inexistente', 'jornada=madrugada'],
      ['un cursor inventado', 'cursor=esto-no-es-un-cursor'],
      ['un parámetro que no existe', 'rol=administrador'],
    ])('rechaza %s con 400', async (_nombre, consulta) => {
      const respuesta = await get(`/api/v1/cuidadores?${consulta}`);

      expect(respuesta.status).toBe(400);
    });

    it('un intento de inyección en la búsqueda no rompe nada', async () => {
      const respuesta = await get(
        `/api/v1/cuidadores?busqueda=${encodeURIComponent(`'; drop table directorio.cuidadores; --`)}`,
      );

      expect(respuesta.status).toBe(200);
      expect((respuesta.body as { cuidadores: unknown[] }).cuidadores).toEqual(
        [],
      );
    });
  });

  describe('filtros disponibles', () => {
    it('ofrece las opciones cerradas y las zonas de quienes se muestran', async () => {
      const zona = zonaNueva();
      await importar(entrada(zona, { tarifaHora: 88_000 }));
      const oculto = zonaNueva();
      const otro = await importar(entrada(oculto));
      await ocultar(otro.cuidadorId);

      const respuesta = await get('/api/v1/cuidadores/filtros');

      expect(respuesta.status).toBe(200);
      const cuerpo = respuesta.body as {
        zonas: string[];
        tarifaMaxima: number;
        especialidades: string[];
        jornadas: string[];
      };
      expect(cuerpo.especialidades).toEqual([
        'auxiliar',
        'enfermeria',
        'fisioterapia',
        'acompanamiento',
      ]);
      expect(cuerpo.jornadas).toEqual(['manana', 'tarde', 'noche']);
      expect(cuerpo.zonas).toContain(zona);
      expect(cuerpo.zonas).not.toContain(oculto);
      expect(cuerpo.tarifaMaxima).toBeGreaterThanOrEqual(88_000);
    });
  });

  describe('perfil de un cuidador', () => {
    it('muestra al cuidador visible con sus reseñas, sin teléfono', async () => {
      const zona = zonaNueva();
      const { cuidadorId } = await importar(entrada(zona));
      await bd.query(
        `insert into directorio.resenas (id, cuidador_id, servicio_id, autor_visible, calificacion, comentario)
         values ($1, $2, $3, 'Andrea G.', 5, 'Muy atenta.')`,
        [nuevoId(), cuidadorId, nuevoId()],
      );
      await bd.query(
        `update directorio.cuidadores set suma_calificaciones = 5, cantidad_resenas = 1 where id = $1`,
        [cuidadorId],
      );

      const respuesta = await get(`/api/v1/cuidadores/${cuidadorId}`);

      expect(respuesta.status).toBe(200);
      const { cuidador } = respuesta.body as {
        cuidador: Record<string, unknown> & {
          resenas: Record<string, unknown>[];
        };
      };
      expect(cuidador).toMatchObject({
        id: cuidadorId,
        calificacion: 5,
        cantidadResenas: 1,
      });
      expect(cuidador.resenas).toEqual([
        {
          id: expect.any(String) as string,
          autor: 'Andrea G.',
          calificacion: 5,
          comentario: 'Muy atenta.',
          fecha: expect.any(String) as string,
        },
      ]);
      expect(JSON.stringify(respuesta.body)).not.toContain('5731044');
      expect(cuidador).not.toHaveProperty('telefono');
    });

    it('un cuidador que no se muestra es 404, idéntico a uno que no existe (E7)', async () => {
      const { cuidadorId } = await importar(entrada(zonaNueva()));
      await ocultar(cuidadorId);

      const oculto = await get(`/api/v1/cuidadores/${cuidadorId}`);
      const inexistente = await get(`/api/v1/cuidadores/${nuevoId()}`);

      expect(oculto.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(oculto.body).toMatchObject({ codigo: 'cuidador.no_encontrado' });
      expect(Object.keys(oculto.body as object).sort()).toEqual(
        Object.keys(inexistente.body as object).sort(),
      );
    });

    it('un cuidador en borrador (sin sus controles) tampoco se ve', async () => {
      const id = nuevoId();
      await bd.query(
        `insert into directorio.cuidadores
           (id, nombre, nombre_busqueda, especialidad, titulo, anios_experiencia, tarifa_hora, telefono, zona, zona_busqueda, disponibilidad, bio, estado, visible)
         values ($1, 'Sin Verificar', 'sin verificar', 'auxiliar', 'Auxiliar', 2, 15000, '+573001112233', 'Zona', 'zona', '{manana}', '', 'borrador', false)`,
        [id],
      );

      const respuesta = await get(`/api/v1/cuidadores/${id}`);

      expect(respuesta.status).toBe(404);
    });

    it('cuando se le vence un control deja de verse al instante, aunque la revisión diaria no haya corrido', async () => {
      const { cuidadorId } = await importar(
        entrada(zonaNueva(), {
          controles: [
            { control: 'antecedentes', vigenteHasta: '2030-06-20' },
            { control: 'titulos', vigenteHasta: null },
            { control: 'psicotecnica', vigenteHasta: null },
          ],
        }),
      );
      expect((await get(`/api/v1/cuidadores/${cuidadorId}`)).status).toBe(200);

      // Pasan 15 días: la sesión del 10 ya venció, así que entra una nueva.
      reloj.fijar('2030-06-25T15:00:00.000Z');
      const nueva = await registrarFamiliar(como(app));
      const despues = await como(app)
        .get(`/api/v1/cuidadores/${cuidadorId}`)
        .set('Cookie', conSesion(nueva.sesion));

      expect(despues.status).toBe(404);
    });

    it('rechaza un identificador que no es UUID con 400', async () => {
      const respuesta = await get('/api/v1/cuidadores/no-es-un-uuid');

      expect(respuesta.status).toBe(400);
    });
  });

  describe('hoja de vida', () => {
    const conHoja = async () => {
      const datos = entrada(zonaNueva(), {
        hojaDeVida: { nombreOriginal: 'hoja.pdf', contenido: PDF },
      });
      return importar(datos);
    };

    async function direccionFirmada(cuidadorId: string): Promise<string> {
      const respuesta = await get(
        `/api/v1/cuidadores/${cuidadorId}/hoja-de-vida`,
      );
      expect(respuesta.status).toBe(302);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      return rutaDe(respuesta.headers.location as string);
    }

    const sinSesion = (ruta: string): request.Test => como(app).get(ruta);

    it('redirige a una dirección firmada, y esa dirección entrega el PDF sin necesitar sesión', async () => {
      const { cuidadorId } = await conHoja();

      const ruta = await direccionFirmada(cuidadorId);
      const archivo = await sinSesion(ruta).buffer(true).parse(binario);

      expect(ruta).toMatch(/^\/api\/v1\/archivos\?clave=hojas-de-vida/);
      expect(archivo.status).toBe(200);
      expect(archivo.headers['content-type']).toBe('application/pdf');
      expect(archivo.headers['x-content-type-options']).toBe('nosniff');
      expect(archivo.headers['cache-control']).toBe('private, no-store');
      expect(archivo.headers['content-disposition']).toBe('inline');
      expect((archivo.body as Buffer).equals(PDF)).toBe(true);
    });

    it('la dirección vence a los 5 minutos', async () => {
      const { cuidadorId } = await conHoja();
      const ruta = await direccionFirmada(cuidadorId);

      reloj.avanzar(4 * 60_000);
      expect((await sinSesion(ruta)).status).toBe(200);
      reloj.avanzar(2 * 60_000);
      const vencida = await sinSesion(ruta);

      expect(vencida.status).toBe(404);
      expect(vencida.body).toMatchObject({ codigo: 'archivo.no_encontrado' });
    });

    it('una firma alterada, otra clave o un vencimiento cambiado se rechazan con 404', async () => {
      const { cuidadorId } = await conHoja();
      const otra = await conHoja();
      const ruta = new URL(`http://x${await direccionFirmada(cuidadorId)}`);
      const manipular = (cambios: Record<string, string>) => {
        const copia = new URL(ruta);
        for (const [clave, valor] of Object.entries(cambios)) {
          copia.searchParams.set(clave, valor);
        }
        return `${copia.pathname}${copia.search}`;
      };
      const claveAjena = new URL(
        `http://x${await direccionFirmada(otra.cuidadorId)}`,
      ).searchParams.get('clave') as string;

      const intentos = [
        manipular({ firma: 'x'.repeat(43) }),
        manipular({ clave: claveAjena }),
        manipular({
          expira: String(Number(ruta.searchParams.get('expira')) + 3600),
        }),
      ];

      for (const intento of intentos) {
        expect((await sinSesion(intento)).status).toBe(404);
      }
    });

    it('intentar salirse de la carpeta con «../» no devuelve nada', async () => {
      const respuesta = await sinSesion(
        `/api/v1/archivos?clave=${encodeURIComponent('hojas-de-vida/../../.env')}&expira=9999999999&firma=${'a'.repeat(43)}`,
      );

      expect(respuesta.status).toBe(404);
    });

    it('sin parámetros es 400 y no explica nada más', async () => {
      expect((await sinSesion('/api/v1/archivos')).status).toBe(400);
    });

    it('un cuidador sin hoja de vida es 404', async () => {
      const { cuidadorId } = await importar(entrada(zonaNueva()));

      const respuesta = await get(
        `/api/v1/cuidadores/${cuidadorId}/hoja-de-vida`,
      );

      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject({
        codigo: 'hoja_de_vida.no_encontrada',
      });
    });

    it('un cuidador que no se muestra no entrega su hoja de vida', async () => {
      const { cuidadorId } = await conHoja();
      await ocultar(cuidadorId);

      const respuesta = await get(
        `/api/v1/cuidadores/${cuidadorId}/hoja-de-vida`,
      );

      expect(respuesta.status).toBe(404);
    });

    it('los documentos privados de verificación no tienen salida por esta ruta', async () => {
      const { cuidadorId } = await importar(entrada(zonaNueva()));
      const id = nuevoId();
      await bd.query(
        `insert into directorio.documentos
           (id, cuidador_id, tipo, clave_almacenamiento, nombre_original, tipo_mime, tamano_bytes, sha256, estado, es_publico)
         values ($1, $2, 'cedula', $3, 'cedula.pdf', 'application/pdf', 10, $4, 'aprobado', false)`,
        [id, cuidadorId, `cedulas/${id}.pdf`, Buffer.alloc(32, 1)],
      );

      const respuesta = await get(
        `/api/v1/cuidadores/${cuidadorId}/hoja-de-vida`,
      );

      expect(respuesta.status).toBe(404);
    });
  });
});

// supertest no entrega los cuerpos binarios como Buffer salvo que se lo pidamos.
function binario(
  respuesta: request.Response,
  llamar: (error: Error | null, cuerpo: Buffer) => void,
): void {
  // En el parser, la respuesta es el flujo de bytes del servidor.
  const flujo = respuesta as unknown as NodeJS.ReadableStream;
  const partes: Buffer[] = [];
  flujo.on('data', (parte: Buffer) => partes.push(parte));
  flujo.on('end', () => llamar(null, Buffer.concat(partes)));
}
