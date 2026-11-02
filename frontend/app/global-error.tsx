"use client";

import "./globals.css";

// Solo se usa si el propio layout raíz falla (algo mucho menos probable que un error de una pantalla, que ya
// atrapan `error.tsx` en cada área). Por eso tiene su documento HTML completo: aquí no hay `<html>` ni `<body>` que
// lo envuelvan. No puede exportar metadatos ni usar `next/font` (es un boundary de error, fuera del árbol normal);
// trae sus propios tokens importando `globals.css` directo, como pide la guía de Next.
export default function ErrorGlobal({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh items-center justify-center bg-background px-4 text-center">
        <div className="flex max-w-xs flex-col items-center gap-5">
          <h1 className="text-2xl font-bold text-foreground">Seniory no pudo cargar</h1>
          <p className="text-base text-muted-foreground">Revisa tu conexión e inténtalo de nuevo.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="flex h-12 w-full items-center justify-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
