import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { UsuarioActual } from '../../../../compartido/http/decoradores.js';
import {
  LIMITE_MAXIMO,
  ListarMisNotificaciones,
  type PaginaDeVistasDeNotificaciones,
} from '../../../aplicacion/casos-de-uso/listar-mis-notificaciones.js';

// Solo la FORMA; los límites reales los aplica el caso de uso.
export class ListadoDeNotificacionesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: `El límite debe estar entre 1 y ${LIMITE_MAXIMO}` })
  @Max(LIMITE_MAXIMO, {
    message: `El límite debe estar entre 1 y ${LIMITE_MAXIMO}`,
  })
  limite?: number;

  @IsOptional()
  @IsString({ message: 'El cursor no es válido' })
  @Length(0, 500, { message: 'El cursor no es válido' })
  cursor?: string;
}

// La campana de la aplicación: los avisos de quien pregunta, los más recientes primero. Cualquier persona con
// sesión ve SOLO los suyos: el destinatario sale del token, nunca de un parámetro.
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    @Inject(ListarMisNotificaciones)
    private readonly listar: ListarMisNotificaciones,
  ) {}

  @Get()
  listado(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query() consulta: ListadoDeNotificacionesDto,
  ): Promise<PaginaDeVistasDeNotificaciones> {
    return this.listar.ejecutar(usuario.id, consulta);
  }
}
