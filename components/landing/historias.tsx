export function Historias() {
  return (
    <section className="bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Creciendo y cuidando juntos
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Detrás de cada cuidado hay una familia que quiere seguir
            compartiendo tiempo de calidad, sin la angustia de no saber si
            todo está bien.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <figure className="group overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-xl">
            <div className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/pareja-caminando.jpg"
                alt="Pareja de adultos mayores caminando tomados del brazo por un sendero de otoño"
                className="aspect-4/3 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            </div>
            <figcaption className="p-5 text-base text-muted-foreground">
              Salir a caminar, ir a citas médicas o simplemente conversar:
              acompañamiento presencial con quien de verdad se preocupa.
            </figcaption>
          </figure>

          <figure className="group overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-xl">
            <div className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/pareja-columpio.jpg"
                alt="Pareja de adultos mayores sonriendo juntos al aire libre"
                className="aspect-4/3 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            </div>
            <figcaption className="p-5 text-base text-muted-foreground">
              Más años de vida merecen más momentos así. Nuestro trabajo es
              darle a tu familia la tranquilidad para disfrutarlos.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
