"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";

const TAMANO_MAXIMO = 3 * 1024 * 1024;
const FORMATOS = ["image/jpeg", "image/png"];

// La foto de perfil del cuidador: se ve de inmediato a las familias en cuanto se sube, sin pasar por revisión (a
// diferencia de los documentos de verificación).
export function SubirFoto({ nombre, fotoUrl }: { nombre: string; fotoUrl: string | null }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La ruta no cambia al reemplazar la foto (es siempre `/api/cuidador/foto`): sin esto, el navegador no la
  // volvería a pedir y se seguiría viendo la anterior hasta recargar la página entera.
  const [version, setVersion] = useState(0);
  const src = fotoUrl === null ? undefined : version === 0 ? fotoUrl : `${fotoUrl}?v=${version}`;

  async function alElegir(archivo: File | undefined) {
    if (archivo === undefined) return;
    setError(null);
    if (!FORMATOS.includes(archivo.type)) {
      setError("Debe ser una foto JPEG o una imagen PNG.");
      return;
    }
    if (archivo.size === 0) {
      setError("El archivo está vacío.");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      setError("La foto pesa más de 3 MB. Elige una más liviana.");
      return;
    }
    setSubiendo(true);
    try {
      const respuesta = await fetch("/api/cuidador/foto", { method: "POST", headers: { "Content-Type": archivo.type }, body: archivo });
      const cuerpo = (await respuesta.json().catch(() => null)) as { ok: boolean; mensaje?: string } | null;
      if (!respuesta.ok || cuerpo?.ok !== true) {
        setError(cuerpo?.mensaje ?? "No pudimos subir la foto. Inténtalo de nuevo.");
        return;
      }
      setVersion((v) => v + 1);
      router.refresh();
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
      if (entrada.current !== null) entrada.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <AvatarCuidador nombre={nombre} foto={src} size="lg" />
      <div className="flex flex-col gap-2">
        <input
          ref={entrada}
          id="foto-de-perfil"
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(evento) => void alElegir(evento.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={subiendo} onClick={() => entrada.current?.click()}>
          <Upload aria-hidden="true" />
          {subiendo ? "Subiendo…" : fotoUrl === null ? "Subir foto de perfil" : "Cambiar foto"}
        </Button>
        {error !== null && <Aviso titulo="No se pudo subir" descripcion={error} />}
      </div>
    </div>
  );
}
