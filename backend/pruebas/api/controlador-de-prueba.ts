import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AUDITORIA,
  type Auditoria,
} from '../../src/compartido/aplicacion/puertos/auditoria.js';
import type { UsuarioAutenticado } from '../../src/compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  NoAutenticado,
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
  SinPermiso,
} from '../../src/compartido/dominio/errores.js';
import {
  Publico,
  Roles,
  UsuarioActual,
} from '../../src/compartido/http/decoradores.js';

class DireccionDto {
  @IsString({ message: 'La ciudad es obligatoria' })
  ciudad!: string;
}

class SolicitudDePruebaDto {
  @IsInt({ message: 'Las horas deben ser un número entero' })
  @Min(1, { message: 'Debe estar entre 1 y 8' })
  @Max(8, { message: 'Debe estar entre 1 y 8' })
  horas!: number;

  @IsIn(['manana', 'tarde', 'noche'], { message: 'Jornada inválida' })
  jornada!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DireccionDto)
  direccion?: DireccionDto;

  @IsOptional()
  @Length(0, 200_000)
  nota?: string;
}

const ERRORES = {
  validacion: () => new ErrorDeValidacion('El monto no puede ser negativo'),
  no_autenticado: () => new NoAutenticado(),
  sin_permiso: () => new SinPermiso(),
  no_encontrado: () => new RecursoNoEncontrado('El servicio no existe'),
  conflicto: () =>
    new ConflictoDeEstado(
      'El cuidador ya tiene un servicio en esa franja',
      'reservas.franja_ocupada',
    ),
  regla: () =>
    new ReglaDeNegocioIncumplida(
      'No se puede reservar para una fecha pasada',
      'reservas.fecha_pasada',
    ),
  inesperado: () => new Error('detalle interno secreto: contraseña=abc'),
} as const;

// Rutas que solo existen en las pruebas de la capa HTTP.
@Controller('prueba')
export class ControladorDePrueba {
  constructor(@Inject(AUDITORIA) private readonly auditoria: Auditoria) {}

  @Get('privada')
  privada(@UsuarioActual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }

  @Roles('administrador')
  @Get('solo-administradores')
  soloAdministradores(): { ok: true } {
    return { ok: true };
  }

  @Publico()
  @Post('eco')
  eco(@Body() solicitud: SolicitudDePruebaDto): SolicitudDePruebaDto & {
    clase: string;
  } {
    // Devuelve el nombre de la clase para comprobar que el ValidationPipe entregó una instancia.
    return {
      horas: solicitud.horas,
      jornada: solicitud.jornada,
      direccion: solicitud.direccion,
      nota: solicitud.nota,
      clase: solicitud.constructor.name,
    };
  }

  @Publico()
  @Get('error/:tipo')
  error(@Param('tipo') tipo: keyof typeof ERRORES): never {
    throw ERRORES[tipo]();
  }

  @Publico()
  @Post('auditar/:recursoId')
  async auditar(@Param('recursoId') recursoId: string): Promise<void> {
    await this.auditoria.registrar({
      actorId: null,
      accion: 'prueba.auditar',
      recursoTipo: 'prueba',
      recursoId,
      resultado: 'permitido',
    });
  }
}
