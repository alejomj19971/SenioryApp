import type { NestExpressApplication } from '@nestjs/platform-express';
import { CrearAdministrador } from '../../../src/identidad/aplicacion/casos-de-uso/crear-administrador.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../../src/compartido/dominio/errores.js';
import {
  crearAdministradorDesdeEntorno,
  ErrorDeComando,
} from '../../../src/identidad/infraestructura/entrada/consola/comando-crear-administrador.js';
import { dependenciasDeSemillas } from '../../../src/identidad/infraestructura/entrada/consola/dependencias-de-semillas.js';
import {
  CORREO_DE_ANDREA,
  sembrarIdentidad,
} from '../../../src/identidad/infraestructura/entrada/consola/semillas-de-identidad.js';
import { ControladorDePrueba } from '../../api/controlador-de-prueba.js';
import { como, conSesion, sesionDe, SECRETO_BFF } from '../../soporte/api.js';
import { crearAppDePrueba } from '../../soporte/app.js';
import { conectarBd, nuevoId } from '../../soporte/bd.js';

// Los comandos de consola de Identidad (M1 §4.8): `crear-admin` y `semillas`. Se prueban con la
// aplicación completa y Postgres real; la parte que solo lee `process.env` y llama a `process.exit`
// es una capa delgada sobre estas funciones.

const CONTRASENA = 'una contraseña larga y única';
const bd = conectarBd();

