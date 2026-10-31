import { cuidadorDePrueba } from '../../../soporte/directorio.js';
import { AHORA } from '../../../soporte/identidad.js';

describe('Cuidador.registrarServicioCompletado', () => {
  it('empieza en cero y suma de uno en uno', () => {
    const cuidador = cuidadorDePrueba();
    expect(cuidador.serviciosCompletados).toBe(0);

    cuidador.registrarServicioCompletado(AHORA);
    cuidador.registrarServicioCompletado(AHORA);

    expect(cuidador.serviciosCompletados).toBe(2);
  });

  it('sube la versión y actualiza la fecha de cambio', () => {
    const cuidador = cuidadorDePrueba();
    const versionAntes = cuidador.version;
    const despues = new Date('2026-11-01T10:00:00.000Z');

    cuidador.registrarServicioCompletado(despues);

    expect(cuidador.version).toBe(versionAntes + 1);
    expect(cuidador.actualizadoEn).toEqual(despues);
  });

  it('no toca la calificación ni la visibilidad', () => {
    const cuidador = cuidadorDePrueba();

    cuidador.registrarServicioCompletado(AHORA);

    expect(cuidador.calificacion()).toBeNull();
    expect(cuidador.cantidadResenas).toBe(0);
    expect(cuidador.visible).toBe(true);
  });
});
