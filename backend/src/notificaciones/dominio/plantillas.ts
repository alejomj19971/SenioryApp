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
      if (motivo === 'pago_fallido') {
        return {
          titulo: 'No se pudo cobrar tu servicio',
          cuerpo: `El servicio del ${momento} se canceló porque el pago no se completó. Puedes pedirlo de nuevo en Seniory.`,
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
    if (motivo === 'pago_fallido') {
      return {
        titulo: 'Se canceló un servicio',
        cuerpo: `El servicio del ${momento} se canceló porque la familia no completó el pago.`,
      };
    }
    return {
      titulo: 'La familia canceló el servicio',
      cuerpo: `Se canceló el servicio del ${momento}.`,
    };
  };
}

const PLANTILLAS: Record<string, Plantilla> = {
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

// Teleasistencia. Estos avisos salen por SMS, correo y WhatsApp, canales que no son confiables para datos de
// salud (Ley 1581): por eso dicen que hay algo que mirar y mandan a abrir Seniory, sin decir qué medicamento ni qué
// lectura. Solo la alerta lleva el nombre de la persona: sin él, no se sabría de quién es el pedido de ayuda.
PLANTILLAS['alerta_generada:destinatario'] = (p) => {
  const nombre = texto(p, 'nombre');
  return {
    titulo: `Alerta de ${nombre}`,
    cuerpo: `${nombre} pidió ayuda desde Seniory. Abre la aplicación para ver los detalles. Si es una emergencia, llama al 123.`,
  };
};
PLANTILLAS['medicamento_omitido:destinatario'] = () => ({
  titulo: 'Hay una toma sin registrar',
  cuerpo: 'Hay una toma pendiente de registrar. Revísala en Seniory.',
});
PLANTILLAS['lectura_fuera_de_rango:destinatario'] = () => ({
  titulo: 'Hay un registro para revisar',
  cuerpo: 'Hay un registro nuevo que conviene revisar. Ábrelo en Seniory.',
});

// Pagos. Los avisos no llevan montos: dicen que hay algo por hacer y mandan a abrir Seniory.
PLANTILLAS['pago_requerido:familia'] = (p) => ({
  titulo: 'Falta pagar tu servicio',
  cuerpo: `Tu servicio del ${cuando(p)} está confirmado. Págalo en Seniory para asegurarlo.`,
});
PLANTILLAS['pago_reembolsado:familia'] = (p) => ({
  titulo: 'Te devolvimos tu pago',
  cuerpo: `Devolvimos el pago del servicio del ${cuando(p)}. Puedes verlo en Seniory.`,
});
PLANTILLAS['compra_de_bolsa_fallida:familia'] = (p) => {
  const motivo = texto(p, 'motivo');
  return {
    titulo: 'No se completó tu compra',
    cuerpo:
      motivo === 'expirado'
        ? 'El plazo para pagar tu bolsa de horas venció. Puedes intentarlo de nuevo en Seniory.'
        : 'El pago de tu bolsa de horas no se completó. Puedes intentarlo de nuevo en Seniory.',
  };
};
PLANTILLAS['bolsa_comprada:familia'] = () => ({
  titulo: 'Tu bolsa ya tiene saldo',
  cuerpo:
    'Tu pago se aprobó y tu bolsa de horas ya tiene saldo. Úsala en Seniory.',
});

// Mensajería. El aviso NO lleva el texto del mensaje ni el nombre de quien lo escribió: solo dice que hay uno.
PLANTILLAS['mensaje_nuevo:destinatario'] = () => ({
  titulo: 'Tienes un mensaje nuevo',
  cuerpo: 'Te escribieron en Seniory. Ábrela para leerlo.',
});

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
