import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { UsuarioActual } from '../../../../compartido/http/decoradores.js';
import { CONFIGURACION } from '../../../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../../../configuracion/variables-de-entorno.js';
import { ActualizarPerfilPropio } from '../../../aplicacion/casos-de-uso/actualizar-perfil-propio.js';
import { CambiarContrasena } from '../../../aplicacion/casos-de-uso/cambiar-contrasena.js';
import {
  ObtenerPerfilPropio,
  type Perfil,
} from '../../../aplicacion/casos-de-uso/obtener-perfil-propio.js';
import type { VistaDePerfil } from '../../../aplicacion/vistas.js';
import { escribirCookiesDeSesion } from './cookies-de-sesion.js';
import { CambioDeContrasenaDto } from './dto-de-autenticacion.js';
import { ActualizarPerfilDto } from './dto-de-perfil.js';

// El perfil de quien tiene la sesión. Cualquier rol autenticado lo usa; el control de acceso es que
// cada quien solo puede pedir el suyo (el id sale del token, nunca de la ruta).
@Controller('yo')
export class PerfilController {
  constructor(
    @Inject(ObtenerPerfilPropio) private readonly obtener: ObtenerPerfilPropio,
    @Inject(ActualizarPerfilPropio)
    private readonly actualizar: ActualizarPerfilPropio,
    @Inject(CambiarContrasena)
    private readonly cambiarContrasena: CambiarContrasena,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  @Get()
  perfil(@UsuarioActual() usuario: UsuarioAutenticado): Promise<Perfil> {
    return this.obtener.ejecutar(usuario.id);
  }

  // Cambia la contraseña conociendo la actual. Cierra todas las sesiones de la cuenta y abre una nueva
  // para quien la cambió (las cookies nuevas vienen en esta respuesta). Límite por IP: equivocarse con
  // la contraseña actual cuenta como un intento fallido de inicio de sesión.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('contrasena')
  async contrasena(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: CambioDeContrasenaDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    const tokens = await this.cambiarContrasena.ejecutar(usuario.id, cuerpo);
    escribirCookiesDeSesion(
      respuesta,
      tokens,
      this.configuracion.cookiesSeguras,
    );
  }

  @Patch()
  async cambiar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: ActualizarPerfilDto,
  ): Promise<{ usuario: VistaDePerfil }> {
    return { usuario: await this.actualizar.ejecutar(usuario.id, cuerpo) };
  }
}
