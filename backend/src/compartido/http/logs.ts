import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Configuracion } from '../../configuracion/variables-de-entorno.js';
import { idDeCorrelacionDe } from './datos-de-la-peticion.js';

// Lo que nunca debe quedar en un log (M0 §4.10, E6): credenciales, el secreto del BFF y datos
// personales. pino reemplaza esos campos antes de escribir.
const CAMPOS_OCULTOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-seniory-bff"]',
  'res.headers["set-cookie"]',
  '*.contrasena',
  '*.correo',
  '*.telefono',
  '*.datos',
];

// Logs en JSON con el ID de correlación de cada petición. En desarrollo se muestran legibles.
export function opcionesDeLogs(configuracion: Configuracion): Params {
  return {
    pinoHttp: {
      level: configuracion.nivelDeLog,
      genReqId: (peticion: IncomingMessage, respuesta: ServerResponse) =>
        idDeCorrelacionDe(peticion, respuesta),
      redact: { paths: CAMPOS_OCULTOS, censor: '[oculto]' },
      // Los monitores consultan /salud cada pocos segundos: registrarlos solo haría ruido.
      autoLogging: {
        ignore: (peticion) => peticion.url?.startsWith('/salud') ?? false,
      },
      transport:
        configuracion.entorno === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}
