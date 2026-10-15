"use client";

import { useRouter } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { useReconocimientoVoz } from "@/lib/hooks/use-reconocimiento-voz";
import { cn } from "@/lib/utils";

interface ComandoVoz {
  frases: string[];
  accion: (router: ReturnType<typeof useRouter>) => void;
}

const comandos: ComandoVoz[] = [
  { frases: ["buscar cuidador", "buscar cuidadores"], accion: (router) => router.push("/app/cuidadores") },
  { frases: ["teleasistencia"], accion: (router) => router.push("/app/teleasistencia") },
  { frases: ["alerta", "ayuda"], accion: (router) => router.push("/app/teleasistencia?alerta=1") },
  { frases: ["inicio"], accion: (router) => router.push("/app") },
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Compara por palabras en vez de substring exacto, para tolerar frases
// naturales como "quiero buscar un cuidador" o "búscame un cuidador".
function coincideFrase(transcripcionNormalizada: string, frase: string): boolean {
  const palabrasTranscripcion = transcripcionNormalizada.split(/\s+/);
  return frase.split(" ").every((palabra) => palabrasTranscripcion.includes(palabra));
}

export function BotonVoz() {
  const router = useRouter();
  const { soportado, escuchando, mensaje, alternarEscucha } = useReconocimientoVoz(
    (transcripcionOriginal) => {
      const transcripcion = normalizar(transcripcionOriginal);
      const comando = comandos.find((c) =>
        c.frases.some((frase) => coincideFrase(transcripcion, frase)),
      );
      if (comando) {
        comando.accion(router);
        return;
      }
      return `No reconocí "${transcripcionOriginal}". Prueba con "buscar cuidador", "teleasistencia", "alerta" o "inicio".`;
    },
  );

  if (!soportado) return null;

  return (
    <div className="relative flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={alternarEscucha}
        aria-pressed={escuchando}
        aria-label={
          escuchando
            ? "Detener comando de voz"
            : 'Activar comando de voz: di "buscar cuidador", "teleasistencia", "alerta" o "inicio"'
        }
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          escuchando
            ? "animate-pulse border-destructive bg-destructive text-white"
            : "border-primary bg-primary/10 text-primary hover:bg-primary/20",
        )}
      >
        {escuchando ? (
          <MicOff className="size-5" aria-hidden="true" />
        ) : (
          <Mic className="size-5" aria-hidden="true" />
        )}
      </button>
      <span className="text-[10px] font-medium text-muted-foreground">Voz</span>

      {mensaje && (
        <div
          role="status"
          className="absolute top-full right-0 z-40 mt-2 w-56 rounded-xl bg-foreground px-3 py-2 text-left text-xs font-medium text-background shadow-lg"
        >
          {mensaje}
        </div>
      )}
    </div>
  );
}
