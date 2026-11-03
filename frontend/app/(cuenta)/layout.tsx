import Link from "next/link";
import { Lora } from "next/font/google";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Logo } from "@/components/logo";

// Serif solo para los títulos de estas pantallas (prueba de diseño): se carga aquí, no en el layout raíz, para no
// afectar el resto del sitio ni pagar su peso fuera de (cuenta).
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });

// Las pantallas de cuenta (ingresar, registro, recuperar, bienvenida, política): logo y contenido centrado, con la
// barra de accesibilidad a mano porque quien más la necesita llega aquí antes de entrar a la app.
export default function CuentaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${lora.variable} flex min-h-dvh flex-col bg-background`}>
      <BarraAccesibilidad />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
        <Link href="/" aria-label="Ir al inicio de Seniory" className="self-center">
          <Logo />
        </Link>
        <main className="mt-8 flex-1">{children}</main>
        <footer className="mt-10 flex flex-wrap justify-center gap-x-6 text-sm text-muted-foreground">
          <Link href="/privacidad" className="inline-flex min-h-12 items-center underline underline-offset-4">
            Política de tratamiento de datos
          </Link>
          <Link href="/terminos" className="inline-flex min-h-12 items-center underline underline-offset-4">
            Términos y condiciones
          </Link>
          <Link href="/alcance-teleasistencia" className="inline-flex min-h-12 items-center underline underline-offset-4">
            Alcance de la teleasistencia
          </Link>
        </footer>
      </div>
    </div>
  );
}
