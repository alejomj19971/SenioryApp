# ADR 002: Repositorio único y organización funcional del código

| Campo | Valor |
|---|---|
| **Proyecto** | Seniory — *Creciendo y cuidando juntos* |
| **Equipo de desarrollo** | Michael Stiven Zuleta Hernández, Alejandro Múnera Jaramillo |
| **Curso** | Arquitectura de Software |
| **Fecha** | 2026-10-14 |
| **Estado** | Aceptado |

## 1. Contexto

Seniory es una plataforma web para conectar a familias con cuidadores de adultos mayores. El MVP incluye una landing pública, búsqueda y perfiles de cuidadores, contratación, mensajería y teleasistencia. El equipo es pequeño y el producto se desarrolla como una aplicación Next.js con TypeScript.

El proyecto necesita mantener juntas las partes que cambian para entregar una funcionalidad: rutas, interfaz, tipos, servicios y datos de prueba. También debe poder evolucionar hacia una solución con servicios y proveedores reales sin que el desarrollo inicial tenga el costo operativo de varios repositorios y despliegues independientes.

Este ADR complementa [ADR-01.md](./ADR-01.md), que selecciona el monolito modular por capas y la arquitectura hexagonal como estilo arquitectónico del sistema. No reemplaza ni modifica esa decisión.

## 2. Decisión

Adoptamos un **repositorio único como estrategia de monorepositorio para Seniory**. La raíz se divide en tres carpetas, como define [ADR-01.md §4.8](./ADR-01.md): `frontend/` (aplicación web), `backend/` (API, aún sin implementar) y `docs/` (documentación). Todo se versiona junto.

La organización interna del frontend es **funcional por rutas y áreas del producto**, con separación entre presentación, servicios, tipos, lógica compartida y datos. Cada cambio de una funcionalidad puede actualizar sus partes relacionadas en un único cambio revisable.

### Alcance actual

Hoy solo `frontend/` contiene código: una aplicación Next.js desplegada en Vercel (con *Root Directory* `frontend`). `backend/` existe como marcador de posición con su README; su tecnología se definirá en un ADR posterior. El repositorio no declara workspaces de npm ni paquetes compartidos entre carpetas. Por ello, es el inicio de la estrategia de monorepositorio, no una afirmación de que ya existan varios proyectos desplegables. Si el producto crece, podrán incorporarse nuevos paquetes o aplicaciones sin que sea necesario separarlos de inmediato.

## 3. Motivos de la decisión

- **Coordinación sencilla para un equipo pequeño:** todos trabajan sobre una fuente de verdad y revisan los cambios en el mismo contexto.
- **Cambios funcionales coherentes:** una función puede modificar su página, componentes, tipos y servicio en un solo commit o pull request.
- **Tipos y contratos compartidos:** la interfaz y los servicios usan los mismos modelos de TypeScript, lo que reduce divergencias entre capas.
- **Menor carga operativa:** se evita coordinar versiones, permisos, pipelines y despliegues entre repositorios independientes antes de que el producto los necesite.
- **Integración y validación centralizadas:** lint, build y despliegue del MVP parten de una sola aplicación.
- **Evolución gradual:** los límites funcionales y la capa de servicios permiten cambiar la fuente de datos y sumar paquetes en el mismo repositorio cuando exista una necesidad concreta.

Un monorepositorio no es una mejor práctica universal por sí sola. Se elige aquí porque el tamaño del equipo y el estado del producto favorecen la colaboración y la integración conjunta, mientras que la independencia de despliegue todavía no es un requisito.

## 4. Arquitectura que se está trabajando

### 4.1 Estilo arquitectónico definido para Seniory

De acuerdo con [ADR-01.md](./ADR-01.md), el estilo arquitectónico elegido para el sistema completo es un **monolito modular organizado por capas, con arquitectura hexagonal dentro de cada módulo de dominio**. Los eventos de dominio internos y una máquina de estados para el ciclo de vida del servicio son complementos previstos. La decisión busca mantener módulos con responsabilidades claras, aislar el dominio de proveedores e infraestructura, y evitar el costo operativo de microservicios para el equipo actual.

