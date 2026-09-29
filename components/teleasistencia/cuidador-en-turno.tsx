"use client";

import Link from "next/link";
import { ChevronRight, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { etiquetaEspecialidad } from "@/lib/format";
import type { Cuidador } from "@/lib/types";

export function CuidadorEnTurno({
  cuidador,
  adultoMayorNombre,
}: {
  cuidador: Cuidador;
  adultoMayorNombre: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-border transition-colors hover:ring-primary/40"
        aria-label={`Ver datos de contacto de ${cuidador.nombre}, quien está cuidando a ${adultoMayorNombre} ahora`}
      >
        <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" />
        <div className="flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <span className="flex size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            Cuidando a {adultoMayorNombre} ahora
          </p>
          <p className="text-base font-semibold text-foreground">{cuidador.nombre}</p>
          <p className="text-sm text-muted-foreground">
            {etiquetaEspecialidad(cuidador.especialidad)}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" className="size-14" />
            <div>
              <DialogTitle>{cuidador.nombre}</DialogTitle>
              <DialogDescription>{cuidador.titulo}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          Cuidador verificado — a cargo de {adultoMayorNombre} ahora
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${cuidador.telefono}`}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            <Phone className="size-4" aria-hidden="true" />
            Llamar
          </a>
          <Link
            href={`/app/mensajes/${cuidador.id}`}
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Escribir
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
