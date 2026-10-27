// Jerarquía de errores de dominio (docs/backend/M0 §4.6). La capa HTTP (PR 5) traduce cada clase a un
// estado y a un documento problem+json; el dominio no sabe nada de HTTP.
//
// El mensaje puede llegar al cliente: debe ser claro para una persona y no llevar datos personales
// ni clínicos. El `codigo` es estable y lo usa el frontend para decidir qué mostrar; cada módulo puede
// dar uno propio más específico (por ejemplo 'reservas.franja_ocupada').

export abstract class ErrorDeDominio extends Error {
  readonly codigo: string;

  protected constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
  }
}

// Datos con forma o rango inválido (un monto negativo, una fecha inexistente).
export class ErrorDeValidacion extends ErrorDeDominio {
  constructor(mensaje: string, codigo = 'validacion') {
    super(mensaje, codigo);
  }
}

// El recurso no existe o no pertenece a quien lo pide (no se distingue, para no revelar que existe).
export class RecursoNoEncontrado extends ErrorDeDominio {
  constructor(mensaje: string, codigo = 'no_encontrado') {
    super(mensaje, codigo);
  }
}

// Transición de estado inválida o duplicado (aceptar un servicio ya cancelado, doble reserva).
export class ConflictoDeEstado extends ErrorDeDominio {
  constructor(mensaje: string, codigo = 'conflicto') {
    super(mensaje, codigo);
  }
}

// Los datos son válidos, pero el negocio no lo permite (reservar para una fecha pasada).
export class ReglaDeNegocioIncumplida extends ErrorDeDominio {
  constructor(mensaje: string, codigo = 'regla_de_negocio') {
    super(mensaje, codigo);
  }
}

// No hay sesión o el token no es válido.
export class NoAutenticado extends ErrorDeDominio {
  constructor(mensaje = 'Debes iniciar sesión', codigo = 'no_autenticado') {
    super(mensaje, codigo);
  }
}

// Hay sesión, pero el rol o el vínculo no alcanzan para esta acción.
export class SinPermiso extends ErrorDeDominio {
  constructor(
    mensaje = 'No tienes permiso para esta acción',
    codigo = 'sin_permiso',
  ) {
    super(mensaje, codigo);
  }
}
