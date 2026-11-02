// Lo que el backend RESPONDE en la postulación y verificación de cuidadores (M9). Contrato de lo que el frontend lee;
// lo vigilan las pruebas de contrato contra el backend local. Los documentos privados (cédula, antecedentes, título,
// psicotécnica) solo los ven el propio cuidador y un revisor.

export interface DocumentoDelBackend {
  id: string;
  tipo: "cedula" | "antecedentes" | "titulo" | "psicotecnica" | "hoja_de_vida";
  nombre: string;
  estado: "pendiente" | "aprobado" | "rechazado";
  tamanoBytes: number;
  subidoEn: string;
}

export interface ControlDelBackend {
  control: "antecedentes" | "titulos" | "psicotecnica";
  estado: "sin_solicitar" | "pendiente" | "aprobada" | "rechazada" | "vencida";
  motivoDeRechazo: string | null;
  vigenteHasta: string | null;
  puedeRenovar: boolean;
}

// `GET/POST/PATCH /cuidadores/yo`, `POST /cuidadores/yo/revision` y `/verificaciones/:control/renovacion`.
export interface MiPerfilDelBackend {
  id: string;
  nombre: string;
  especialidad: "auxiliar" | "enfermeria" | "fisioterapia" | "acompanamiento";
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  telefono: string;
  zona: string;
  disponibilidad: ("manana" | "tarde" | "noche")[];
  bio: string;
  aceptacionAutomatica: boolean;
  estado: string;
  visible: boolean;
  controles: ControlDelBackend[];
  documentos: DocumentoDelBackend[];
}
export interface RespuestaDeMiPerfil {
  perfil: MiPerfilDelBackend;
}
export interface RespuestaDeDocumento {
  documento: DocumentoDelBackend;
}

// `GET /verificaciones` (solo administradores).
export interface VerificacionParaRevisorDelBackend {
  id: string;
  control: "antecedentes" | "titulos" | "psicotecnica";
  estado: "pendiente" | "aprobada" | "rechazada" | "vencida";
  solicitadaEn: string;
  cuidador: { id: string; nombre: string; especialidad: MiPerfilDelBackend["especialidad"]; zona: string };
  documentos: DocumentoDelBackend[];
}
export interface RespuestaDeCola {
  verificaciones: VerificacionParaRevisorDelBackend[];
}
export interface RespuestaDeHojasPendientes {
  hojasDeVida: { documento: DocumentoDelBackend; cuidador: { id: string; nombre: string } }[];
}
export interface RespuestaDeDecision {
  verificacion: { estado: string; cuidadorVisible: boolean };
}
