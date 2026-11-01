import "server-only";
import { escribirEnBackend, leerDelBackend, type ResultadoDeEscritura } from "@/lib/api/cliente-servidor";
import type {
  CuidadorEnTurnoDelBackend,
  PaginaDeServiciosDelBackend,
  RespuestaDeCotizacion,
  RespuestaDeCuidadorEnTurno,
  RespuestaDeServicioParaCuidador,
  RespuestaDeServicioParaFamilia,
  ServicioParaCuidadorDelBackend,
  ServicioParaFamiliaDelBackend,
  VistaBasicaDelBackend,
} from "@/lib/api/contratos/reservas";
import type {
  Cotizacion,
  CuidadorEnTurno,
  DatosDeSolicitud,
  EstadoDeServicio,
  Servicio,
  ServicioBase,
  ServicioDelCuidador,
} from "@/lib/types";

// Servicios (Reservas, M4) sobre la API. Aquí se mapea el contrato a los tipos de las pantallas. La familia y el
// cuidador reciben vistas distintas del dinero: el mapeo de cada una es una lista blanca, para que lo de una parte
// nunca pase a la otra por descuido.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function aBase(v: VistaBasicaDelBackend & { tarifaHora: number }): ServicioBase {
  return {
    id: v.id,
    estado: v.estado,
    fecha: v.fecha,
    jornada: v.jornada,
    horas: v.horas,
    medioDePago: v.medioDePago,
    solicitudExpiraEn: v.solicitudExpiraEn,
    cuidador: v.cuidador,
    adultoMayor: v.adultoMayor,
    solicitadoEn: v.solicitadoEn,
    aceptadoEn: v.aceptadoEn,
    iniciadoEn: v.iniciadoEn,
    finalizadoEn: v.finalizadoEn,
    canceladoEn: v.canceladoEn,
    motivoDeCancelacion: v.motivoDeCancelacion,
    calificacion: v.calificacion === null ? null : { calificacion: v.calificacion.calificacion, comentario: v.calificacion.comentario ?? "" },
    tarifaHora: v.tarifaHora,
  };
}

export function aServicioDeFamilia(v: ServicioParaFamiliaDelBackend): Servicio {
  return { ...aBase(v), subtotal: v.subtotal, cargoDeServicio: v.cargoDeServicio, totalFamilia: v.totalFamilia };
}

export function aServicioDelCuidador(v: ServicioParaCuidadorDelBackend): ServicioDelCuidador {
  return { ...aBase(v), pagoProfesional: v.pagoProfesional };
}

function mapear<D, T>(resultado: ResultadoDeEscritura<D>, convertir: (datos: D) => T): ResultadoDeEscritura<T> {
  return resultado.ok ? { ok: true, datos: convertir(resultado.datos) } : resultado;
}

export interface PaginaDeServicios<T> {
  servicios: T[];
  siguiente: string | null;
}

// ── Cotización (M3): el precio lo pone el servidor; lo que se ve antes de contratar es una vista previa ──────────
export async function cotizar(cuidadorId: string, horas: number): Promise<ResultadoDeEscritura<Cotizacion>> {
  const resultado = await escribirEnBackend<RespuestaDeCotizacion>("/pagos/cotizaciones", {
    metodo: "POST",
    cuerpo: { cuidadorId, horas },
  });
  return mapear(resultado, ({ cotizacion: c }) => ({
    cuidadorId: c.cuidadorId,
    horas: c.horas,
    tarifaHora: c.tarifaHora,
    subtotal: c.subtotal,
    cargoPorcentaje: c.cargoDeServicio.porcentaje,
    cargo: c.cargoDeServicio.monto,
    totalFamilia: c.totalFamilia,
  }));
}

// ── La familia ─────────────────────────────────────────────────────────────────────────────────────────────────
// `clave` es la Idempotency-Key: el mismo reintento devuelve el mismo servicio y nunca cobra dos veces.
export async function solicitarServicio(
  adultoMayorId: string,
  datos: DatosDeSolicitud,
  clave: string,
): Promise<ResultadoDeEscritura<Servicio>> {
  const resultado = await escribirEnBackend<RespuestaDeServicioParaFamilia>("/servicios", {
    metodo: "POST",
    claveDeIdempotencia: clave,
    cuerpo: { adultoMayorId, ...datos },
  });
  return mapear(resultado, ({ servicio }) => aServicioDeFamilia(servicio));
}

