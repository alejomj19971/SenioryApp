import pg from 'pg';

// El rol con el que corre la API en producción: puede LEER y ESCRIBIR datos, pero no cambiar la estructura de la base.
// Las migraciones las aplica OTRA cuenta (la dueña de las tablas). Así, si alguien explota una vulnerabilidad de la
// API (una inyección de SQL, por ejemplo), no puede borrar tablas, cambiar triggers ni leer el historial de migraciones.

// Tablas que son un libro de solo inserción: ni siquiera este rol las edita ni las borra (además del trigger de la
// base, que las protege de cualquiera que no sea el dueño).
export const TABLAS_DE_SOLO_INSERCION = [
  'compartido.auditoria',
  'pagos.movimientos_de_bolsa',
] as const;

// Esquemas del sistema o de la herramienta de migraciones: la API no los toca.
const ESQUEMAS_AJENOS = ['information_schema', 'public', 'drizzle'];

const NOMBRE_DE_ROL = /^[a-z_][a-z0-9_]{0,62}$/;

export function exigirNombreDeRol(rol: string): string {
  if (!NOMBRE_DE_ROL.test(rol)) {
    throw new Error(
      `El nombre de rol «${rol}» no es válido (minúsculas, números y guion bajo)`,
    );
  }
  return rol;
}

function ident(nombre: string): string {
  // Los nombres de esquema y de rol salen de la base de datos o ya pasaron por `exigirNombreDeRol`.
  return `"${nombre.replaceAll('"', '""')}"`;
}

// Las sentencias que dejan al rol con los permisos justos sobre estos esquemas. Son idempotentes: se pueden volver a
// correr después de cada migración (las tablas nuevas también quedan cubiertas por los permisos por defecto).
export function sentenciasDePermisos(
  rol: string,
  dueno: string,
  esquemas: readonly string[],
): string[] {
  const r = ident(exigirNombreDeRol(rol));
  const d = ident(dueno);
  const sentencias = [
    `ALTER ROLE ${r} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  ];
  for (const esquema of esquemas) {
    const e = ident(esquema);
    sentencias.push(
      `REVOKE ALL ON SCHEMA ${e} FROM ${r}`,
      `GRANT USAGE ON SCHEMA ${e} TO ${r}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${e} TO ${r}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${e} TO ${r}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${d} IN SCHEMA ${e} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${d} IN SCHEMA ${e} GRANT USAGE, SELECT ON SEQUENCES TO ${r}`,
    );
  }
  for (const tabla of TABLAS_DE_SOLO_INSERCION) {
    const [esquema, nombre] = tabla.split('.') as [string, string];
    if (esquemas.includes(esquema)) {
      sentencias.push(
        `REVOKE UPDATE, DELETE, TRUNCATE ON ${ident(esquema)}.${ident(nombre)} FROM ${r}`,
      );
    }
  }
  for (const ajeno of ESQUEMAS_AJENOS) {
    sentencias.push(`REVOKE ALL ON SCHEMA ${ident(ajeno)} FROM ${r}`);
  }
  return sentencias;
}

// Crea el rol (con contraseña) si no existe, o le cambia la contraseña si ya existe; y le da los permisos.
export async function aplicarRolDeAplicacion(
  urlDelDueno: string,
  rol: string,
  contrasena: string,
): Promise<{ esquemas: string[] }> {
  exigirNombreDeRol(rol);
  if (contrasena.length < 16) {
    throw new Error('La contraseña del rol debe tener al menos 16 caracteres');
  }
  const cliente = new pg.Client({
    connectionString: urlDelDueno,
    application_name: 'seniory-permisos',
  });
  await cliente.connect();
  try {
    const esquemas = (
      await cliente.query<{ nspname: string }>(
        `select nspname from pg_namespace
         where nspname !~ '^pg_' and nspname <> all ($1::text[]) order by nspname`,
        [ESQUEMAS_AJENOS],
      )
    ).rows.map((fila) => fila.nspname);
    const { rows } = await cliente.query<{ dueno: string }>(
      'select current_user as dueno',
    );
    const dueno = rows[0]?.dueno ?? '';
    const clave = cliente.escapeLiteral(contrasena);
    const existe = (
      await cliente.query('select 1 from pg_roles where rolname = $1', [rol])
    ).rowCount;
    await cliente.query('begin');
    try {
      await cliente.query(
        existe === 1
          ? `ALTER ROLE ${ident(rol)} WITH LOGIN PASSWORD ${clave}`
          : `CREATE ROLE ${ident(rol)} WITH LOGIN PASSWORD ${clave}`,
      );
      for (const sentencia of sentenciasDePermisos(rol, dueno, esquemas)) {
        await cliente.query(sentencia);
      }
      await cliente.query('commit');
    } catch (error) {
      await cliente.query('rollback');
      throw error;
    }
    return { esquemas };
  } finally {
    await cliente.end();
  }
}
