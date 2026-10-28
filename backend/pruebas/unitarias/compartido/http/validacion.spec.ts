import type { ValidationError } from '@nestjs/common';
import {
  aplanarErrores,
  ErrorDeValidacionDeEntrada,
  opcionesDeValidacion,
} from '../../../../src/compartido/http/validacion.js';

const error = (
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children });

describe('aplanarErrores', () => {
  it('convierte el árbol de class-validator en una lista de campo y mensaje', () => {
    expect(
      aplanarErrores([
        error('horas', { min: 'Debe estar entre 1 y 8' }),
        error('direccion', undefined, [
          error('ciudad', { isString: 'La ciudad es obligatoria' }),
        ]),
        error('horarios', undefined, [
          error('0', { matches: 'Hora inválida' }),
        ]),
      ]),
    ).toEqual([
      { campo: 'horas', mensaje: 'Debe estar entre 1 y 8' },
      { campo: 'direccion.ciudad', mensaje: 'La ciudad es obligatoria' },
      { campo: 'horarios.0', mensaje: 'Hora inválida' },
    ]);
  });

  it('traduce el mensaje de campo no permitido', () => {
    expect(
      aplanarErrores([
        error('rol', { whitelistValidation: 'property rol should not exist' }),
      ]),
    ).toEqual([{ campo: 'rol', mensaje: 'Este campo no está permitido' }]);
  });

  it('una propiedad con varias reglas incumplidas da un mensaje por regla', () => {
    expect(
      aplanarErrores([
        error('correo', { isEmail: 'Correo inválido', maxLength: 'Muy largo' }),
      ]),
    ).toHaveLength(2);
  });
});

describe('opcionesDeValidacion', () => {
  it('rechaza campos no declarados y transforma al tipo del DTO', () => {
    expect(opcionesDeValidacion).toMatchObject({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  it('lanza ErrorDeValidacionDeEntrada con la lista aplanada', () => {
    const resultado = opcionesDeValidacion.exceptionFactory?.([
      error('horas', { min: 'Debe estar entre 1 y 8' }),
    ]);
    expect(resultado).toBeInstanceOf(ErrorDeValidacionDeEntrada);
    expect((resultado as ErrorDeValidacionDeEntrada).errores).toEqual([
      { campo: 'horas', mensaje: 'Debe estar entre 1 y 8' },
    ]);
  });
});