export async function listarServiciosDeLaFamilia(estado?: EstadoDeServicio, cursor?: string): Promise<PaginaDeServicios<Servicio>> {
  const pagina = await leerDelBackend<PaginaDeServiciosDelBackend<ServicioParaFamiliaDelBackend>>("/servicios", {
    consulta: { ...(estado === undefined ? {} : { estado }), ...(cursor === undefined ? {} : { cursor }) },
  });
  return { servicios: pagina.servicios.map(aServicioDeFamilia), siguiente: pagina.siguiente };
}

// Null si no existe **o no es de esta familia** (el backend responde 404 igual en los dos casos).
export async function obtenerServicio(id: string): Promise<Servicio | null> {
  if (!FORMATO_DE_UUID.test(id)) return null;
  const { servicio } = await leerDelBackend<RespuestaDeServicioParaFamilia>(`/servicios/${id}`);
  return aServicioDeFamilia(servicio);
}

export async function cancelarServicio(id: string): Promise<ResultadoDeEscritura<Servicio>> {
  const resultado = await escribirEnBackend<RespuestaDeServicioParaFamilia>(`/servicios/${id}/cancelar`, { metodo: "POST" });
  return mapear(resultado, ({ servicio }) => aServicioDeFamilia(servicio));
}

export async function calificarServicio(id: string, calificacion: number, comentario: string): Promise<ResultadoDeEscritura<void>> {
  const resultado = await escribirEnBackend<unknown>(`/servicios/${id}/calificacion`, {
    metodo: "POST",
    cuerpo: { calificacion, ...(comentario.trim() === "" ? {} : { comentario: comentario.trim() }) },
  });
  return mapear(resultado, () => undefined);
}

// El cuidador que está con la persona ahora mismo; null si no hay. Es el ÚNICO lugar donde llega un teléfono.
export async function obtenerCuidadorEnTurnoDe(adultoMayorId: string): Promise<CuidadorEnTurno | null> {
  const { cuidadorEnTurno } = await leerDelBackend<RespuestaDeCuidadorEnTurno>(`/adultos-mayores/${adultoMayorId}/cuidador-en-turno`);
  return cuidadorEnTurno === null ? null : aCuidadorEnTurno(cuidadorEnTurno);
}

function aCuidadorEnTurno({ cuidador, servicio }: CuidadorEnTurnoDelBackend): CuidadorEnTurno {
  return {
    id: cuidador.id,
    nombre: cuidador.nombre,
    foto: cuidador.fotoUrl ?? "",
    especialidad: cuidador.especialidad,
    telefono: cuidador.telefono,
    servicioId: servicio.id,
  };
}

// ── El cuidador ────────────────────────────────────────────────────────────────────────────────────────────────
export async function listarServiciosDelCuidador(estado?: EstadoDeServicio, cursor?: string): Promise<PaginaDeServicios<ServicioDelCuidador>> {
  const pagina = await leerDelBackend<PaginaDeServiciosDelBackend<ServicioParaCuidadorDelBackend>>("/servicios", {
    consulta: { ...(estado === undefined ? {} : { estado }), ...(cursor === undefined ? {} : { cursor }) },
  });
  return { servicios: pagina.servicios.map(aServicioDelCuidador), siguiente: pagina.siguiente };
}

export type AccionDelCuidador = "aceptar" | "rechazar" | "iniciar" | "finalizar";

export async function actuarComoCuidador(id: string, accion: AccionDelCuidador): Promise<ResultadoDeEscritura<ServicioDelCuidador>> {
  const resultado = await escribirEnBackend<RespuestaDeServicioParaCuidador>(`/servicios/${id}/${accion}`, { metodo: "POST" });
  return mapear(resultado, ({ servicio }) => aServicioDelCuidador(servicio));
}
