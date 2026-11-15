import Link from "next/link";
import { Lora } from "next/font/google";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Logo } from "@/components/logo";
import { PanelDeMarca } from "@/components/cuenta/panel-de-marca";

// Serif solo para los títulos de estas pantallas (prueba de diseño): se carga aquí, no en el layout raíz, para no
// afectar el resto del sitio ni pagar su peso fuera de (cuenta).
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });

// Las pantallas de cuenta (ingresar, registro, recuperar, bienvenida, política): logo y contenido centrado, con la
// barra de accesibilidad a mano porque quien más la necesita llega aquí antes de entrar a la app. En escritorio
// (`lg:`) se suma un panel de marca a la derecha: sin él, la tarjeta angosta (pensada para celular) deja mucho
// espacio vacío en una pantalla ancha.
export default function CuentaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${lora.variable} flex min-h-dvh flex-col bg-background`}>
      <BarraAccesibilidad />
      {/* La fila (el panel de marca solo entra desde `lg:`) queda SEPARADA de la barra de accesibilidad: si
          `flex-row` estuviera en el contenedor de arriba, la barra se volvería una columna angosta más. */}
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 lg:mx-0 lg:max-w-none lg:flex-1 lg:justify-center lg:px-12 xl:px-20">
          <Link href="/" aria-label="Ir al inicio de Seniory" className="self-center">
            <Logo />
          </Link>
          <main className="mt-8 flex-1 lg:mx-auto lg:mt-8 lg:w-full lg:max-w-md lg:flex-none">{children}</main>
          <footer className="mt-10 flex flex-wrap justify-center gap-x-6 text-sm text-muted-foreground lg:mt-8">
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
        <PanelDeMarca />
      </div>
    </div>
  );
}
