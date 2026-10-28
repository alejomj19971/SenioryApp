import { ConflictoDeEstado } from '../../compartido/dominio/errores.js';
import type { AdultoMayorId, UsuarioId, VinculoId } from './ids.js';
import type { Parentesco } from './valores-cerrados.js';

export type EstadoDeVinculo = 'activo' | 'revocado';

export interface DatosDeVinculo {
  id: VinculoId;
  familiarId: UsuarioId;
  adultoMayorId: AdultoMayorId;
  parentesco: Parentesco;
  esResponsable: boolean;
  estado: EstadoDeVinculo;
  creadoEn: Date;
  revocadoEn: Date | null;
}

export interface DatosParaCrearVinculo {
  id: VinculoId;
  familiarId: UsuarioId;
  adultoMayorId: AdultoMayorId;
  parentesco: Parentesco;
  esResponsable: boolean;
  ahora: Date;
}

// La relación entre un familiar y una persona mayor. Es la base del control de acceso: sin un
// vínculo activo, un familiar no ve nada de esa persona (ni siquiera sabe si existe: responde 404).
//
// Que haya UN SOLO vínculo activo por pareja lo garantiza un índice único parcial en la base de
// datos: el dominio no ve los demás vínculos.
export class Vinculo {
  private constructor(private readonly datos: DatosDeVinculo) {}

  static crear(datos: DatosParaCrearVinculo): Vinculo {
    return new Vinculo({
      id: datos.id,
      familiarId: datos.familiarId,
      adultoMayorId: datos.adultoMayorId,
      parentesco: datos.parentesco,
      esResponsable: datos.esResponsable,
      estado: 'activo',
      creadoEn: datos.ahora,
      revocadoEn: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeVinculo): Vinculo {
    return new Vinculo({ ...datos });
  }

  get id(): VinculoId {
    return this.datos.id;
  }
  get familiarId(): UsuarioId {
    return this.datos.familiarId;
  }
  get adultoMayorId(): AdultoMayorId {
    return this.datos.adultoMayorId;
  }
  get parentesco(): Parentesco {
    return this.datos.parentesco;
  }
  get esResponsable(): boolean {
    return this.datos.esResponsable;
  }
  get estado(): EstadoDeVinculo {
    return this.datos.estado;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get revocadoEn(): Date | null {
    return this.datos.revocadoEn;
  }

  estaActivo(): boolean {
    return this.datos.estado === 'activo';
  }

  // ¿Es el vínculo activo de este familiar con esta persona mayor?
  conecta(familiarId: UsuarioId, adultoMayorId: AdultoMayorId): boolean {
    return (
      this.estaActivo() &&
      this.datos.familiarId === familiarId &&
      this.datos.adultoMayorId === adultoMayorId
    );
  }

  revocar(ahora: Date): void {
    if (!this.estaActivo()) {
      throw new ConflictoDeEstado(
        'El vínculo ya está revocado',
        'vinculo.ya_revocado',
      );
    }
    this.datos.estado = 'revocado';
    this.datos.revocadoEn = ahora;
  }
}
