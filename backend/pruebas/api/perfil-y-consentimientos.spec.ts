import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import {
  como,
  conSesion,
  iniciarSesion,
  nuevaIp,
  registrarFamiliar,
  CONTRASENA,
  SECRETO_BFF,
  type Cliente,
  type Persona,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { ControladorDePrueba } from './controlador-de-prueba.js';

// M1 §6 (API) para el PR 4: perfil, personas mayores y consentimientos, con la matriz de autorización.
// Con el reloj en 2035-03-01 las edades salen exactas sin importar cuándo corra la prueba.

const INICIO = '2035-03-01T12:00:00.000Z';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

const DATOS_DE_ADULTO = {
  nombre: 'Carmen Gómez',
  fechaDeNacimiento: '1950-03-01', // 85 años el 2035-03-01
  parentesco: 'hijo_hija',
};
const DATOS_DE_CONSENTIMIENTO = {
  finalidad: 'datos_de_salud',
  versionDelTexto: 'v1',
  calidad: 'representante',
};

describe('perfil, personas mayores y consentimientos (API)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
      variables: { SECRETO_BFF },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
  });

  beforeEach(() => reloj.fijar(INICIO));

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────
  const cliente = () => como(app, nuevaIp());

  const yo = (c: Cliente, persona: Persona) =>
    c.get('/api/v1/yo').set('Cookie', conSesion(persona.sesion));

  async function conRol(c: Cliente, rol: string): Promise<Persona> {
    const persona = await registrarFamiliar(c);
    await bd.query('update identidad.usuarios set rol = $1 where id = $2', [
      rol,
      persona.id,
    ]);
    // El token lleva el rol con el que se emitió: hay que iniciar sesión otra vez.
    return { ...persona, sesion: await iniciarSesion(c, persona.correo) };
  }

  async function registrarAdulto(c: Cliente, persona: Persona, cambios = {}) {
    const respuesta = await c
      .post('/api/v1/adultos-mayores')
      .set('Cookie', conSesion(persona.sesion))
      .send({ ...DATOS_DE_ADULTO, ...cambios });
    return {
      respuesta,
      id: (respuesta.body as { adultoMayor?: { id: string } }).adultoMayor?.id,
    };
  }

  const consentir = (
    c: Cliente,
    persona: Persona,
    adultoMayorId: string,
    cuerpo: Record<string, unknown> = DATOS_DE_CONSENTIMIENTO,
  ) =>
    c
      .post(`/api/v1/adultos-mayores/${adultoMayorId}/consentimientos`)
      .set('Cookie', conSesion(persona.sesion))
      .send(cuerpo);

  const revocar = (c: Cliente, persona: Persona, consentimientoId: string) =>
    c
      .delete(`/api/v1/consentimientos/${consentimientoId}`)
      .set('Cookie', conSesion(persona.sesion));

  // Una familia con una persona mayor y, si se pide, su consentimiento.
  async function familiaConAdulto(conConsentimiento = false) {
    const c = cliente();
    const familiar = await registrarFamiliar(c);
    const { id: adultoMayorId } = await registrarAdulto(c, familiar);
    if (adultoMayorId === undefined) throw new Error('No se registró');
    let consentimientoId: string | undefined;
    if (conConsentimiento) {
      const r = await consentir(c, familiar, adultoMayorId);
      consentimientoId = (r.body as { consentimiento: { id: string } })
        .consentimiento.id;
    }
    return { c, familiar, adultoMayorId, consentimientoId };
  }

  const sinCorrelacion = (cuerpo: unknown) => {
    const { idDeCorrelacion: _id, ...resto } = cuerpo as Record<
      string,
      unknown
    >;
    return resto;
  };

  const eventosDe = (tipo: string, clave: string, valor: string) =>
    filas<{ datos: unknown }>(
      `select datos from compartido.outbox where tipo = $1 and datos->>$2 = $3`,
      [tipo, clave, valor],
    );

  const auditoriaDe = (accion: string, actorId: string) =>
    filas<{ resultado: string; recurso_tipo: string; metadatos: unknown }>(
      `select resultado, recurso_tipo, metadatos from compartido.auditoria
       where accion = $1 and actor_id = $2::uuid order by ocurrido_en, id`,
      [accion, actorId],
    );

  // ─── GET /yo ───────────────────────────────────────────────────────────────────────────────
  describe('GET /yo', () => {
    it('devuelve el perfil propio y ninguna persona mayor si todavía no hay vínculos', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const respuesta = await yo(c, persona);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        usuario: {
          id: persona.id,
          nombre: 'Andrea Gómez',
          correo: persona.correo,
          rol: 'familiar',
          telefono: null,
        },
        adultosMayores: [],
      });
    });

    it('lista las personas mayores con su edad, parentesco, responsabilidad y consentimiento', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();
      const antes = (await yo(c, familiar)).body as {
        adultosMayores: unknown[];
      };

      const otra = await registrarAdulto(c, familiar, {
        nombre: 'Jorge Gómez',
        fechaDeNacimiento: '1940-03-02', // 94: todavía no cumple los 95
        parentesco: 'otro',
      });
      const despues = (await yo(c, familiar)).body as {
        adultosMayores: Record<string, unknown>[];
      };

      expect(antes.adultosMayores).toHaveLength(1);
      expect(despues.adultosMayores).toEqual([
        {
          id: adultoMayorId,
          nombre: 'Carmen Gómez',
          edad: 85,
          fotoUrl: null,
          parentesco: 'hijo_hija',
          esResponsable: true,
          consentimientoDeSalud: false,
        },
        {
          id: otra.id,
          nombre: 'Jorge Gómez',
          edad: 94,
          fotoUrl: null,
          parentesco: 'otro',
          esResponsable: true,
          consentimientoDeSalud: false,
        },
      ]);
    });

    it('muestra el consentimiento de salud cuando hay uno vigente y deja de mostrarlo al revocarlo', async () => {
      const { c, familiar, consentimientoId } = await familiaConAdulto(true);
      const con = (await yo(c, familiar)).body as {
        adultosMayores: { consentimientoDeSalud: boolean }[];
      };

      await revocar(c, familiar, consentimientoId as string);
      const sin = (await yo(c, familiar)).body as {
        adultosMayores: { consentimientoDeSalud: boolean }[];
      };

      expect(con.adultosMayores[0]?.consentimientoDeSalud).toBe(true);
      expect(sin.adultosMayores[0]?.consentimientoDeSalud).toBe(false);
    });

    it('cada familiar ve solo a sus personas mayores', async () => {
      const { c, familiar } = await familiaConAdulto();
      const otro = await registrarFamiliar(c);
      await registrarAdulto(c, otro, { nombre: 'Rosa Pérez' });

      const mio = (await yo(c, familiar)).body as {
        adultosMayores: { nombre: string }[];
      };
      const suyo = (await yo(c, otro)).body as {
        adultosMayores: { nombre: string }[];
      };

      expect(mio.adultosMayores.map((a) => a.nombre)).toEqual(['Carmen Gómez']);
      expect(suyo.adultosMayores.map((a) => a.nombre)).toEqual(['Rosa Pérez']);
    });

    it('una cuenta eliminada con un token todavía vigente responde 401', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await bd.query(
        "update identidad.usuarios set estado = 'eliminado' where id = $1",
        [persona.id],
      );

      expect((await yo(c, persona)).status).toBe(401);
    });

    it('sin sesión responde 401', async () => {
      expect((await cliente().get('/api/v1/yo')).status).toBe(401);
    });

    it('nunca incluye la credencial, el hash ni el contador de intentos', async () => {
      const { c, familiar } = await familiaConAdulto(true);

      const cuerpo = JSON.stringify((await yo(c, familiar)).body);

      expect(cuerpo).not.toMatch(/hash|intentos|bloqueado|argon2|credencial/i);
    });
  });

  // ─── PATCH /yo ─────────────────────────────────────────────────────────────────────────────
  describe('PATCH /yo', () => {
    const cambiar = (c: Cliente, persona: Persona, cuerpo: unknown) =>
      c
        .patch('/api/v1/yo')
        .set('Cookie', conSesion(persona.sesion))
        .send(cuerpo as object);

    it('cambia el nombre y el teléfono, y el cambio se ve en /yo', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const respuesta = await cambiar(c, persona, {
        nombre: '  Andrea   María Gómez ',
        telefono: '+573001234567',
      });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        usuario: {
          id: persona.id,
          nombre: 'Andrea María Gómez',
          correo: persona.correo,
          rol: 'familiar',
          telefono: '+573001234567',
        },
      });
      expect(
        ((await yo(c, persona)).body as { usuario: object }).usuario,
      ).toEqual((respuesta.body as { usuario: object }).usuario);
    });

    it('un teléfono null lo borra y omitirlo lo deja como está', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await cambiar(c, persona, { telefono: '+573001234567' });

      const soloNombre = await cambiar(c, persona, { nombre: 'Andrea' });
      const borrado = await cambiar(c, persona, { telefono: null });

      expect(
        (soloNombre.body as { usuario: { telefono: string } }).usuario.telefono,
      ).toBe('+573001234567');
      expect(
        (borrado.body as { usuario: { telefono: null } }).usuario.telefono,
      ).toBeNull();
    });

    it.each([
      ['un cuerpo vacío', {}, 'perfil.sin_cambios'],
      ['un nombre vacío', { nombre: '   ' }, 'nombre.invalido'],
      ['un nombre null', { nombre: null }, undefined],
      [
        'un teléfono sin formato internacional',
        { telefono: '3001234567' },
        undefined,
      ],
      ['el correo', { correo: 'otro@prueba.seniory.invalid' }, undefined],
      ['el rol', { rol: 'administrador' }, undefined],
    ])('rechaza %s: 400', async (_caso, cuerpo, codigo) => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const respuesta = await cambiar(c, persona, cuerpo);

      expect(respuesta.status).toBe(400);
      if (codigo !== undefined) {
        expect(respuesta.body).toMatchObject({ codigo });
      }
    });

    it('un intento de cambiar el rol no lo cambia', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      await cambiar(c, persona, { rol: 'administrador' });

      const [fila] = await filas<{ rol: string }>(
        'select rol from identidad.usuarios where id = $1',
        [persona.id],
      );
      expect(fila?.rol).toBe('familiar');
    });

    it('deja auditado qué campos cambió, sin sus valores', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      await cambiar(c, persona, { telefono: '+573009998877' });

      const entradas = await auditoriaDe(
        'identidad.actualizar_perfil',
        persona.id,
      );
      expect(entradas).toEqual([
        {
          resultado: 'permitido',
          recurso_tipo: 'usuario',
          metadatos: { nombre: false, telefono: true },
        },
      ]);
      expect(JSON.stringify(entradas)).not.toContain('573009998877');
    });

    it('no pierde los intentos fallidos de inicio de sesión que ocurren a la vez', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      await Promise.all([
        ...Array.from({ length: 3 }, (_, i) =>
          cambiar(c, persona, { nombre: `Andrea ${i}` }),
        ),
        ...Array.from({ length: 4 }, () =>
          c
            .post('/api/v1/auth/login')
            .send({ correo: persona.correo, contrasena: 'incorrecta-0123456' }),
        ),
      ]);

      const [credencial] = await filas<{ intentos_fallidos: number }>(
        'select intentos_fallidos from identidad.credenciales where usuario_id = $1',
        [persona.id],
      );
      expect(credencial?.intentos_fallidos).toBe(4);
    });

    it('sin sesión responde 401', async () => {
      const respuesta = await cliente()
        .patch('/api/v1/yo')
        .send({ nombre: 'X' });

      expect(respuesta.status).toBe(401);
    });
  });

  // ─── POST /adultos-mayores ─────────────────────────────────────────────────────────────────
  describe('POST /adultos-mayores', () => {
    it('registra a la persona y deja al familiar como su responsable, con sus eventos y auditoría', async () => {
      const c = cliente();
      const familiar = await registrarFamiliar(c);

      const { respuesta, id } = await registrarAdulto(c, familiar);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        adultoMayor: {
          id,
          nombre: 'Carmen Gómez',
          edad: 85,
          fotoUrl: null,
          parentesco: 'hijo_hija',
          esResponsable: true,
          consentimientoDeSalud: false,
        },
      });
      const [vinculo] = await filas<{
        id: string;
        estado: string;
        es_responsable: boolean;
        familiar_id: string;
      }>(
        'select id, estado, es_responsable, familiar_id from identidad.vinculos where adulto_mayor_id = $1',
        [id],
      );
      expect(vinculo).toMatchObject({
        estado: 'activo',
        es_responsable: true,
        familiar_id: familiar.id,
      });
      expect(
        await eventosDe(
          'identidad.adulto_mayor_registrado',
          'adultoMayorId',
          id as string,
        ),
      ).toEqual([{ datos: { adultoMayorId: id, registradoPor: familiar.id } }]);
      expect(
        await eventosDe(
          'identidad.vinculo_creado',
          'adultoMayorId',
          id as string,
        ),
      ).toEqual([
        {
          datos: {
            vinculoId: vinculo?.id,
            familiarId: familiar.id,
            adultoMayorId: id,
          },
        },
      ]);
      expect(
        await auditoriaDe('identidad.registrar_adulto_mayor', familiar.id),
      ).toEqual([
        {
          resultado: 'permitido',
          recurso_tipo: 'adulto_mayor',
          metadatos: null,
        },
      ]);
      expect(await auditoriaDe('identidad.crear_vinculo', familiar.id)).toEqual(
        [
          {
            resultado: 'permitido',
            recurso_tipo: 'vinculo',
            metadatos: { adultoMayorId: id },
          },
        ],
      );
    });

    it('los eventos no llevan el nombre ni la fecha de nacimiento', async () => {
      const c = cliente();
      const familiar = await registrarFamiliar(c);
      const { id } = await registrarAdulto(c, familiar, {
        nombre: 'Nombre Muy Reconocible',
      });

      const todos = JSON.stringify([
        ...(await eventosDe(
          'identidad.adulto_mayor_registrado',
          'adultoMayorId',
          id as string,
        )),
        ...(await eventosDe(
          'identidad.vinculo_creado',
          'adultoMayorId',
          id as string,
        )),
      ]);

      expect(todos).not.toContain('Reconocible');
      expect(todos).not.toContain('1950');
    });

    it.each([
      ['un parentesco que no existe', { parentesco: 'vecino' }, undefined],
      [
        'una fecha con otro formato',
        { fechaDeNacimiento: '01/03/1950' },
        undefined,
      ],
      [
        'una fecha que no existe',
        { fechaDeNacimiento: '1950-02-31' },
        undefined,
      ],
      [
        'un nacimiento en el futuro',
        { fechaDeNacimiento: '2036-01-01' },
        'adulto_mayor.fecha_de_nacimiento_invalida',
      ],
      [
        'una edad de más de 120 años',
        { fechaDeNacimiento: '1900-01-01' },
        'adulto_mayor.edad_invalida',
      ],
      ['un nombre vacío', { nombre: '' }, undefined],
      ['un campo de más', { fotoUrl: 'http://x.co/a.png' }, undefined],
    ])('rechaza %s: 400 y no crea nada', async (_caso, cambios, codigo) => {
      const c = cliente();
      const familiar = await registrarFamiliar(c);

      const { respuesta } = await registrarAdulto(c, familiar, cambios);

      expect(respuesta.status).toBe(400);
      if (codigo !== undefined) {
        expect(respuesta.body).toMatchObject({ codigo });
      }
      expect(
        await filas('select 1 from identidad.vinculos where familiar_id = $1', [
          familiar.id,
        ]),
      ).toHaveLength(0);
    });

    it('el día del cumpleaños cuenta el año; el día anterior todavía no', async () => {
      const c = cliente();
      const familiar = await registrarFamiliar(c);

      const hoy = await registrarAdulto(c, familiar, {
        fechaDeNacimiento: '1950-03-01',
      });
      const manana = await registrarAdulto(c, familiar, {
        fechaDeNacimiento: '1950-03-02',
      });

      expect(
        (hoy.respuesta.body as { adultoMayor: { edad: number } }).adultoMayor
          .edad,
      ).toBe(85);
      expect(
        (manana.respuesta.body as { adultoMayor: { edad: number } }).adultoMayor
          .edad,
      ).toBe(84);
    });
  });

  // ─── GET /adultos-mayores/:id ──────────────────────────────────────────────────────────────
  describe('GET /adultos-mayores/:id', () => {
    const detalle = (c: Cliente, persona: Persona, id: string) =>
      c
        .get(`/api/v1/adultos-mayores/${id}`)
        .set('Cookie', conSesion(persona.sesion));

    it('el familiar vinculado ve a la persona', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto(true);

      const respuesta = await detalle(c, familiar, adultoMayorId);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        adultoMayor: {
          id: adultoMayorId,
          nombre: 'Carmen Gómez',
          edad: 85,
          fotoUrl: null,
          parentesco: 'hijo_hija',
          esResponsable: true,
          consentimientoDeSalud: true,
        },
      });
    });

    it('un familiar sin vínculo recibe 404, IGUAL que si la persona no existiera', async () => {
      const { c, adultoMayorId } = await familiaConAdulto();
      const ajeno = await registrarFamiliar(c);

      const existe = await detalle(c, ajeno, adultoMayorId);
      const noExiste = await detalle(c, ajeno, nuevoId());

      expect(existe.status).toBe(404);
      expect(noExiste.status).toBe(404);
      expect(sinCorrelacion(existe.body)).toEqual(
        sinCorrelacion(noExiste.body),
      );
      expect(JSON.stringify(existe.body)).not.toContain('Carmen');
    });

    it('el intento de un ajeno queda auditado como denegado', async () => {
      const { c, adultoMayorId } = await familiaConAdulto();
      const ajeno = await registrarFamiliar(c);

      await detalle(c, ajeno, adultoMayorId);

      expect(
        await auditoriaDe('identidad.consultar_adulto_mayor', ajeno.id),
      ).toEqual([
        {
          resultado: 'denegado',
          recurso_tipo: 'adulto_mayor',
          metadatos: null,
        },
      ]);
    });

    it('un vínculo revocado ya no da acceso', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();
      await bd.query(
        "update identidad.vinculos set estado = 'revocado', revocado_en = now() where adulto_mayor_id = $1",
        [adultoMayorId],
      );

      expect((await detalle(c, familiar, adultoMayorId)).status).toBe(404);
    });

    it('un id que no es un UUID responde 400', async () => {
      const { c, familiar } = await familiaConAdulto();

      expect((await detalle(c, familiar, 'no-es-un-uuid')).status).toBe(400);
    });
  });

  // ─── POST /adultos-mayores/:id/consentimientos ─────────────────────────────────────────────
  describe('POST /adultos-mayores/:id/consentimientos', () => {
    it('el familiar vinculado otorga el consentimiento como representante, con su evento y auditoría', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();

      const respuesta = await consentir(c, familiar, adultoMayorId);

      expect(respuesta.status).toBe(201);
      const consentimiento = (
        respuesta.body as { consentimiento: Record<string, unknown> }
      ).consentimiento;
      expect(consentimiento).toEqual({
        id: expect.any(String),
        adultoMayorId,
        finalidad: 'datos_de_salud',
        calidad: 'representante',
        versionDelTexto: 'v1',
        otorgadoEn: INICIO,
      });
      expect(
        await eventosDe(
          'identidad.consentimiento_otorgado',
          'adultoMayorId',
          adultoMayorId,
        ),
      ).toEqual([{ datos: { adultoMayorId, finalidad: 'datos_de_salud' } }]);
      expect(
        await auditoriaDe('identidad.otorgar_consentimiento', familiar.id),
      ).toEqual([
        {
          resultado: 'permitido',
          recurso_tipo: 'consentimiento',
          metadatos: {
            adultoMayorId,
            finalidad: 'datos_de_salud',
            calidad: 'representante',
            versionDelTexto: 'v1',
          },
        },
      ]);
    });

    it('un segundo consentimiento vigente para la misma persona responde 409', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto(true);

      const respuesta = await consentir(c, familiar, adultoMayorId);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({
        codigo: 'consentimiento.ya_vigente',
      });
    });

    it('dos peticiones simultáneas dejan UN consentimiento vigente y un 409', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();

      const [a, b] = await Promise.all([
        consentir(c, familiar, adultoMayorId),
        consentir(c, familiar, adultoMayorId),
      ]);

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
      expect(
        await filas(
          'select 1 from identidad.consentimientos where adulto_mayor_id = $1 and revocado_en is null',
          [adultoMayorId],
        ),
      ).toHaveLength(1);
      expect(
        await eventosDe(
          'identidad.consentimiento_otorgado',
          'adultoMayorId',
          adultoMayorId,
        ),
      ).toHaveLength(1);
    });

    it('un familiar sin vínculo recibe 404, IGUAL que si la persona no existiera, y el intento queda auditado', async () => {
      const { c, adultoMayorId } = await familiaConAdulto();
      const ajeno = await registrarFamiliar(c);

      const existe = await consentir(c, ajeno, adultoMayorId);
      const noExiste = await consentir(c, ajeno, nuevoId());

      expect(existe.status).toBe(404);
      expect(noExiste.status).toBe(404);
      expect(sinCorrelacion(existe.body)).toEqual(
        sinCorrelacion(noExiste.body),
      );
      expect(
        await filas(
          'select 1 from identidad.consentimientos where adulto_mayor_id = $1',
          [adultoMayorId],
        ),
      ).toHaveLength(0);
      const auditadas = await auditoriaDe(
        'identidad.otorgar_consentimiento',
        ajeno.id,
      );
      expect(auditadas.map((a) => a.resultado)).toEqual([
        'denegado',
        'denegado',
      ]);
    });

    it('declarar una calidad que no le corresponde responde 403', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();

      const respuesta = await consentir(c, familiar, adultoMayorId, {
        ...DATOS_DE_CONSENTIMIENTO,
        calidad: 'titular',
      });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body).toMatchObject({
        codigo: 'consentimiento.calidad_no_corresponde',
      });
    });

    it('exige la versión vigente del texto', async () => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();

      const respuesta = await consentir(c, familiar, adultoMayorId, {
        ...DATOS_DE_CONSENTIMIENTO,
        versionDelTexto: 'v0',
      });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({
        codigo: 'consentimiento.version_no_vigente',
      });
    });

    it.each([
      ['una finalidad que no existe', { finalidad: 'marketing' }],
      ['una calidad que no existe', { calidad: 'tutor' }],
      ['sin versión del texto', { versionDelTexto: undefined }],
      ['un campo de más', { otorgadoPor: nuevoId() }],
    ])('rechaza %s: 400', async (_caso, cambios) => {
      const { c, familiar, adultoMayorId } = await familiaConAdulto();

      const respuesta = await consentir(c, familiar, adultoMayorId, {
        ...DATOS_DE_CONSENTIMIENTO,
        ...cambios,
      });

      expect(respuesta.status).toBe(400);
    });
  });

  // ─── DELETE /consentimientos/:id ───────────────────────────────────────────────────────────
  describe('DELETE /consentimientos/:id', () => {
    it('revoca el consentimiento, emite el evento y deja la auditoría', async () => {
      const { c, familiar, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);
      reloj.avanzar(60_000);

      const respuesta = await revocar(c, familiar, consentimientoId as string);

      expect(respuesta.status).toBe(204);
      const [fila] = await filas<{ revocado_en: Date }>(
        'select revocado_en from identidad.consentimientos where id = $1',
        [consentimientoId],
      );
      expect(fila?.revocado_en).toEqual(new Date(Date.parse(INICIO) + 60_000));
      expect(
        await eventosDe(
          'identidad.consentimiento_revocado',
          'adultoMayorId',
          adultoMayorId,
        ),
      ).toEqual([{ datos: { adultoMayorId, finalidad: 'datos_de_salud' } }]);
      expect(
        await auditoriaDe('identidad.revocar_consentimiento', familiar.id),
      ).toEqual([
        {
          resultado: 'permitido',
          recurso_tipo: 'consentimiento',
          metadatos: { adultoMayorId, finalidad: 'datos_de_salud' },
        },
      ]);
    });

    it('revocar otra vez responde 409 y no emite un segundo evento', async () => {
      const { c, familiar, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);
      await revocar(c, familiar, consentimientoId as string);

      const otra = await revocar(c, familiar, consentimientoId as string);

      expect(otra.status).toBe(409);
      expect(otra.body).toMatchObject({ codigo: 'consentimiento.ya_revocado' });
      expect(
        await eventosDe(
          'identidad.consentimiento_revocado',
          'adultoMayorId',
          adultoMayorId,
        ),
      ).toHaveLength(1);
    });

    it('dos revocaciones simultáneas dejan UNA revocación y UN evento', async () => {
      const { c, familiar, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);

      const [a, b] = await Promise.all([
        revocar(c, familiar, consentimientoId as string),
        revocar(c, familiar, consentimientoId as string),
      ]);

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([204, 409]);
      expect(
        await eventosDe(
          'identidad.consentimiento_revocado',
          'adultoMayorId',
          adultoMayorId,
        ),
      ).toHaveLength(1);
    });

    it('después de revocar se puede otorgar uno nuevo', async () => {
      const { c, familiar, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);
      await revocar(c, familiar, consentimientoId as string);

      const nuevo = await consentir(c, familiar, adultoMayorId);

      expect(nuevo.status).toBe(201);
    });

    it('un familiar sin vínculo recibe 404, IGUAL que con un consentimiento que no existe; el consentimiento sigue vigente', async () => {
      const { c, consentimientoId } = await familiaConAdulto(true);
      const ajeno = await registrarFamiliar(c);

      const existe = await revocar(c, ajeno, consentimientoId as string);
      const noExiste = await revocar(c, ajeno, nuevoId());

      expect(existe.status).toBe(404);
      expect(noExiste.status).toBe(404);
      expect(sinCorrelacion(existe.body)).toEqual(
        sinCorrelacion(noExiste.body),
      );
      const [fila] = await filas<{ revocado_en: Date | null }>(
        'select revocado_en from identidad.consentimientos where id = $1',
        [consentimientoId],
      );
      expect(fila?.revocado_en).toBeNull();
      const auditadas = await auditoriaDe(
        'identidad.revocar_consentimiento',
        ajeno.id,
      );
      expect(auditadas.map((a) => a.resultado)).toEqual([
        'denegado',
        'denegado',
      ]);
    });

    it('quien perdió el vínculo ya no puede revocar', async () => {
      const { c, familiar, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);
      await bd.query(
        "update identidad.vinculos set estado = 'revocado', revocado_en = now() where adulto_mayor_id = $1",
        [adultoMayorId],
      );

      expect(
        (await revocar(c, familiar, consentimientoId as string)).status,
      ).toBe(404);
    });

    it('un id que no es un UUID responde 400', async () => {
      const { c, familiar } = await familiaConAdulto();

      expect((await revocar(c, familiar, 'no-es-un-uuid')).status).toBe(400);
    });
  });

  // ─── Matriz de autorización ────────────────────────────────────────────────────────────────
  describe('matriz de autorización', () => {
    // Cada ruta: sin sesión → 401; un rol que no la usa (cuidador) → 403; un familiar ajeno → 404.
    type Test = request.Test;
    const rutas: {
      nombre: string;
      llamar: (
        c: Cliente,
        persona: Persona | null,
        ids: { adultoMayorId: string; consentimientoId: string },
      ) => Test;
      rolesQueNoPueden: string[];
      ajenoRecibe404: boolean;
    }[] = [
      {
        nombre: 'GET /adultos-mayores/:id',
        llamar: (c, p, ids) =>
          conCookie(c.get(`/api/v1/adultos-mayores/${ids.adultoMayorId}`), p),
        rolesQueNoPueden: ['cuidador', 'administrador'],
        ajenoRecibe404: true,
      },
      {
        nombre: 'POST /adultos-mayores',
        llamar: (c, p) =>
          conCookie(c.post('/api/v1/adultos-mayores'), p).send(DATOS_DE_ADULTO),
        rolesQueNoPueden: ['cuidador', 'administrador', 'adulto_mayor'],
        ajenoRecibe404: false,
      },
      {
        nombre: 'POST /adultos-mayores/:id/consentimientos',
        llamar: (c, p, ids) =>
          conCookie(
            c.post(
              `/api/v1/adultos-mayores/${ids.adultoMayorId}/consentimientos`,
            ),
            p,
          ).send({ ...DATOS_DE_CONSENTIMIENTO, calidad: 'representante' }),
        rolesQueNoPueden: ['cuidador', 'administrador'],
        ajenoRecibe404: true,
      },
      {
        nombre: 'DELETE /consentimientos/:id',
        llamar: (c, p, ids) =>
          conCookie(
            c.delete(`/api/v1/consentimientos/${ids.consentimientoId}`),
            p,
          ),
        rolesQueNoPueden: ['cuidador', 'administrador'],
        ajenoRecibe404: true,
      },
    ];

    function conCookie(peticion: Test, persona: Persona | null): Test {
      return persona === null
        ? peticion
        : peticion.set('Cookie', conSesion(persona.sesion));
    }

    it.each(rutas.map((r) => [r.nombre, r] as const))(
      '%s: sin sesión 401',
      async (_nombre, ruta) => {
        const { c, adultoMayorId, consentimientoId } =
          await familiaConAdulto(true);

        const respuesta = await ruta.llamar(c, null, {
          adultoMayorId,
          consentimientoId: consentimientoId as string,
        });

        expect(respuesta.status).toBe(401);
      },
    );

    it.each(
      rutas.flatMap((r) =>
        r.rolesQueNoPueden.map((rol) => [r.nombre, rol, r] as const),
      ),
    )('%s: el rol %s recibe 403', async (_nombre, rol, ruta) => {
      const { c, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);
      const otro = await conRol(c, rol);

      const respuesta = await ruta.llamar(c, otro, {
        adultoMayorId,
        consentimientoId: consentimientoId as string,
      });

      expect(respuesta.status).toBe(403);
    });

    it.each(
      rutas.filter((r) => r.ajenoRecibe404).map((r) => [r.nombre, r] as const),
    )('%s: un familiar ajeno recibe 404', async (_nombre, ruta) => {
      const { c, adultoMayorId, consentimientoId } =
        await familiaConAdulto(true);
      const ajeno = await registrarFamiliar(c);

      const respuesta = await ruta.llamar(c, ajeno, {
        adultoMayorId,
        consentimientoId: consentimientoId as string,
      });

      expect(respuesta.status).toBe(404);
    });

    it('un cuidador puede ver su propio perfil (GET /yo no depende del rol)', async () => {
      const c = cliente();
      const cuidador = await conRol(c, 'cuidador');

      const respuesta = await yo(c, cuidador);

      expect(respuesta.status).toBe(200);
      expect((respuesta.body as { usuario: { rol: string } }).usuario.rol).toBe(
        'cuidador',
      );
    });

    it('un cuidador recibe la lista vacía: no ve personas mayores que no tiene vinculadas', async () => {
      const { c } = await familiaConAdulto(true);
      const cuidador = await conRol(c, 'cuidador');

      const respuesta = await yo(c, cuidador);

      expect(
        (respuesta.body as { adultosMayores: unknown[] }).adultosMayores,
      ).toEqual([]);
    });
  });

  it('ninguna respuesta de estas rutas expone el hash, los intentos ni tokens', async () => {
    const { c, familiar, adultoMayorId, consentimientoId } =
      await familiaConAdulto(true);
    const respuestas = [
      await yo(c, familiar),
      await c
        .get(`/api/v1/adultos-mayores/${adultoMayorId}`)
        .set('Cookie', conSesion(familiar.sesion)),
      await c
        .patch('/api/v1/yo')
        .set('Cookie', conSesion(familiar.sesion))
        .send({ nombre: 'Andrea' }),
      await revocar(c, familiar, consentimientoId as string),
    ];

    for (const respuesta of respuestas) {
      expect(JSON.stringify(respuesta.body)).not.toMatch(
        /hash|intentos|bloqueado|argon2|eyJ|contrasena/i,
      );
    }
    expect(CONTRASENA).toBeDefined();
  });
});
