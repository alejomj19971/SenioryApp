import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../src/compartido/dominio/errores.js';
import { Correo } from '../../../src/identidad/dominio/correo.js';
import { NombrePersona } from '../../../src/identidad/dominio/nombre-persona.js';
import { TelefonoE164 } from '../../../src/identidad/dominio/telefono-e164.js';
import { Usuario } from '../../../src/identidad/dominio/usuario.js';
import { RelojFalso } from '../../soporte/dobles.js';
import {
  AHORA,
  credencialDePrueba,
  idDePrueba,
  usuarioDePrueba,
} from '../../soporte/identidad.js';
import {
  esperar,
  montarRepositoriosDeIdentidad,
} from '../../soporte/repositorios-identidad.js';

describe('RepositorioUsuariosDrizzle', () => {
  const repos = montarRepositoriosDeIdentidad();
  const { usuarios, contexto } = repos;

  afterAll(async () => {
    await repos.pool.end();
  });

  async function existe(id: string): Promise<boolean> {
    const { rowCount } = await repos.pool.query(
      'select 1 from identidad.usuarios where id = $1',
      [id],
    );
    return rowCount === 1;
  }

  describe('guardar y buscar', () => {
    it('guarda un usuario con su credencial y lo recupera igual', async () => {
      const id = idDePrueba<'Usuario'>();
      const usuario = Usuario.registrarFamiliar({
        id,
        correo: Correo.crear(`${id}@prueba.invalid`),
        nombre: NombrePersona.crear('Andrea Gómez'),
        telefono: TelefonoE164.crear('+573001234567'),
        credencial: credencialDePrueba(id),
        ahora: AHORA,
      });

      await usuarios.guardar(usuario);
      const guardado = await usuarios.buscarPorId(id);

      expect(guardado).not.toBeNull();
      expect(guardado).toMatchObject({
        id,
        rol: 'familiar',
        estado: 'activo',
        correoVerificadoEn: null,
        creadoEn: AHORA,
        actualizadoEn: AHORA,
      });
      expect(guardado?.correo.valor).toBe(usuario.correo.valor);
      expect(guardado?.nombre.valor).toBe('Andrea Gómez');
      expect(guardado?.telefono?.valor).toBe('+573001234567');
      expect(guardado?.credencial.hash).toBe(usuario.credencial.hash);
      expect(guardado?.credencial.intentosFallidos).toBe(0);
      expect(guardado?.credencial.bloqueadoHasta).toBeNull();
    });

    it('conserva el rol de un administrador', async () => {
      const id = idDePrueba<'Usuario'>();
      const admin = Usuario.crearAdministrador({
        id,
        correo: Correo.crear(`${id}@prueba.invalid`),
        nombre: NombrePersona.crear('Administración'),
        credencial: credencialDePrueba(id),
        ahora: AHORA,
      });

      await usuarios.guardar(admin);

      expect((await usuarios.buscarPorId(id))?.rol).toBe('administrador');
    });

    it('devuelve null si el usuario no existe', async () => {
      expect(await usuarios.buscarPorId(idDePrueba())).toBeNull();
      expect(
        await usuarios.buscarPorCorreo(Correo.crear('nadie@prueba.invalid')),
      ).toBeNull();
    });

    it('busca por correo sin distinguir mayúsculas', async () => {
      const usuario = usuarioDePrueba();
      await usuarios.guardar(usuario);
      const otraEscritura = Correo.crear(usuario.correo.valor.toUpperCase());

      const encontrado = await usuarios.buscarPorCorreo(otraEscritura);

      expect(encontrado?.id).toBe(usuario.id);
    });
  });

  describe('correo único', () => {
    it('un correo repetido, aunque cambien las mayúsculas, es un conflicto', async () => {
      const original = usuarioDePrueba();
      await usuarios.guardar(original);
      const repetido = usuarioDePrueba({
        correo: original.correo.valor.toUpperCase(),
      });

      await expect(usuarios.guardar(repetido)).rejects.toThrow(
        expect.objectContaining({
          codigo: 'usuario.correo_ya_registrado',
          constructor: ConflictoDeEstado,
        }),
      );
    });

    it('si falla, no queda ni el usuario ni su credencial a medias', async () => {
      const original = usuarioDePrueba();
      await usuarios.guardar(original);
      const repetido = usuarioDePrueba({ correo: original.correo.valor });

      await expect(usuarios.guardar(repetido)).rejects.toThrow(
        ConflictoDeEstado,
      );

      expect(await existe(repetido.id)).toBe(false);
      const credencial = await repos.pool.query(
        'select 1 from identidad.credenciales where usuario_id = $1',
        [repetido.id],
      );
      expect(credencial.rowCount).toBe(0);
    });
  });

  describe('transacciones', () => {
    it('se une a la unidad de trabajo en curso: si se revierte, el usuario no queda', async () => {
      const usuario = usuarioDePrueba();

      await expect(
        contexto.ejecutar(async () => {
          await usuarios.guardar(usuario);
          expect(await existe(usuario.id)).toBe(false); // todavía sin confirmar, otra conexión no lo ve
          throw new Error('el caso de uso falló después de guardar');
        }),
      ).rejects.toThrow('el caso de uso falló');

      expect(await existe(usuario.id)).toBe(false);
    });

    it('se confirma junto con el resto de la unidad de trabajo', async () => {
      const usuario = usuarioDePrueba();

      await contexto.ejecutar(() => usuarios.guardar(usuario));

      expect(await existe(usuario.id)).toBe(true);
    });
  });

  describe('actualizar', () => {
    it('guarda el perfil y el control de intentos de la credencial', async () => {
      const reloj = new RelojFalso();
      const usuario = usuarioDePrueba({ ahora: reloj.ahora() });
      await usuarios.guardar(usuario);
      reloj.avanzar(60_000);

      usuario.actualizarPerfil(
        {
          nombre: NombrePersona.crear('Andrea M. Gómez'),
          telefono: TelefonoE164.crear('+573109998877'),
        },
        reloj.ahora(),
      );
      for (let i = 0; i < 5; i++)
        usuario.credencial.registrarFallo(reloj.ahora());
      await usuarios.actualizar(usuario);

      const guardado = await usuarios.buscarPorId(usuario.id);
      expect(guardado?.nombre.valor).toBe('Andrea M. Gómez');
      expect(guardado?.telefono?.valor).toBe('+573109998877');
      expect(guardado?.actualizadoEn).toEqual(reloj.ahora());
      expect(guardado?.credencial.intentosFallidos).toBe(5);
      expect(guardado?.credencial.bloqueadoHasta).toEqual(
        new Date(reloj.ahora().getTime() + 15 * 60_000),
      );
    });

    it('borra el teléfono cuando se pone en null', async () => {
      const usuario = usuarioDePrueba();
      usuario.actualizarPerfil(
        { telefono: TelefonoE164.crear('+573001234567') },
        AHORA,
      );
      await usuarios.guardar(usuario);

      usuario.actualizarPerfil({ telefono: null }, AHORA);
      await usuarios.actualizar(usuario);

      expect((await usuarios.buscarPorId(usuario.id))?.telefono).toBeNull();
    });

    it('no cambia el rol ni el correo', async () => {
      const usuario = usuarioDePrueba();
      await usuarios.guardar(usuario);

      await usuarios.actualizar(usuario);

      const guardado = await usuarios.buscarPorId(usuario.id);
      expect(guardado?.rol).toBe('familiar');
      expect(guardado?.correo.valor).toBe(usuario.correo.valor);
    });

    it('un usuario que no existe es un recurso no encontrado', async () => {
      await expect(usuarios.actualizar(usuarioDePrueba())).rejects.toThrow(
        expect.objectContaining({
          codigo: 'usuario.no_encontrado',
          constructor: RecursoNoEncontrado,
        }),
      );
    });
  });

  describe('bloqueo para el inicio de sesión', () => {
    it('mientras una transacción tiene la credencial, otra espera su turno', async () => {
      const usuario = usuarioDePrueba();
      await usuarios.guardar(usuario);
      let soltar!: () => void;
      const espera = new Promise<void>((resolver) => (soltar = resolver));
      let primeraTieneElBloqueo!: () => void;
      const bloqueado = new Promise<void>((r) => (primeraTieneElBloqueo = r));
      let segundaTermino = false;

      const primera = contexto.ejecutar(async () => {
        await usuarios.buscarPorCorreoParaActualizar(usuario.correo);
        primeraTieneElBloqueo();
        await espera;
      });
      // Si la primera falla antes de bloquear, se ve el error de verdad en vez de esperar un timeout.
      await Promise.race([bloqueado, primera]);
      const segunda = contexto.ejecutar(async () => {
        await usuarios.buscarPorCorreoParaActualizar(usuario.correo);
        segundaTermino = true;
      });

      await esperar(300);
      expect(segundaTermino).toBe(false);
      soltar();
      await Promise.all([primera, segunda]);
      expect(segundaTermino).toBe(true);
    });

    it('doce intentos fallidos simultáneos no se pierden: exactamente 5 cuentan y la cuenta queda bloqueada', async () => {
      const reloj = new RelojFalso();
      const usuario = usuarioDePrueba({ ahora: reloj.ahora() });
      await usuarios.guardar(usuario);

      // Cada intento hace lo que hará el inicio de sesión: bloquear la credencial, registrar el fallo
      // y guardar. Sin el bloqueo, todos leerían «0 fallos» y el contador terminaría en 1.
      await Promise.all(
        Array.from({ length: 12 }, () =>
          contexto.ejecutar(async () => {
            const actual = await usuarios.buscarPorCorreoParaActualizar(
              usuario.correo,
            );
            actual?.credencial.registrarFallo(reloj.ahora());
            if (actual) await usuarios.actualizar(actual);
          }),
        ),
      );

      const final = await usuarios.buscarPorId(usuario.id);
      expect(final?.credencial.intentosFallidos).toBe(5);
      expect(final?.credencial.estaBloqueada(reloj.ahora())).toBe(true);
    });

    it('devuelve null si el correo no existe', async () => {
      await contexto.ejecutar(async () => {
        expect(
          await usuarios.buscarPorCorreoParaActualizar(
            Correo.crear('nadie@prueba.invalid'),
          ),
        ).toBeNull();
      });
    });
  });
});
