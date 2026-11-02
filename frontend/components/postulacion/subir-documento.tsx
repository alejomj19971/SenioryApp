"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, Upload, XCircle } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentoSubido, TipoDeDocumento } from "@/lib/types";

const TAMANO_MAXIMO = 5 * 1024 * 1024;
const FORMATOS = ["application/pdf", "image/jpeg", "image/png"];

interface SubirDocumentoProps {
  tipo: TipoDeDocumento;
  titulo: string;
  ayuda: string;
  // Los ya subidos de este tipo (el más reciente decide).
  subidos: DocumentoSubido[];
  soloPdf?: boolean;
}

const ESTADOS: Record<DocumentoSubido["estado"], { texto: string; variante: "warning" | "success" | "destructive"; icono: typeof Clock }> = {
  pendiente: { texto: "En revisión", variante: "warning", icono: Clock },
  aprobado: { texto: "Aprobado", variante: "success", icono: CircleCheck },
  rechazado: { texto: "Rechazado", variante: "destructive", icono: XCircle },
};

const kilobytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Un documento de la postulación: se ve lo que ya se subió y se sube otro. El archivo viaja como cuerpo de la petición a
// nuestro servidor, que lo reenvía; aquí solo se comprueba lo evidente (tipo y tamaño) para responder sin esperar.
export function SubirDocumento({ tipo, titulo, ayuda, subidos, soloPdf = false }: SubirDocumentoProps) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subioAhora, setSubioAhora] = useState(false);
  const ultimo = [...subidos].sort((a, b) => b.subidoEn.localeCompare(a.subidoEn))[0];
  const estado = ultimo === undefined ? null : ESTADOS[ultimo.estado];
  const idDeAyuda = `${tipo}-ayuda`;

  async function alElegir(archivo: File | undefined) {
    if (archivo === undefined) return;
    setError(null);
    setSubioAhora(false);
    const permitidos = soloPdf ? ["application/pdf"] : FORMATOS;
    if (!permitidos.includes(archivo.type)) {
      setError(soloPdf ? "Debe ser un PDF." : "Debe ser un PDF, una foto JPEG o una imagen PNG.");
      return;
    }
    if (archivo.size === 0) {
      setError("El archivo está vacío.");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      setError("El archivo pesa más de 5 MB. Elige uno más liviano.");
      return;
    }
    setSubiendo(true);
    try {
      const respuesta = await fetch(`/api/cuidador/documentos/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": archivo.type, "X-Nombre-De-Archivo": encodeURIComponent(archivo.name) },
        body: archivo,
      });
      const cuerpo = (await respuesta.json().catch(() => null)) as { ok: boolean; mensaje?: string } | null;
      if (!respuesta.ok || cuerpo?.ok !== true) {
        setError(cuerpo?.mensaje ?? "No pudimos subir el archivo. Inténtalo de nuevo.");
        return;
      }
      setSubioAhora(true);
      router.refresh();
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
      if (entrada.current !== null) entrada.current.value = "";
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-foreground">{titulo}</p>
        {estado !== null && (
          <Badge variant={estado.variante}>
            <estado.icono aria-hidden="true" />
            {estado.texto}
          </Badge>
        )}
      </div>
      <p id={idDeAyuda} className="text-sm text-muted-foreground">
        {ayuda}
      </p>
      {ultimo !== undefined && (
        <p className="text-sm text-foreground">
          Último archivo: {ultimo.nombre} ({kilobytes(ultimo.tamanoBytes)})
        </p>
      )}
      {subioAhora && (
        <p role="status" className="text-sm font-medium text-success">
          Archivo subido.
        </p>
      )}
      {error !== null && <Aviso titulo="No se pudo subir" descripcion={error} />}
      <input
        ref={entrada}
        id={`archivo-${tipo}`}
        type="file"
        accept={soloPdf ? "application/pdf" : "application/pdf,image/jpeg,image/png"}
        className="sr-only"
        aria-describedby={idDeAyuda}
        onChange={(evento) => void alElegir(evento.target.files?.[0])}
      />
      <Button type="button" variant={ultimo === undefined ? "default" : "outline"} disabled={subiendo} onClick={() => entrada.current?.click()}>
        <Upload aria-hidden="true" />
        {subiendo ? "Subiendo…" : ultimo === undefined ? `Subir ${titulo.toLowerCase()}` : "Subir uno nuevo"}
      </Button>
    </li>
  );
}
