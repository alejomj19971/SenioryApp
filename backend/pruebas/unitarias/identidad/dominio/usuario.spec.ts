import { Correo } from '../../../../src/identidad/dominio/correo.js';
import { NombrePersona } from '../../../../src/identidad/dominio/nombre-persona.js';
import { TelefonoE164 } from '../../../../src/identidad/dominio/telefono-e164.js';
import {
  Usuario,
  type CambiosDePerfil,
} from '../../../../src/identidad/dominio/usuario.js';
import { RelojFalso } from '../../../soporte/dobles.js';
import {
  AHORA,
  credencialDePrueba,
  idDePrueba,
  usuarioDePrueba,
} from '../../../soporte/identidad.js';

const telefono = (texto: string) => TelefonoE164.crear(texto);

describe('Usuario', () => {
  describe('registro', () => {
    it('un registro público crea un familiar activo, sin correo verificado', () => {
      const id = idDePrueba<'Usuario'>();

      const usuario = Usuario.registrarFamiliar({
        id,
        correo: Correo.crear('Andrea@Ejemplo.co'),
        nombre: NombrePersona.crear('Andrea Gómez'),
        credencial: credencialDePrueba(id),
        ahora: AHORA,
      });

      expect(usuario).toMatchObject({
        id,
        rol: 'familiar',
        estado: 'activo',
        telefono: null,
        correoVerificadoEn: null,
        creadoEn: AHORA,
        actualizadoEn: AHORA,
      });
      expect(usuario.correo.valor).toBe('andrea@ejemplo.co');
    });

    it('guarda el teléfono si se da', () => {
      const id = idDePrueba<'Usuario'>();

      const usuario = Usuario.registrarFamiliar({
        id,
        correo: Correo.crear('a@ejemplo.co'),
        nombre: NombrePersona.crear('Andrea'),
        telefono: telefono('+573001234567'),
        credencial: credencialDePrueba(id),
        ahora: AHORA,
      });

      expect(usuario.telefono?.valor).toBe('+573001234567');
    });

    it('un administrador solo se crea con su propia función', () => {
      const id = idDePrueba<'Usuario'>();

      const admin = Usuario.crearAdministrador({
        id,
        correo: Correo.crear('admin@seniory.co'),
        nombre: NombrePersona.crear('Administración'),
        credencial: credencialDePrueba(id),
        ahora: AHORA,
      });

      expect(admin.rol).toBe('administrador');
    });

    it('rechaza una credencial que pertenece a otro usuario', () => {
      expect(() =>
        Usuario.registrarFamiliar({
          id: idDePrueba(),
          correo: Correo.crear('a@ejemplo.co'),
          nombre: NombrePersona.crear('Andrea'),
          credencial: credencialDePrueba(idDePrueba()),
          ahora: AHORA,
        }),
      ).toThrow(
        expect.objectContaining({ codigo: 'usuario.credencial_ajena' }),
      );
    });
  });

  describe('el rol no se puede cambiar', () => {
    it('no existe ninguna forma de asignarlo después de crear la cuenta', () => {
      const usuario = usuarioDePrueba();

      // El rol es de solo lectura: asignarlo falla, no se ignora en silencio.
      expect(() => {
        (usuario as unknown as { rol: string }).rol = 'administrador';
      }).toThrow(TypeError);
      expect(usuario.rol).toBe('familiar');
    });

    it('actualizarPerfil ignora un rol que se cuele en los cambios', () => {
      const usuario = usuarioDePrueba();

      usuario.actualizarPerfil(
        { rol: 'administrador' } as unknown as CambiosDePerfil,
        AHORA,
      );

      expect(usuario.rol).toBe('familiar');
    });
  });

  describe('puedeIniciarSesion', () => {
    it('una cuenta activa y sin bloqueo puede', () => {
      expect(usuarioDePrueba().puedeIniciarSesion(AHORA)).toBe(true);
    });

    it('una cuenta bloqueada por intentos fallidos no puede, hasta que expira el bloqueo', () => {
      const reloj = new RelojFalso();
      const usuario = usuarioDePrueba({ ahora: reloj.ahora() });
      for (let i = 0; i < 5; i++) {
        usuario.credencial.registrarFallo(reloj.ahora());
      }

      expect(usuario.puedeIniciarSesion(reloj.ahora())).toBe(false);
      reloj.avanzar(15 * 60_000);
      expect(usuario.puedeIniciarSesion(reloj.ahora())).toBe(true);
    });

    it('una cuenta eliminada no puede, aunque la contraseña sea correcta', () => {
      const original = usuarioDePrueba();
      const eliminada = Usuario.reconstruir({
        id: original.id,
        correo: original.correo,
        nombre: original.nombre,
        telefono: null,
        rol: original.rol,
        estado: 'eliminado',
        correoVerificadoEn: null,
        creadoEn: AHORA,
        actualizadoEn: AHORA,
        credencial: original.credencial,
      });

      expect(eliminada.puedeIniciarSesion(AHORA)).toBe(false);
    });
  });

  describe('actualizarPerfil', () => {
    const despues = new Date(AHORA.getTime() + 60_000);

    it('cambia el nombre y marca la fecha de actualización', () => {
      const usuario = usuarioDePrueba();

      usuario.actualizarPerfil(
        { nombre: NombrePersona.crear('Andrea M. Gómez') },
        despues,
      );

      expect(usuario.nombre.valor).toBe('Andrea M. Gómez');
      expect(usuario.actualizadoEn).toEqual(despues);
      expect(usuario.creadoEn).toEqual(AHORA);
    });

    it('agrega, cambia y borra el teléfono (null lo borra)', () => {
      const usuario = usuarioDePrueba();

      usuario.actualizarPerfil(
        { telefono: telefono('+573001234567') },
        despues,
      );
      expect(usuario.telefono?.valor).toBe('+573001234567');

      usuario.actualizarPerfil(
        { telefono: telefono('+573109998877') },
        despues,
      );
      expect(usuario.telefono?.valor).toBe('+573109998877');

      usuario.actualizarPerfil({ telefono: null }, despues);
      expect(usuario.telefono).toBeNull();
    });

    it('lo que no se menciona no cambia', () => {
      const usuario = usuarioDePrueba();
      usuario.actualizarPerfil(
        { telefono: telefono('+573001234567') },
        despues,
      );

      usuario.actualizarPerfil(
        { nombre: NombrePersona.crear('Otro Nombre') },
        despues,
      );

      expect(usuario.telefono?.valor).toBe('+573001234567');
    });

    it('si no hay cambios reales no toca la fecha de actualización', () => {
      const usuario = usuarioDePrueba();
      usuario.actualizarPerfil(
        { telefono: telefono('+573001234567') },
        despues,
      );
      const fecha = new Date(despues.getTime() + 60_000);

      usuario.actualizarPerfil({}, fecha);
      usuario.actualizarPerfil(
        { nombre: NombrePersona.crear('Andrea Gómez') },
        fecha,
      );
      usuario.actualizarPerfil({ telefono: telefono('+573001234567') }, fecha);
      usuarioDePrueba().actualizarPerfil({ telefono: null }, fecha);

      expect(usuario.actualizadoEn).toEqual(despues);
    });

    it('borrar un teléfono que no existe no cuenta como cambio', () => {
      const usuario = usuarioDePrueba();

      usuario.actualizarPerfil({ telefono: null }, despues);

      expect(usuario.actualizadoEn).toEqual(AHORA);
    });
  });
});
