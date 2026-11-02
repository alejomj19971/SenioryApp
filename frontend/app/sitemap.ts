import type { MetadataRoute } from "next";
import { urlPublicaDelSitio } from "@/lib/configuracion";

// `GET /sitemap.xml` (F10 §7). Solo lo público: la landing y las pantallas de cuenta sin sesión. Las áreas
// protegidas (`/app`, `/cuidador`, `/admin`) no tienen nada que un buscador deba indexar.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlPublicaDelSitio();
  const ahora = new Date();
  const rutas = ["/", "/ingresar", "/registro", "/registro/cuidador", "/privacidad", "/terminos", "/alcance-teleasistencia"];
  return rutas.map((ruta) => ({ url: `${base}${ruta}`, lastModified: ahora }));
}
