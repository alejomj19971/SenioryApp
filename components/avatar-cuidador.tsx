import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { obtenerIniciales } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AvatarCuidadorProps {
  nombre: string;
  foto?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function AvatarCuidador({
  nombre,
  foto,
  size = "default",
  className,
}: AvatarCuidadorProps) {
  return (
    <Avatar size={size} className={cn(className)}>
      {foto && <AvatarImage src={foto} alt="" />}
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
        {obtenerIniciales(nombre)}
      </AvatarFallback>
    </Avatar>
  );
}
