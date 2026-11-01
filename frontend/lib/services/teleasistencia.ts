import "server-only";
import { escribirEnBackend, leerDelBackend, type ResultadoDeEscritura } from "@/lib/api/cliente-servidor";
import type {
  LecturaDelBackend,
  MedicamentoDelDiaDelBackend,
  RespuestaDeAlerta,
  RespuestaDeLectura,
  RespuestaDeLecturas,
  RespuestaDeMedicamento,
  RespuestaDeMedicamentos,
  RespuestaDeResumen,
  RespuestaDeToma,
  RespuestaDeUltimaLectura,
} from "@/lib/api/contratos/teleasistencia";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import type {
  AlertaEnviada,
  EstadoDeToma,
  LecturaSignos,
  MedicamentosDelDia,
  ResumenDeTeleasistencia,
  TomaDelDia,
} from "@/lib/types";

// Teleasistencia (M6) sobre la API: medicamentos y sus tomas, signos vitales y alertas de la persona que la familia
// cuida. La persona sale de la SESIÓN (nunca de la URL ni de un formulario); el backend pregunta en CADA consulta si
// esa familia puede ver esos datos (vinculada y con autorización), y una negativa es un 404 igual al de «no existe».

const ruta = (personaId: string, resto: string) => `/adultos-mayores/${personaId}/${resto}`;

function aLectura(lectura: LecturaDelBackend): LecturaSignos {
  return {
    id: lectura.id,
    fecha: lectura.tomadaEn,
    presionSistolica: lectura.presionSistolica,
    presionDiastolica: lectura.presionDiastolica,
    frecuenciaCardiaca: lectura.frecuenciaCardiaca,
    glucosa: lectura.glucosa,
    fueraDeRango: lectura.fueraDeRango,
  };
}

function aTomas(medicamento: MedicamentoDelDiaDelBackend): TomaDelDia[] {
  return medicamento.tomas.map((toma) => ({
    tomaId: toma.id,
    medicamentoId: medicamento.id,
    nombre: medicamento.nombre,
    dosis: medicamento.dosis,
    indicaciones: medicamento.indicaciones ?? "",
    hora: toma.horaProgramada,
    estado: toma.estado,
  }));
}

// ── Lecturas ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function obtenerResumen(): Promise<ResumenDeTeleasistencia> {
  const { persona } = await exigirFamiliaLista();
  const { resumen } = await leerDelBackend<RespuestaDeResumen>(ruta(persona.id, "resumen"));
  return {
    fecha: resumen.fecha,
    tomas: resumen.tomasDeHoy,
    proximaToma: resumen.proximaToma === null ? null : { nombre: resumen.proximaToma.nombre, hora: resumen.proximaToma.horaProgramada },
    ultimaLectura: resumen.ultimaLectura === null ? null : { fecha: resumen.ultimaLectura.tomadaEn, fueraDeRango: resumen.ultimaLectura.fueraDeRango },
    alertasSinAtender: resumen.alertasSinAtender,
  };
}

// Los medicamentos de hoy y sus tomas, ordenadas por hora. Sin medicamentos, la lista viene vacía (no es un error).
export async function listarMedicamentosDeHoy(): Promise<MedicamentosDelDia> {
  const { persona } = await exigirFamiliaLista();
  const { fecha, medicamentos } = await leerDelBackend<RespuestaDeMedicamentos>(ruta(persona.id, "medicamentos"));
  return {
    fecha,
    medicamentos: medicamentos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      dosis: m.dosis,
      indicaciones: m.indicaciones ?? "",
      horarios: m.horarios,
    })),
    tomas: medicamentos.flatMap(aTomas).sort((a, b) => a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre, "es")),
  };
}

// Las lecturas de los últimos días, de la más antigua a la más reciente (el orden de una gráfica).
export async function listarLecturas(dias = 14): Promise<LecturaSignos[]> {
  const { persona } = await exigirFamiliaLista();
  const { lecturas } = await leerDelBackend<RespuestaDeLecturas>(ruta(persona.id, "signos-vitales"), { consulta: { dias: String(dias) } });
  return lecturas.map(aLectura).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function obtenerUltimaLectura(): Promise<LecturaSignos | null> {
  const { persona } = await exigirFamiliaLista();
  const { lectura } = await leerDelBackend<RespuestaDeUltimaLectura>(ruta(persona.id, "signos-vitales/ultima"));
  return lectura === null ? null : aLectura(lectura);
}

// ── Escrituras (devuelven el error como valor) ────────────────────────────────────────────────────────────────────
export interface DatosDeMedicamento {
  nombre: string;
  dosis: string;
  indicaciones: string;
  horarios: string[];
}

export async function registrarMedicamento(datos: DatosDeMedicamento): Promise<ResultadoDeEscritura<void>> {
  const { persona } = await exigirFamiliaLista();
  const resultado = await escribirEnBackend<RespuestaDeMedicamento>(ruta(persona.id, "medicamentos"), {
    metodo: "POST",
    cuerpo: {
      nombre: datos.nombre,
      dosis: datos.dosis,
      ...(datos.indicaciones === "" ? {} : { indicaciones: datos.indicaciones }),
      horarios: datos.horarios,
    },
  });
  return resultado.ok ? { ok: true, datos: undefined } : resultado;
}

export async function desactivarMedicamento(medicamentoId: string): Promise<ResultadoDeEscritura<void>> {
  const resultado = await escribirEnBackend<void>(`/medicamentos/${medicamentoId}/desactivar`, { metodo: "POST" });
  return resultado.ok ? { ok: true, datos: undefined } : resultado;
}

// Marcar una toma como tomada, o deshacerlo. Solo se puede el día que corresponde (hora de Colombia).
export async function cambiarToma(medicamentoId: string, tomaId: string, estado: Exclude<EstadoDeToma, "omitida">): Promise<ResultadoDeEscritura<void>> {
  const resultado = await escribirEnBackend<RespuestaDeToma>(`/medicamentos/${medicamentoId}/tomas/${tomaId}`, { metodo: "PATCH", cuerpo: { estado } });
  return resultado.ok ? { ok: true, datos: undefined } : resultado;
}

export interface DatosDeLectura {
  presionSistolica?: number;
  presionDiastolica?: number;
  frecuenciaCardiaca?: number;
  glucosa?: number;
}

export async function registrarLectura(datos: DatosDeLectura): Promise<ResultadoDeEscritura<LecturaSignos>> {
  const { persona } = await exigirFamiliaLista();
  const resultado = await escribirEnBackend<RespuestaDeLectura>(ruta(persona.id, "signos-vitales"), { metodo: "POST", cuerpo: datos });
  return resultado.ok ? { ok: true, datos: aLectura(resultado.datos.lectura) } : resultado;
}

// Pedir ayuda. `clave` es la Idempotency-Key: reintentar la MISMA alerta (mala conexión, doble toque) devuelve la
// misma y nunca avisa dos veces. Devuelve A QUIÉN se avisó: la pantalla no promete más que eso.
export async function enviarAlerta(origen: "boton" | "voz", clave: string): Promise<ResultadoDeEscritura<AlertaEnviada>> {
  const { persona } = await exigirFamiliaLista();
  const resultado = await escribirEnBackend<RespuestaDeAlerta>(ruta(persona.id, "alertas"), {
    metodo: "POST",
    claveDeIdempotencia: clave,
    cuerpo: { origen },
  });
  return resultado.ok
    ? { ok: true, datos: { id: resultado.datos.alerta.id, generadaEn: resultado.datos.alerta.generadaEn, avisadosA: resultado.datos.alerta.avisadosA } }
    : resultado;
}
