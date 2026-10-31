import { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { Parametros } from './valores-cerrados.js';

export interface TextoDeAviso {
  titulo: string;
  cuerpo: string;
}

// Los textos de los avisos, en español de Colombia. Son texto plano (sin HTML libre) y NUNCA llevan datos
// clínicos: por SMS, correo o WhatsApp no hay confianza para datos de salud (Ley 1581), así que solo dicen
// fechas, franjas y horas, y mandan a abrir Seniory. Tampoco llevan nombres.
//
// El tipo es «evento:rol» (por ejemplo `servicio_confirmado:familia`): cada parte recibe su propio texto.

const JORNADAS_EN_TEXTO: Record<string, string> = {
  manana: 'la mañana',
  tarde: 'la tarde',
  noche: 'la noche',
};

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

// «2030-06-11» → «martes 11 de junio». Sin Intl: el resultado no depende del ICU de cada servidor.
export function fechaLegible(fecha: string): string {
  const civil = FechaCivil.desdeTexto(fecha);
  const dia =
    DIAS[new Date(Date.UTC(civil.anio, civil.mes - 1, civil.dia)).getUTCDay()];
  return `${dia} ${civil.dia} de ${MESES[civil.mes - 1]}`;
}

function texto(parametros: Parametros, nombre: string): string {
  const valor = parametros[nombre];
  if (typeof valor !== 'string' || valor === '') {
    throw new ErrorDeValidacion(
      `Falta el dato «${nombre}» para armar el aviso`,
      'plantilla.parametro_faltante',
    );
  }
  return valor;
}

function cuando(parametros: Parametros): string {
  const jornada = JORNADAS_EN_TEXTO[texto(parametros, 'jornada')];
  if (jornada === undefined) {
    throw new ErrorDeValidacion(
      'La jornada del aviso no es válida',
      'plantilla.jornada_invalida',
    );
  }
  return `${fechaLegible(texto(parametros, 'fecha'))}, en ${jornada}`;
}

function horas(parametros: Parametros): string {
  const valor = parametros.horas;
  if (typeof valor !== 'number') {
    throw new ErrorDeValidacion(
      'Falta el dato «horas» para armar el aviso',
      'plantilla.parametro_faltante',
    );
  }
  return valor === 1 ? '1 hora' : `${valor} horas`;
}

type Plantilla = (parametros: Parametros) => TextoDeAviso;

function cancelado(rol: 'familia' | 'cuidador'): Plantilla {
  return (p) => {
    const motivo = texto(p, 'motivo');
    const momento = cuando(p);
    if (rol === 'familia') {
      if (motivo === 'rechazada') {
        return {
          titulo: 'El cuidador no pudo atender tu solicitud',
          cuerpo: `Tu solicitud para el ${momento} no fue aceptada. Elige a otra persona en Seniory.`,
        };
      }
      if (motivo === 'expirada') {
        return {
          titulo: 'Tu solicitud venció',
          cuerpo: `El cuidador no alcanzó a responder tu solicitud para el ${momento}. Elige a otra persona en Seniory.`,
        };
      }
      return {
        titulo: 'Servicio cancelado',
        cuerpo: `Cancelaste el servicio del ${momento}.`,
      };
    }
    if (motivo === 'rechazada') {
      return {
        titulo: 'Rechazaste una solicitud',
        cuerpo: `Rechazaste la solicitud para el ${momento}.`,
      };
    }
    if (motivo === 'expirada') {
      return {
        titulo: 'Una solicitud venció',
        cuerpo: `La solicitud para el ${momento} venció sin tu respuesta.`,
      };
    }
    return {
      titulo: 'La familia canceló el servicio',
      cuerpo: `Se canceló el servicio del ${momento}.`,
    };
  };
}

const PLANTILLAS: Readonly<Record<string, Plantilla>> = {
  'servicio_solicitado:cuidador': (p) => ({
    titulo: 'Nueva solicitud de servicio',
    cuerpo: `Tienes una solicitud para el ${cuando(p)}, por ${horas(p)}. Respóndela en Seniory antes de que venza el plazo.`,
  }),
  'servicio_solicitado:familia': (p) => ({
    titulo: 'Solicitud enviada',
    cuerpo: `Enviamos tu solicitud para el ${cuando(p)}. Te avisaremos cuando el cuidador responda.`,
  }),
  'servicio_confirmado:familia': (p) => ({
    titulo: 'Servicio confirmado',
    cuerpo: `Tu servicio del ${cuando(p)} quedó confirmado.`,
  }),
  'servicio_confirmado:cuidador': (p) => ({
    titulo: 'Servicio confirmado',
    cuerpo: `Tienes un servicio confirmado para el ${cuando(p)}, por ${horas(p)}.`,
  }),
  'servicio_iniciado:familia': () => ({
    titulo: 'El servicio comenzó',
    cuerpo:
      'El cuidador marcó que inició el servicio. Puedes verlo en Seniory.',
  }),
  'servicio_iniciado:cuidador': () => ({
    titulo: 'Iniciaste el servicio',
    cuerpo:
      'Marcaste el inicio del servicio. Márcalo como finalizado cuando termines.',
  }),
  'servicio_finalizado:familia': () => ({
    titulo: 'Servicio finalizado',
    cuerpo:
      'El servicio terminó. Cuéntanos cómo te fue: califícalo en Seniory.',
  }),
  'servicio_finalizado:cuidador': () => ({
    titulo: 'Servicio finalizado',
    cuerpo: 'Terminaste el servicio. Gracias por tu trabajo.',
  }),
  'servicio_cancelado:familia': cancelado('familia'),
  'servicio_cancelado:cuidador': cancelado('cuidador'),
};

export const TIPOS_DE_AVISO = Object.keys(PLANTILLAS);

export function renderizarAviso(
  tipo: string,
  parametros: Parametros,
): TextoDeAviso {
  const plantilla = PLANTILLAS[tipo];
  if (plantilla === undefined) {
    throw new ErrorDeValidacion(
      `No hay plantilla para el aviso «${tipo}»`,
      'plantilla.desconocida',
    );
  }
  return plantilla(parametros);
}
