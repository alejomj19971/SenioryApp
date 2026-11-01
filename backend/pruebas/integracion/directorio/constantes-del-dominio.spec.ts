import { JORNADAS } from '../../../src/compartido/dominio/jornada.js';
import {
  CONTROLES_DE_VERIFICACION,
  ESPECIALIDADES,
  ESTADOS_DE_CUIDADOR,
  ESTADOS_DE_DOCUMENTO,
  ESTADOS_DE_VERIFICACION,
  TIPOS_DE_DOCUMENTO,
} from '../../../src/directorio/dominio/valores-cerrados.js';
import { conectarBd } from '../../soporte/bd.js';

// Los valores permitidos viven en DOS lugares: las constantes del dominio y los CHECK de la base. Si alguien
// agrega uno en un lado y olvida el otro, el dominio aceptaría algo que la base rechaza (o al revés). Esta
// prueba lo detecta comparando los dos.
describe('constantes del dominio y CHECK de la base de datos (directorio)', () => {
  const bd = conectarBd();

  afterAll(async () => {
    await bd.end();
  });

  // Los valores literales de un CHECK de tipo «columna IN (...)» o «columna <@ array[...]».
  async function valoresDelCheck(restriccion: string): Promise<string[]> {
    const { rows } = await bd.query<{ definicion: string }>(
      `select pg_get_constraintdef(c.oid) as definicion
       from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where n.nspname = 'directorio' and c.conname = $1`,
      [restriccion],
    );
    const definicion = rows[0]?.definicion;
    if (definicion === undefined) {
      throw new Error(`No existe el CHECK ${restriccion}`);
    }
    return [...definicion.matchAll(/'([^']+)'::text/g)]
      .map((m) => m[1] as string)
      .sort();
  }

  it.each([
    [
      'especialidades',
      'cuidadores_especialidad_valida',
      ESPECIALIDADES as readonly string[],
    ],
    [
      'estados de cuidador',
      'cuidadores_estado_valido',
      ESTADOS_DE_CUIDADOR as readonly string[],
    ],
    [
      'jornadas',
      'cuidadores_disponibilidad_valida',
      JORNADAS as readonly string[],
    ],
    [
      'controles de verificación',
      'verificaciones_control_valido',
      CONTROLES_DE_VERIFICACION as readonly string[],
    ],
    [
      'estados de verificación',
      'verificaciones_estado_valido',
      ESTADOS_DE_VERIFICACION as readonly string[],
    ],
    [
      'estados de documento',
      'documentos_estado_valido',
      ESTADOS_DE_DOCUMENTO as readonly string[],
    ],
  ])('los %s coinciden (%s)', async (_nombre, restriccion, constantes) => {
    expect(await valoresDelCheck(restriccion)).toEqual([...constantes].sort());
  });

  // La base admite además «foto», que todavía no se sube por la API: todo tipo del dominio tiene que caber.
  it('todos los tipos de documento del dominio caben en la base de datos', async () => {
    const enLaBase = await valoresDelCheck('documentos_tipo_valido');

    expect(enLaBase).toEqual(expect.arrayContaining([...TIPOS_DE_DOCUMENTO]));
    expect(
      enLaBase.filter(
        (t) => !(TIPOS_DE_DOCUMENTO as readonly string[]).includes(t),
      ),
    ).toEqual(['foto']);
  });
});
