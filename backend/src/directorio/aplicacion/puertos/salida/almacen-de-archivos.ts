// Dónde viven los archivos de los cuidadores (hoja de vida, documentos de verificación desde M9, y la foto de
// perfil desde M11). Los documentos son privados: nunca se sirven con una dirección permanente, sino con una URL
// firmada que vence en minutos, así un enlace copiado deja de funcionar. La foto de perfil es lo contrario a
// propósito: la familia la ve en cada búsqueda, así que necesita una dirección pública y cacheable, no una que
// venza.
//
// El almacén real (un bucket del hosting) llega con el hosting elegido. Mientras tanto, fuera de producción hay
// uno local en disco y, en producción, uno deshabilitado que responde «no disponible» en lugar de fingir que
// guarda.
export interface AlmacenDeArchivos {
  readonly disponible: boolean;

  guardar(
    clave: string,
    contenido: Uint8Array,
    tipoMime: string,
  ): Promise<void>;

  // Dirección temporal para ver el archivo. Es la que se entrega a la persona.
  urlFirmada(clave: string, vigenciaEnSegundos: number): string;

  // Dirección pública y permanente, SOLO para archivos no sensibles (la foto de perfil, bajo «fotos/»). Nunca para
  // documentos de verificación.
  urlPublica(clave: string): string;
}

export const ALMACEN_DE_ARCHIVOS = Symbol('AlmacenDeArchivos');
