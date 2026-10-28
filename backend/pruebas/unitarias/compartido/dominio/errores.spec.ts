import {
  ConflictoDeEstado,
  ErrorDeDominio,
  ErrorDeValidacion,
  NoAutenticado,
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
  SinPermiso,
} from '../../../../src/compartido/dominio/errores.js';

describe('errores de dominio', () => {
  it.each([
    [new ErrorDeValidacion('dato inválido'), 'ErrorDeValidacion', 'validacion'],
    [
      new RecursoNoEncontrado('no existe'),
      'RecursoNoEncontrado',
      'no_encontrado',
    ],
    [new ConflictoDeEstado('ya cancelado'), 'ConflictoDeEstado', 'conflicto'],
    [
      new ReglaDeNegocioIncumplida('fecha pasada'),
      'ReglaDeNegocioIncumplida',
      'regla_de_negocio',
    ],
    [new NoAutenticado(), 'NoAutenticado', 'no_autenticado'],
    [new SinPermiso(), 'SinPermiso', 'sin_permiso'],
  ])('%s tiene nombre y código por defecto', (error, nombre, codigo) => {
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(nombre);
    expect(error.codigo).toBe(codigo);
    expect(error.stack).toContain(nombre);
  });

  it('cada módulo puede dar un código más específico', () => {
    const error = new ConflictoDeEstado(
      'El cuidador ya tiene un servicio en esa franja',
      'reservas.franja_ocupada',
    );
    expect(error.codigo).toBe('reservas.franja_ocupada');
    expect(error.message).toBe(
      'El cuidador ya tiene un servicio en esa franja',
    );
  });

  it('autenticación y permisos traen un mensaje claro por defecto', () => {
    expect(new NoAutenticado().message).toBe('Debes iniciar sesión');
    expect(new SinPermiso().message).toBe('No tienes permiso para esta acción');
  });

  it('las clases se distinguen entre sí (la capa HTTP elige el estado por clase)', () => {
    const error: ErrorDeDominio = new RecursoNoEncontrado('no existe');
    expect(error).not.toBeInstanceOf(ConflictoDeEstado);
    expect(error).not.toBeInstanceOf(ErrorDeValidacion);
  });
});
