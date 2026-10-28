# SENIORY — Plan de desarrollo del MVP (demo Rocket Pitch)

> **Documento histórico (actualizado el 2026-10-26).** Este plan especificó el MVP para el Rocket Pitch, que ya está construido. **El desarrollo actual es la aplicación real**, y se rige por [PLAN_BACKEND_SENIORY.md](./PLAN_BACKEND_SENIORY.md) y [PLAN_FRONTEND_SENIORY.md](./PLAN_FRONTEND_SENIORY.md). Lo que aquí figura como «fuera de alcance» (autenticación, backend, base de datos, pagos reales, registro de cuidadores) **ahora sí está en alcance**. Se conserva por el contexto de producto (secciones 1, 5, 6 y 7) y como referencia de las pantallas.

> **Para Claude Code:** este documento es la especificación del MVP. Trabaja **fase por fase**, en orden.
> Al terminar cada fase: ejecuta `npm run build` y `npm run lint`, resume lo que hiciste y **detente para revisión** antes de seguir con la siguiente.
> Si algo de este plan es ambiguo, pregunta antes de inventar. Alejo actúa como arquitecto del proyecto; tú implementas.

---

## 1. Contexto del producto

**Seniory** — *"Creciendo y cuidando juntos"*
Marketplace de cuidado para adultos mayores en Colombia (piloto en Medellín). Reemplaza la **confianza informal** (boca a boca, grupos de WhatsApp) por **confianza verificable**: cuidadores con antecedentes verificados, títulos comprobados y pruebas psicotécnicas.

**Frase de marca:** "Porque envejecer con dignidad no es un lujo, es un derecho."
**Dato de contexto (DANE):** para 2036 Colombia tendrá más personas mayores de 60 años que menores de 15.

### Tres pilares del servicio
1. **Directorio de talento certificado**: contratación por horas o turnos de auxiliares, enfermeros y terapeutas validados.
2. **Teleasistencia y monitoreo** (GRATIS): botón de alerta remota, recordatorios de medicamentos y signos vitales visibles para la familia en tiempo real.
3. **Acompañamiento presencial**: salidas a citas médicas, diligencias, compras y estimulación cognitiva. *(En la landing se presenta; en la app del MVP no tiene pantalla propia.)*

### Modelo de negocio (fuente de verdad: el guion del pitch)
- Comisión total ~18%: **10% se descuenta al profesional**, **8% se cobra a la familia**.
- Ejemplo: servicio de $20.000 COP/hora → la familia paga $21.600, el cuidador recibe $18.000, la plataforma captura $3.600.
- **Bolsas de horas prepago** con descuento (flujo de caja).
- **La teleasistencia es gratuita**. Existe para generar el hábito de uso diario, no para monetizar. **No mostrar membresías pagas.**

### Clientes
- **Familiares responsables** (usuario principal del demo).
- **Adultos mayores autovalentes** (por eso la accesibilidad es un requisito, no un extra).
- Los cuidadores son la **oferta** (proveedores validados), no clientes.

---

## 2. Objetivo del MVP

Una app web **responsive** (mobile-first) desplegada en **Vercel** que permita ejecutar sin fallas el guion del Rocket Pitch de 4 minutos:

1. **Persona 1** habla con la **landing** en pantalla (logo/hero visible).
2. **Persona 2** hace el demo en vivo (~110 s): **búsqueda → perfil del cuidador con badges de verificación → contratación por horas → teleasistencia (alerta, medicamentos, signos vitales)**. Opcional: comando de voz / alto contraste.
3. **Persona 3** cierra con el modelo de negocio (fuera de la app).

**Criterio rector:** cada paso del demo debe ser **un toque**, rápido, sin pantallas de carga largas y sin depender de red externa más allá de cargar la app.

### Fuera de alcance (NO construir en el MVP)
- Autenticación real, registro, login.
- Backend, base de datos, pagos reales.
- Registro de cuidadores (lado de la oferta).
- Notificaciones push reales, geolocalización real.
- Módulo de acompañamiento presencial como pantalla.

---

## 3. Stack técnico

