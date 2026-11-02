"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Campo, Lista, MensajeDeCampo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { guardarPerfilAccion } from "@/lib/acciones/postulacion";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { ESPECIALIDADES, JORNADAS, LARGO_MAXIMO_DE_BIO } from "@/lib/acciones/validar-postulacion";
import type { MiPerfilDeCuidador } from "@/lib/types";

// El perfil del cuidador: lo que las familias verán cuando un revisor lo apruebe. Sirve para armarlo y para corregirlo.
// Un perfil ya activo no puede cambiar su especialidad ni su título (respaldan un título aprobado): esos campos se
// muestran sin poderse editar.
export function FormularioPerfil({ perfil }: { perfil: MiPerfilDeCuidador | null }) {
  const [estado, accion, pendiente] = useActionState(guardarPerfilAccion, ESTADO_INICIAL);
  const congelado = perfil?.estado === "activo";
  // Lo escrito (si hubo un error) manda sobre lo guardado.
  const valor = (campo: string, guardado: string) => estado.valores?.[campo] ?? guardado;
  const jornadasElegidas = estado.valores?.disponibilidad !== undefined ? estado.valores.disponibilidad.split(",") : (perfil?.disponibilidad ?? []);
  const errorDeJornadas = estado.errores?.disponibilidad;

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      <ResumenDelFormulario estado={estado} />
      {estado.listo === true && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-success bg-success/5 p-4 text-base text-foreground">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          {perfil === null ? "Perfil guardado. Ahora sube tus documentos." : "Cambios guardados."}
        </p>
      )}

      {congelado ? (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4 text-base text-foreground">
          <p>
            <strong>{ESPECIALIDADES.find((e) => e.valor === perfil.especialidad)?.etiqueta}</strong> · {perfil.titulo}
          </p>
          <p className="text-sm text-muted-foreground">Tu especialidad y tu título ya no se pueden cambiar: respaldan el título que verificamos.</p>
        </div>
      ) : (
        <>
          <Lista
            nombre="especialidad"
            etiqueta="Tu especialidad"
            placeholder="Elige una"
            opciones={ESPECIALIDADES.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }))}
            valorInicial={valor("especialidad", perfil?.especialidad ?? "")}
            error={estado.errores?.especialidad !== undefined}
          />
          {estado.errores?.especialidad !== undefined && <MensajeDeCampo id="especialidad-error">{estado.errores.especialidad}</MensajeDeCampo>}
          <Campo
            nombre="titulo"
            etiqueta="Título o formación"
            ayuda="Por ejemplo, «Auxiliar de enfermería, SENA»."
            required
            maxLength={150}
            defaultValue={valor("titulo", perfil?.titulo ?? "")}
            error={estado.errores?.titulo}
          />
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo
          nombre="aniosExperiencia"
          etiqueta="Años de experiencia"
          type="text"
          inputMode="numeric"
          required
          defaultValue={valor("aniosExperiencia", perfil === null ? "" : String(perfil.aniosExperiencia))}
          error={estado.errores?.aniosExperiencia}
        />
        <Campo
          nombre="tarifaHora"
          etiqueta="Tarifa por hora ($)"
          type="text"
          inputMode="numeric"
          required
          defaultValue={valor("tarifaHora", perfil === null ? "" : String(perfil.tarifaHora))}
          error={estado.errores?.tarifaHora}
        />
      </div>
      <Campo
        nombre="telefono"
        etiqueta="Tu celular"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        ayuda="Solo se lo damos a la familia mientras estés atendiendo a su persona."
        required
        defaultValue={valor("telefono", perfil?.telefono ?? "")}
        error={estado.errores?.telefono}
      />
      <Campo
        nombre="zona"
        etiqueta="Zona donde atiendes"
        ayuda="Por ejemplo, «Laureles, Medellín»."
        required
        maxLength={100}
        defaultValue={valor("zona", perfil?.zona ?? "")}
        error={estado.errores?.zona}
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={errorDeJornadas !== undefined ? "disponibilidad-error" : undefined}>
        <legend className="text-base font-medium text-foreground">¿En qué jornadas atiendes?</legend>
        <div className="flex flex-wrap gap-3">
          {JORNADAS.map((jornada) => (
            <label key={jornada.valor} className="flex min-h-12 items-center gap-2 rounded-lg border border-input bg-card px-4 text-base">
              <input type="checkbox" name="disponibilidad" value={jornada.valor} defaultChecked={jornadasElegidas.includes(jornada.valor)} className="size-5 accent-primary" />
              {jornada.etiqueta}
            </label>
          ))}
        </div>
        {errorDeJornadas !== undefined && <MensajeDeCampo id="disponibilidad-error">{errorDeJornadas}</MensajeDeCampo>}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Cuéntales a las familias quién eres</Label>
        <textarea
          id="bio"
          name="bio"
          rows={5}
          required
          maxLength={LARGO_MAXIMO_DE_BIO}
          defaultValue={valor("bio", perfil?.bio ?? "")}
          aria-invalid={estado.errores?.bio !== undefined ? true : undefined}
          aria-describedby={estado.errores?.bio !== undefined ? "bio-error" : "bio-ayuda"}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-2 aria-invalid:border-destructive"
        />
        <p id="bio-ayuda" className="text-sm text-muted-foreground">
          Hasta {LARGO_MAXIMO_DE_BIO} caracteres. Tu experiencia, cómo cuidas y qué te gusta de tu trabajo.
        </p>
        {estado.errores?.bio !== undefined && <MensajeDeCampo id="bio-error">{estado.errores.bio}</MensajeDeCampo>}
      </div>

      {perfil !== null && (
        <label htmlFor="aceptacionAutomatica" className="flex min-h-12 items-start gap-3 text-base">
          <input id="aceptacionAutomatica" name="aceptacionAutomatica" type="checkbox" defaultChecked={perfil.aceptacionAutomatica} className="mt-0.5 size-6 shrink-0 accent-primary" />
          <span>
            Aceptar automáticamente las solicitudes cuando esté libre en esa franja.
            <span className="block text-sm text-muted-foreground">Si no lo marcas, tú decides cada solicitud.</span>
          </span>
        </label>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : perfil === null ? "Guardar mi perfil" : "Guardar cambios"}
      </Button>
    </form>
  );
}
