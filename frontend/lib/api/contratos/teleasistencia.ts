// Lo que el backend RESPONDE en Teleasistencia (M6), el único módulo que guarda datos de salud. Contrato de lo que el
// frontend lee; lo vigilan las pruebas de contrato contra el backend local. Una persona ajena (o un cuidador sin
// servicio activo) recibe 404 en todo: no se revela que la persona existe.

export interface TomaDelBackend {
  id: string;
  // «HH:mm» en hora de Colombia.
  horaProgramada: string;
  estado: "pendiente" | "tomada" | "omitida";
  registradaEn: string | null;
}

export interface MedicamentoDelBackend {
  id: string;
  nombre: string;
  dosis: string;
  indicaciones: string | null;
  horarios: string[];
  // 1 (lunes) a 7 (domingo).
  diasDeLaSemana: number[];
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export interface MedicamentoDelDiaDelBackend extends MedicamentoDelBackend {
  tomas: TomaDelBackend[];
}

// `GET /adultos-mayores/:id/medicamentos`
export interface RespuestaDeMedicamentos {
  fecha: string;
  medicamentos: MedicamentoDelDiaDelBackend[];
}

export interface LecturaDelBackend {
  id: string;
  tomadaEn: string;
  // Cada medida es opcional, pero la presión va completa o no va.
  presionSistolica: number | null;
  presionDiastolica: number | null;
  frecuenciaCardiaca: number | null;
  glucosa: number | null;
  // Fuera de los rangos de la persona (o de los generales provisionales): el backend no dice cuál medida ni cuánto.
  fueraDeRango: boolean;
  fuente: "manual" | "dispositivo";
}

export interface RespuestaDeLecturas {
  lecturas: LecturaDelBackend[];
}
export interface RespuestaDeUltimaLectura {
  lectura: LecturaDelBackend | null;
}
export interface RespuestaDeLectura {
  lectura: LecturaDelBackend;
}

export interface AlertaDelBackend {
  id: string;
  origen: string;
  estado: "generada" | "notificada" | "atendida";
  generadaEn: string;
  primeraEntregaEn: string | null;
  atendidaEn: string | null;
  nota: string | null;
}

// `POST /adultos-mayores/:id/alertas`: dice A QUIÉN se avisó (la pantalla nunca promete más que eso).
export interface RespuestaDeAlerta {
  alerta: AlertaDelBackend & { avisadosA: string[] };
}

// `GET /adultos-mayores/:id/resumen`
export interface RespuestaDeResumen {
  resumen: {
    fecha: string;
    tomasDeHoy: { total: number; tomadas: number; pendientes: number; omitidas: number };
    proximaToma: { medicamentoId: string; nombre: string; horaProgramada: string } | null;
    ultimaLectura: { tomadaEn: string; fueraDeRango: boolean } | null;
    alertasSinAtender: number;
  };
}

export interface RespuestaDeToma {
  toma: TomaDelBackend;
}
export interface RespuestaDeMedicamento {
  medicamento: MedicamentoDelBackend;
}