| Área | Elección |
|---|---|
| Framework | Next.js (última versión estable), App Router, TypeScript estricto |
| Estilos | Tailwind CSS + shadcn/ui |
| Íconos | lucide-react |
| Gráficas | Recharts (solo en componentes cliente) |
| Voz | Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) con detección de soporte |
| Datos | JSON semilla en `/data`, accedidos **solo** vía `lib/services` |
| Estado global | React Context (preferencias de accesibilidad, contratación en curso) |
| Deploy | Vercel conectado al repo de GitHub (deploy automático en cada push a `main`) |
| Idioma | Todo el contenido en **español (Colombia)**. Moneda COP con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` |

No agregar dependencias fuera de esta lista sin preguntar.

---

## 4. Arquitectura

### Principio clave: capa de servicios intercambiable
Las pantallas **nunca** importan JSON directamente. Solo llaman funciones de `lib/services/*`. Hoy esas funciones leen los datos semilla; mañana harán `fetch` a un backend real (p. ej. Spring Boot) **sin cambiar las pantallas**.

```ts
// lib/services/cuidadores.ts (firma esperada)
export async function listarCuidadores(filtros?: FiltrosCuidador): Promise<Cuidador[]>
export async function obtenerCuidador(id: string): Promise<Cuidador | null>
```

Todas las funciones de servicio son `async` aunque hoy lean JSON local.

### Estructura de carpetas

```
seniory/
├─ app/
│  ├─ (marketing)/
│  │  └─ page.tsx                  ← Landing  (ruta "/")
│  ├─ app/
│  │  ├─ layout.tsx                ← Shell móvil: header, nav inferior, barra de accesibilidad
│  │  ├─ page.tsx                  ← Inicio de Andrea (atajos a Buscar y Teleasistencia)
│  │  ├─ cuidadores/page.tsx       ← Búsqueda + filtros
│  │  ├─ cuidadores/[id]/page.tsx  ← Perfil del cuidador
│  │  ├─ contratar/[id]/page.tsx   ← Flujo de contratación por horas
│  │  ├─ contratar/confirmacion/page.tsx
│  │  └─ teleasistencia/page.tsx   ← Alerta, medicamentos, signos vitales
│  ├─ layout.tsx                   ← Root layout (fuentes, metadata, providers)
│  └─ globals.css                  ← Tokens de diseño
├─ components/
│  ├─ ui/                          ← shadcn
│  ├─ landing/                     ← Hero, Problema, Pilares, ComoFunciona, Confianza, Bolsas, CTA, Footer
│  ├─ cuidadores/                  ← TarjetaCuidador, FiltrosCuidador, BadgesVerificacion, Resenas
│  ├─ contratacion/                ← SelectorHoras, ResumenCosto
│  ├─ teleasistencia/              ← BotonAlerta, ListaMedicamentos, GraficaSignos
│  └─ accesibilidad/               ← BarraAccesibilidad, BotonVoz, AccesibilidadProvider
├─ lib/
│  ├─ services/                    ← cuidadores.ts, paciente.ts, teleasistencia.ts, contratacion.ts
│  ├─ types.ts
│  ├─ pricing.ts                   ← lógica de comisiones (pura, testeable)
│  └─ format.ts                    ← formato COP, fechas
├─ data/
│  ├─ cuidadores.json
│  ├─ familia.json                 ← Andrea + doña Carmen
│  ├─ medicamentos.json
│  └─ signos-vitales.json
└─ public/                         ← logo, fotos de cuidadores (placeholders o avatares)
```

### Modelos de datos (`lib/types.ts`)

```ts
export type Especialidad = 'auxiliar' | 'enfermeria' | 'fisioterapia' | 'acompanamiento';

export interface Verificacion {
  antecedentes: boolean;     // Policía, Procuraduría, Contraloría
  titulos: boolean;          // títulos/certificaciones comprobados
  psicotecnica: boolean;     // prueba psicotécnica aprobada
  fechaVerificacion: string; // ISO
}

export interface Resena {
  autor: string;
  calificacion: number;      // 1–5
  comentario: string;
  fecha: string;
}

export interface Cuidador {
  id: string;
  nombre: string;
  foto: string;
  especialidad: Especialidad;
  titulo: string;            // ej. "Técnica en Enfermería — SENA"
  aniosExperiencia: number;
  tarifaHora: number;        // COP, lo que cobra el cuidador
  zona: string;              // barrio/comuna de Medellín o municipio del Valle de Aburrá
  disponibilidad: ('manana' | 'tarde' | 'noche')[];
  calificacion: number;
  serviciosCompletados: number;
  bio: string;
  verificacion: Verificacion;
  resenas: Resena[];
}

export interface Medicamento {
  id: string;
  nombre: string;
  dosis: string;
  hora: string;              // "08:00"
  tomado: boolean;
}

export interface LecturaSignos {
  fecha: string;             // ISO
  presionSistolica: number;
  presionDiastolica: number;
  frecuenciaCardiaca: number;
  glucosa: number;
}
```

### Lógica de precios (`lib/pricing.ts`)

```ts
export const COMISION_FAMILIA = 0.08;
export const COMISION_PROFESIONAL = 0.10;

export function calcularServicio(tarifaHora: number, horas: number) {
  const subtotal = tarifaHora * horas;
  const cargoFamilia = Math.round(subtotal * COMISION_FAMILIA);
  const totalFamilia = subtotal + cargoFamilia;
  const pagoProfesional = Math.round(subtotal * (1 - COMISION_PROFESIONAL));
  const ingresoPlataforma = totalFamilia - pagoProfesional;
  return { subtotal, cargoFamilia, totalFamilia, pagoProfesional, ingresoPlataforma };
}
// Verificación: calcularServicio(20000, 1) → totalFamilia 21600, pagoProfesional 18000, ingresoPlataforma 3600
```

La UI de la familia muestra **subtotal, cargo de servicio (8%) y total**. No mostrar el 10% del profesional en la vista de la familia.

---

## 5. Datos semilla (narrativa del demo)

- **Usuaria logueada (simulada):** **Andrea**, hija, trabaja todo el día.
- **Adulta mayor monitoreada:** **doña Carmen**, 78 años, vive sola. Es el perfil de teleasistencia.
- **Cuidadores:** entre 8 y 10, con variedad de especialidades, zonas (Laureles, Belén, El Poblado, Robledo, Bello, Envigado, Itagüí…) y tarifas entre $18.000 y $35.000 COP/hora. **Al menos uno con exactamente $20.000/hora**, destacado primero en la búsqueda, para que coincida con el ejemplo del pitch. Todos los que aparecen en el directorio están verificados.
- **Medicamentos de doña Carmen:** 3–4 del día con horarios (mañana, mediodía, noche), algunos ya tomados.
- **Signos vitales:** 7 días de lecturas con valores realistas y estables, y una lectura levemente alta para que la gráfica tenga algo que contar.
- **Fotos:** usar avatares/ilustraciones o iniciales. Nada de fotos de personas reales sin licencia.

---

## 6. Diseño y accesibilidad

### Identidad visual (PROVISIONAL, pendiente de confirmar con el equipo)
- Imagotipo: dos manos estrechadas formando un corazón, con líneas de circuito/nodos (cuidado + afecto + tecnología). Mientras llega el logo final, usar un placeholder SVG simple + wordmark "SENIORY".
- Definir los colores **solo como tokens CSS** en `globals.css` (`--primary`, `--accent`, etc.) para poder cambiar la paleta en un solo lugar. Propuesta inicial: primario verde azulado (confianza/salud) + acento coral cálido (afecto) sobre fondo crema claro.
- Tono: cálido, humano, profesional. Nada de estética "hospital frío".

### Requisitos de accesibilidad (obligatorios)
- Texto base de **18px** o más. Títulos grandes y claros.
- Objetivos táctiles de **48×48px** o más.
- Contraste WCAG AA como mínimo en modo normal.
- **Modo alto contraste** (toggle): aplica un tema alternativo vía `data-contrast="high"` en `<html>`.
- **Tamaño de texto** ajustable (normal / grande / muy grande) vía variable CSS de escala.
- Las preferencias se guardan en un Context y persisten en `localStorage` (envuelto en try/catch).
- **Comando de voz** (botón de micrófono en el shell de la app):
  - Frases reconocidas (coincidencia flexible, en `es-CO`): "buscar cuidador" → `/app/cuidadores`; "teleasistencia" → `/app/teleasistencia`; "alerta" / "ayuda" → abre el modal de alerta; "inicio" → `/app`.
  - Si el navegador no soporta la API, **ocultar el botón** (no mostrar errores). Funciona bien en Chrome/Edge; en Safari no es confiable.
- HTML semántico, `aria-label` en botones solo-ícono, foco visible, navegable con teclado.

### Responsive
- **Mobile-first.** La app (`/app/*`) se diseña para ~390px con navegación inferior; en escritorio se centra con un ancho máximo tipo teléfono/tablet.
- La landing sí aprovecha el ancho completo en escritorio.

---

## 7. Especificación de pantallas y criterios de aceptación

### 7.1 Landing `/` — PRIORIDAD 1
Secciones en orden:
1. **Header**: logo + wordmark, anclas (Servicios, Cómo funciona, Precios), CTA "Probar la app" → `/app`.
2. **Hero**: titular emocional (la angustia de dejar a los padres solos), subtítulo con la propuesta (cuidadores verificados + teleasistencia gratuita), CTA principal → `/app`, visual con mockup del teléfono o ilustración. El slogan "Creciendo y cuidando juntos" visible.
3. **El problema**: el cuidado hoy es informal (WhatsApp, boca a boca, sin garantías) + dato DANE 2036 destacado como cifra grande.
4. **Tres pilares**: Directorio certificado, Teleasistencia gratuita, Acompañamiento presencial.
5. **Confianza verificable**: los tres filtros (antecedentes, títulos, psicotécnica) con íconos, estilo "badge".
6. **Cómo funciona**: 3 pasos (Busca y filtra → Revisa el perfil verificado → Contrata por horas y monitorea).
7. **Bolsas de horas**: 3 paquetes ilustrativos con descuento (ej. 10, 20 y 40 horas) + nota "teleasistencia siempre gratis".
8. **Accesibilidad**: pensada también para el adulto mayor (voz, alto contraste, letra grande).
9. **CTA final + footer**: "Porque envejecer con dignidad no es un lujo, es un derecho."

**Aceptación:** se ve bien en 390px, 768px y 1440px; sin scroll horizontal; Lighthouse Accesibilidad ≥ 90; todos los CTA llevan a `/app`.

### 7.2 Inicio de la app `/app`
Saludo "Hola, Andrea", tarjeta de estado de doña Carmen (último signo vital, próximo medicamento), dos accesos grandes: **Buscar cuidador** y **Teleasistencia**.

### 7.3 Búsqueda `/app/cuidadores` — PRIORIDAD 2
- Campo de búsqueda por nombre/especialidad.
- Filtros: especialidad (chips), rango de tarifa, disponibilidad (mañana/tarde/noche), zona.
- Lista de `TarjetaCuidador`: foto, nombre, especialidad, zona, calificación, tarifa/hora, **badge "Verificado"** visible.
- Filtrado instantáneo en cliente.

**Aceptación:** filtrar y abrir un perfil toma 2 toques como máximo; estado vacío amigable si ningún resultado coincide.

### 7.4 Perfil `/app/cuidadores/[id]` — PRIORIDAD 3 (momento clave del pitch)
- Encabezado con foto, nombre, título, años de experiencia, calificación, servicios completados.
- **Bloque de verificación protagonista**: tres badges (Antecedentes verificados ✓, Títulos comprobados ✓, Prueba psicotécnica aprobada ✓) con fecha de verificación. Debe ser lo primero que se ve bajo el encabezado, grande y claro, porque Persona 2 lo señala en vivo.
- Bio, disponibilidad, zona, reseñas.
- Botón fijo inferior: **"Contratar por horas — $XX.XXX/hora"** → `/app/contratar/[id]`.

### 7.5 Contratación `/app/contratar/[id]` — PRIORIDAD 4
- Selector de fecha (hoy/mañana/elegir), franja horaria y número de horas (stepper grande).
- `ResumenCosto` en vivo usando `lib/pricing.ts`: subtotal, cargo de servicio (8%), **total**.
- Opción visual "Usar bolsa de horas" (sin lógica real, solo UI).
- Botón "Confirmar contratación" → `/app/contratar/confirmacion` con resumen y mensaje de éxito + acceso a Teleasistencia.

**Aceptación:** con el cuidador de $20.000 y 1 hora, el total mostrado es **$21.600**.

### 7.6 Teleasistencia `/app/teleasistencia` — PRIORIDAD 5
- Encabezado: "Doña Carmen, 78 años" + indicador "Monitoreo activo" + etiqueta "Gratis".
- **Botón de alerta** grande y rojo: al tocarlo, modal con cuenta regresiva de 5 s (cancelable) → estado "Alerta enviada a Andrea y a la línea de emergencia". Todo simulado.
- **Medicamentos de hoy**: lista con horario, dosis y check para marcar como tomado (estado en cliente); el próximo pendiente se resalta.
- **Signos vitales**: tarjetas con el último valor (presión, frecuencia cardiaca, glucosa) + gráfica de 7 días (Recharts) con tabs por métrica.
- Texto "Actualizado hace X min" para dar la sensación de tiempo real.

**Aceptación:** los tres módulos se ven en una sola pantalla móvil con scroll corto; el flujo de alerta completo se hace en menos de 10 s.

### 7.7 Accesibilidad global — PRIORIDAD 6
`BarraAccesibilidad` en el shell de `/app`: toggle alto contraste, tamaño de texto y botón de voz (ver sección 6).

---

## 8. Fases de implementación

### Fase 0 — Setup
- [ ] `create-next-app` (TypeScript, Tailwind, App Router, ESLint), inicializar shadcn/ui.
- [ ] Instalar `lucide-react` y `recharts`.
- [ ] Tokens de diseño en `globals.css` (paleta provisional, escala tipográfica, radios).
- [ ] `lib/types.ts`, `lib/pricing.ts`, `lib/format.ts`.
- [ ] Datos semilla en `/data` + servicios en `lib/services`.
- [ ] Metadata del sitio (title, description, favicon, Open Graph básico) en español.
- [ ] Verificar `npm run build`. **→ Detenerse para revisión.**

### Fase 1 — Landing
- [ ] Componentes de `components/landing/` según 7.1.
- [ ] Revisar responsive en 390 / 768 / 1440.
- [ ] Primer deploy a Vercel. **→ Detenerse para revisión.**

### Fase 2 — Recorrido principal del demo
- [ ] Shell de `/app` (header, nav inferior).
- [ ] Inicio `/app` (7.2).
- [ ] Búsqueda (7.3), perfil (7.4), contratación + confirmación (7.5).
- [ ] **→ Detenerse para revisión.**

### Fase 3 — Teleasistencia
- [ ] Botón de alerta con modal, medicamentos, signos vitales (7.6).
- [ ] **→ Detenerse para revisión.**

### Fase 4 — Accesibilidad y pulido
- [ ] Alto contraste, tamaño de texto y comando de voz (sección 6).
- [ ] Transiciones suaves, estados vacíos, página 404 amigable.
- [ ] Revisión de accesibilidad (Lighthouse ≥ 90 en landing, perfil y teleasistencia).
- [ ] **→ Detenerse para revisión.**

### Fase 5 — Preparación del demo (la hace el equipo, con apoyo)
- [ ] Probar el recorrido completo en el dispositivo real del pitch.
- [ ] Grabar el video de respaldo: búsqueda → perfil → contratación → teleasistencia.
- [ ] Ensayo cronometrado de los 4 minutos.

---

## 9. Convenciones de código

- Server Components por defecto; `'use client'` solo donde haya estado, eventos, Recharts o Web Speech API.
- Nombres de componentes y dominio en **español** (`TarjetaCuidador`, `listarCuidadores`); utilidades técnicas pueden ir en inglés.
- Nada de datos hardcodeados dentro de componentes de página: todo sale de `lib/services`.
- Componentes pequeños y reutilizables; sin lógica de negocio en JSX (usar `lib/pricing.ts`).
- Imágenes con `next/image`. Sin llamadas a APIs externas en runtime.
- Commits pequeños y descriptivos por fase (ej. `feat(landing): sección de confianza verificable`).

## 10. Definition of Done del MVP
- [ ] Desplegado en Vercel con URL pública estable.
- [ ] El guion completo del pitch se puede ejecutar en menos de 2 minutos de demo sin errores en consola.
- [ ] Funciona en Chrome móvil (Android) y Safari (iPhone); en Safari el botón de voz se oculta sin romper nada.
- [ ] Total de $21.600 correcto para el ejemplo del pitch.
- [ ] Ningún texto en inglés visible para el usuario.

## 11. Evolución posterior (no implementar ahora)
Autenticación real y roles (familia, adulto mayor, cuidador), backend propio (candidato: Spring Boot) detrás de `lib/services`, registro y verificación de cuidadores, pagos, notificaciones push reales, modo "cuidador preferido" vs. "bolsa abierta", módulo de acompañamiento presencial y funciones con IA.