describe('comandos de consola de Identidad', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
      variables: { SECRETO_BFF },
    });
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  const caso = () => app.get(CrearAdministrador, { strict: false });
  const correoNuevo = () => `${nuevoId()}@admin.seniory.invalid`;

  describe('crear-admin', () => {
    const entorno = (cambios: Record<string, string | undefined> = {}) => ({
      ADMIN_NOMBRE: 'Laura Administradora',
      ADMIN_CORREO: correoNuevo(),
      ADMIN_CONTRASENA: CONTRASENA,
      ...cambios,
    });

    it('crea un administrador que puede iniciar sesión y entrar a las rutas de administradores', async () => {
      const variables = entorno();

      const mensaje = await crearAdministradorDesdeEntorno(variables, caso());

      expect(mensaje).toContain(variables.ADMIN_CORREO);
      const cliente = como(app);
      const login = await cliente
        .post('/api/v1/auth/login')
        .send({ correo: variables.ADMIN_CORREO, contrasena: CONTRASENA });
      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({
        usuario: { rol: 'administrador', nombre: 'Laura Administradora' },
      });
      const ruta = await cliente
        .get('/api/v1/prueba/solo-administradores')
        .set('Cookie', conSesion(sesionDe(login)));
      expect(ruta.status).toBe(200);
    });

    it('guarda solo el hash de la contraseña, y la contraseña nunca aparece en el mensaje', async () => {
      const variables = entorno();

      const mensaje = await crearAdministradorDesdeEntorno(variables, caso());

      expect(mensaje).not.toContain(CONTRASENA);
      const { rows } = await bd.query<{ hash: string }>(
        `select c.hash from identidad.credenciales c join identidad.usuarios u on u.id = c.usuario_id
         where u.correo = $1`,
        [variables.ADMIN_CORREO],
      );
      expect(rows[0]?.hash).toMatch(/^\$argon2id\$/);
      expect(rows[0]?.hash).not.toContain(CONTRASENA);
    });

    it('queda auditado como hecho por el sistema, sin el correo', async () => {
      const variables = entorno();
      await crearAdministradorDesdeEntorno(variables, caso());

      const { rows } = await bd.query<{
        actor_id: string | null;
        resultado: string;
      }>(
        `select a.actor_id, a.resultado from compartido.auditoria a
         join identidad.usuarios u on u.id::text = a.recurso_id
         where a.accion = 'identidad.crear_administrador' and u.correo = $1`,
        [variables.ADMIN_CORREO],
      );
      expect(rows).toEqual([{ actor_id: null, resultado: 'permitido' }]);
    });

    it('un correo que ya tiene cuenta se rechaza, también con otras mayúsculas', async () => {
      const variables = entorno();
      await crearAdministradorDesdeEntorno(variables, caso());

      await expect(
        crearAdministradorDesdeEntorno(
          { ...variables, ADMIN_CORREO: variables.ADMIN_CORREO.toUpperCase() },
          caso(),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'usuario.correo_ya_registrado',
        }),
      );
    });

    it.each([
      [
        'una contraseña corta',
        { ADMIN_CONTRASENA: 'corta' },
        'contrasena.largo_invalido',
      ],
      [
        'una contraseña común',
        { ADMIN_CONTRASENA: 'QWERTYUIOP' },
        'contrasena.comun',
      ],
      [
        'un correo inválido',
        { ADMIN_CORREO: 'no-es-un-correo' },
        'correo.invalido',
      ],
    ])('rechaza %s y no crea nada', async (_caso, cambios, codigo) => {
      await expect(
        crearAdministradorDesdeEntorno(entorno(cambios), caso()),
      ).rejects.toThrow(
        expect.objectContaining({ constructor: ErrorDeValidacion, codigo }),
      );
    });

    it.each(['ADMIN_NOMBRE', 'ADMIN_CORREO', 'ADMIN_CONTRASENA'])(
      'pide %s si falta o está en blanco, y nombra la variable',
      async (variable) => {
        for (const valor of [undefined, '', '   ']) {
          await expect(
            crearAdministradorDesdeEntorno(
              entorno({ [variable]: valor }),
              caso(),
            ),
          ).rejects.toThrow(
            expect.objectContaining({
              constructor: ErrorDeComando,
              message: expect.stringContaining(variable),
            }),
          );
        }
      },
    );

    it('el mensaje de las variables que faltan nunca incluye la contraseña que sí se dio', async () => {
      const promesa = crearAdministradorDesdeEntorno(
        entorno({ ADMIN_CORREO: undefined }),
        caso(),
      );

      await expect(promesa).rejects.not.toThrow(CONTRASENA);
    });

    it('no existe ninguna ruta de la API que cree administradores', async () => {
      const cliente = como(app);

      const respuesta = await cliente.post('/api/v1/auth/registro').send({
        nombre: 'Intruso',
        correo: correoNuevo(),
        contrasena: CONTRASENA,
        versionPolitica: 'v1',
        rol: 'administrador',
      });

      expect(respuesta.status).toBe(400);
    });
  });

  describe('semillas', () => {
    const entorno = (cambios: Record<string, string | undefined> = {}) => ({
      NODE_ENV: 'development',
      CONTRASENA_DE_PRUEBA: CONTRASENA,
      ...cambios,
    });
    const sembrar = (variables = entorno()) =>
      sembrarIdentidad(variables, dependenciasDeSemillas(app));

    it('se niega a correr en producción y no crea nada', async () => {
      await expect(
        sembrar(entorno({ NODE_ENV: 'production' })),
      ).rejects.toThrow(
        expect.objectContaining({
          constructor: ErrorDeComando,
          message: expect.stringContaining('producción'),
        }),
      );
    });

    it('pide CONTRASENA_DE_PRUEBA y nunca la trae por defecto', async () => {
      for (const valor of [undefined, '', '   ']) {
        await expect(
          sembrar(entorno({ CONTRASENA_DE_PRUEBA: valor })),
        ).rejects.toThrow(
          expect.objectContaining({
            constructor: ErrorDeComando,
            message: expect.stringContaining('CONTRASENA_DE_PRUEBA'),
          }),
        );
      }
    });

    it('rechaza una contraseña débil: una semilla no abre una cuenta débil', async () => {
      await expect(
        sembrar(entorno({ CONTRASENA_DE_PRUEBA: 'QWERTYUIOP' })),
      ).rejects.toThrow(
        expect.objectContaining({ codigo: 'contrasena.comun' }),
      );
    });

    it('crea a Andrea y a Doña Carmen, vinculadas y con el consentimiento de salud', async () => {
      await sembrar();

      const cliente = como(app);
      const login = await cliente
        .post('/api/v1/auth/login')
        .send({ correo: CORREO_DE_ANDREA, contrasena: CONTRASENA });
      expect(login.status).toBe(200);
      const perfil = await cliente
        .get('/api/v1/yo')
        .set('Cookie', conSesion(sesionDe(login)));
      expect(perfil.body).toMatchObject({
        usuario: {
          nombre: 'Andrea',
          correo: CORREO_DE_ANDREA,
          rol: 'familiar',
        },
        adultosMayores: [
          {
            nombre: 'Doña Carmen',
            edad: 78,
            parentesco: 'hijo_hija',
            esResponsable: true,
            consentimientoDeSalud: true,
          },
        ],
      });
    });

    it('se puede repetir sin duplicar nada y conserva los mismos IDs', async () => {
      await sembrar();
      const antes = await bd.query<{ n: string }>(
        `select
           (select count(*) from identidad.usuarios where correo = $1)
         + (select count(*) from identidad.adultos_mayores where nombre = 'Doña Carmen' and creado_por = (select id from identidad.usuarios where correo = $1))
         as n`,
        [CORREO_DE_ANDREA],
      );

      const mensajes = await sembrar();
      const despues = await bd.query<{ n: string }>(
        `select
           (select count(*) from identidad.usuarios where correo = $1)
         + (select count(*) from identidad.adultos_mayores where nombre = 'Doña Carmen' and creado_por = (select id from identidad.usuarios where correo = $1))
         as n`,
        [CORREO_DE_ANDREA],
      );

      expect(despues.rows).toEqual(antes.rows);
      expect(mensajes.join(' ')).toContain('ya existía');
      const { rows } = await bd.query<{ id: string }>(
        'select id from identidad.usuarios where correo = $1',
        [CORREO_DE_ANDREA],
      );
      // UUID versión 5: se deriva del nombre («f-andrea»), así que es siempre el mismo.
      expect(rows[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('repetirla no cambia la contraseña de Andrea', async () => {
      await sembrar();

      await sembrar(
        entorno({ CONTRASENA_DE_PRUEBA: 'otra contraseña distinta y larga' }),
      );

      const login = await como(app)
        .post('/api/v1/auth/login')
        .send({ correo: CORREO_DE_ANDREA, contrasena: CONTRASENA });
      expect(login.status).toBe(200);
    });
  });
});
