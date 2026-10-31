// Una sola forma de comparar texto en las búsquedas (hallazgo H9): minúsculas, sin tildes ni signos
// de combinación, y con los espacios colapsados. «José», «JOSÉ» y «jose» son lo mismo; «Laureles,
// Medellín» y «laureles medellin» también.
//
// La base guarda este texto ya normalizado (`nombre_busqueda`, `zona_busqueda`) y la búsqueda normaliza lo
// que escribe la persona con ESTA misma función, así que los dos lados siempre coinciden y no hace falta la
// extensión `unaccent` en cada consulta.
export function normalizarParaBuscar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[,;.]+/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
