import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import { Correo } from '../../../../src/identidad/dominio/correo.js';
import { NombrePersona } from '../../../../src/identidad/dominio/nombre-persona.js';
import { TelefonoE164 } from '../../../../src/identidad/dominio/telefono-e164.js';
import {
  calidadDesdeTexto,
  finalidadDesdeTexto,
  parentescoDesdeTexto,
} from '../../../../src/identidad/dominio/valores-cerrados.js';
import { VersionDeTexto } from '../../../../src/identidad/dominio/version-de-texto.js';

describe('Correo', () => {
  it.each([
    ['andrea@ejemplo.co', 'andrea@ejemplo.co'],
    ['  Andrea@Ejemplo.CO  ', 'andrea@ejemplo.co'],
    ['a.b+etiqueta@sub.dominio.com.co', 'a.b+etiqueta@sub.dominio.com.co'],
    ["o'brien@ejemplo.co", "o'brien@ejemplo.co"],
    ['x@prueba.seniory.invalid', 'x@prueba.seniory.invalid'],
  ])('acepta %j y lo normaliza', (texto, esperado) => {
    expect(Correo.crear(texto).valor).toBe(esperado);
  });

  it.each([
    '',
    '   ',
    'sin-arroba',
    'a@b', // dominio sin punto
    'a@@b.co',
    '@ejemplo.co',
    'a@',
    'a@.co',
    'a@ejemplo..co',
    'a@ejemplo.c', // dominio de primer nivel de una letra
    'a@ejemplo.c0',
    'a@-ejemplo.co',
    'a@ejemplo-.co',
    'a..b@ejemplo.co',
    '.a@ejemplo.co',
    'a.@ejemplo.co',
    'a b@ejemplo.co',
    'a\nb@ejemplo.co',
    'a@ejemplo.co,b@ejemplo.co',
    'ñandú@ejemplo.co', // solo ASCII
    `${'a'.repeat(65)}@ejemplo.co`, // parte local de más de 64
    `a@${'b'.repeat(64)}.co`, // etiqueta de más de 63
  ])('rechaza %j', (texto) => {
    expect(() => Correo.crear(texto)).toThrow(ErrorDeValidacion);
    expect(() => Correo.crear(texto)).toThrow(
      expect.objectContaining({ codigo: 'correo.invalido' }),
    );
  });

  it('acepta hasta 254 caracteres y rechaza uno más', () => {
    const local = 'a'.repeat(64);
    const dominio = (largoDelUltimo: number) =>
      `${'b'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(largoDelUltimo)}`;

    expect(Correo.crear(`${local}@${dominio(61)}`).valor).toHaveLength(254);
    expect(() => Correo.crear(`${local}@${dominio(62)}`)).toThrow(
      ErrorDeValidacion,
    );
  });

  it('dos correos que solo difieren en mayúsculas son el mismo', () => {
    expect(
      Correo.crear('Andrea@x.co').igualA(Correo.crear('andrea@X.CO')),
    ).toBe(true);
    expect(Correo.crear('a@x.co').igualA(Correo.crear('b@x.co'))).toBe(false);
  });
});

describe('TelefonoE164', () => {
  it.each(['+573001234567', '+12025550123', '+34600123456'])(
    'acepta %s',
    (texto) => {
      expect(TelefonoE164.crear(texto).valor).toBe(texto);
    },
  );

  it('quita los espacios de los extremos', () => {
    expect(TelefonoE164.crear(' +573001234567 ').valor).toBe('+573001234567');
  });

  it.each([
    '',
    '3001234567', // sin el «+» y el código del país
    '+57 300 123 4567',
    '+57-300-1234567',
    '+0573001234567', // el código del país no empieza en 0
    '+5730012', // demasiado corto
    '+5730012345678901', // demasiado largo
    '+57300abc4567',
    '++573001234567',
  ])('rechaza %j', (texto) => {
    expect(() => TelefonoE164.crear(texto)).toThrow(
      expect.objectContaining({ codigo: 'telefono.invalido' }),
    );
  });
});

