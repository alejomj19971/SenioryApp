import { createHash } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { RevisarVigencias } from '../../src/directorio/aplicacion/casos-de-uso/revisar-vigencias.js';
import { CrearAdministrador } from '../../src/identidad/aplicacion/casos-de-uso/crear-administrador.js';
import {
  EMISOR_DE_TOKENS,
  type EmisorDeTokens,
} from '../../src/identidad/aplicacion/puertos/salida/emisor-de-tokens.js';
import type { UsuarioId } from '../../src/identidad/dominio/ids.js';
import { como, correoNuevo, CONTRASENA, SECRETO_BFF } from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { nuevaFamilia, nuevoCuidador } from '../soporte/escenario.js';

// M9 (API): del registro del cuidador a verlo en el directorio, con la aplicación completa y Postgres real. La regla
// que más importa (E7): un cuidador solo se muestra y solo se puede contratar con sus tres controles aprobados y
// vigentes. El reloj está en el lunes 10 de junio de 2030 a las 10:00 en Bogotá.

const INICIO = '2030-06-10T15:00:00.000Z';
const MANANA = '2030-06-11';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

// Archivos mínimos con la firma real de cada formato.
const PDF = (relleno = 'x') => Buffer.from(`%PDF-1.4\n${relleno}\n%%EOF`);
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

const PERFIL = {
  especialidad: 'enfermeria',
  titulo: 'Técnica en Enfermería — SENA',
  aniosExperiencia: 6,
  tarifaHora: 20_000,
  telefono: '+573001112233',
  zona: 'Laureles',
  disponibilidad: ['manana', 'tarde'],
  bio: 'Cuido con paciencia.',
};

const TIPOS_OBLIGATORIOS = ['cedula', 'antecedentes', 'titulo', 'psicotecnica'];

interface Perfil {
  id: string;
  nombre: string;
  telefono: string;
  estado: string;
  visible: boolean;
  aceptacionAutomatica: boolean;
  especialidad: string;
  controles: {
    control: string;
    estado: string;
    motivoDeRechazo: string | null;
    vigenteHasta: string | null;
    puedeRenovar: boolean;
  }[];
  documentos: { id: string; tipo: string; nombre: string; estado: string }[];
}

interface FilaDeCola {
  id: string;
  control: string;
  cuidador: { id: string };
  documentos: { id: string; tipo: string }[];
}

