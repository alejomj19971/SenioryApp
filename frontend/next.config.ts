import type { NextConfig } from "next";

// Cabeceras de seguridad (F10 §7, guía de CSP de Next en `node_modules/next/dist/docs`). Sin nonces a propósito: un
// nonce exige que TODA la aplicación se renderice dinámicamente (la guía lo advierte: sin caché de CDN, más carga en
// el servidor), y la landing debe poder quedar estática. En cambio, la arquitectura BFF ya hace el trabajo fuerte: el
// navegador NUNCA habla con el backend (`connect-src 'self'` basta de verdad), no hay `<iframe>` en la aplicación, y
// el pago se abre con una navegación completa (`window.location.assign`), no un `<script>` de un tercero. La única
// excepción a "ningún origen externo" son los tiles del mapa (`img-src`, M2/F2): Leaflet los pide como `<img>`
// directo al navegador, sin pasar por el BFF, así que necesitan su propio permiso. `style-src`/`script-src` llevan
// `unsafe-inline` porque Next no inyecta un nonce sin la configuración de arriba y dos pantallas usan `style={{}}`
// en línea (gráficas y barras); es la cabecera de siempre de un Next sin nonces, no una ausencia de CSP.
const esProduccion = process.env.NODE_ENV === "production";

const politicaDeContenido = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${esProduccion ? "" : " 'unsafe-eval'"};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.tile.openstreetmap.org;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Todas las rutas, incluidas las de /api (route handlers del BFF): también sirven HTML de error o
        // texto plano, y la misma cabecera no hace daño a una respuesta JSON.
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: politicaDeContenido },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Respaldo de `frame-ancestors 'none'` para navegadores que no leen CSP (H10: nadie debe poder
          // incrustar Seniory en otro sitio para engañar a una familia).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nada de cámara ni pagos del navegador. El micrófono es para el comando de voz y la ubicación
          // para «Buscar cerca de mí» (familia) y el pin del cuidador en su perfil (M2/F2): las dos son
          // las únicas que la aplicación usa de verdad, y solo del propio origen.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
