# Etapa 0 — Ajustar `components/ui` a la hoja de componentes aprobada

Instrucciones para Claude Code. La hoja visual de referencia está en Claude Design
("SENIORY · Hoja de componentes"): columnas claro, oscuro y alto contraste.

## Antes de empezar
- Lee `AGENTS.md` y la guía correspondiente en `node_modules/next/dist/docs/` (Next.js 16 cambia APIs).
- **No cambies `app/globals.css`** (paleta y tokens ya definidos). No agregues librerías.
- Colores SOLO con tokens semánticos de Tailwind (`bg-primary`, `text-success`, `border-input`...).
  Prohibido hex, rgb u oklch en clases, y `text-white`/`bg-white` fijos.
- Todo texto visible en español.
- Base de la app: `html { font-size: 112.5% }` → 1rem = 18 px. Por eso `h-11` = 49,5 px, `h-12` = 54 px, `h-14` = 63 px.
- Antes de cambiar variantes o tamaños, busca sus usos (`grep -rn 'size="' components app`,
  `grep -rn 'variant="destructive"' components app`) y corrige lo que se rompa.

## Objetivo de accesibilidad que justifica los cambios
- Objetivos táctiles de al menos 48×48 px (hoy botones miden 27–40,5 px y el campo 36 px).
- Contraste AA medido: el botón/badge destructivo actual (texto rojo sobre rojo al 10 %) da **4,41:1 en claro → no cumple**.
  Rojo sólido con `destructive-foreground` da 5,40:1 (claro), 6,50:1 (oscuro), 8,27:1 (alto contraste).
- Bordes de controles ≥ 3:1: `border` da 1,25:1 (no sirve para controles); `input` da 3,48:1 (claro) y 3,81:1 (oscuro).

## Cambios

### 1. `components/ui/button.tsx`
- Base: cambiar `text-sm` por `text-base`; ícono por defecto `[&_svg:not([class*='size-'])]:size-5`.
- Variantes:
  - `destructive`: `bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/40` (quitar el fondo al 10/20 %).
  - `outline`: `border-input` en lugar de `border-border` (mantener el resto, incluido `dark:`).
  - `default`, `secondary`, `ghost`, `link`: sin cambios de color. `link` con `min-h-12`.
- Tamaños (todos ≥ 48 px; conservar los nombres para no romper usos):
  - `xs` y `sm`: `h-11 gap-1.5 px-4 text-sm` (49,5 px). `xs` queda como alias de `sm`.
  - `default`: `h-12 gap-2 px-5` (54 px).
  - `lg`: `h-14 gap-2 px-6 text-lg font-semibold` (63 px).
  - `icon`: `size-12`; `icon-xs` e `icon-sm`: `size-11`; `icon-lg`: `size-14`.
  - Quitar los `rounded-[min(...)]` de xs/sm: todos usan `rounded-lg` (= `--radius`, 0.75rem).

### 2. `components/ui/input.tsx`
- `h-12 px-4 text-base`, quitar `md:text-sm` (el texto nunca baja de 18 px).
- `bg-card` en claro (mantener `dark:bg-input/30`).
- Error (`aria-invalid`): `aria-invalid:border-2 aria-invalid:border-destructive` + el ring actual.

### 3. `components/ui/label.tsx`
- `text-base` en lugar de `text-sm`.

### 4. `components/ui/badge.tsx`
- Base: `h-7 px-3 text-sm font-semibold`, íconos `[&>svg]:size-4!` (en lugar de h-5/text-xs/size-3).
- `destructive`: sólido `bg-destructive text-destructive-foreground`.
- Variantes nuevas (siempre se usan con ícono + texto, nunca solo color):
  - `success`: `bg-success text-success-foreground` (ícono `CircleCheck`).
  - `warning`: `bg-warning text-warning-foreground` (ícono `TriangleAlert`).
  - `info`: `bg-info text-info-foreground` (ícono `Info`).
  - `verificado`: `border-[1.5px] border-success bg-card text-success` (ícono `ShieldCheck`).
- Contrastes medidos (texto/fondo): success 5,05 · warning 7,93 · info 5,24 · destructive 5,40 · verificado 5,18 (claro); todos mayores en oscuro y alto contraste.

### 5. `components/ui/tabs.tsx`
- Lista: quitar la altura fija `group-data-horizontal/tabs:h-8`; usar `h-auto p-1 gap-1`.
- Trigger: `min-h-11 px-2 text-base`; inactivo `text-muted-foreground` (en lugar de `text-foreground/60`);
  activo `data-active:font-semibold data-active:border-border` además de lo actual.

### 6. `components/ui/card.tsx`
- Card: `text-base`, `ring-border` en lugar de `ring-foreground/10` (en alto contraste el borde queda negro), y `shadow-xs` (sombra muy suave).
- `CardTitle`: `text-xl font-semibold`. `CardDescription`: `text-sm` se queda.

### 7. `components/ui/dialog.tsx`
- Contenido: `p-5 text-base sm:max-w-md`; el botón cerrar ya hereda `icon-sm` (49,5 px).
- `DialogTitle`: `text-xl font-semibold leading-snug`. `DialogDescription`: `text-base`.
- `DialogFooter`: ajustar márgenes negativos a `-mx-5 -mb-5 p-5` para que calcen con el nuevo padding.

### 8. Componente nuevo: `components/ui/aviso.tsx`
Aviso de error en pantalla (estado "error" obligatorio en cada pantalla). Solo esta variante por ahora.
```tsx
type AvisoProps = {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode; // p. ej. <Button variant="outline" size="sm" onClick={onReintentar}><RotateCcw />Reintentar</Button>
  className?: string;
};
```
- Contenedor `role="alert"`: `flex gap-3 rounded-lg border border-destructive bg-destructive/5 p-4`.
- Ícono `CircleAlert` `size-5 text-destructive` con `aria-hidden`.
- Título `text-base font-semibold text-foreground`; descripción `text-sm text-foreground`.
- Usa `cn` de `@/lib/utils` como el resto del proyecto.

## No hacer en esta etapa (decisiones pendientes de Alejo)
- Color del sello "Verificado" en `components/cuidadores/tarjeta-cuidador.tsx` (hoy `bg-primary`): no tocar.
- Activación del modo oscuro (nadie pone la clase `.dark`) y su combinación con alto contraste.
- `timeZone: "America/Bogota"` en `lib/format.ts`.
- Nombre "Andrea" fijo en `components/teleasistencia/boton-alerta.tsx` (pasará a props en su etapa).
- `components/chip.tsx` mide `min-h-10` (45 px): anotar, no cambiar.

## Verificación
1. `npm run lint` y `npm test` sin errores; actualiza pruebas que verifiquen clases antiguas.
2. `npm run dev` y revisa en 390 px: botones, campos, badges, pestañas y diálogo de alerta en
   claro y con alto contraste (botón de contraste de la barra de accesibilidad).
3. Busca que no quede ningún color fijo: `grep -rnE '#[0-9a-fA-F]{3,6}|rgb\(|oklch\(|text-white|bg-white' components/ui`.
4. Al terminar, lista: archivos cambiados, componente nuevo, usos que tuviste que corregir.
