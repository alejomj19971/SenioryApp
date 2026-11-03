// Un par de manchas de color detrás de la tarjeta (prueba: ¿le da un aire más fresco a las pantallas de cuenta?).
// Puramente decorativo: `aria-hidden`, y se apaga en alto contraste (`globals.css`) para no restarle legibilidad a
// quien más la necesita.
export function FondoDecorativo() {
  return (
    <div aria-hidden="true" className="fondo-decorativo pointer-events-none absolute inset-x-0 top-0 h-[32rem] overflow-hidden">
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMin slice" className="h-full w-full">
        <path
          fill="var(--primary)"
          opacity="0.16"
          d="M48.6,-62.3C62.2,-54.2,72.1,-39.5,76.6,-23.3C81.1,-7.1,80.3,10.6,73.8,25.8C67.4,41,55.4,53.7,41.1,62.6C26.8,71.5,10.1,76.5,-6.9,76.8C-23.9,77.1,-41.1,72.6,-54.4,62.6C-67.7,52.6,-77.1,37.1,-80.4,20.2C-83.7,3.3,-80.9,-14.9,-73.1,-30.3C-65.3,-45.6,-52.5,-58,-38.1,-65.6C-23.7,-73.2,-7.7,-76.1,7.5,-75.9C22.7,-75.7,35,-70.4,48.6,-62.3Z"
          transform="translate(90 80) scale(1.3)"
        />
        <path
          fill="var(--success)"
          opacity="0.14"
          d="M44.7,-56.7C56.9,-49.1,65,-34.4,68.8,-18.6C72.6,-2.8,72.1,14.2,65.2,28.2C58.3,42.2,45,53.2,30.1,60.1C15.2,67,-1.3,69.8,-17.4,66.9C-33.5,64,-49.2,55.4,-59.5,42.2C-69.8,29,-74.7,11.2,-72.7,-5.6C-70.7,-22.4,-61.8,-38.2,-49,-46.5C-36.2,-54.8,-19.5,-55.6,-2.1,-52.6C15.3,-49.6,32.5,-64.3,44.7,-56.7Z"
          transform="translate(330 50) scale(1.2)"
        />
      </svg>
    </div>
  );
}
