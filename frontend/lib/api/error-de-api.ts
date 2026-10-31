// Un error de la API del backend, ya traducido a algo que se puede mostrar. Se construye desde la
// respuesta `application/problem+json` del backend (RFC 9457, con `codigo` e `idDeCorrelacion`), o desde
// una falla de red. Los mensajes están en español y nunca incluyen detalles internos.

export interface ErrorDeCampo {
  // Ruta del campo, por ejemplo «correo» o «direccion.ciudad».
  campo: string;
  mensaje: string;
}

export interface DatosDeErrorDeApi {
  estado: number;
  codigo: string;
  mensaje: string;
  errores?: ErrorDeCampo[];
  idDeCorrelacion?: string;
}

export const MENSAJE_SIN_CONEXION =
  "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.";
export const MENSAJE_TIEMPO_AGOTADO =
  "El servicio tardó demasiado en responder. Inténtalo de nuevo en un momento.";
export const MENSAJE_SERVICIO_CAIDO =
  "El servicio no responde por ahora. Inténtalo de nuevo en unos minutos.";
export const MENSAJE_GENERICO =
  "Ocurrió un error inesperado. Inténtalo de nuevo.";

export class ErrorDeApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly errores: ErrorDeCampo[];
  readonly idDeCorrelacion: string | undefined;

  constructor(datos: DatosDeErrorDeApi) {
    super(datos.mensaje);
    this.name = "ErrorDeApi";
    this.estado = datos.estado;
    this.codigo = datos.codigo;
    this.errores = datos.errores ?? [];
    this.idDeCorrelacion = datos.idDeCorrelacion;
  }

  // El mensaje del error de un campo concreto, para mostrarlo junto al campo.
  mensajeDelCampo(campo: string): string | undefined {
    return this.errores.find((error) => error.campo === campo)?.mensaje;
  }

  // Desde la respuesta HTTP de un error. Si no es `problem+json` (por ejemplo, un 502 con HTML del
  // hosting), se usa un mensaje genérico según el estado.
  static async desdeRespuesta(respuesta: Response): Promise<ErrorDeApi> {
    const problema = await leerProblema(respuesta);
    if (problema !== null) {
      return new ErrorDeApi({
        estado: respuesta.status,
        codigo: problema.codigo,
        mensaje: problema.detail ?? problema.title ?? MENSAJE_GENERICO,
        errores: problema.errores,
        idDeCorrelacion: problema.idDeCorrelacion,
      });
    }
    const servicioCaido = respuesta.status === 502 || respuesta.status === 503 || respuesta.status === 504;
    return new ErrorDeApi({
      estado: respuesta.status,
      codigo: servicioCaido ? "servicio_no_disponible" : "error_desconocido",
      mensaje: servicioCaido ? MENSAJE_SERVICIO_CAIDO : MENSAJE_GENERICO,
    });
  }

  // Desde una falla antes de recibir respuesta: sin red, o más de lo permitido sin contestar.
  static deRed(causa: unknown): ErrorDeApi {
    const agotado =
      causa instanceof Error && (causa.name === "TimeoutError" || causa.name === "AbortError");
    return new ErrorDeApi({
      estado: 0,
      codigo: agotado ? "tiempo_agotado" : "sin_conexion",
      mensaje: agotado ? MENSAJE_TIEMPO_AGOTADO : MENSAJE_SIN_CONEXION,
    });
  }
}

interface Problema {
  codigo: string;
  title?: string;
  detail?: string;
  errores?: ErrorDeCampo[];
  idDeCorrelacion?: string;
}

async function leerProblema(respuesta: Response): Promise<Problema | null> {
  const tipo = respuesta.headers.get("content-type") ?? "";
  if (!tipo.includes("application/problem+json")) return null;
  try {
    const cuerpo: unknown = await respuesta.json();
    if (typeof cuerpo !== "object" || cuerpo === null) return null;
    const { codigo, title, detail, errores, idDeCorrelacion } = cuerpo as Record<string, unknown>;
    if (typeof codigo !== "string") return null;
    return {
      codigo,
      title: typeof title === "string" ? title : undefined,
      detail: typeof detail === "string" ? detail : undefined,
      errores: Array.isArray(errores) ? errores.filter(esErrorDeCampo) : undefined,
      idDeCorrelacion: typeof idDeCorrelacion === "string" ? idDeCorrelacion : undefined,
    };
  } catch {
    return null;
  }
}

function esErrorDeCampo(valor: unknown): valor is ErrorDeCampo {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as ErrorDeCampo).campo === "string" &&
    typeof (valor as ErrorDeCampo).mensaje === "string"
  );
}
