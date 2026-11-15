"use client";

import { useActionState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Campo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import {
  confirmarSegundoFactorAccion,
  desactivarSegundoFactorAccion,
  iniciarSegundoFactorAccion,
  type EstadoDeConfiguracion,
} from "@/lib/acciones/segundo-factor";

// Activar: genera el secreto (código QR) y pide un código real para confirmar que quedó bien configurado.
function Activar() {
  const [estado, iniciar, iniciando] = useActionState<EstadoDeConfiguracion, FormData>(iniciarSegundoFactorAccion, {});
  const [confirmacion, confirmar, confirmando] = useActionState(confirmarSegundoFactorAccion, ESTADO_INICIAL);

  if (estado.uriDeInscripcion === undefined) {
    return (
      <form action={iniciar} className="flex flex-col gap-4">
        <p className="text-base text-muted-foreground">
          Protege tu cuenta con un código que cambia cada 30 segundos, además de tu contraseña. Necesitas una app
          autenticadora en tu celular (Google Authenticator, Authy o similar).
        </p>
        {estado.mensaje !== undefined && <Aviso titulo={estado.mensaje} />}
        <Button type="submit" size="lg" className="w-fit" disabled={iniciando}>
          <ShieldCheck aria-hidden="true" />
          {iniciando ? "Generando…" : "Activar verificación en dos pasos"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-5">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={estado.uriDeInscripcion} size={200} />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Escanéalo con tu app autenticadora. Si no puedes escanear, escribe este código a mano:
        </p>
        <p className="rounded-lg bg-background px-3 py-2 font-mono text-sm break-all text-foreground">{estado.secretoManual}</p>
      </div>
      <form action={confirmar} className="flex flex-col gap-4">
        <ResumenDelFormulario estado={confirmacion} />
        <Campo
          nombre="codigo"
          etiqueta="Código de tu app"
          type="text"
          icono={KeyRound}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          required
          error={confirmacion.errores?.codigo}
        />
        <Button type="submit" size="lg" className="w-fit" disabled={confirmando}>
          {confirmando ? "Confirmando…" : "Confirmar y activar"}
        </Button>
      </form>
    </div>
  );
}

// Desactivar: un botón, sin campos ni confirmación extra (se puede volver a activar cuando se quiera).
function Desactivar() {
  return (
    <form action={desactivarSegundoFactorAccion} className="flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 text-base font-medium text-success">
        <ShieldCheck className="size-5" aria-hidden="true" />
        La verificación en dos pasos está activa.
      </p>
      <Button type="submit" variant="outline">
        Desactivar
      </Button>
    </form>
  );
}

export function SegundoFactor({ activo }: { activo: boolean }) {
  return activo ? <Desactivar /> : <Activar />;
}
