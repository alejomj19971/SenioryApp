import { Aviso } from "@/components/ui/aviso";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";

// El aviso de arriba de un formulario (`role="alert"`: se anuncia a los lectores de pantalla). Un error de la
// pantalla se muestra tal cual; si solo hay errores de campo, se avisa que hay datos por corregir y cada campo
// trae el suyo.
export function ResumenDelFormulario({ estado }: { estado: EstadoDeFormulario }) {
  if (estado.mensaje !== undefined) return <Aviso titulo={estado.mensaje} />;
  const cantidad = Object.keys(estado.errores ?? {}).length;
  if (cantidad === 0) return null;
  return (
    <Aviso
      titulo="Revisa lo que escribiste"
      descripcion={
        cantidad === 1 ? "Hay un dato por corregir, marcado abajo." : `Hay ${cantidad} datos por corregir, marcados abajo.`
      }
    />
  );
}
