import fc from 'fast-check';
import {
  codificarCursor,
  crearFiltros,
  decodificarCursor,
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  limiteDe,
} from '../../../../src/directorio/dominio/filtros-de-cuidadores.js';
import {
  Resena,
  abreviarAutor,
} from '../../../../src/directorio/dominio/resena.js';
import { normalizarParaBuscar } from '../../../../src/directorio/dominio/texto-de-busqueda.js';
import { Verificacion } from '../../../../src/directorio/dominio/verificacion.js';
import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import { AHORA, idDePrueba } from '../../../soporte/identidad.js';

describe('normalizarParaBuscar', () => {
  it.each([
    ['José', 'jose'],
    ['JOSÉ', 'jose'],
    ['jose', 'jose'],
    ['  María   Fernanda ', 'maria fernanda'],
    ['Laureles, Medellín', 'laureles medellin'],
    ['Niño', 'nino'],
    ['Ñandú', 'nandu'],
    ['é', 'e'], // «e» con el acento suelto
  ])('«%s» → «%s»', (entrada, esperado) => {
    expect(normalizarParaBuscar(entrada)).toBe(esperado);
  });

  it('propiedad: es idempotente (normalizar dos veces da lo mismo)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (texto) => {
        const una = normalizarParaBuscar(texto);
        expect(normalizarParaBuscar(una)).toBe(una);
      }),
    );
  });

  it('propiedad: nunca deja mayúsculas, tildes ni espacios sobrantes', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (texto) => {
        const resultado = normalizarParaBuscar(texto);
        expect(resultado).toBe(resultado.toLowerCase());
        expect(resultado).not.toMatch(/\p{M}/u);
        expect(resultado).not.toMatch(/^\s|\s$|\s{2}/u);
      }),
    );
  });
});

describe('abreviarAutor', () => {
  it.each([
    ['Andrea Gómez', 'Andrea G.'],
    ['María Fernanda Gómez Pérez', 'María P.'],
    ['Andrea', 'Andrea'],
    ['  ana   lópez  ', 'ana L.'],
    ['Juan Ñáñez', 'Juan Ñ.'],
    ['', 'Una familia'],
    ['   ', 'Una familia'],
  ])('«%s» → «%s»', (nombre, esperado) => {
    expect(abreviarAutor(nombre)).toBe(esperado);
  });

  it('nunca revela el apellido completo', () => {
    expect(abreviarAutor('Andrea Gómez Restrepo')).not.toContain('Gómez');
  });
});

describe('Resena', () => {
  const datos = (cambios = {}) => ({
    id: idDePrueba<'Resena'>(),
    cuidadorId: idDePrueba<'Cuidador'>(),
    servicioId: idDePrueba(),
    nombreDelAutor: 'Andrea Gómez',
    calificacion: 5,
    comentario: 'Muy puntual y cariñosa.',
    ahora: AHORA,
    ...cambios,
  });

  it('crea la reseña con el autor abreviado y sin ocultar', () => {
    const resena = Resena.crear(datos());

    expect(resena).toMatchObject({
      autorVisible: 'Andrea G.',
      calificacion: 5,
      comentario: 'Muy puntual y cariñosa.',
      oculta: false,
      creadaEn: AHORA,
    });
  });

  it.each([undefined, null, '', '   '])(
    'un comentario %j queda sin comentario',
    (comentario) => {
      expect(Resena.crear(datos({ comentario })).comentario).toBeNull();
    },
  );

  it('acepta un comentario de exactamente 500 caracteres y rechaza uno de 501', () => {
    expect(
      Resena.crear(datos({ comentario: 'a'.repeat(500) })).comentario,
    ).toHaveLength(500);
    expect(() => Resena.crear(datos({ comentario: 'a'.repeat(501) }))).toThrow(
      expect.objectContaining({ codigo: 'resena.comentario_muy_largo' }),
    );
  });

  it.each([0, 6, 2.5, -1, Number.NaN])(
    'rechaza la calificación %s',
    (calificacion) => {
      expect(() => Resena.crear(datos({ calificacion }))).toThrow(
        expect.objectContaining({ codigo: 'resena.calificacion_invalida' }),
      );
    },
  );
});