describe('postulación y verificación de cuidadores (API)', () => {
  let app: NestExpressApplication;
  let carpeta: string;
  let administrador: { id: string };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'seniory-postulacion-'));
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
    administrador = await app
      .get(CrearAdministrador, { strict: false })
      .ejecutar({
        nombre: 'Revisora Uno',
        correo: correoNuevo(),
        contrasena: CONTRASENA,
      });
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(() => reloj.fijar(INICIO));

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────

  // Un token vigente a la hora de ahora (el reloj de la prueba se mueve; las sesiones duran 15 minutos).
  async function cookieDe(
    id: string,
    rol: 'familiar' | 'cuidador' | 'administrador',
  ): Promise<string> {
    const emisor = app.get<EmisorDeTokens>(EMISOR_DE_TOKENS, { strict: false });
    const { token } = await emisor.emitirAcceso(
      { id: id as UsuarioId, rol },
      reloj.ahora(),
    );
    return `seniory_acceso=${token}`;
  }
  const comoAdmin = () => cookieDe(administrador.id, 'administrador');

  // Una persona que se postula: crea su cuenta por el registro de cuidadores.
  async function postulante() {
    const correo = correoNuevo();
    const respuesta = await como(app)
      .post('/api/v1/auth/registro-cuidador')
      .send({
        nombre: 'Marta Restrepo',
        correo,
        contrasena: CONTRASENA,
        versionPolitica: 'v1',
      });
    expect(respuesta.status).toBe(201);
    const id = (respuesta.body as { usuario: { id: string } }).usuario.id;
    return { id, correo, cookie: () => cookieDe(id, 'cuidador') };
  }
  type Postulante = Awaited<ReturnType<typeof postulante>>;

  const crearPerfil = async (p: Postulante, cambios: object = {}) =>
    como(app)
      .post('/api/v1/cuidadores/yo')
      .set('Cookie', await p.cookie())
      .send({ ...PERFIL, ...cambios });

  const miPerfil = async (p: Postulante): Promise<Perfil> =>
    (
      (
        await como(app)
          .get('/api/v1/cuidadores/yo')
          .set('Cookie', await p.cookie())
      ).body as { perfil: Perfil }
    ).perfil;

  const subir = async (
    p: Postulante,
    tipo: string,
    contenido: Buffer = PDF(),
    tipoDeContenido = 'application/pdf',
    nombre = 'documento.pdf',
  ) =>
    como(app)
      .put(`/api/v1/cuidadores/yo/documentos/${tipo}`)
      .set('Cookie', await p.cookie())
      .set('Content-Type', tipoDeContenido)
      .set('X-Nombre-De-Archivo', encodeURIComponent(nombre))
      .send(contenido);

  async function subirTodos(p: Postulante): Promise<void> {
    for (const tipo of TIPOS_OBLIGATORIOS) {
      expect((await subir(p, tipo, PDF(tipo))).status).toBe(201);
    }
  }

  const pedirRevision = async (p: Postulante) =>
    como(app)
      .post('/api/v1/cuidadores/yo/revision')
      .set('Cookie', await p.cookie())
      .send({});

  // Un postulante con perfil, documentos y revisión pedida.
  async function enRevision(): Promise<Postulante> {
    const p = await postulante();
    expect((await crearPerfil(p)).status).toBe(201);
    await subirTodos(p);
    expect((await pedirRevision(p)).status).toBe(200);
    return p;
  }

  const cola = async (estado = ''): Promise<FilaDeCola[]> =>
    (
      (
        await como(app)
          .get(`/api/v1/verificaciones${estado}`)
          .set('Cookie', await comoAdmin())
      ).body as { verificaciones: FilaDeCola[] }
    ).verificaciones;

  // Las verificaciones pendientes de ese cuidador, por control.
  async function pendientesDe(p: Postulante): Promise<Map<string, string>> {
    const perfil = await miPerfil(p);
    const todas = await cola();
    return new Map(
      todas
        .filter((f) => f.cuidador.id === perfil.id)
        .map((f) => [f.control, f.id]),
    );
  }

  const decidir = async (id: string, cuerpo: object) =>
    como(app)
      .patch(`/api/v1/verificaciones/${id}`)
      .set('Cookie', await comoAdmin())
      .send(cuerpo);

  const aprobar = (id: string, vigenteHasta: string | null = '2031-01-01') =>
    decidir(id, { decision: 'aprobar', vigenteHasta });

  // Aprueba los tres controles del postulante.
  async function aprobarTodos(p: Postulante): Promise<void> {
    const pendientes = await pendientesDe(p);
    for (const control of ['antecedentes', 'titulos', 'psicotecnica']) {
      const respuesta = await aprobar(pendientes.get(control) as string);
      expect(respuesta.status).toBe(200);
    }
  }

  const verComoFamilia = async (cuidadorId: string) => {
    const familia = await nuevaFamilia(app);
    return como(app)
      .get(`/api/v1/cuidadores/${cuidadorId}`)
      .set('Cookie', familia.cookie);
  };

  const procesarEventos = async () => {
    const despachador = app.get(DespachadorDeEventos, { strict: false });
    for (let i = 0; i < 4; i++) await despachador.esperarEntregas();
  };

  const eventosDe = (cuidadorId: string) =>
    filas<{ tipo: string; datos: Record<string, unknown> }>(
      `select tipo, datos from compartido.outbox
       where tipo like 'directorio.%' and datos->>'cuidadorId' = $1 order by creado_en`,
      [cuidadorId],
    );

  // ─── Registro del cuidador ─────────────────────────────────────────────────────────────────
  describe('POST /auth/registro-cuidador', () => {
    it('crea una cuenta con rol cuidador y deja la sesión iniciada', async () => {
      const respuesta = await como(app)
        .post('/api/v1/auth/registro-cuidador')
        .send({
          nombre: 'Marta Restrepo',
          correo: correoNuevo(),
          contrasena: CONTRASENA,
          versionPolitica: 'v1',
        });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ usuario: { rol: 'cuidador' } });
      expect(respuesta.headers['set-cookie']).toBeDefined();
    });

    it('el rol no se puede pedir: ni «rol» ni nada fuera de lo esperado se acepta', async () => {
      const respuesta = await como(app)
        .post('/api/v1/auth/registro-cuidador')
        .send({
          nombre: 'Marta Restrepo',
          correo: correoNuevo(),
          contrasena: CONTRASENA,
          versionPolitica: 'v1',
          rol: 'administrador',
        });

      expect(respuesta.status).toBe(400);
    });

    it('el registro de familias sigue creando solo familias', async () => {
      const respuesta = await como(app).post('/api/v1/auth/registro').send({
        nombre: 'Andrea Gómez',
        correo: correoNuevo(),
        contrasena: CONTRASENA,
        versionPolitica: 'v1',
      });

      expect(respuesta.body).toMatchObject({ usuario: { rol: 'familiar' } });
    });

    it('una cuenta recién creada no tiene perfil ni aparece en el directorio', async () => {
      const p = await postulante();

      const perfil = await como(app)
        .get('/api/v1/cuidadores/yo')
        .set('Cookie', await p.cookie());

      expect(perfil.status).toBe(404);
      expect(perfil.body).toMatchObject({ codigo: 'cuidador.sin_perfil' });
    });
  });

  // ─── Perfil ────────────────────────────────────────────────────────────────────────────────
  describe('mi perfil', () => {
    it('se crea en borrador y oculto, con el nombre de la cuenta y los controles sin pedir', async () => {
      const p = await postulante();

      const respuesta = await crearPerfil(p);

      expect(respuesta.status).toBe(201);
      expect((respuesta.body as { perfil: Perfil }).perfil).toMatchObject({
        nombre: 'Marta Restrepo',
        estado: 'borrador',
        visible: false,
        telefono: '+573001112233',
        aceptacionAutomatica: false,
        controles: [
          { control: 'antecedentes', estado: 'sin_solicitar' },
          { control: 'titulos', estado: 'sin_solicitar' },
          { control: 'psicotecnica', estado: 'sin_solicitar' },
        ],
        documentos: [],
      });
    });

    it('nadie más que un cuidador con cuenta propia lo crea, y solo una vez', async () => {
      const p = await postulante();
      await crearPerfil(p);
      const familia = await nuevaFamilia(app);

      const repetido = await crearPerfil(p);
      const comoFamilia = await como(app)
        .post('/api/v1/cuidadores/yo')
        .set('Cookie', familia.cookie)
        .send(PERFIL);
      const comoAdministrador = await como(app)
        .post('/api/v1/cuidadores/yo')
        .set('Cookie', await comoAdmin())
        .send(PERFIL);

      expect(repetido.status).toBe(409);
      expect(repetido.body).toMatchObject({
        codigo: 'cuidador.usuario_ya_tiene_perfil',
      });
      expect(comoFamilia.status).toBe(403);
      expect(comoAdministrador.status).toBe(403);
    });

    it.each([
      ['el nombre', { nombre: 'Otra Persona' }],
      ['el estado', { estado: 'activo' }],
      ['la visibilidad', { visible: true }],
      ['la cuenta', { usuarioId: nuevoId() }],
      ['la calificación', { calificacion: 5 }],
    ])('no deja enviar %s', async (_campo, extra) => {
      const p = await postulante();

      expect((await crearPerfil(p, extra)).status).toBe(400);
    });

    it.each([
      [
        'un teléfono sin formato internacional',
        { telefono: '3001112233' },
        'cuidador.telefono_invalido',
      ],
      ['una tarifa en cero', { tarifaHora: 0 }, null],
      ['sin jornadas', { disponibilidad: [] }, null],
      ['una jornada inventada', { disponibilidad: ['madrugada'] }, null],
      ['una especialidad inventada', { especialidad: 'brujeria' }, null],
      ['más de 60 años de experiencia', { aniosExperiencia: 61 }, null],
      [
        'una presentación de más de 1000 caracteres',
        { bio: 'a'.repeat(1001) },
        'cuidador.bio_muy_larga',
      ],
    ])('rechaza %s', async (_caso, cambios, codigo) => {
      const p = await postulante();

      const respuesta = await crearPerfil(p, cambios);

      expect(respuesta.status).toBe(400);
      if (codigo !== null) expect(respuesta.body).toMatchObject({ codigo });
    });

    it('mientras está en borrador no aparece en el directorio, ni se puede ver por su id', async () => {
      const p = await postulante();
      const id = ((await crearPerfil(p)).body as { perfil: Perfil }).perfil.id;

      const detalle = await verComoFamilia(id);

      expect(detalle.status).toBe(404);
      const otraFamilia = await nuevaFamilia(app);
      const busqueda = await como(app)
        .get('/api/v1/cuidadores?limite=50&busqueda=Restrepo')
        .set('Cookie', otraFamilia.cookie);
      expect(JSON.stringify(busqueda.body)).not.toContain(id);
    });

    it('el cuidador corrige su perfil y activa la aceptación automática él mismo', async () => {
      const p = await postulante();
      await crearPerfil(p);

      const respuesta = await como(app)
        .patch('/api/v1/cuidadores/yo')
        .set('Cookie', await p.cookie())
        .send({
          tarifaHora: 25_000,
          zona: 'Poblado',
          aceptacionAutomatica: true,
          especialidad: 'fisioterapia',
        });

      expect(respuesta.status).toBe(200);
      expect((respuesta.body as { perfil: Perfil }).perfil).toMatchObject({
        especialidad: 'fisioterapia',
        aceptacionAutomatica: true,
      });
      expect(
        await filas(
          `select tarifa_hora::int as tarifa, zona, zona_busqueda from directorio.cuidadores where usuario_id = $1`,
          [p.id],
        ),
      ).toEqual([
        { tarifa: 25_000, zona: 'Poblado', zona_busqueda: 'poblado' },
      ]);
    });

    it('un cambio inválido no cambia nada', async () => {
      const p = await postulante();
      await crearPerfil(p);

      const respuesta = await como(app)
        .patch('/api/v1/cuidadores/yo')
        .set('Cookie', await p.cookie())
        .send({ tarifaHora: 30_000, telefono: 'no-es-un-telefono' });

      expect(respuesta.status).toBe(400);
      expect((await miPerfil(p)).telefono).toBe('+573001112233');
    });

    it('un cuidador suspendido ya no cambia su perfil ni sube documentos', async () => {
      const p = await postulante();
      await crearPerfil(p);
      await bd.query(
        "update directorio.cuidadores set estado = 'suspendido' where usuario_id = $1",
        [p.id],
      );

      const cambio = await como(app)
        .patch('/api/v1/cuidadores/yo')
        .set('Cookie', await p.cookie())
        .send({ bio: 'nueva' });
      const archivo = await subir(p, 'cedula');

      expect(cambio.status).toBe(409);
      expect(cambio.body).toMatchObject({ codigo: 'cuidador.suspendido' });
      expect(archivo.status).toBe(409);
    });
  });

  // ─── Documentos ────────────────────────────────────────────────────────────────────────────
  describe('PUT /cuidadores/yo/documentos/:tipo', () => {
    it('guarda el archivo con un nombre del servidor, pendiente de revisión', async () => {
      const p = await postulante();
      await crearPerfil(p);
      const contenido = PDF('cédula de prueba');

      const respuesta = await subir(
        p,
        'cedula',
        contenido,
        'application/pdf',
        'mi cédula.pdf',
      );

      expect(respuesta.status).toBe(201);
      const documento = (respuesta.body as { documento: { id: string } })
        .documento;
      expect(documento).toMatchObject({
        tipo: 'cedula',
        nombre: 'mi cédula.pdf',
        estado: 'pendiente',
        tamanoBytes: contenido.length,
      });
      const [fila] = await filas<{
        clave: string;
        tipo_mime: string;
        sha: string;
        publico: boolean;
      }>(
        `select clave_almacenamiento as clave, tipo_mime, encode(sha256, 'hex') as sha, es_publico as publico
         from directorio.documentos where id = $1`,
        [documento.id],
      );
      expect(fila).toEqual({
        clave: `documentos/${documento.id}.pdf`,
        tipo_mime: 'application/pdf',
        sha: createHash('sha256').update(contenido).digest('hex'),
        publico: false,
      });
      await expect(
        access(join(carpeta, fila?.clave ?? '')),
      ).resolves.toBeUndefined();
    });

    it('lo que cuenta es el contenido, no lo que diga el cliente', async () => {
      const p = await postulante();
      await crearPerfil(p);

      const texto = await subir(p, 'cedula', Buffer.from('esto no es un pdf'));
      const ejecutable = await subir(
        p,
        'cedula',
        Buffer.from('MZ\x90\x00'),
        'image/jpeg',
        'foto.jpg',
      );
      const vacio = await subir(p, 'cedula', Buffer.alloc(0));
      const imagenDisfrazada = await subir(
        p,
        'cedula',
        PNG,
        'application/pdf',
        'x.pdf',
      );

      for (const rechazado of [texto, ejecutable]) {
        expect(rechazado.status).toBe(400);
        expect(rechazado.body).toMatchObject({
          codigo: 'documento.formato_invalido',
        });
      }
      expect(vacio.status).toBe(400);
      // Una imagen PNG enviada como PDF se guarda por lo que ES.
      expect(imagenDisfrazada.status).toBe(201);
      expect(
        await filas(
          `select tipo_mime from directorio.documentos d join directorio.cuidadores c on c.id = d.cuidador_id where c.usuario_id = $1`,
          [p.id],
        ),
      ).toEqual([{ tipo_mime: 'image/png' }]);
    });

    it('acepta PDF, JPEG y PNG, pero la hoja de vida solo PDF', async () => {
      const p = await postulante();
      await crearPerfil(p);

      expect(
        (await subir(p, 'titulo', JPEG, 'image/jpeg', 'titulo.jpg')).status,
      ).toBe(201);
      expect(
        (await subir(p, 'antecedentes', PNG, 'image/png', 'a.png')).status,
      ).toBe(201);
      const hoja = await subir(p, 'hoja_de_vida', PNG, 'image/png', 'h.png');

      expect(hoja.status).toBe(400);
      expect(hoja.body).toMatchObject({
        codigo: 'documento.hoja_de_vida_no_es_pdf',
      });
    });

    it.each([
      ['un tipo de contenido que no es de archivo', 'text/plain'],
      ['JSON', 'application/json'],
    ])('rechaza %s', async (_caso, tipoDeContenido) => {
      const p = await postulante();
      await crearPerfil(p);

      const respuesta = await subir(p, 'cedula', PDF(), tipoDeContenido);

      expect(respuesta.status).toBe(400);
    });

    it('rechaza un tipo de documento que no existe', async () => {
      const p = await postulante();
      await crearPerfil(p);

      for (const tipo of ['pasaporte', 'foto', '..%2F..%2Fetc']) {
        expect((await subir(p, tipo)).status).toBe(400);
      }
    });

    it('rechaza un archivo de más de 5 MB sin leerlo', async () => {
      const p = await postulante();
      await crearPerfil(p);
      const grande = Buffer.concat([PDF(), Buffer.alloc(5 * 1024 * 1024)]);

      const respuesta = await subir(p, 'cedula', grande).then(
        (r) => r,
        (error: { code?: string }) => error,
      );

      // O llega el 400, o el servidor corta la conexión antes de que el cliente termine de mandar los megabytes:
      // en los dos casos no se leyó ni se guardó nada.
      if ('status' in respuesta) {
        expect(respuesta.status).toBe(400);
        expect(respuesta.body).toMatchObject({
          codigo: 'documento.tamano_invalido',
        });
      } else {
        expect(respuesta.code).toBeDefined();
      }
      expect((await miPerfil(p)).documentos).toEqual([]);
    });

    it('el nombre original solo se guarda para mostrarlo: sin rutas ni caracteres peligrosos', async () => {
      const p = await postulante();
      await crearPerfil(p);

      const respuesta = await subir(
        p,
        'cedula',
        PDF(),
        'application/pdf',
        '../../etc/passwd‮txt.pdf',
      );

      const nombre = (respuesta.body as { documento: { nombre: string } })
        .documento.nombre;
      expect(nombre).toBe('passwdtxt.pdf');
      const [fila] = await filas<{ clave: string }>(
        `select clave_almacenamiento as clave from directorio.documentos d join directorio.cuidadores c on c.id = d.cuidador_id where c.usuario_id = $1`,
        [p.id],
      );
      expect(fila?.clave).toMatch(/^documentos\/[0-9a-f-]{36}\.pdf$/);
    });

    it('tiene tope de archivos por tipo', async () => {
      const p = await postulante();
      await crearPerfil(p);
      for (let i = 0; i < 5; i++) {
        expect((await subir(p, 'cedula', PDF(String(i)))).status).toBe(201);
      }

      const sexto = await subir(p, 'cedula', PDF('seis'));

      expect(sexto.status).toBe(422);
      expect(sexto.body).toMatchObject({ codigo: 'documento.demasiados' });
    });

    it('solo un cuidador con perfil sube documentos; sin sesión es 401', async () => {
      const sinPerfil = await postulante();
      const familia = await nuevaFamilia(app);

      expect((await subir(sinPerfil, 'cedula')).status).toBe(404);
      const comoFamilia = await como(app)
        .put('/api/v1/cuidadores/yo/documentos/cedula')
        .set('Cookie', familia.cookie)
        .set('Content-Type', 'application/pdf')
        .send(PDF());
      const sinSesion = await como(app)
        .put('/api/v1/cuidadores/yo/documentos/cedula')
        .set('Content-Type', 'application/pdf')
        .send(PDF());

      expect(comoFamilia.status).toBe(403);
      expect(sinSesion.status).toBe(401);
    });
  });

  // ─── Pedir la revisión ─────────────────────────────────────────────────────────────────────
  describe('POST /cuidadores/yo/revision', () => {
    it('sin todos los documentos no se envía, y dice cuáles faltan', async () => {
      const p = await postulante();
      await crearPerfil(p);
      await subir(p, 'cedula');
      await subir(p, 'titulo');

      const respuesta = await pedirRevision(p);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({
        codigo: 'revision.faltan_documentos',
      });
      expect((respuesta.body as { detail: string }).detail).toContain(
        'antecedentes',
      );
      expect((respuesta.body as { detail: string }).detail).toContain(
        'psicotecnica',
      );
      expect((await miPerfil(p)).estado).toBe('borrador');
    });

    it('con todos pasa a revisión, con los tres controles pendientes, y sigue oculto', async () => {
      const p = await postulante();
      await crearPerfil(p);
      await subirTodos(p);

      const respuesta = await pedirRevision(p);

      expect(respuesta.status).toBe(200);
      expect((respuesta.body as { perfil: Perfil }).perfil).toMatchObject({
        estado: 'en_revision',
        visible: false,
        controles: [
          { control: 'antecedentes', estado: 'pendiente' },
          { control: 'titulos', estado: 'pendiente' },
          { control: 'psicotecnica', estado: 'pendiente' },
        ],
      });
      expect((await verComoFamilia((await miPerfil(p)).id)).status).toBe(404);
    });

    it('pedirla otra vez es 409 y no duplica nada', async () => {
      const p = await enRevision();

      const otra = await pedirRevision(p);

      expect(otra.status).toBe(409);
      expect(
        await filas(
          `select v.id from directorio.verificaciones v join directorio.cuidadores c on c.id = v.cuidador_id where c.usuario_id = $1`,
          [p.id],
        ),
      ).toHaveLength(3);
    });
  });

  // ─── El panel de los revisores ─────────────────────────────────────────────────────────────
  describe('/verificaciones (revisores)', () => {
    it('solo entran administradores', async () => {
      const p = await enRevision();
      const familia = await nuevaFamilia(app);
      const pendientes = await pendientesDe(p);
      const id = pendientes.get('titulos') as string;

      const sesiones = [
        { nombre: 'sin sesión', cookie: null, estado: 401 },
        { nombre: 'familia', cookie: familia.cookie, estado: 403 },
        { nombre: 'el propio cuidador', cookie: await p.cookie(), estado: 403 },
      ];
      for (const { cookie, estado } of sesiones) {
        const llamadas = [
          () => como(app).get('/api/v1/verificaciones'),
          () => como(app).get('/api/v1/verificaciones/hojas-de-vida'),
          () =>
            como(app)
              .patch(`/api/v1/verificaciones/${id}`)
              .send({ decision: 'aprobar' }),
        ];
        for (const armar of llamadas) {
          const llamada = armar();
          const respuesta =
            cookie === null
              ? await llamada
              : await llamada.set('Cookie', cookie);
          expect(respuesta.status).toBe(estado);
        }
      }
      expect((await miPerfil(p)).controles[1]?.estado).toBe('pendiente');
    });

    it('la cola muestra cada control pendiente con su documento y la cédula', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);

      const delCuidador = (await cola()).filter(
        (f) => f.cuidador.id === perfil.id,
      );

      expect(delCuidador.map((f) => f.control).sort()).toEqual([
        'antecedentes',
        'psicotecnica',
        'titulos',
      ]);
      const titulos = delCuidador.find((f) => f.control === 'titulos');
      expect(titulos?.documentos.map((d) => d.tipo).sort()).toEqual([
        'cedula',
        'titulo',
      ]);
      expect(JSON.stringify(delCuidador)).not.toMatch(
        /telefono|clave|almacenamiento|sha256/i,
      );
    });

    it('la cola se puede pedir por estado, y uno inventado es 400', async () => {
      expect(Array.isArray(await cola('?estado=rechazada'))).toBe(true);
      const malo = await como(app)
        .get('/api/v1/verificaciones?estado=inventado')
        .set('Cookie', await comoAdmin());
      expect(malo.status).toBe(400);
    });

    it('el revisor abre un documento privado con una dirección firmada que vence, y queda auditado', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);
      const documento = perfil.documentos.find((d) => d.tipo === 'cedula');

      const respuesta = await como(app)
        .get(`/api/v1/verificaciones/documentos/${documento?.id}`)
        .set('Cookie', await comoAdmin());

      expect(respuesta.status).toBe(302);
      expect(respuesta.headers.location).toMatch(/\/archivos\?.*firma=/);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      expect(
        await filas(
          `select resultado from compartido.auditoria where accion = 'directorio.ver_documento' and recurso_id = $1 and actor_id = $2`,
          [documento?.id, administrador.id],
        ),
      ).toEqual([{ resultado: 'permitido' }]);
    });

    it('un documento privado no sale por ninguna ruta pública ni de familias', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);
      const documento = perfil.documentos.find((d) => d.tipo === 'cedula');
      const familia = await nuevaFamilia(app);

      const comoFamilia = await como(app)
        .get(`/api/v1/verificaciones/documentos/${documento?.id}`)
        .set('Cookie', familia.cookie);
      const hoja = await como(app)
        .get(`/api/v1/cuidadores/${perfil.id}/hoja-de-vida`)
        .set('Cookie', familia.cookie);
      const inexistente = await como(app)
        .get(`/api/v1/verificaciones/documentos/${nuevoId()}`)
        .set('Cookie', await comoAdmin());

      expect(comoFamilia.status).toBe(403);
      expect(hoja.status).toBe(404);
      expect(inexistente.status).toBe(404);
    });
  });

  // ─── E7: de la postulación a ser visible ───────────────────────────────────────────────────
  describe('los tres controles (E7)', () => {
    it('con uno o dos controles aprobados NO aparece ni se puede contratar; con los tres, sí', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);
      const familia = await nuevaFamilia(app);
      const contratar = () =>
        como(app)
          .post('/api/v1/servicios')
          .set('Cookie', familia.cookie)
          .set('Idempotency-Key', `clave-${nuevoId()}`)
          .send({
            adultoMayorId: familia.adultoMayorId,
            cuidadorId: perfil.id,
            fecha: MANANA,
            jornada: 'manana',
            horas: 2,
            medioDePago: 'pasarela',
          });
      const pendientes = await pendientesDe(p);

      await aprobar(pendientes.get('antecedentes') as string);
      const conUno = await verComoFamilia(perfil.id);
      await aprobar(pendientes.get('titulos') as string);
      const conDos = await verComoFamilia(perfil.id);
      const contratarConDos = await contratar();
      await aprobar(pendientes.get('psicotecnica') as string);
      const conTres = await verComoFamilia(perfil.id);
      const contratarConTres = await contratar();

      expect(conUno.status).toBe(404);
      expect(conDos.status).toBe(404);
      expect(contratarConDos.status).toBe(404);
      expect(conTres.status).toBe(200);
      expect(contratarConTres.status).toBe(201);
      expect(await miPerfil(p)).toMatchObject({
        estado: 'activo',
        visible: true,
      });
    });

    it('al aprobar el tercero se anuncia, se avisa al cuidador y quedan aprobados sus documentos', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);

      await aprobarTodos(p);
      await procesarEventos();

      expect((await eventosDe(perfil.id)).map((e) => e.tipo).sort()).toEqual([
        'directorio.cuidador_verificado',
        'directorio.cuidador_visible',
      ]);
      expect(
        await filas(
          `select parametros from notificaciones.notificaciones
           where destinatario_id = $1 and tipo = 'cuidador_verificado:cuidador'`,
          [p.id],
        ),
      ).toHaveLength(1);
      expect(
        (await miPerfil(p)).documentos.every((d) => d.estado === 'aprobado'),
      ).toBe(true);
      // Sus documentos siguen privados.
      expect(
        await filas(
          `select d.id from directorio.documentos d join directorio.cuidadores c on c.id = d.cuidador_id
           where c.usuario_id = $1 and d.es_publico`,
          [p.id],
        ),
      ).toEqual([]);
    });

    it('aprueba solo lo que se le pide: los antecedentes y la psicotécnica exigen vigencia', async () => {
      const p = await enRevision();
      const pendientes = await pendientesDe(p);

      const sinVigencia = await decidir(
        pendientes.get('antecedentes') as string,
        {
          decision: 'aprobar',
        },
      );
      const pasada = await aprobar(
        pendientes.get('antecedentes') as string,
        '2030-06-09',
      );
      const muyLejana = await aprobar(
        pendientes.get('psicotecnica') as string,
        '2040-01-01',
      );
      const malFormada = await aprobar(
        pendientes.get('psicotecnica') as string,
        '10/06/2031',
      );
      const titulosSinVigencia = await decidir(
        pendientes.get('titulos') as string,
        {
          decision: 'aprobar',
          vigenteHasta: null,
        },
      );

      expect(sinVigencia.status).toBe(400);
      expect(sinVigencia.body).toMatchObject({
        codigo: 'verificacion.falta_vigencia',
      });
      expect(pasada.body).toMatchObject({
        codigo: 'verificacion.vigencia_pasada',
      });
      expect(muyLejana.body).toMatchObject({
        codigo: 'verificacion.vigencia_muy_lejana',
      });
      expect(malFormada.status).toBe(400);
      // Los títulos no caducan.
      expect(titulosSinVigencia.status).toBe(200);
    });

    it('rechazar exige el motivo, que ve el cuidador pero no viaja en el evento ni en el aviso', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);
      const pendientes = await pendientesDe(p);
      const id = pendientes.get('titulos') as string;

      const sinMotivo = await decidir(id, { decision: 'rechazar' });
      const rechazo = await decidir(id, {
        decision: 'rechazar',
        motivo: 'El título está borroso, súbelo de nuevo.',
      });
      await procesarEventos();

      expect(sinMotivo.status).toBe(400);
      expect(rechazo.body).toMatchObject({
        verificacion: { estado: 'rechazada', cuidadorVisible: false },
      });
      expect((await miPerfil(p)).controles[1]).toMatchObject({
        control: 'titulos',
        estado: 'rechazada',
        motivoDeRechazo: 'El título está borroso, súbelo de nuevo.',
        puedeRenovar: true,
      });
      const [evento] = (await eventosDe(perfil.id)).filter(
        (e) => e.tipo === 'directorio.verificacion_rechazada',
      );
      expect(evento?.datos).toEqual({
        cuidadorId: perfil.id,
        control: 'titulos',
      });
      const avisos = await filas<{ parametros: Record<string, unknown> }>(
        `select parametros from notificaciones.notificaciones
         where destinatario_id = $1 and tipo = 'verificacion_rechazada:cuidador'`,
        [p.id],
      );
      expect(avisos).toHaveLength(1);
      expect(JSON.stringify(avisos)).not.toContain('borroso');
    });

    it('una decisión ya tomada no se puede repetir, y un id que no existe es 404', async () => {
      const p = await enRevision();
      const id = (await pendientesDe(p)).get('titulos') as string;
      await aprobar(id);

      const otraVez = await decidir(id, {
        decision: 'rechazar',
        motivo: 'tarde',
      });
      const inexistente = await decidir(nuevoId(), {
        decision: 'aprobar',
        vigenteHasta: null,
      });

      expect(otraVez.status).toBe(409);
      expect(otraVez.body).toMatchObject({
        codigo: 'verificacion.no_pendiente',
      });
      expect(inexistente.status).toBe(404);
    });

    it('dos revisores a la vez sobre el mismo control: uno decide y el otro recibe 409', async () => {
      const p = await enRevision();
      const id = (await pendientesDe(p)).get('titulos') as string;

      const respuestas = await Promise.all([
        aprobar(id),
        decidir(id, { decision: 'rechazar', motivo: 'no me convence' }),
        aprobar(id),
      ]);

      expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409, 409,
      ]);
    });

    it('los tres controles aprobados a la vez no dejan al cuidador a medias', async () => {
      const p = await enRevision();
      const pendientes = await pendientesDe(p);

      const respuestas = await Promise.all(
        ['antecedentes', 'titulos', 'psicotecnica'].map((c) =>
          aprobar(pendientes.get(c) as string),
        ),
      );

      expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await miPerfil(p)).toMatchObject({
        estado: 'activo',
        visible: true,
      });
      const perfil = await miPerfil(p);
      expect(
        (await eventosDe(perfil.id)).filter(
          (e) => e.tipo === 'directorio.cuidador_verificado',
        ),
      ).toHaveLength(1);
    });

    it('lo aprobado queda auditado con quién lo aprobó', async () => {
      const p = await enRevision();
      const id = (await pendientesDe(p)).get('titulos') as string;

      await aprobar(id);

      expect(
        await filas(
          `select resultado from compartido.auditoria
           where accion = 'directorio.aprobar_verificacion' and recurso_id = $1 and actor_id = $2`,
          [id, administrador.id],
        ),
      ).toEqual([{ resultado: 'permitido' }]);
      expect(
        await filas(
          `select revisado_por from directorio.verificaciones where id = $1`,
          [id],
        ),
      ).toEqual([{ revisado_por: administrador.id }]);
    });

    it('especialidad y título se congelan una vez activado', async () => {
      const p = await enRevision();
      await aprobarTodos(p);

      const cambioVerificado = await como(app)
        .patch('/api/v1/cuidadores/yo')
        .set('Cookie', await p.cookie())
        .send({ titulo: 'Médica cirujana' });
      const cambioLibre = await como(app)
        .patch('/api/v1/cuidadores/yo')
        .set('Cookie', await p.cookie())
        .send({ tarifaHora: 28_000 });

      expect(cambioVerificado.status).toBe(409);
      expect(cambioVerificado.body).toMatchObject({
        codigo: 'cuidador.dato_verificado',
      });
      expect(cambioLibre.status).toBe(200);
      expect((await miPerfil(p)).estado).toBe('activo');
    });
  });

  // ─── Rechazo y renovación ──────────────────────────────────────────────────────────────────
  describe('renovar un control', () => {
    const renovar = async (p: Postulante, control: string) =>
      como(app)
        .post(`/api/v1/cuidadores/yo/verificaciones/${control}/renovacion`)
        .set('Cookie', await p.cookie())
        .send({});

    it('tras un rechazo, exige un documento nuevo y vuelve a la cola', async () => {
      const p = await enRevision();
      const pendientes = await pendientesDe(p);
      await decidir(pendientes.get('titulos') as string, {
        decision: 'rechazar',
        motivo: 'Ilegible',
      });
      await aprobar(pendientes.get('antecedentes') as string);
      await aprobar(pendientes.get('psicotecnica') as string);
      reloj.avanzar(60_000);

      const sinNuevo = await renovar(p, 'titulos');
      await subir(p, 'titulo', PDF('título nuevo'));
      const conNuevo = await renovar(p, 'titulos');

      expect(sinNuevo.status).toBe(422);
      expect(sinNuevo.body).toMatchObject({
        codigo: 'verificacion.falta_documento_nuevo',
      });
      expect(conNuevo.status).toBe(200);
      expect(
        (conNuevo.body as { perfil: Perfil }).perfil.controles[1],
      ).toMatchObject({
        estado: 'pendiente',
      });
      expect((await miPerfil(p)).visible).toBe(false);
      // El revisor aprueba la nueva y ahora sí es visible.
      const nueva = (await pendientesDe(p)).get('titulos') as string;
      expect(nueva).not.toBe(pendientes.get('titulos'));
      await aprobar(nueva);
      expect(await miPerfil(p)).toMatchObject({
        estado: 'activo',
        visible: true,
      });
    });

    it('un control en revisión o vigente no se renueva; uno sin pedir tampoco', async () => {
      const sinPedir = await postulante();
      await crearPerfil(sinPedir);
      const revision = await enRevision();
      await aprobarTodos(revision);

      const enCurso = await enRevision();
      const pendiente = await renovar(enCurso, 'titulos');
      const vigente = await renovar(revision, 'titulos');
      const nuncaPedido = await renovar(sinPedir, 'titulos');
      const inventado = await renovar(revision, 'brujeria');

      expect(pendiente.body).toMatchObject({
        codigo: 'verificacion.en_revision',
      });
      expect(vigente.body).toMatchObject({ codigo: 'verificacion.vigente' });
      expect(nuncaPedido.body).toMatchObject({
        codigo: 'verificacion.sin_solicitar',
      });
      expect(inventado.status).toBe(400);
    });

    it('al vencerse un control el cuidador deja de verse el mismo día y puede renovarlo', async () => {
      const p = await enRevision();
      const perfil = await miPerfil(p);
      const pendientes = await pendientesDe(p);
      await aprobar(pendientes.get('antecedentes') as string, '2030-07-01');
      await aprobar(pendientes.get('titulos') as string, null);
      await aprobar(pendientes.get('psicotecnica') as string, '2031-01-01');
      expect((await verComoFamilia(perfil.id)).status).toBe(200);

      // El 1 de julio todavía vale; el 2, no.
      reloj.fijar('2030-07-01T20:00:00.000Z');
      const ultimoDia = await verComoFamilia(perfil.id);
      reloj.fijar('2030-07-02T15:00:00.000Z');
      const vencido = await verComoFamilia(perfil.id);
      const revision = await app
        .get(RevisarVigencias, { strict: false })
        .ejecutar();
      await procesarEventos();

      expect(ultimoDia.status).toBe(200);
      expect(vencido.status).toBe(404);
      expect(revision.ocultados).toBeGreaterThanOrEqual(1);
      expect((await eventosDe(perfil.id)).map((e) => e.tipo)).toContain(
        'directorio.cuidador_oculto',
      );
      expect((await miPerfil(p)).controles[0]).toMatchObject({
        control: 'antecedentes',
        estado: 'vencida',
        puedeRenovar: true,
      });

      // Renueva: documento nuevo, nueva revisión y vuelve a verse.
      reloj.avanzar(60_000);
      await subir(p, 'antecedentes', PDF('antecedentes nuevos'));
      expect((await renovar(p, 'antecedentes')).status).toBe(200);
      await aprobar(
        (await pendientesDe(p)).get('antecedentes') as string,
        '2031-07-01',
      );
      expect((await verComoFamilia(perfil.id)).status).toBe(200);
      expect(
        await filas(
          `select estado from directorio.verificaciones where cuidador_id = $1 and control = 'antecedentes' order by creado_en`,
          [perfil.id],
        ),
      ).toEqual([{ estado: 'vencida' }, { estado: 'aprobada' }]);
    });
  });

  // ─── Hoja de vida ──────────────────────────────────────────────────────────────────────────
  describe('hoja de vida', () => {
    const hojasPendientes = async () =>
      (
        (
          await como(app)
            .get('/api/v1/verificaciones/hojas-de-vida')
            .set('Cookie', await comoAdmin())
        ).body as {
          hojasDeVida: {
            documento: { id: string };
            cuidador: { id: string };
          }[];
        }
      ).hojasDeVida;
    const decidirHoja = async (id: string, decision: string) =>
      como(app)
        .patch(`/api/v1/verificaciones/documentos/${id}`)
        .set('Cookie', await comoAdmin())
        .send({ decision });

    it('solo se muestra a las familias cuando un revisor la aprueba', async () => {
      const p = await enRevision();
      await aprobarTodos(p);
      const perfil = await miPerfil(p);
      const subida = await subir(
        p,
        'hoja_de_vida',
        PDF('mi hoja'),
        'application/pdf',
        'hoja.pdf',
      );
      const documentoId = (subida.body as { documento: { id: string } })
        .documento.id;
      const familia = await nuevaFamilia(app);
      const verHoja = () =>
        como(app)
          .get(`/api/v1/cuidadores/${perfil.id}/hoja-de-vida`)
          .set('Cookie', familia.cookie);

      const antes = await verHoja();
      const enLaCola = (await hojasPendientes()).some(
        (h) => h.documento.id === documentoId,
      );
      const aprobada = await decidirHoja(documentoId, 'aprobar');
      const despues = await verHoja();

      expect(antes.status).toBe(404);
      expect(enLaCola).toBe(true);
      expect(aprobada.body).toMatchObject({
        documento: { tipo: 'hoja_de_vida', estado: 'aprobado' },
      });
      expect(despues.status).toBe(302);
      expect(despues.headers.location).toMatch(/firma=/);
      expect(
        (await hojasPendientes()).some((h) => h.documento.id === documentoId),
      ).toBe(false);
    });

    it('una hoja rechazada nunca es pública, y el panel no decide por documentos que no son hoja de vida', async () => {
      const p = await enRevision();
      await aprobarTodos(p);
      const perfil = await miPerfil(p);
      const hoja = (
        (await subir(p, 'hoja_de_vida', PDF('otra'))).body as {
          documento: { id: string };
        }
      ).documento.id;
      const cedula = perfil.documentos.find((d) => d.tipo === 'cedula')
        ?.id as string;

      const rechazada = await decidirHoja(hoja, 'rechazar');
      const otraVez = await decidirHoja(hoja, 'aprobar');
      const cedulaPorSeparado = await decidirHoja(cedula, 'aprobar');
      const decisionInvalida = await decidirHoja(hoja, 'quizas');

      expect(rechazada.body).toMatchObject({
        documento: { estado: 'rechazado' },
      });
      expect(otraVez.status).toBe(409);
      expect(cedulaPorSeparado.status).toBe(422);
      expect(decisionInvalida.status).toBe(400);
      expect(
        await filas(
          'select es_publico from directorio.documentos where id = $1',
          [hoja],
        ),
      ).toEqual([{ es_publico: false }]);
    });
  });

  // ─── Los cuidadores ya cargados siguen igual ──────────────────────────────────────────────
  describe('compatibilidad', () => {
    it('un cuidador importado ya activo ve su perfil y no puede reenviarse a revisión', async () => {
      const importado = await nuevoCuidador(app, reloj);
      const p: Postulante = {
        id: importado.usuarioId,
        correo: '',
        cookie: () => cookieDe(importado.usuarioId, 'cuidador'),
      };

      const perfil = await miPerfil(p);
      const revision = await pedirRevision(p);

      expect(perfil).toMatchObject({ estado: 'activo', visible: true });
      expect(perfil.controles.every((c) => c.estado === 'aprobada')).toBe(true);
      expect(revision.status).toBe(409);
    });
  });
});
