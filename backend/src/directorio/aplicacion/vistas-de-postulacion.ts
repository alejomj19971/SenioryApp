import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import type { Cuidador } from '../dominio/cuidador.js';
import type { Documento } from '../dominio/documento.js';
import {
  CONTROLES_DE_VERIFICACION,
  type ControlDeVerificacion,
  type EstadoDeVerificacion,
} from '../dominio/valores-cerrados.js';
import type { Verificacion } from '../dominio/verificacion.js';

// Lo que ve el propio cuidador de su postulación y lo que ven los revisores. Listas blancas, como todas las vistas.

export interface VistaDeControl {
  control: ControlDeVerificacion;
  // «sin_solicitar» mientras el cuidador no ha enviado su perfil a revisión.
  estado: EstadoDeVerificacion | 'sin_solicitar';
  // Por qué lo rechazaron: lo único que necesita para corregirlo.
  motivoDeRechazo: string | null;
  vigenteHasta: string | null;
  // Aprobado pero ya vencido, o rechazado: hay que subir el documento otra vez y pedir la renovación.
  puedeRenovar: boolean;
}

export interface VistaDeDocumento {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  tamanoBytes: number;
  subidoEn: string;
}

// El perfil del cuidador visto POR EL CUIDADOR: incluye su teléfono (es suyo) y el estado de su postulación.
export interface VistaDeMiPerfil {
  id: string;
  nombre: string;
  especialidad: string;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  telefono: string;
  zona: string;
  disponibilidad: string[];
  bio: string;
  aceptacionAutomatica: boolean;
  estado: string;
  // ¿Se está mostrando hoy a las familias?
  visible: boolean;
  controles: VistaDeControl[];
  documentos: VistaDeDocumento[];
}

export function vistaDeDocumento(documento: Documento): VistaDeDocumento {
  return {
    id: documento.id,
    tipo: documento.tipo,
    nombre: documento.nombreOriginal,
    estado: documento.estado,
    tamanoBytes: documento.tamanoBytes,
    subidoEn: documento.subidoEn.toISOString(),
  };
}

function vistaDeControl(
  control: ControlDeVerificacion,
  verificacion: Verificacion | undefined,
  hoy: FechaCivil,
): VistaDeControl {
  if (verificacion === undefined) {
    return {
      control,
      estado: 'sin_solicitar',
      motivoDeRechazo: null,
      vigenteHasta: null,
      puedeRenovar: false,
    };
  }
  const vencida =
    verificacion.estado === 'vencida' ||
    (verificacion.estado === 'aprobada' && !verificacion.estaVigente(hoy));
  return {
    control,
    estado: vencida ? 'vencida' : verificacion.estado,
    motivoDeRechazo: verificacion.motivoDeRechazo,
    vigenteHasta: verificacion.vigenteHasta?.aTexto() ?? null,
    puedeRenovar: vencida || verificacion.estado === 'rechazada',
  };
}

export function vistaDeMiPerfil(
  cuidador: Cuidador,
  documentos: readonly Documento[],
  hoy: FechaCivil,
): VistaDeMiPerfil {
  return {
    id: cuidador.id,
    nombre: cuidador.nombre,
    especialidad: cuidador.especialidad,
    titulo: cuidador.titulo,
    aniosExperiencia: cuidador.aniosExperiencia,
    tarifaHora: cuidador.tarifaHora.valor,
    telefono: cuidador.telefono,
    zona: cuidador.zona,
    disponibilidad: [...cuidador.disponibilidad],
    bio: cuidador.bio,
    aceptacionAutomatica: cuidador.aceptacionAutomatica,
    estado: cuidador.estado,
    visible: cuidador.esVisible(hoy),
    controles: CONTROLES_DE_VERIFICACION.map((control) =>
      vistaDeControl(
        control,
        cuidador.verificaciones.find((v) => v.control === control),
        hoy,
      ),
    ),
    documentos: documentos.map(vistaDeDocumento),
  };
}

// Una fila de la cola de los revisores.
export interface VistaDeVerificacionParaRevisor {
  id: string;
  control: ControlDeVerificacion;
  estado: EstadoDeVerificacion;
  solicitadaEn: string;
  cuidador: {
    id: string;
    nombre: string;
    especialidad: string;
    zona: string;
  };
  // Lo que el revisor debe mirar: el documento de este control y la cédula. Se abren con su dirección firmada.
  documentos: VistaDeDocumento[];
}
