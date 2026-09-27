import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Problema } from "@/components/landing/problema";
import { Pilares } from "@/components/landing/pilares";
import { Confianza } from "@/components/landing/confianza";
import { ComoFunciona } from "@/components/landing/como-funciona";
import { Bolsas } from "@/components/landing/bolsas";
import { AccesibilidadSeccion } from "@/components/landing/accesibilidad-seccion";
import { CtaFinal } from "@/components/landing/cta-final";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Problema />
        <Pilares />
        <Confianza />
        <ComoFunciona />
        <Bolsas />
        <AccesibilidadSeccion />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}
