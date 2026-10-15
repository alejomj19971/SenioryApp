import type { ResumenServicio } from "@/lib/pricing";
import { formatearCOP } from "@/lib/format";

export function ResumenCosto({ resumen }: { resumen: ResumenServicio }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
      <div className="flex items-center justify-between text-base text-muted-foreground">
        <span>Subtotal</span>
        <span className="font-medium text-foreground">
          {formatearCOP(resumen.subtotal)}
        </span>
      </div>
      <div className="flex items-center justify-between text-base text-muted-foreground">
        <span>Cargo de servicio (8%)</span>
        <span className="font-medium text-foreground">
          {formatearCOP(resumen.cargoFamilia)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Este cargo cubre la verificación de antecedentes, títulos y prueba
        psicotécnica de cada cuidador, y la teleasistencia gratuita.
      </p>
      <div className="h-px bg-border" />
      <div className="flex items-center justify-between text-lg font-bold text-foreground">
        <span>Total</span>
        <span>{formatearCOP(resumen.totalFamilia)}</span>
      </div>
    </div>
  );
}
