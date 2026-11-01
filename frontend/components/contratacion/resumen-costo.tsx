import { Loader2 } from "lucide-react";
import { formatearCOP } from "@/lib/format";

interface ResumenCostoProps {
  subtotal: number;
  cargo: number;
  cargoPorcentaje: number;
  total: number;
  // Mientras el servidor recalcula (al cambiar las horas).
  calculando?: boolean;
}

// Lo que paga la familia. Los números los pone el SERVIDOR (cotización o servicio ya pedido): el navegador solo los
// muestra. Nunca muestra lo que recibe el cuidador.
export function ResumenCosto({ subtotal, cargo, cargoPorcentaje, total, calculando = false }: ResumenCostoProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4" aria-busy={calculando}>
      <div className="flex items-center justify-between text-base text-muted-foreground">
        <span>Subtotal</span>
        <span className="font-medium text-foreground">{formatearCOP(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-base text-muted-foreground">
        <span>Cargo de servicio ({cargoPorcentaje.toLocaleString("es-CO")} %)</span>
        <span className="font-medium text-foreground">{formatearCOP(cargo)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Este cargo cubre la verificación de antecedentes, títulos y prueba psicotécnica de cada cuidador, y la teleasistencia gratuita.
      </p>
      <div className="h-px bg-border" />
      <div className="flex items-center justify-between text-lg font-bold text-foreground">
        <span>Total</span>
        <span className="flex items-center gap-2" aria-live="polite">
          {calculando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Calculando" />}
          {formatearCOP(total)}
        </span>
      </div>
    </div>
  );
}
