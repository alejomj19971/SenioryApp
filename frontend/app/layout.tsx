import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AccesibilidadProvider } from "@/components/accesibilidad/accesibilidad-provider";
import { urlPublicaDelSitio } from "@/lib/configuracion";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const descripcion =
  "Marketplace de cuidado para adultos mayores en Colombia. Cuidadores verificados por horas y teleasistencia gratuita para cuidar con confianza a quienes más quieres.";

export const metadata: Metadata = {
  // Resuelve las direcciones relativas de Open Graph y los enlaces canónicos (F10 §7). Sin dominio propio
  // todavía cae en `localhost`; se vuelve real al configurar `URL_PUBLICA_DEL_SITIO` en el hosting elegido.
  metadataBase: new URL(urlPublicaDelSitio()),
  title: {
    default: "Seniory — Creciendo y cuidando juntos",
    template: "%s · Seniory",
  },
  description: descripcion,
  openGraph: {
    title: "Seniory — Creciendo y cuidando juntos",
    description: descripcion,
    locale: "es_CO",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AccesibilidadProvider>{children}</AccesibilidadProvider>
      </body>
    </html>
  );
}