### 4.2 Implementación actual del MVP

El código disponible es, por ahora, una **aplicación web Next.js única, organizada funcionalmente y con separación ligera de responsabilidades**. Está desplegada y construida como una sola aplicación; sus carpetas agrupan las áreas de la interfaz —cuidadores, contratación, mensajería y teleasistencia—, pero aún no implementan el backend ni los módulos de dominio completos del estilo elegido en ADR-01.

La separación que sí existe en el frontend (rutas relativas a `frontend/`) es:

1. **Presentación y rutas:** `app/` define las páginas, layouts y composición de cada URL.
2. **Componentes de interfaz:** `components/` implementa las pantallas y elementos, agrupados principalmente por función; `components/ui/` contiene controles visuales reutilizables.
3. **Frontera de acceso a datos:** `lib/services/` expone operaciones asíncronas usadas por las páginas. Esto sigue el rol de puerto previsto para el frontend en ADR-01, aunque su implementación actual es sencilla y lee los datos semilla directamente.
4. **Modelos y lógica compartida:** `lib/types.ts` establece los contratos de datos, mientras el resto de `lib/` contiene funciones comunes, lógica de precios y hooks.
5. **Adaptador temporal de datos:** `data/` contiene JSON semilla que los servicios leen actualmente, de acuerdo con el rol de adaptador de datos del MVP descrito en ADR-01. No es una base de datos ni proporciona persistencia de producción.

En términos prácticos, el flujo de consulta es:

```text
Ruta/página (app/)
       ↓ solicita datos
Servicio (lib/services/)
       ↓ consulta actualmente
JSON semilla (data/)
       ↓ resultado
Componente de presentación (components/)
```

Las páginas pueden ejecutarse en el servidor y entregar los datos como propiedades a componentes cliente cuando la interfaz necesita estado, eventos o APIs del navegador. Por ejemplo, la página de búsqueda obtiene cuidadores mediante `listarCuidadores` y los entrega al buscador interactivo; la página de perfil usa `obtenerCuidador` para buscar un cuidador por identificador.

### 4.3 Brecha y evolución prevista

La estructura actual es coherente con la dirección de ADR-01, pero no debe confundirse con la arquitectura completa ya implementada. En particular, `lib/services/` establece una frontera reemplazable hacia los datos, pero todavía no hay un backend con puertos de entrada y salida formalizados, adaptadores de infraestructura, persistencia en base de datos, eventos de dominio ni la máquina de estados prevista.

Cuando el producto lo requiera, la evolución será añadir el backend como monolito modular por capas y aplicar arquitectura hexagonal dentro de sus módulos de dominio. Los servicios del frontend se comunicarán entonces con la API en lugar de leer los JSON, procurando conservar las páginas y componentes. Así, ADR-01 registra el estilo arquitectónico seleccionado y este ADR describe el estado del MVP y cómo su organización funcional se alinea con ese objetivo.

## 5. Organización funcional de carpetas

La estructura sigue la definida en [ADR-01.md §4.8](./ADR-01.md). Los archivos de configuración de `frontend/` (`package.json`, `next.config.ts`, `tsconfig.json`, configuración de Tailwind y ESLint) soportan la aplicación y sus herramientas.

