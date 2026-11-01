// Ensayo de restauración (M10): saca un respaldo de la base, lo restaura en una base NUEVA y comprueba que cada tabla
// quedó con exactamente las mismas filas. Un respaldo que nunca se restauró no es un respaldo.
//
//   npm run bd:probar-restauracion
//
// Usa el Postgres del docker-compose (contenedor `seniory_postgres`) y la URL_BASE_DE_DATOS de tu .env. No toca la
// base original: solo lee. La base de ensayo se borra al terminar. En producción el ensayo se hace con el respaldo
// del proveedor (ver docs/OPERACION.md); este script prueba el mismo procedimiento en local.
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const CONTENEDOR = process.env.CONTENEDOR_DE_BD ?? 'seniory_postgres';
const url = process.env.URL_BASE_DE_DATOS;
if (!url) {
  console.error('Falta URL_BASE_DE_DATOS.');
  process.exit(1);
}

const origen = new URL(url);
const usuario = decodeURIComponent(origen.username);
const baseOrigen = origen.pathname.slice(1);
const baseEnsayo = `restauracion_${Date.now()}`;
const archivo = `/tmp/${baseEnsayo}.dump`;

const dentro = (...args) =>
  execFileSync('docker', ['exec', CONTENEDOR, ...args], { encoding: 'utf8' });

function conexionA(base) {
  const direccion = new URL(url);
  direccion.pathname = `/${base}`;
  return new pg.Client({ connectionString: direccion.toString() });
}

// Cuántas filas tiene cada tabla de negocio, contadas de verdad (no estadísticas).
async function contarFilas(base) {
  const cliente = conexionA(base);
  await cliente.connect();
  try {
    const { rows } = await cliente.query(
      `select table_schema, table_name from information_schema.tables
       where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
       order by 1, 2`,
    );
    const conteos = {};
    for (const { table_schema: esquema, table_name: tabla } of rows) {
      const { rows: fila } = await cliente.query(
        `select count(*)::int as total from "${esquema}"."${tabla}"`,
      );
      conteos[`${esquema}.${tabla}`] = fila[0].total;
    }
    return conteos;
  } finally {
    await cliente.end();
  }
}

let creada = false;
try {
  console.log(`1/4 Respaldo de «${baseOrigen}» (pg_dump, formato personalizado)…`);
  dentro('pg_dump', '-U', usuario, '-Fc', '-d', baseOrigen, '-f', archivo);

  console.log(`2/4 Restauración en una base nueva («${baseEnsayo}»)…`);
  dentro('createdb', '-U', usuario, baseEnsayo);
  creada = true;
  dentro('pg_restore', '-U', usuario, '--no-owner', '-d', baseEnsayo, archivo);

  console.log('3/4 Comparando las filas de cada tabla…');
  const antes = await contarFilas(baseOrigen);
  const despues = await contarFilas(baseEnsayo);
  const diferencias = Object.keys(antes).filter(
    (tabla) => antes[tabla] !== despues[tabla],
  );
  const faltantes = Object.keys(antes).filter((tabla) => !(tabla in despues));
  const total = Object.values(antes).reduce((suma, n) => suma + n, 0);

  console.log(
    `4/4 ${Object.keys(antes).length} tablas, ${total} filas en el original.`,
  );
  if (diferencias.length > 0 || faltantes.length > 0) {
    for (const tabla of [...diferencias, ...faltantes]) {
      console.error(
        `  ✗ ${tabla}: original ${antes[tabla]}, restaurada ${despues[tabla] ?? 'no existe'}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log('✔ La restauración es idéntica: todas las tablas coinciden.');
  }
} catch (error) {
  console.error(
    'El ensayo de restauración falló:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  // Limpieza: la base de ensayo y el archivo del respaldo, pase lo que pase.
  try {
    if (creada) dentro('dropdb', '-U', usuario, '--if-exists', baseEnsayo);
    dentro('rm', '-f', archivo);
  } catch {
    console.error(`(No se pudo limpiar: borra «${baseEnsayo}» a mano.)`);
  }
}
