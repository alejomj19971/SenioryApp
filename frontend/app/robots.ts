import type { MetadataRoute } from "next";
import { urlPublicaDelSitio } from "@/lib/configuracion";

// `GET /robots.txt` (F10 §7). Fuera de los buscadores quedan las áreas con sesión: nada ahí es público, y un
// buscador que las indexara solo mostraría pantallas de «ingresa para ver esto» (o, peor, filtraría que existen
// ciertas rutas). `/api` también: son los *route handlers* del BFF, nunca páginas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/cuidador", "/admin", "/api"],
    },
    sitemap: `${urlPublicaDelSitio()}/sitemap.xml`,
  };
}
