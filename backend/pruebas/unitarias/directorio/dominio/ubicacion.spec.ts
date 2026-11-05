import fc from 'fast-check';
import {
  LATITUD_MAXIMA,
  LATITUD_MINIMA,
  LONGITUD_MAXIMA,
  LONGITUD_MINIMA,
  distanciaKm,
  validarUbicacion,
} from '../../../../src/directorio/dominio/ubicacion.js';

// Puntos reales conocidos, para anclar la fórmula a algo verificable (no solo a sus propias propiedades).
const MEDELLIN = { latitud: 6.244203, longitud: -75.581212 };
const BOGOTA = { latitud: 4.710989, longitud: -74.072092 };
const SAN_ANDRES = { latitud: 12.5847, longitud: -81.7006 };

describe('validarUbicacion', () => {
  it('acepta un punto dentro de Colombia, incluida la isla de San Andrés', () => {
    expect(validarUbicacion(MEDELLIN)).toEqual(MEDELLIN);
    expect(validarUbicacion(SAN_ANDRES)).toEqual(SAN_ANDRES);
  });

  it.each([
    ['Nueva York', { latitud: 40.7128, longitud: -74.006 }],
    ['el polo norte', { latitud: 90, longitud: 0 }],
    ['NaN en la latitud', { latitud: Number.NaN, longitud: -75 }],
    [
      'infinito en la longitud',
      { latitud: 6, longitud: Number.POSITIVE_INFINITY },
    ],
    [
      'justo al norte del límite',
      { latitud: LATITUD_MAXIMA + 0.01, longitud: -75 },
    ],
    [
      'justo al sur del límite',
      { latitud: LATITUD_MINIMA - 0.01, longitud: -75 },
    ],
    [
      'justo al este del límite',
      { latitud: 6, longitud: LONGITUD_MAXIMA + 0.01 },
    ],
    [
      'justo al oeste del límite',
      { latitud: 6, longitud: LONGITUD_MINIMA - 0.01 },
    ],
  ])('rechaza %s', (_caso, punto) => {
    expect(() => validarUbicacion(punto)).toThrow(
      expect.objectContaining({
        codigo: 'ubicacion.fuera_de_colombia',
      }) as Error,
    );
  });

  it('acepta justo los bordes de la caja', () => {
    expect(() =>
      validarUbicacion({ latitud: LATITUD_MAXIMA, longitud: LONGITUD_MAXIMA }),
    ).not.toThrow();
    expect(() =>
      validarUbicacion({ latitud: LATITUD_MINIMA, longitud: LONGITUD_MINIMA }),
    ).not.toThrow();
  });
});

describe('distanciaKm', () => {
  it('un punto consigo mismo está a 0 km', () => {
    expect(distanciaKm(MEDELLIN, MEDELLIN)).toBeCloseTo(0, 9);
  });

  it('Medellín-Bogotá en línea recta es de verdad alrededor de 240 km', () => {
    const distancia = distanciaKm(MEDELLIN, BOGOTA);
    expect(distancia).toBeGreaterThan(200);
    expect(distancia).toBeLessThan(280);
  });

  it('propiedad: es simétrica', () => {
    const colombia = fc.record({
      latitud: fc.float({
        min: LATITUD_MINIMA,
        max: LATITUD_MAXIMA,
        noNaN: true,
      }),
      longitud: fc.float({
        min: LONGITUD_MINIMA,
        max: LONGITUD_MAXIMA,
        noNaN: true,
      }),
    });
    fc.assert(
      fc.property(colombia, colombia, (a, b) => {
        expect(distanciaKm(a, b)).toBeCloseTo(distanciaKm(b, a), 6);
      }),
    );
  });

  it('propiedad: nunca es negativa y nunca pasa de la mitad de la vuelta a la Tierra', () => {
    const colombia = fc.record({
      latitud: fc.float({
        min: LATITUD_MINIMA,
        max: LATITUD_MAXIMA,
        noNaN: true,
      }),
      longitud: fc.float({
        min: LONGITUD_MINIMA,
        max: LONGITUD_MAXIMA,
        noNaN: true,
      }),
    });
    fc.assert(
      fc.property(colombia, colombia, (a, b) => {
        const distancia = distanciaKm(a, b);
        expect(distancia).toBeGreaterThanOrEqual(0);
        expect(distancia).toBeLessThan(20_038); // π × radio de la Tierra
      }),
    );
  });
});
