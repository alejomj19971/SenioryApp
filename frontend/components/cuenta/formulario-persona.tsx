"use client";

import { useActionState } from "react";
import { Campo, Lista, MensajeDeCampo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { registrarAdultoMayor } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { PARENTESCOS } from "@/lib/acciones/validar-cuenta";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = Array.from({ length: 31 }, (_, i) => ({ valor: String(i + 1), etiqueta: String(i + 1) }));
const OPCIONES_DE_MES = MESES.map((mes, i) => ({ valor: String(i + 1), etiqueta: mes }));

// De más reciente a más antiguo: la mayoría de las personas a cuidar nacieron hace 60 a 90 años.
function anios(anioActual: number) {
  return Array.from({ length: 121 }, (_, i) => ({ valor: String(anioActual - i), etiqueta: String(anioActual - i) }));
}

export function FormularioPersona({ anioActual }: { anioActual: number }) {
  const [estado, accion, pendiente] = useActionState(registrarAdultoMayor, ESTADO_INICIAL);
  const errorDeFecha = estado.errores?.fecha;
  const errorDeParentesco = estado.errores?.parentesco;

  return (
    <form action={accion} className="flex flex-col gap-6">
      <ResumenDelFormulario estado={estado} />
      <Campo
        nombre="nombre"
        etiqueta="¿Cómo se llama?"
        autoComplete="off"
        required
        maxLength={100}
        ayuda="Como le dices en casa, por ejemplo «Doña Carmen»."
        defaultValue={estado.valores?.nombre}
        error={estado.errores?.nombre}
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={errorDeFecha !== undefined ? "fecha-error" : undefined}>
        <legend className="mb-2 text-base font-medium">Fecha de nacimiento</legend>
        <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
          <Lista nombre="dia" etiqueta="Día" placeholder="Día" opciones={DIAS} valorInicial={estado.valores?.dia} error={errorDeFecha !== undefined} />
          <Lista nombre="mes" etiqueta="Mes" placeholder="Mes" opciones={OPCIONES_DE_MES} valorInicial={estado.valores?.mes} error={errorDeFecha !== undefined} />
          <Lista nombre="anio" etiqueta="Año" placeholder="Año" opciones={anios(anioActual)} valorInicial={estado.valores?.anio} error={errorDeFecha !== undefined} />
        </div>
        {errorDeFecha !== undefined && <MensajeDeCampo id="fecha-error">{errorDeFecha}</MensajeDeCampo>}
      </fieldset>

      <fieldset className="flex flex-col gap-3" aria-describedby={errorDeParentesco !== undefined ? "parentesco-error" : undefined}>
        <legend className="mb-1 text-base font-medium">¿Qué parentesco tienes con esta persona?</legend>
        <div className="flex flex-wrap gap-2">
          {PARENTESCOS.map(({ valor, etiqueta }) => (
            <label
              key={valor}
              className="inline-flex min-h-12 cursor-pointer items-center rounded-full border border-input bg-card px-5 text-base has-checked:border-primary has-checked:bg-primary has-checked:font-semibold has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name="parentesco"
                value={valor}
                required
                defaultChecked={estado.valores?.parentesco === valor}
                className="sr-only"
              />
              {etiqueta}
            </label>
          ))}
        </div>
        {errorDeParentesco !== undefined && <MensajeDeCampo id="parentesco-error">{errorDeParentesco}</MensajeDeCampo>}
      </fieldset>

      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Continuar"}
      </Button>
    </form>
  );
}
