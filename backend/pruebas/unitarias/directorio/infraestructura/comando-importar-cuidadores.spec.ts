import { ConflictoDeEstado } from '../../../../src/compartido/dominio/errores.js';
import type { EntradaDeCuidadorImportado } from '../../../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import {
  ErrorDeArchivo,
  importarEntradas,
  leerArchivoDeImportacion,
  type CasoImportarCuidador,
} from '../../../../src/directorio/infraestructura/entrada/consola/comando-importar-cuidadores.js';

const REVISOR = '0198aaaa-0000-7000-8000-000000000001';

function cuidadorCrudo(cambios: Record<string, unknown> = {}) {
  return {
    nombre: 'Marta Ramírez',
    correo: 'marta@ejemplo.co',
    telefono: '+573001234567',
    especialidad: 'enfermeria',
    titulo: 'Enfermera profesional',
    aniosExperiencia: 6,
    tarifaHora: 25000,
    zona: 'Laureles',
    disponibilidad: ['manana', 'tarde'],
    bio: 'Cuido con paciencia.',
    controles: [
      { control: 'antecedentes', vigenteHasta: '2027-03-31' },
      { control: 'titulos', vigenteHasta: null },
      { control: 'psicotecnica', vigenteHasta: '2027-03-31' },
    ],
    ...cambios,
  };
}

const archivo = (cuidadores: unknown[], revisadoPor: unknown = REVISOR) =>
  JSON.stringify({ revisadoPor, cuidadores });

describe('leerArchivoDeImportacion', () => {
  it('convierte un archivo válido en entradas del caso de uso', async () => {
    const resultado = await leerArchivoDeImportacion(
      archivo([cuidadorCrudo()]),
      '/datos',
    );

    expect(resultado.revisadoPor).toBe(REVISOR);
    expect(resultado.cuidadores).toEqual([
      {
        nombre: 'Marta Ramírez',
        correo: 'marta@ejemplo.co',
        telefono: '+573001234567',
        especialidad: 'enfermeria',
        titulo: 'Enfermera profesional',
        aniosExperiencia: 6,
        tarifaHora: 25000,
        zona: 'Laureles',
        disponibilidad: ['manana', 'tarde'],
        bio: 'Cuido con paciencia.',
        controles: [
          { control: 'antecedentes', vigenteHasta: '2027-03-31' },
          { control: 'titulos', vigenteHasta: null },
          { control: 'psicotecnica', vigenteHasta: '2027-03-31' },
        ],
      },
    ]);
  });

  it('lee la hoja de vida desde una ruta relativa al archivo', async () => {
    const leidas: string[] = [];
    const resultado = await leerArchivoDeImportacion(
      archivo([cuidadorCrudo({ hojaDeVida: 'hojas/marta.pdf' })]),
      '/datos',
      (ruta) => {
        leidas.push(ruta);
        return Promise.resolve(Buffer.from('%PDF-1.4'));
      },
    );

    expect(leidas).toHaveLength(1);
    expect(leidas[0]?.replaceAll('\\', '/')).toMatch(
      /\/datos\/hojas\/marta\.pdf$/,
    );
    expect(resultado.cuidadores[0]?.hojaDeVida?.nombreOriginal).toBe(
      'marta.pdf',
    );
  });

  it('explica cuando la hoja de vida no se puede leer', async () => {
    await expect(
      leerArchivoDeImportacion(
        archivo([cuidadorCrudo({ hojaDeVida: 'no-existe.pdf' })]),
        '/datos',
        () => Promise.reject(new Error('ENOENT')),
      ),
    ).rejects.toThrow(/Cuidador 1: no se pudo leer la hoja de vida/);
  });

  it('rechaza un JSON roto', async () => {
    await expect(
      leerArchivoDeImportacion('{ no es json', '/datos'),
    ).rejects.toThrow(new ErrorDeArchivo('El archivo no es un JSON válido'));
  });

  it.each([
    ['que la raíz no sea un objeto', '[]', /El archivo debe ser un objeto/],
    [
      'que falte «revisadoPor»',
      JSON.stringify({ cuidadores: [] }),
      /revisadoPor/,
    ],
    [
      'un «revisadoPor» que no es un UUID',
      archivo([cuidadorCrudo()], 'el-jefe'),
      /identificador/,
    ],
    ['que no haya cuidadores', archivo([]), /no trae ningún cuidador/],
    [
      'que «cuidadores» no sea una lista',
      JSON.stringify({ revisadoPor: REVISOR, cuidadores: {} }),
      /«cuidadores» debe ser una lista/,
    ],
  ])('rechaza %s', async (_nombre, contenido, mensaje) => {
    await expect(leerArchivoDeImportacion(contenido, '/datos')).rejects.toThrow(
      mensaje,
    );
  });

  it.each([
    [
      'un nombre numérico',
      { nombre: 42 },
      /Cuidador 1: «nombre» debe ser un texto/,
    ],
    [
      'una tarifa en texto',
      { tarifaHora: '25000' },
      /«tarifaHora» debe ser un número/,
    ],
    [
      'una especialidad desconocida',
      { especialidad: 'brujeria' },
      /especialidad/i,
    ],
    ['una jornada desconocida', { disponibilidad: ['madrugada'] }, /jornada/i],
    [
      'una disponibilidad que no es lista',
      { disponibilidad: 'tarde' },
      /«disponibilidad» debe ser una lista/,
    ],
    [
      'un control desconocido',
      { controles: [{ control: 'rut', vigenteHasta: null }] },
      /control/i,
    ],
    [
      'una vigencia que no es texto ni null',
      { controles: [{ control: 'titulos', vigenteHasta: 2027 }] },
      /«vigenteHasta»/,
    ],
    [
      'una hoja de vida que no es ruta',
      { hojaDeVida: 7 },
      /«hojaDeVida» debe ser una ruta/,
    ],
  ])('rechaza %s', async (_nombre, cambios, mensaje) => {
    await expect(
      leerArchivoDeImportacion(archivo([cuidadorCrudo(cambios)]), '/datos'),
    ).rejects.toThrow(mensaje);
  });

  it('dice cuál cuidador de la lista tiene el problema', async () => {
    await expect(
      leerArchivoDeImportacion(
        archivo([cuidadorCrudo(), cuidadorCrudo({ nombre: null })]),
        '/datos',
      ),
    ).rejects.toThrow(/Cuidador 2/);
  });
});

