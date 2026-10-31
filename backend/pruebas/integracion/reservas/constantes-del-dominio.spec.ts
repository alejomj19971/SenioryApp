import { JORNADAS } from '../../../src/compartido/dominio/jornada.js';
import { HORARIOS_DE_FRANJA } from '../../../src/reservas/dominio/franjas.js';
import {
  HORAS_MAXIMAS,
  HORAS_MINIMAS,
} from '../../../src/reservas/dominio/servicio.js';
import {
  ESTADOS_ACTIVOS,
  ESTADOS_DE_SERVICIO,
  MEDIOS_DE_PAGO,
} from '../../../src/reservas/dominio/valores-cerrados.js';
import { conectarBd } from '../../soporte/bd.js';

// Los valores permitidos viven en DOS lugares: las constantes del dominio y los CHECK/datos de la base. Si
// alguien cambia uno y olvida el otro, el dominio aceptaría algo que la base rechaza (o al revés). Esta prueba
// lo detecta comparando los dos.
describe('constantes del dominio y base de datos (reservas)', () => {
  const bd = conectarBd();

  afterAll(async () => {
    await bd.end();
  });

  async function definicionDelCheck(restriccion: string): Promise<string> {
    const { rows } = await bd.query<{ definicion: string }>(
      `select pg_get_constraintdef(c.oid) as definicion
       from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where n.nspname = 'reservas' and c.conname = $1`,
      [restriccion],
    );
    const definicion = rows[0]?.definicion;
    if (definicion === undefined) {
      throw new Error(`No existe el CHECK ${restriccion}`);
    }
    return definicion;
  }

  const literales = (definicion: string) =>
    [...definicion.matchAll(/'([^']+)'::text/g)]
      .map((m) => m[1] as string)
      .sort();

  it.each([
    ['estados', 'servicios_estado_valido', ESTADOS_DE_SERVICIO],
    ['medios de pago', 'servicios_medio_valido', MEDIOS_DE_PAGO],
    ['jornadas', 'franjas_jornada_valida', JORNADAS],
  ] as const)(
    'los %s coinciden (%s)',
    async (_nombre, restriccion, constantes) => {
      expect(literales(await definicionDelCheck(restriccion))).toEqual(
        [...constantes].sort(),
      );
    },
  );

  it('las horas del servicio van de 1 a 8, como en el CHECK', async () => {
    const definicion = await definicionDelCheck('servicios_horas_validas');

    // Postgres guarda «between 1 and 8» como dos comparaciones.
    expect(definicion).toContain(`horas >= ${HORAS_MINIMAS}`);
    expect(definicion).toContain(`horas <= ${HORAS_MAXIMAS}`);
  });

  it('los estados que ocupan la franja coinciden con el índice único parcial', async () => {
    const { rows } = await bd.query<{ definicion: string }>(
      `select indexdef as definicion from pg_indexes
       where schemaname = 'reservas' and indexname = 'servicios_sin_doble_reserva'`,
    );

    expect(literales(rows[0]?.definicion ?? '')).toEqual(
      [...ESTADOS_ACTIVOS].sort(),
    );
  });

  it('los horarios de las franjas coinciden con la tabla `reservas.franjas`', async () => {
    const { rows } = await bd.query<{
      jornada: string;
      inicio: number;
      fin: number;
      cruza: boolean;
    }>(
      `select jornada,
              extract(hour from hora_inicio)::int * 60 + extract(minute from hora_inicio)::int as inicio,
              extract(hour from hora_fin)::int * 60 + extract(minute from hora_fin)::int as fin,
              cruza_medianoche as cruza
       from reservas.franjas order by jornada`,
    );

    const esperado = JORNADAS.map((jornada) => {
      const { inicio, fin } = HORARIOS_DE_FRANJA[jornada];
      return {
        jornada,
        inicio,
        // En la tabla la hora de fin es de reloj (06:00); en el dominio, minutos desde el inicio del día.
        fin: fin % 1440,
        cruza: fin > 1440,
      };
    }).sort((a, b) => a.jornada.localeCompare(b.jornada));
    expect(rows).toEqual(esperado);
  });
});
