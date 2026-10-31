// Dónde viven los archivos de los cuidadores (hoja de vida, y en M9 los documentos de verificación). El
// archivo nunca se sirve con una dirección permanente: se entrega una URL firmada que vence en minutos,
// así un enlace copiado deja de funcionar.
//
// El almacén real (un bucket privado del hosting) llega con el hosting elegido. Mientras tanto, fuera de
// producción hay uno local en disco y, en producción, uno deshabilitado que responde «no disponible» en
// lugar de fingir que guarda.
export interface AlmacenDeArchivos {
  readonly disponible: boolean;

  guardar(
    clave: string,
    contenido: Uint8Array,
    tipoMime: string,
  ): Promise<void>;

  // Dirección temporal para ver el archivo. Es la que se entrega a la persona.
  urlFirmada(clave: string, vigenciaEnSegundos: number): string;
}

export const ALMACEN_DE_ARCHIVOS = Symbol('AlmacenDeArchivos');
