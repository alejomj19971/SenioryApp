"use client";

import { useState } from "react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface FotoDeCuidadorProps {
  nombre: string;
  foto?: string;
}

// La foto del cuidador en su perfil: lo bastante grande para verla bien de entrada, y con un toque se amplía
// todavía más. Para una familia, ver con claridad a quién va a dejar entrar a su casa importa — un avatar
// pequeño no basta.
export function FotoDeCuidador({ nombre, foto }: FotoDeCuidadorProps) {
  const [abierta, setAbierta] = useState(false);

  if (!foto) {
    return (
      <AvatarCuidador nombre={nombre} foto={foto} size="lg" className="size-28 ring-4 ring-primary/10" />
    );
  }

  return (
    <Dialog open={abierta} onOpenChange={setAbierta}>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <AvatarCuidador nombre={nombre} foto={foto} size="lg" className="size-28 ring-4 ring-primary/10" />
        <span className="sr-only">Ver la foto de {nombre} en grande</span>
      </button>
      <DialogContent className="flex flex-col items-center gap-4 sm:max-w-sm">
        <DialogTitle className="sr-only">Foto de {nombre}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element -- la foto viene de Cloudinary, no de un asset local */}
        <img src={foto} alt={`Foto de ${nombre}`} className="aspect-square w-full rounded-2xl object-cover" />
        <p className="text-center text-base font-semibold text-foreground">{nombre}</p>
      </DialogContent>
    </Dialog>
  );
}
