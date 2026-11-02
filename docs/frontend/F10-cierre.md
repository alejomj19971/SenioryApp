# F10 — Cierre para producción

| Campo | Valor |
|---|---|
| **Módulo** | F10 (último del plan v2) |
| **Requiere en el backend** | M10 (endurecimiento y despliegue) |
| **Estado** | Construido (2026-11-02) |

## Qué hace
- **Páginas legales:** `/privacidad` (F1), `/terminos` y `/alcance-teleasistencia` (nuevas), enlazadas desde el pie de la landing, el pie de las pantallas de cuenta y el registro.
- **SEO:** `app/robots.ts` (excluye `/app`, `/cuidador`, `/admin` y `/api`) y `app/sitemap.ts` (solo lo público), `metadataBase` en el layout raíz para que Open Graph resuelva direcciones absolutas.
- **Cabeceras de seguridad** en `next.config.ts`: Content-Security-Policy, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security`, en toda ruta.
- **Un error boundary por área:** `/app`, `/cuidador`, `/admin` y la raíz (para la landing y las pantallas de cuenta) tienen el suyo, con un componente compartido (`PantallaDeError`) que nunca muestra el mensaje crudo del error; `global-error.tsx` cubre si el propio layout raíz falla.
- **Imágenes de la landing** con `next/image` (antes `<img>` sin optimizar): recorte, tamaños responsivos y carga diferida salvo la del hero (`priority`).

## Decisiones
| Tema | Decisión |
|---|---|
| CSP sin nonces | La guía de CSP de Next recomienda un nonce por petición, pero eso fuerza **toda** la aplicación a renderizarse dinámicamente (sin caché de CDN, más carga en el servidor — la guía lo advierte). La arquitectura BFF ya hace el trabajo fuerte: el navegador **nunca** habla con el backend ni con ningún origen externo, no hay `<iframe>`, y el pago es una navegación completa, no un script de un tercero. Con eso, `connect-src 'self'` es literal y una CSP estática (sin nonces) ya cierra lo que importa: ni `<iframe>` ajeno (`frame-ancestors 'none'`), ni recursos de otro origen, ni MIME sniffing. `script-src`/`style-src` llevan `unsafe-inline` (dos pantallas usan `style={{}}` en línea). Queda anotado en PENDIENTES para revisar al elegir el hosting. |
| `URL_PUBLICA_DEL_SITIO` | Nueva variable, **sin seguridad de por medio** (a diferencia de `SENIORY_API_URL`/`SENIORY_BFF_SECRETO`): si falta, cae a `localhost` sin romper nada. En Vercel se completa sola (`VERCEL_PROJECT_PRODUCTION_URL`); con otro hosting se fija a mano. |
| Error boundaries | Cada área vuelve a SU propio inicio (`/app`, `/cuidador`, `/admin`, `/`), nunca a uno genérico. Ninguno muestra `error.message`: Next ya lo reemplaza en errores del servidor para no filtrar detalles, y uno del navegador podría traerlos; solo se ve un texto fijo y, si existe, el `digest` para dar soporte. |
| Sentry | **No se instaló.** Necesita una cuenta y un `SENTRY_DSN` que no existen todavía (ya estaba anotado como tarea del usuario); instalar `@sentry/nextjs` sin DSN lo dejaría sin configurar y es una dependencia nueva. Los errores del servidor ya traen un `digest` para buscarlos en el log mientras tanto. |
| Exportar/eliminar cuenta | El backend no tiene esas rutas todavía (quedó como opcional en M1); no se construyó nada en el frontend porque no hay qué llamar. La política de privacidad lo dice así: «los canales se publicarán aquí antes del lanzamiento». |
| Lighthouse | **No se corrió en esta sesión**: la CLI de Lighthouse pide descargar un paquete, y la política de la sesión no permitió ejecutarlo. Queda en PENDIENTES para correrlo contra la build de producción antes de lanzar. En su lugar, se revisó a mano: semántica (encabezados, `role="note"`, `aria-hidden` en lo decorativo), objetivos táctiles ≥ 48 px y el mismo sistema de tokens ya medido en Etapa 0. |
| Fotos de la landing | Sin cambiar: se verificó que no quedó ningún texto de «ejemplo» o «demo» visible (ya se había limpiado en F7). La licencia de las fotos de `public/img` sigue pendiente de confirmar (anotado en PENDIENTES, backend M2). |

## Pruebas
Unitarias (`urlPublicaDelSitio` con sus tres niveles de respaldo, `robots.ts`/`sitemap.ts` excluyen las áreas protegidas, las cabeceras de `next.config.ts` incluyen la CSP y dejan el micrófono para el comando de voz, `PantallaDeError` nunca muestra el mensaje crudo y cada área vuelve a su propio inicio) y recorridos (`robots.txt` y `sitemap.xml` servidos y correctos, las cabeceras llegan en cada respuesta, las páginas legales se alcanzan desde el pie y el registro, y `/app`/`/cuidador`/`/admin` sin sesión piden ingresar). El cambio de imágenes se verificó con capturas antes/después de la build de producción (sin diferencia visual).