```text
seniory/
├─ frontend/                    ← Aplicación web (Next.js), desplegada en Vercel
│  ├─ app/                      ← Rutas, layouts y pantallas de Next.js
│  │  ├─ (marketing)/           ← Landing pública; el grupo no agrega segmento a la URL
│  │  ├─ app/                   ← Experiencia de la aplicación
│  │  │  ├─ cuidadores/         ← Búsqueda y perfiles de cuidadores
│  │  │  ├─ contratar/          ← Contratación y confirmación
│  │  │  ├─ mensajes/           ← Conversaciones
│  │  │  └─ teleasistencia/     ← Funciones de seguimiento y asistencia
│  │  ├─ layout.tsx             ← Layout raíz
│  │  ├─ globals.css            ← Estilos globales y tokens visuales
│  │  └─ not-found.tsx          ← Pantalla para rutas no encontradas
│  ├─ components/               ← Componentes de interfaz
│  │  ├─ accesibilidad/         ← Preferencias y controles de accesibilidad
│  │  ├─ contratacion/          ← Formulario, horas y resumen de costo
│  │  ├─ cuidadores/            ← Búsqueda, filtros, tarjetas y reseñas
│  │  ├─ landing/               ← Secciones de la página pública
│  │  ├─ mensajeria/            ← Interfaz de conversación
│  │  ├─ shell/                 ← Elementos persistentes de la aplicación
│  │  ├─ teleasistencia/        ← Alertas, medicamentos y signos vitales
│  │  └─ ui/                    ← Componentes visuales reutilizables
│  ├─ data/                     ← ADAPTADOR del MVP: JSON semilla
│  ├─ lib/                      ← Funciones y contratos compartidos
│  │  ├─ hooks/                 ← Hooks reutilizables
│  │  └─ services/              ← PUERTOS: acceso a datos por área funcional
│  ├─ public/                   ← Imágenes, logos y hojas de vida públicas
│  └─ types/                    ← Declaraciones TypeScript globales
├─ backend/                     ← Monolito modular hexagonal (pendiente; solo README)
└─ docs/                        ← ADR, plan del MVP y material fuente
```

### Criterios para ubicar código

Las rutas son relativas a `frontend/`.

- Las rutas, layouts y composición específica de una URL van en `app/`.
- Los componentes de una función se ubican en la carpeta correspondiente dentro de `components/`; los elementos de interfaz genéricos se ubican en `components/ui/`.
- Las páginas consultan datos a través de funciones de `lib/services/`, no importando directamente archivos de `data/`.
- Los contratos compartidos se ubican en `lib/types.ts`; las declaraciones globales o de APIs del navegador se ubican en `types/`.
- Las imágenes y otros archivos que deben servirse públicamente se ubican en `public/`.
- La lógica reutilizable y sin interfaz se ubica en `lib/`, en el módulo más específico que corresponda.
- Los módulos del backend, cuando existan, seguirán la estructura de ADR-01 §4.8 dentro de `backend/`.

## 6. Consecuencias

### Positivas

- La estructura facilita encontrar el código por responsabilidad y seguir una funcionalidad desde su ruta hasta sus datos.
- Una funcionalidad puede cambiarse y revisarse de manera atómica.
- Los servicios forman un punto de sustitución entre las pantallas y la fuente de datos.
- Un único repositorio permite compartir tipos, convenciones y herramientas sin duplicación prematura.

### Costos y límites

- El repositorio no proporciona aislamiento automático entre módulos; las dependencias deben mantenerse ordenadas por convenciones y revisión.
- A medida que crezca el código, será necesario reforzar límites entre áreas y añadir pruebas para evitar dependencias circulares o lógica dispersa.
- Los datos JSON actuales son apropiados para el prototipo, pero no ofrecen persistencia multiusuario, concurrencia ni controles de acceso de producción.
- Un repositorio compartido implica coordinar cambios incompatibles y permisos a nivel del repositorio, en vez de aislarlos por proyecto.

## 7. Conclusiones y revisión

La decisión es mantener Seniory en un repositorio único y organizar su código por rutas y funciones, con servicios como frontera de acceso a los datos y tipos compartidos como contratos. Esta estructura es adecuada para el MVP, el equipo actual y la necesidad de entregar funcionalidades integradas sin complejidad operativa innecesaria.

La decisión se revisará si aparecen aplicaciones con ciclos de entrega o permisos realmente independientes, si los equipos necesitan desplegar y versionar módulos por separado, o si la coordinación en el repositorio único se convierte en un obstáculo. Hasta entonces, separar repositorios o introducir workspaces no aporta un beneficio suficiente para justificar su costo.