describe('importarEntradas', () => {
  const entrada = (nombre: string): EntradaDeCuidadorImportado =>
    ({ nombre, correo: `${nombre}@ejemplo.co` }) as EntradaDeCuidadorImportado;

  function caso(
    comportamiento: (
      nombre: string,
    ) => Promise<{ cuidadorId: string; usuarioId: string }>,
  ): CasoImportarCuidador {
    return { ejecutar: (e) => comportamiento(e.nombre) };
  }

  it('informa cada cuidador importado', async () => {
    const { mensajes, fallaron } = await importarEntradas(
      { revisadoPor: REVISOR, cuidadores: [entrada('Ana'), entrada('Luz')] },
      caso((nombre) =>
        Promise.resolve({ cuidadorId: `id-${nombre}`, usuarioId: 'u' }),
      ),
    );

    expect(fallaron).toBe(0);
    expect(mensajes).toEqual([
      'Importado: Ana (id id-Ana).',
      'Importado: Luz (id id-Luz).',
    ]);
  });

  it('un correo que ya tenía cuenta se informa como «ya existía» y no cuenta como fallo', async () => {
    const { mensajes, fallaron } = await importarEntradas(
      { revisadoPor: REVISOR, cuidadores: [entrada('Ana')] },
      caso(() =>
        Promise.reject(
          new ConflictoDeEstado('ya', 'usuario.correo_ya_registrado'),
        ),
      ),
    );

    expect(fallaron).toBe(0);
    expect(mensajes).toEqual(['Ya existía: Ana (Ana@ejemplo.co).']);
  });

  it('un fallo no detiene a los demás, y se cuenta', async () => {
    const { mensajes, fallaron } = await importarEntradas(
      {
        revisadoPor: REVISOR,
        cuidadores: [entrada('Ana'), entrada('Rota'), entrada('Luz')],
      },
      caso((nombre) =>
        nombre === 'Rota'
          ? Promise.reject(new Error('La tarifa debe ser mayor que cero'))
          : Promise.resolve({ cuidadorId: `id-${nombre}`, usuarioId: 'u' }),
      ),
    );

    expect(fallaron).toBe(1);
    expect(mensajes).toEqual([
      'Importado: Ana (id id-Ana).',
      'NO importado: Rota: La tarifa debe ser mayor que cero',
      'Importado: Luz (id id-Luz).',
    ]);
  });

  it('otro conflicto distinto del correo repetido sí es un fallo', async () => {
    const { fallaron } = await importarEntradas(
      { revisadoPor: REVISOR, cuidadores: [entrada('Ana')] },
      caso(() =>
        Promise.reject(
          new ConflictoDeEstado('otro', 'cuidador.usuario_ya_tiene_perfil'),
        ),
      ),
    );

    expect(fallaron).toBe(1);
  });
});
