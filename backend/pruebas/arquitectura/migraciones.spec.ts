import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Arranque seguro (M10): las migraciones se aplican TAL CUAL en producción, así que no pueden traer datos de prueba.
// Lo único que se permite insertar son datos de referencia que el sistema necesita para funcionar, y cada uno está
// aquí con su razón. Agregar otro obliga a venir a esta lista, es decir, a que alguien lo revise.
const CARPETA = join(process.cwd(), 'drizzle');

const DATOS_DE_REFERENCIA_PERMITIDOS: Record<string, string> = {
  '"pagos"."politicas_de_precios"':
    'La política de comisiones v1 (8 % familia, 10 % profesional): sin ella no se puede cotizar.',
  '"reservas"."franjas"':
    'Las tres jornadas y sus horarios (mañana, tarde y noche): sin ellas no se puede reservar.',
  '"directorio"."horarios_libres"':
    'Migración 0016: backfill del horario semanal de cada cuidador YA existente, a partir de su propia ' +
    'disponibilidad por jornada (nunca un valor literal ni un cuidador de ejemplo).',
};

function migraciones(): { nombre: string; sql: string }[] {
  return readdirSync(CARPETA)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort()
    .map((nombre) => ({
      nombre,
      sql: readFileSync(join(CARPETA, nombre), 'utf8'),
    }));
}

// Quita los comentarios (los de línea y los de bloque) para no confundir una frase con una sentencia.
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

describe('las migraciones no traen datos de prueba', () => {
  it('hay migraciones que revisar', () => {
    expect(migraciones().length).toBeGreaterThan(5);
  });

  it('solo insertan los datos de referencia permitidos', () => {
    const insertadas = new Set<string>();
    for (const { sql } of migraciones()) {
      for (const coincidencia of sinComentarios(sql).matchAll(
        /\binsert\s+into\s+("?[\w]+"?\."?[\w]+"?|"?[\w]+"?)/gi,
      )) {
        insertadas.add((coincidencia[1] ?? '').toLowerCase());
      }
    }

    const permitidas = Object.keys(DATOS_DE_REFERENCIA_PERMITIDOS).map((t) =>
      t.toLowerCase(),
    );
    expect([...insertadas].filter((t) => !permitidas.includes(t))).toEqual([]);
  });

  it('no cargan semillas, cuentas ni correos de ejemplo', () => {
    for (const { nombre, sql } of migraciones()) {
      const texto = sinComentarios(sql).toLowerCase();
      expect(texto, nombre).not.toMatch(/@\w+\.(invalid|test|example)/);
      expect(texto, nombre).not.toMatch(/\binsert\s+into\s+"?identidad"?\./);
      // `directorio` admite UNA excepción: una sentencia INSERT ... SELECT que reestructura datos YA
      // existentes de la propia persona (un backfill, como el horario semanal que reemplazó la
      // disponibilidad por jornada, migración 0016). Nunca inserta un valor literal ni trae datos de otro
      // lado: solo puede mover lo que ya estaba guardado para ese mismo cuidador. Un INSERT con valores
      // literales (una cuenta o un cuidador de ejemplo) sigue prohibido.
      for (const sentencia of sinComentarios(sql)
        .toLowerCase()
        .split('--> statement-breakpoint')) {
        if (!/\binsert\s+into\s+"?directorio"?\./.test(sentencia)) continue;
        const esBackfillDesdeLaMismaTabla =
          /\bselect\b/.test(sentencia) &&
          /\bfrom\s+"?directorio"?\./.test(sentencia);
        expect(esBackfillDesdeLaMismaTabla, `${nombre}: ${sentencia}`).toBe(
          true,
        );
      }
    }
  });

  it('no desactivan triggers ni cambian la seguridad de la base', () => {
    for (const { nombre, sql } of migraciones()) {
      const texto = sinComentarios(sql).toLowerCase();
      expect(texto, nombre).not.toMatch(/disable\s+trigger/);
      expect(texto, nombre).not.toMatch(
        /\bcreate\s+role\b|\balter\s+role\b|\bgrant\b/,
      );
    }
  });
});