describe('Verificacion', () => {
  const aprobada = (vigenteHasta: FechaCivil | null) =>
    Verificacion.aprobadaFueraDeLinea({
      id: idDePrueba<'Verificacion'>(),
      cuidadorId: idDePrueba<'Cuidador'>(),
      control: 'antecedentes',
      revisadoPor: 'admin-1',
      ahora: AHORA,
      vigenteHasta,
    });

  it('nace aprobada, con quién la revisó y cuándo', () => {
    const verificacion = aprobada(null);

    expect(verificacion).toMatchObject({
      estado: 'aprobada',
      revisadoPor: 'admin-1',
      revisadoEn: AHORA,
      motivoDeRechazo: null,
    });
  });

  it('exige decir quién la revisó', () => {
    expect(() =>
      Verificacion.aprobadaFueraDeLinea({
        id: idDePrueba<'Verificacion'>(),
        cuidadorId: idDePrueba<'Cuidador'>(),
        control: 'titulos',
        revisadoPor: '  ',
        ahora: AHORA,
        vigenteHasta: null,
      }),
    ).toThrow(expect.objectContaining({ codigo: 'verificacion.sin_revisor' }));
  });

  it('vale hasta su último día y deja de valer al siguiente', () => {
    const verificacion = aprobada(FechaCivil.desdeTexto('2026-12-31'));

    expect(verificacion.estaVigente(FechaCivil.desdeTexto('2026-12-31'))).toBe(
      true,
    );
    expect(verificacion.estaVigente(FechaCivil.desdeTexto('2027-01-01'))).toBe(
      false,
    );
  });

  it('sin fecha de vigencia nunca vence', () => {
    expect(
      aprobada(null).estaVigente(FechaCivil.desdeTexto('2099-12-31')),
    ).toBe(true);
  });

  it.each(['pendiente', 'rechazada', 'vencida'] as const)(
    'una verificación %s no vale',
    (estado) => {
      const verificacion = Verificacion.reconstruir({
        id: idDePrueba<'Verificacion'>(),
        cuidadorId: idDePrueba<'Cuidador'>(),
        control: 'antecedentes',
        estado,
        revisadoPor: null,
        revisadoEn: null,
        motivoDeRechazo: estado === 'rechazada' ? 'No coincide' : null,
        vigenteHasta: null,
        creadoEn: AHORA,
      });

      expect(
        verificacion.estaVigente(FechaCivil.desdeTexto('2026-10-21')),
      ).toBe(false);
    },
  );
});

describe('crearFiltros', () => {
  it('sin nada pedido no filtra por nada', () => {
    expect(crearFiltros({})).toEqual({});
  });

  it('normaliza la búsqueda y la zona como las columnas de la base', () => {
    expect(
      crearFiltros({ busqueda: ' JOSÉ ', zona: 'Laureles, Medellín' }),
    ).toEqual({
      busqueda: 'jose',
      zona: 'laureles medellin',
    });
  });

  it.each(['', '   ', undefined])('un texto vacío (%j) se ignora', (texto) => {
    expect(
      crearFiltros({
        busqueda: texto,
        zona: texto,
        especialidad: texto,
        jornada: texto,
      }),
    ).toEqual({});
  });

  it('acepta una especialidad, una jornada y una tarifa válidas', () => {
    expect(
      crearFiltros({
        especialidad: 'enfermeria',
        jornada: 'tarde',
        tarifaMaxima: 25_000,
      }),
    ).toEqual({
      especialidad: 'enfermeria',
      jornada: 'tarde',
      tarifaMaxima: 25_000,
    });
  });

  it.each([
    [
      'una especialidad que no existe',
      { especialidad: 'magia' },
      'especialidad.invalida',
    ],
    ['una jornada que no existe', { jornada: 'madrugada' }, 'jornada.invalida'],
    ['una tarifa de cero', { tarifaMaxima: 0 }, 'filtro.tarifa_invalida'],
    ['una tarifa negativa', { tarifaMaxima: -5 }, 'filtro.tarifa_invalida'],
    [
      'una tarifa con decimales',
      { tarifaMaxima: 1.5 },
      'filtro.tarifa_invalida',
    ],
    [
      'una búsqueda enorme',
      { busqueda: 'a'.repeat(101) },
      'filtro.busqueda_muy_largo',
    ],
  ])('rechaza %s', (_caso, entrada, codigo) => {
    expect(() => crearFiltros(entrada)).toThrow(
      expect.objectContaining({ codigo }),
    );
  });
});

describe('limiteDe', () => {
  it('por defecto son 20', () => {
    expect(limiteDe(undefined)).toBe(LIMITE_POR_DEFECTO);
    expect(LIMITE_POR_DEFECTO).toBe(20);
  });

  it('acepta de 1 a 50', () => {
    expect(limiteDe(1)).toBe(1);
    expect(limiteDe(LIMITE_MAXIMO)).toBe(50);
  });

  it.each([0, 51, -1, 2.5, Number.NaN])('rechaza %s', (limite) => {
    expect(() => limiteDe(limite)).toThrow(
      expect.objectContaining({ codigo: 'paginacion.limite_invalido' }),
    );
  });
});

describe('cursor', () => {
  const cursor = {
    calificacion: 4.9,
    tarifaHora: 20_000,
    id: '0198aaaa-0000-7000-8000-000000000001',
  };

  it('se codifica y se decodifica sin perder nada', () => {
    expect(decodificarCursor(codificarCursor(cursor))).toEqual(cursor);
  });

  it('es texto seguro para una URL', () => {
    expect(codificarCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['texto cualquiera', 'esto-no-es-un-cursor'],
    ['vacío', ''],
    ['JSON que no es un objeto', Buffer.from('"hola"').toString('base64url')],
    [
      'sin id',
      Buffer.from(
        JSON.stringify({ calificacion: 4, tarifaHora: 100 }),
      ).toString('base64url'),
    ],
    [
      'calificación fuera de rango',
      Buffer.from(JSON.stringify({ ...cursor, calificacion: 9 })).toString(
        'base64url',
      ),
    ],
    [
      'tarifa negativa',
      Buffer.from(JSON.stringify({ ...cursor, tarifaHora: -1 })).toString(
        'base64url',
      ),
    ],
    [
      'un id con una inyección',
      Buffer.from(JSON.stringify({ ...cursor, id: "x'; drop table" })).toString(
        'base64url',
      ),
    ],
  ])('rechaza %s', (_caso, texto) => {
    expect(() => decodificarCursor(texto)).toThrow(
      expect.objectContaining({ codigo: 'paginacion.cursor_invalido' }),
    );
  });
});
