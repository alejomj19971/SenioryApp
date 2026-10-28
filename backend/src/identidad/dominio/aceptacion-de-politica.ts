import type { UsuarioId } from './ids.js';
import type { VersionDeTexto } from './version-de-texto.js';

export interface DatosDeAceptacionDePolitica {
  usuarioId: UsuarioId;
  version: VersionDeTexto;
  aceptadaEn: Date;
}

// Prueba de que una persona aceptó una versión concreta de la política de tratamiento de datos
// (Ley 1581). Es obligatoria para registrarse y no se modifica: si la política cambia, se registra
// una aceptación nueva. Un registro por usuario y versión (clave primaria de la tabla).
export class AceptacionDePolitica {
  private constructor(private readonly datos: DatosDeAceptacionDePolitica) {}

  static registrar(datos: DatosDeAceptacionDePolitica): AceptacionDePolitica {
    return new AceptacionDePolitica({ ...datos });
  }

  get usuarioId(): UsuarioId {
    return this.datos.usuarioId;
  }
  get version(): VersionDeTexto {
    return this.datos.version;
  }
  get aceptadaEn(): Date {
    return this.datos.aceptadaEn;
  }
}
