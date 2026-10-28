import {
  Catch,
  HttpException,
  Inject,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CONTEXTO_DE_PETICION,
  type ContextoDePeticion,
} from '../aplicacion/puertos/contexto-de-peticion.js';
import {
  ConflictoDeEstado,
  ErrorDeDominio,
  ErrorDeValidacion,
  NoAutenticado,
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
  SinPermiso,
} from '../dominio/errores.js';
import { idDeCorrelacionDe } from './datos-de-la-peticion.js';
import { ErrorDeValidacionDeEntrada, type ErrorDeCampo } from './validacion.js';

// Cuerpo de error estándar (RFC 9457, application/problem+json) más dos campos propios:
// `codigo` (estable, lo usa el frontend) e `idDeCorrelacion` (para encontrar la petición en los logs).
export interface Problema {
  type: string;
  title: string;
  status: number;
  codigo: string;
  detail?: string;
  idDeCorrelacion: string;
  errores?: ErrorDeCampo[];
}

const TITULOS: Record<number, string> = {
  400: 'Los datos enviados no son válidos',
  401: 'Debes iniciar sesión',
  403: 'No tienes permiso para esta acción',
  404: 'No encontramos lo que buscas',
  405: 'Método no permitido',
  409: 'La operación no es posible en el estado actual',
  413: 'La solicitud es demasiado grande',
  415: 'Formato de datos no admitido',
  422: 'La operación no cumple una regla del servicio',
  429: 'Demasiadas solicitudes; intenta de nuevo en un momento',
  500: 'Ocurrió un error inesperado',
};

const CODIGOS_HTTP: Record<number, string> = {
  400: 'solicitud_invalida',
  401: 'no_autenticado',
  403: 'sin_permiso',
  404: 'no_encontrado',
  405: 'metodo_no_permitido',
  413: 'cuerpo_demasiado_grande',
  415: 'formato_no_admitido',
  429: 'demasiadas_solicitudes',
};

// Estado HTTP de cada error de dominio (M0 §4.10). El 404 cubre también lo AJENO: no se revela que
// un recurso de otra familia existe.
function estadoDe(error: ErrorDeDominio): number {
  if (error instanceof ErrorDeValidacion) return 400;
  if (error instanceof NoAutenticado) return 401;
  if (error instanceof SinPermiso) return 403;
  if (error instanceof RecursoNoEncontrado) return 404;
  if (error instanceof ConflictoDeEstado) return 409;
  if (error instanceof ReglaDeNegocioIncumplida) return 422;
  return 500; // una subclase nueva sin estado asignado: se trata como error del servidor
}

// Los errores de body-parser (JSON mal formado, cuerpo muy grande) no son HttpException: traen
// `status` y `expose` (paquete http-errors).
function esErrorHttpExpuesto(
  error: unknown,
): error is { status: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { expose?: unknown }).expose === true &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

@Catch()
export class FiltroDeErrores implements ExceptionFilter {
  private readonly registro = new Logger('FiltroDeErrores');

  constructor(
    @Inject(CONTEXTO_DE_PETICION)
    private readonly contexto: ContextoDePeticion,
  ) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const peticion = http.getRequest<Request>();
    const respuesta = http.getResponse<Response>();
    const problema = this.problemaDe(error);
    problema.idDeCorrelacion = idDeCorrelacionDe(peticion, respuesta);

    if (problema.status >= 500) {
      // El detalle va solo al log; al cliente nunca le llegan mensajes internos ni trazas.
      // TODO(Sentry): reportarlo también cuando haya cuenta y SENTRY_DSN.
      this.registro.error(
        `Error no controlado en ${peticion.method} ${peticion.url}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    if (respuesta.headersSent) return;
    respuesta
      .status(problema.status)
      .type('application/problem+json')
      .json(problema);
  }

  private problemaDe(error: unknown): Problema {
    const base = (status: number, codigo: string): Problema => ({
      type: `urn:seniory:problema:${codigo}`,
      title: TITULOS[status] ?? TITULOS[500] ?? '',
      status,
      codigo,
      idDeCorrelacion: this.contexto.idDeCorrelacion(),
    });

    if (error instanceof ErrorDeValidacionDeEntrada) {
      return { ...base(400, 'validacion'), errores: error.errores };
    }
    if (error instanceof ErrorDeDominio) {
      const status = estadoDe(error);
      return status === 500
        ? base(500, 'error_interno')
        : { ...base(status, error.codigo), detail: error.message };
    }
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : esErrorHttpExpuesto(error)
          ? error.status
          : 500;
    if (status >= 500) return base(500, 'error_interno');
    return base(status, CODIGOS_HTTP[status] ?? 'solicitud_invalida');
  }
}
