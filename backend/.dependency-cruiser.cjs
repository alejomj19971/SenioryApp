// Reglas de arquitectura (docs/backend/M0 §4.9). `npm run arquitectura` las comprueba sobre src/ y
// la CI falla si se rompe una. pruebas/arquitectura/ejemplos/ tiene un archivo que rompe cada regla a
// propósito, y pruebas/arquitectura/reglas.spec.ts verifica que todas lo detectan.
//
// Un «módulo de negocio» es cualquier carpeta de src/ salvo compartido, configuracion y salud: un
// módulo nuevo queda cubierto sin tocar este archivo.

// Raíz: src/ o la carpeta de ejemplos. Es un grupo que no captura, para que el módulo sea $1.
const RAIZ = '^(?:src|pruebas/arquitectura/ejemplos)/';
const NO_MODULOS = 'compartido|configuracion|salud';
const MODULO = `${RAIZ}((?!(?:${NO_MODULOS})/)[^/]+)/`;
const CUALQUIER_MODULO = `${RAIZ}(?!(?:${NO_MODULOS})/)[^/]+/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sin-ciclos',
      comment:
        'Dependencia circular: dos archivos se necesitan mutuamente. Suele indicar una responsabilidad mal repartida.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'dominio-puro',
      comment:
        'El dominio no depende de la aplicación, la infraestructura ni de librerías (Nest, Drizzle, pg, class-validator…). Valida con sus objetos de valor y se prueba sin nada más (E14).',
      severity: 'error',
      from: { path: `${RAIZ}[^/]+/dominio/` },
      to: {
        path: [`${RAIZ}[^/]+/(aplicacion|infraestructura|http)/`, '^node_modules/'],
      },
    },
    {
      name: 'aplicacion-sin-infraestructura',
      comment:
        'Los casos de uso hablan con el exterior solo a través de puertos: no importan adaptadores, Drizzle, pg ni Express.',
      severity: 'error',
      from: { path: `${RAIZ}[^/]+/aplicacion/` },
      to: {
        path: [
          `${RAIZ}[^/]+/(infraestructura|http)/`,
          '^node_modules/(drizzle-orm|pg|express|@nestjs/platform-express)/',
        ],
      },
    },
    {
      name: 'frontera-de-modulo',
      comment:
        'Un módulo solo puede usar de otro sus puertos de entrada (aplicacion/puertos/entrada). Todo lo demás es privado (E13).',
      severity: 'error',
      from: { path: MODULO },
      to: {
        path: CUALQUIER_MODULO,
        pathNot: [`${RAIZ}$1/`, `${RAIZ}[^/]+/aplicacion/puertos/entrada/`],
      },
    },
    {
      name: 'esquemas-privados',
      comment:
        'Las tablas de un módulo son suyas: nadie más importa su esquema de persistencia (E13).',
      severity: 'error',
      from: { path: `${RAIZ}([^/]+)/` },
      to: {
        path: `${RAIZ}[^/]+/.+\\.esquema\\.ts$`,
        pathNot: `${RAIZ}$1/`,
      },
    },
    {
      name: 'eventos-por-contrato',
      comment:
        'Los contratos de eventos entre módulos viven en compartido/eventos. Un manejador nunca importa eventos de otro módulo.',
      severity: 'error',
      from: { path: MODULO },
      to: {
        // Una carpeta «eventos» a cualquier profundidad (sin cuantificadores anidados: patrón seguro).
        path: `${CUALQUIER_MODULO}.*\\beventos/`,
        pathNot: `${RAIZ}$1/`,
      },
    },
    {
      name: 'compartido-no-depende-de-modulos',
      comment:
        'compartido es la base de todos: si dependiera de un módulo, ese módulo ya no se podría cambiar ni separar.',
      severity: 'error',
      from: { path: `${RAIZ}compartido/` },
      to: { path: CUALQUIER_MODULO },
    },
  ],
  options: {
    doNotFollow: { path: '^node_modules' },
    // Cuenta también los imports de solo tipos: una dependencia de tipos sigue siendo un acople.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    // El código importa './archivo.js' (ESM) aunque el archivo sea './archivo.ts': dependency-cruiser
    // lo resuelve por su cuenta.
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      exportsFields: ['exports'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
