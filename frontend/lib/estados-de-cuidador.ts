// Los estados de un cuidador en el panel del administrador, en el orden en que se ofrecen como filtro. Va aparte del
// servicio (que es solo de servidor) para que el listado, que se prueba sin servidor, pueda usarlo.
export type EstadoDeCuidadorEnElPanel = "activo" | "en_revision" | "borrador" | "suspendido";

export const ESTADOS_DE_CUIDADOR_EN_EL_PANEL: EstadoDeCuidadorEnElPanel[] = ["activo", "en_revision", "borrador", "suspendido"];