describe('NombrePersona', () => {
  it('conserva un nombre normal', () => {
    expect(NombrePersona.crear('Andrea Gómez').valor).toBe('Andrea Gómez');
  });

  it('quita espacios sobrantes y junta los tramos de espacio en uno', () => {
    expect(NombrePersona.crear('  Andrea \t  Gómez\n').valor).toBe(
      'Andrea Gómez',
    );
    expect(NombrePersona.crear('Ana\nMaría').valor).toBe('Ana María');
  });

  it('normaliza a NFC: la «é» compuesta y la descompuesta son el mismo nombre', () => {
    const compuesto = NombrePersona.crear('Andrés');
    const descompuesto = NombrePersona.crear('Andrés');

    expect(descompuesto.valor).toBe('Andrés');
    expect(descompuesto.igualA(compuesto)).toBe(true);
  });

  it('cuenta caracteres, no unidades de texto: 100 emojis caben y 101 no', () => {
    expect(NombrePersona.crear('😀'.repeat(100)).valor).toBe('😀'.repeat(100));
    expect(() => NombrePersona.crear('😀'.repeat(101))).toThrow(
      ErrorDeValidacion,
    );
  });

  it('admite 100 caracteres y rechaza 101', () => {
    expect(NombrePersona.crear('a'.repeat(100)).valor).toHaveLength(100);
    expect(() => NombrePersona.crear('a'.repeat(101))).toThrow(
      expect.objectContaining({ codigo: 'nombre.invalido' }),
    );
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   \t\n '],
    ['carácter de control', 'Ana\u0007'],
    ['carácter nulo', 'Ana\u0000María'],
    ['inversión del sentido de lectura', 'Ana‮odnum'],
  ])('rechaza un nombre %s', (_caso, texto) => {
    expect(() => NombrePersona.crear(texto)).toThrow(
      expect.objectContaining({ codigo: 'nombre.invalido' }),
    );
  });
});

describe('VersionDeTexto', () => {
  it.each(['v1', ' 2026.10 ', 'v1.0-beta_2', '1'])('acepta %j', (texto) => {
    expect(VersionDeTexto.crear(texto).valor).toBe(texto.trim());
  });

  it.each([
    '',
    '   ',
    '-v1',
    '.1',
    'v 1',
    'a'.repeat(21),
    "v1'; drop table",
    'versión',
  ])('rechaza %j', (texto) => {
    expect(() => VersionDeTexto.crear(texto)).toThrow(
      expect.objectContaining({ codigo: 'version_de_texto.invalida' }),
    );
  });

  it('admite 20 caracteres', () => {
    expect(VersionDeTexto.crear('v'.repeat(20)).valor).toHaveLength(20);
  });
});

describe('valores cerrados', () => {
  it('acepta cada parentesco de la base de datos', () => {
    for (const parentesco of [
      'hijo_hija',
      'nieto_nieta',
      'conyuge',
      'hermano_hermana',
      'otro',
    ]) {
      expect(parentescoDesdeTexto(parentesco)).toBe(parentesco);
    }
  });

  it.each(['primo', '', 'HIJO_HIJA', 'hijo_hija '])(
    'rechaza el parentesco %j',
    (texto) => {
      expect(() => parentescoDesdeTexto(texto)).toThrow(
        expect.objectContaining({ codigo: 'parentesco.invalido' }),
      );
    },
  );

  it('acepta la finalidad datos_de_salud y rechaza cualquier otra', () => {
    expect(finalidadDesdeTexto('datos_de_salud')).toBe('datos_de_salud');
    expect(() => finalidadDesdeTexto('marketing')).toThrow(
      expect.objectContaining({ codigo: 'consentimiento.finalidad_invalida' }),
    );
  });

  it('acepta titular y representante y rechaza cualquier otra calidad', () => {
    expect(calidadDesdeTexto('titular')).toBe('titular');
    expect(calidadDesdeTexto('representante')).toBe('representante');
    expect(() => calidadDesdeTexto('tutor')).toThrow(
      expect.objectContaining({ codigo: 'consentimiento.calidad_invalida' }),
    );
  });
});
