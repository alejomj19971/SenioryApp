import { idDesdeTexto } from '../../../../src/compartido/dominio/id.js';
import { GeneradorDeIdsUuidV7 } from '../../../../src/compartido/infraestructura/generador-de-ids-uuid-v7.js';
import { RelojDelSistema } from '../../../../src/compartido/infraestructura/reloj-del-sistema.js';
import {
  GeneradorDeIdsSecuencial,
  RelojFalso,
} from '../../../soporte/dobles.js';

describe('GeneradorDeIdsUuidV7', () => {
  const generador = new GeneradorDeIdsUuidV7();

  it('genera UUID versión 7 válidos', () => {
    const id = generador.nuevo<'Prueba'>();
    expect(id[14]).toBe('7');
    expect(idDesdeTexto(id)).toBe(id);
  });

  it('los IDs salen ordenados por creación, incluso en el mismo milisegundo', () => {
    const ids = Array.from({ length: 2_000 }, () => generador.nuevo());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('el prefijo lleva la hora de creación', () => {
    const antes = Date.now();
    const id = generador.nuevo();
    const milisegundos = parseInt(id.replace('-', '').slice(0, 12), 16);
    expect(milisegundos).toBeGreaterThanOrEqual(antes);
    expect(milisegundos).toBeLessThanOrEqual(Date.now());
  });
});

describe('RelojDelSistema', () => {
  it('devuelve la hora actual', () => {
    const antes = Date.now();
    const ahora = new RelojDelSistema().ahora().getTime();
    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(Date.now());
  });
});

describe('dobles de prueba', () => {
  it('RelojFalso se fija, avanza y no deja modificar su instante desde fuera', () => {
    const reloj = new RelojFalso('2026-10-21T15:00:00.000Z');
    reloj.ahora().setFullYear(1990);
    expect(reloj.ahora().toISOString()).toBe('2026-10-21T15:00:00.000Z');
    reloj.avanzar(90 * 60 * 1000);
    expect(reloj.ahora().toISOString()).toBe('2026-10-21T16:30:00.000Z');
    reloj.fijar('2027-01-01T00:00:00.000Z');
    expect(reloj.ahora().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('GeneradorDeIdsSecuencial da UUID válidos y predecibles', () => {
    const generador = new GeneradorDeIdsSecuencial();
    const primero = generador.nuevo();
    expect(primero).toBe('00000000-0000-7000-8000-000000000001');
    expect(idDesdeTexto(primero)).toBe(primero);
    expect(generador.nuevo()).toBe('00000000-0000-7000-8000-000000000002');
  });
});
