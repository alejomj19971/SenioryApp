import fc from 'fast-check';
import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import { Cuidador } from '../../../../src/directorio/dominio/cuidador.js';
import {
  CONTROLES_DE_VERIFICACION,
  type ControlDeVerificacion,
} from '../../../../src/directorio/dominio/valores-cerrados.js';
import { AHORA, idDePrueba } from '../../../soporte/identidad.js';
import {
  HOY_DE_PRUEBA,
  cuidadorDePrueba,
  verificacionDePrueba,
} from '../../../soporte/directorio.js';

const datosValidos = () => ({
  id: idDePrueba<'Cuidador'>(),
  usuarioId: null,
  nombre: 'Marta Elena Restrepo',
  especialidad: 'enfermeria' as const,
  titulo: 'Técnica en Enfermería — SENA',
  aniosExperiencia: 7,
  tarifaHora: 20_000,
  telefono: '+573168393514',
  zona: 'Laureles, Medellín',
  disponibilidad: ['manana', 'tarde'] as ('manana' | 'tarde' | 'noche')[],
  bio: 'Cuido con paciencia y cariño.',
  ahora: AHORA,
});

describe('Cuidador', () => {
  describe('registrar', () => {
    it('entra en borrador, oculto y sin calificación', () => {
      const cuidador = Cuidador.registrar(datosValidos());

      expect(cuidador).toMatchObject({
        estado: 'borrador',
        visible: false,
        aceptacionAutomatica: false,
        cantidadResenas: 0,
        serviciosCompletados: 0,
        version: 1,
      });
      expect(cuidador.calificacion()).toBeNull();
      expect(cuidador.tarifaHora.valor).toBe(20_000);
    });

    it('limpia los espacios del nombre y deja la disponibilidad en el orden del día', () => {
      const cuidador = Cuidador.registrar({
        ...datosValidos(),
        nombre: '  Marta   Elena\tRestrepo ',
        disponibilidad: ['noche', 'manana', 'noche'],
      });

      expect(cuidador.nombre).toBe('Marta Elena Restrepo');
      expect(cuidador.disponibilidad).toEqual(['manana', 'noche']);
    });

    it.each([
      ['un nombre vacío', { nombre: '   ' }, 'cuidador.nombre_invalido'],
      [
        'un nombre de más de 100 caracteres',
        { nombre: 'a'.repeat(101) },
        'cuidador.nombre_invalido',
      ],
      [
        'un nombre con caracteres que invierten la lectura',
        { nombre: 'Marta ‮Restrepo' },
        'cuidador.nombre_invalido',
      ],
      ['un título vacío', { titulo: '' }, 'cuidador.titulo_invalido'],
      ['una zona vacía', { zona: ' ' }, 'cuidador.zona_invalido'],
      [
        'años negativos',
        { aniosExperiencia: -1 },
        'cuidador.experiencia_invalida',
      ],
      [
        'más de 60 años',
        { aniosExperiencia: 61 },
        'cuidador.experiencia_invalida',
      ],
      [
        'años con decimales',
        { aniosExperiencia: 2.5 },
        'cuidador.experiencia_invalida',
      ],
      ['una tarifa de cero', { tarifaHora: 0 }, 'cuidador.tarifa_invalida'],
      [
        'un teléfono sin formato internacional',
        { telefono: '3168393514' },
        'cuidador.telefono_invalido',
      ],
      [
        'una presentación de más de 1000 caracteres',
        { bio: 'x'.repeat(1001) },
        'cuidador.bio_muy_larga',
      ],
      [
        'ninguna jornada',
        { disponibilidad: [] },
        'cuidador.sin_disponibilidad',
      ],
    ])('rechaza %s', (_caso, cambios, codigo) => {
      expect(() =>
        Cuidador.registrar({ ...datosValidos(), ...cambios }),
      ).toThrow(expect.objectContaining({ codigo }));
    });

    it('rechaza una tarifa negativa (Dinero nunca es negativo)', () => {
      expect(() =>
        Cuidador.registrar({ ...datosValidos(), tarifaHora: -5 }),
      ).toThrow();
    });
  });

  describe('E7: esVisible exige los tres controles aprobados y vigentes', () => {
    // Las 8 combinaciones de tener o no cada control: solo la de los tres es visible.
    const combinaciones = [0, 1, 2, 3, 4, 5, 6, 7].map((n) =>
      CONTROLES_DE_VERIFICACION.filter((_, i) => (n >> i) & 1),
    );

    it.each(
      combinaciones.map(
        (c) =>
          [
            c.length === 3 ? 'los tres' : c.join(' + ') || 'ninguno',
            c,
          ] as const,
      ),
    )('con %s', (_nombre, controles) => {
      const cuidador = cuidadorDePrueba({ controles });

      expect(cuidador.esVisible(HOY_DE_PRUEBA)).toBe(controles.length === 3);
    });

    it('propiedad: es visible si y solo si están los tres controles, en cualquier orden', () => {
      fc.assert(
        fc.property(
          fc.subarray([...CONTROLES_DE_VERIFICACION]),
          fc.constantFrom('borrador', 'en_revision', 'activo', 'suspendido'),
          (controles, estado) => {
            const cuidador = cuidadorDePrueba({ controles, activo: false });
            if (estado === 'activo') cuidador.activar(AHORA);
            else if (estado === 'en_revision') {
              /* sigue en borrador: tampoco es visible */
            } else if (estado === 'suspendido') cuidador.suspender(AHORA);

            const esperado = estado === 'activo' && controles.length === 3;
            expect(cuidador.esVisible(HOY_DE_PRUEBA)).toBe(esperado);
          },
        ),
      );
    });

    it('un cuidador en borrador no es visible aunque tenga los tres controles', () => {
      expect(cuidadorDePrueba({ activo: false }).esVisible(HOY_DE_PRUEBA)).toBe(
        false,
      );
    });

    it('un cuidador suspendido no es visible', () => {
      const cuidador = cuidadorDePrueba();
      cuidador.suspender(AHORA);

      expect(cuidador.esVisible(HOY_DE_PRUEBA)).toBe(false);
      expect(cuidador.visible).toBe(false);
    });

    it('el último día de vigencia todavía vale; el siguiente, no', () => {
      const id = idDePrueba<'Cuidador'>();
      const cuidador = cuidadorDePrueba({
        id,
        controles: ['titulos', 'psicotecnica'],
      });
      const ultimoDia = FechaCivil.desdeTexto('2026-11-30');
      cuidador.conVerificacion(
        verificacionDePrueba(id, 'antecedentes', { vigenteHasta: ultimoDia }),
      );

      expect(cuidador.esVisible(FechaCivil.desdeTexto('2026-11-30'))).toBe(
        true,
      );
      expect(cuidador.esVisible(FechaCivil.desdeTexto('2026-12-01'))).toBe(
        false,
      );
    });

    it('un control sin fecha de vigencia no vence', () => {
      const id = idDePrueba<'Cuidador'>();
      const cuidador = cuidadorDePrueba({ id, controles: [], activo: false });
      for (const control of CONTROLES_DE_VERIFICACION) {
        cuidador.conVerificacion(
          verificacionDePrueba(id, control, { vigenteHasta: null }),
        );
      }
      cuidador.activar(AHORA);

      expect(cuidador.esVisible(FechaCivil.desdeTexto('2099-01-01'))).toBe(
        true,
      );
    });
  });

  describe('recalcularVisibilidad', () => {
    it('al aprobarse el último control pasa a visible y lo informa', () => {
      const id = idDePrueba<'Cuidador'>();
      const cuidador = cuidadorDePrueba({
        id,
        controles: ['antecedentes', 'titulos'],
        activo: false,
      });
      cuidador.activar(AHORA);
      expect(cuidador.recalcularVisibilidad(HOY_DE_PRUEBA, AHORA)).toBeNull();

      cuidador.conVerificacion(verificacionDePrueba(id, 'psicotecnica'));

      expect(cuidador.recalcularVisibilidad(HOY_DE_PRUEBA, AHORA)).toBe(
        'visible',
      );
      expect(cuidador.visible).toBe(true);
    });

    it('al vencer un control pasa a oculto y lo informa; repetirlo no cambia nada', () => {
      const cuidador = cuidadorDePrueba();
      const mananaDelVencimiento = HOY_DE_PRUEBA.sumarDias(366);

      expect(cuidador.recalcularVisibilidad(mananaDelVencimiento, AHORA)).toBe(
        'oculto',
      );
      expect(cuidador.visible).toBe(false);
      expect(
        cuidador.recalcularVisibilidad(mananaDelVencimiento, AHORA),
      ).toBeNull();
    });

    it('cada cambio sube la versión; sin cambios no la toca', () => {
      const cuidador = cuidadorDePrueba();
      const antes = cuidador.version;

      cuidador.recalcularVisibilidad(HOY_DE_PRUEBA, AHORA);
      expect(cuidador.version).toBe(antes);

      cuidador.recalcularVisibilidad(HOY_DE_PRUEBA.sumarDias(400), AHORA);
      expect(cuidador.version).toBe(antes + 1);
    });
  });

  describe('estado', () => {
    it('activar un cuidador suspendido o ya activo falla', () => {
      const activo = cuidadorDePrueba();
      expect(() => activo.activar(AHORA)).toThrow(
        expect.objectContaining({ codigo: 'cuidador.no_activable' }),
      );
      const suspendido = cuidadorDePrueba();
      suspendido.suspender(AHORA);
      expect(() => suspendido.activar(AHORA)).toThrow(
        expect.objectContaining({ codigo: 'cuidador.no_activable' }),
      );
    });

    it('suspender dos veces es lo mismo que una', () => {
      const cuidador = cuidadorDePrueba();
      cuidador.suspender(AHORA);
      const version = cuidador.version;

      cuidador.suspender(AHORA);

      expect(cuidador.version).toBe(version);
    });
  });

  describe('calificación', () => {
    it('es el promedio de las reseñas con un decimal', () => {
      const cuidador = cuidadorDePrueba();
      for (const nota of [5, 5, 4]) cuidador.registrarResena(nota, AHORA);

      expect(cuidador.cantidadResenas).toBe(3);
      expect(cuidador.sumaCalificaciones).toBe(14);
      expect(cuidador.calificacion()).toBe(4.7);
    });

    it('propiedad: el promedio queda siempre entre 1 y 5 y coincide con los contadores', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 1, max: 5 }), {
            minLength: 1,
            maxLength: 60,
          }),
          (notas) => {
            const cuidador = cuidadorDePrueba();
            for (const nota of notas) cuidador.registrarResena(nota, AHORA);

            const promedio = cuidador.calificacion() as number;
            expect(promedio).toBeGreaterThanOrEqual(1);
            expect(promedio).toBeLessThanOrEqual(5);
            expect(cuidador.cantidadResenas).toBe(notas.length);
            expect(cuidador.sumaCalificaciones).toBe(
              notas.reduce((a, b) => a + b, 0),
            );
          },
        ),
      );
    });

    it.each([0, 6, -1, 3.5, Number.NaN])('rechaza una nota de %s', (nota) => {
      expect(() => cuidadorDePrueba().registrarResena(nota, AHORA)).toThrow(
        expect.objectContaining({ codigo: 'resena.calificacion_invalida' }),
      );
    });

    it('no cambia los contadores si la nota es inválida', () => {
      const cuidador = cuidadorDePrueba();

      expect(() => cuidador.registrarResena(9, AHORA)).toThrow();

      expect(cuidador.cantidadResenas).toBe(0);
    });
  });

  describe('conVerificacion', () => {
    it('reemplaza el control del mismo tipo y conserva los demás', () => {
      const id = idDePrueba<'Cuidador'>();
      const cuidador = cuidadorDePrueba({ id });
      const nueva = verificacionDePrueba(id, 'antecedentes', {
        vigenteHasta: FechaCivil.desdeTexto('2030-01-01'),
      });

      cuidador.conVerificacion(nueva);

      expect(cuidador.verificaciones).toHaveLength(3);
      const control = (c: ControlDeVerificacion) =>
        cuidador.verificaciones.find((v) => v.control === c);
      expect(control('antecedentes')).toBe(nueva);
      expect(control('titulos')).toBeDefined();
    });
  });
});
