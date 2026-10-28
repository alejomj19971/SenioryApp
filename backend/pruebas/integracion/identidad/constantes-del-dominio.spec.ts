import { ROLES } from '../../../src/compartido/dominio/rol.js';
import {
  CALIDADES_DE_CONSENTIMIENTO,
  FINALIDADES_DE_CONSENTIMIENTO,
  PARENTESCOS,
} from '../../../src/identidad/dominio/valores-cerrados.js';
import { conectarBd } from '../../soporte/bd.js';

// Los valores permitidos viven en DOS lugares: las constantes del dominio y los CHECK de la base.
// Si alguien agrega uno en un lado y olvida el otro, el dominio aceptaría algo que la base rechaza
// (o al revés). Esta prueba lo detecta comparando los dos.
describe('constantes del dominio y CHECK de la base de datos', () => {
  const bd = conectarBd();

  afterAll(async () => {
    await bd.end();
  });

  // Los valores literales de un CHECK de tipo «columna IN (...)».
  async function valoresDelCheck(restriccion: string): Promise<string[]> {
    const { rows } = await bd.query<{ definicion: string }>(
      `select pg_get_constraintdef(c.oid) as definicion
       from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where n.nspname = 'identidad' and c.conname = $1`,
      [restriccion],
    );
    const definicion = rows[0]?.definicion;
    if (definicion === undefined)
      throw new Error(`No existe el CHECK ${restriccion}`);
    return [...definicion.matchAll(/'([^']+)'::text/g)]
      .map((m) => m[1] as string)
      .sort();
  }

  it.each([
    ['roles', 'usuarios_rol_valido', ROLES],
    ['parentescos', 'vinculos_parentesco_valido', PARENTESCOS],
    ['estados de vínculo', 'vinculos_estado_valido', ['activo', 'revocado']],
    ['estados de usuario', 'usuarios_estado_valido', ['activo', 'eliminado']],
    [
      'finalidades de consentimiento',
      'consentimientos_finalidad_valida',
      FINALIDADES_DE_CONSENTIMIENTO,
    ],
    [
      'calidades de consentimiento',
      'consentimientos_calidad_valida',
      CALIDADES_DE_CONSENTIMIENTO,
    ],
  ])('los %s coinciden (%s)', async (_nombre, restriccion, constantes) => {
    expect(await valoresDelCheck(restriccion)).toEqual([...constantes].sort());
  });
});
