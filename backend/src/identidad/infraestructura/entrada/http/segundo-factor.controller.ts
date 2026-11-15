import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { Roles, UsuarioActual } from '../../../../compartido/http/decoradores.js';
import {
  ConfirmarSegundoFactor,
  DesactivarSegundoFactor,
  IniciarConfiguracionDeSegundoFactor,
  type ConfiguracionIniciada,
} from '../../../aplicacion/casos-de-uso/configurar-segundo-factor.js';
import { CodigoDeSegundoFactorDto } from './dto-de-autenticacion.js';

const UN_MINUTO_MS = 60_000;

// El propio administrador activa, confirma o apaga su segundo factor (TOTP). Solo administradores: es la
// única cuenta que lo exige (decisión 4 de M1).
@Controller('cuentas/yo/segundo-factor')
@Roles('administrador')
export class SegundoFactorController {
  constructor(
    @Inject(IniciarConfiguracionDeSegundoFactor)
    private readonly iniciar: IniciarConfiguracionDeSegundoFactor,
    @Inject(ConfirmarSegundoFactor)
    private readonly confirmar: ConfirmarSegundoFactor,
    @Inject(DesactivarSegundoFactor)
    private readonly desactivar: DesactivarSegundoFactor,
  ) {}

  // Genera un secreto nuevo (reemplaza cualquiera pendiente de antes) y lo entrega como código QR y como
  // texto. Todavía no protege el login: hace falta `confirmacion`.
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post()
  configurar(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ConfiguracionIniciada> {
    return this.iniciar.ejecutar(usuario.id);
  }

  // Demuestra que la app autenticadora quedó bien configurada: desde aquí, el login lo exige.
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('confirmacion')
  confirmarConfiguracion(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: CodigoDeSegundoFactorDto,
  ): Promise<void> {
    return this.confirmar.ejecutar(usuario.id, cuerpo.codigo);
  }

  // Lo apaga por su cuenta (para reconfigurarlo desde cero, por ejemplo).
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete()
  desactivarConfiguracion(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.desactivar.ejecutar(usuario.id);
  }
}
