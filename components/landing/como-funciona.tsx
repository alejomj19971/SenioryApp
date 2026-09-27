const pasos = [
  {
    numero: "1",
    titulo: "Busca y filtra",
    descripcion: "Filtra por especialidad, zona, disponibilidad y tarifa hasta encontrar a la persona ideal.",
  },
  {
    numero: "2",
    titulo: "Revisa el perfil verificado",
    descripcion: "Antecedentes, títulos y prueba psicotécnica, además de reseñas de otras familias.",
  },
  {
    numero: "3",
    titulo: "Contrata por horas y monitorea",
    descripcion: "Agenda el servicio y sigue el bienestar de tu ser querido con teleasistencia gratuita.",
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="bg-secondary/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Cómo funciona
          </h2>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {pasos.map((paso, indice) => (
            <div key={paso.numero} className="relative flex flex-col gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-xl font-bold text-accent-foreground">
                {paso.numero}
              </span>
              <h3 className="text-xl font-semibold text-foreground">{paso.titulo}</h3>
              <p className="text-base text-muted-foreground">{paso.descripcion}</p>
              {indice < pasos.length - 1 && (
                <div
                  aria-hidden="true"
                  className="absolute top-6 left-[calc(100%+1rem)] hidden h-0.5 w-8 bg-border sm:block"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
