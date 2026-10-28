import type { ValidationError, ValidationPipeOptions } from '@nestjs/common';

export interface ErrorDeCampo {
  campo: string; // ruta del campo, por ejemplo 'direccion.ciudad' o 'horarios.0'
  mensaje: string;
}

// Un DTO no pasó la validación. La capa HTTP lo traduce a 400 con la lista de campos.
export class ErrorDeValidacionDeEntrada extends Error {
  constructor(readonly errores: ErrorDeCampo[]) {
    super('Los datos enviados no son válidos');
    this.name = 'ErrorDeValidacionDeEntrada';
  }
}

// Mensajes de class-validator que no vienen de un DTO (los de los DTOs se escriben en español).
const MENSAJES_GENERALES: Record<string, string> = {
  whitelistValidation: 'Este campo no está permitido',
};

// Opciones del ValidationPipe global (M0 §4.10):
// - whitelist + forbidNonWhitelisted: un campo no declarado en el DTO se rechaza. Evita la
//   asignación masiva (por ejemplo, enviar `rol: 'administrador'` al registrarse).
// - transform: el controlador recibe una instancia del DTO con los tipos convertidos.
export const opcionesDeValidacion: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errores) =>
    new ErrorDeValidacionDeEntrada(aplanarErrores(errores)),
};

export function aplanarErrores(
  errores: ValidationError[],
  prefijo = '',
): ErrorDeCampo[] {
  return errores.flatMap((error) => {
    const campo =
      prefijo === '' ? error.property : `${prefijo}.${error.property}`;
    const propios = Object.entries(error.constraints ?? {}).map(
      ([regla, mensaje]) => ({
        campo,
        mensaje: MENSAJES_GENERALES[regla] ?? mensaje,
      }),
    );
    return [...propios, ...aplanarErrores(error.children ?? [], campo)];
  });
}
