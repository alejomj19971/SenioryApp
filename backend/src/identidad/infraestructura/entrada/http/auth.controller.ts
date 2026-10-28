import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { NoAutenticado } from '../../../../compartido/dominio/errores.js';
import { Publico } from '../../../../compartido/http/decoradores.js';
import { CONFIGURACION } from '../../../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../../../configuracion/variables-de-entorno.js';
import { CerrarSesion } from '../../../aplicacion/casos-de-uso/cerrar-sesion.js';
import { IniciarSesion } from '../../../aplicacion/casos-de-uso/iniciar-sesion.js';
import {
  RegistrarFamiliar,
  type ResultadoDeAutenticacion,
} from '../../../aplicacion/casos-de-uso/registrar-familiar.js';
import { RenovarSesion } from '../../../aplicacion/casos-de-uso/renovar-sesion.js';
import type { VistaDeUsuario } from '../../../aplicacion/vistas.js';
import {
  borrarCookiesDeSesion,
  COOKIE_DE_REFRESCO,
  escribirCookiesDeSesion,
} from './cookies-de-sesion.js';
import { InicioDeSesionDto, RegistroDto } from './dto-de-autenticacion.js';

const UN_MINUTO_MS = 60_000;

interface RespuestaDeSesion {
  usuario: VistaDeUsuario;
}

// Todas son públicas: son la puerta de entrada. Los tokens viajan SOLO en cookies, nunca en el cuerpo.
// Límites propios por IP (M1 §4.5): más estrictos que el global, porque aquí se prueban contraseñas.
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RegistrarFamiliar) private readonly registrar: RegistrarFamiliar,
    @Inject(IniciarSesion) private readonly iniciar: IniciarSesion,
    @Inject(RenovarSesion) private readonly renovar: RenovarSesion,
    @Inject(CerrarSesion) private readonly cerrar: CerrarSesion,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  @Publico()
  @Throttle({ default: { limit: 5, ttl: UN_MINUTO_MS } })
  @Post('registro')
  async registro(
    @Body() cuerpo: RegistroDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaDeSesion> {
    const resultado = await this.registrar.ejecutar(cuerpo);
    return this.conSesion(respuesta, resultado);
  }

  @Publico()
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() cuerpo: InicioDeSesionDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaDeSesion> {
    const resultado = await this.iniciar.ejecutar(cuerpo);
    return this.conSesion(respuesta, resultado);
  }

  // Pública porque se usa justo cuando el token de acceso ya venció; lo que la protege es el token de
  // refresco, que solo viaja en su cookie.
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('refresh')
  async refresh(
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    const token = tokenDeRefrescoDe(peticion);
    try {
      if (token === undefined) throw new NoAutenticado();
      const tokens = await this.renovar.ejecutar(token);
      escribirCookiesDeSesion(
        respuesta,
        tokens,
        this.configuracion.cookiesSeguras,
      );
    } catch (error) {
      // Un refresco inválido no sirve más: se borran las cookies para que el navegador deje de enviarlas.
      if (error instanceof NoAutenticado) {
        borrarCookiesDeSesion(respuesta, this.configuracion.cookiesSeguras);
      }
      throw error;
    }
  }

  // Pública a propósito: debe poder cerrarse la sesión aunque el token de acceso ya haya vencido.
  // Quien no tenga el token de refresco no puede revocar nada.
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    await this.cerrar.ejecutar(tokenDeRefrescoDe(peticion));
    borrarCookiesDeSesion(respuesta, this.configuracion.cookiesSeguras);
  }

  private conSesion(
    respuesta: Response,
    resultado: ResultadoDeAutenticacion,
  ): RespuestaDeSesion {
    escribirCookiesDeSesion(
      respuesta,
      resultado.tokens,
      this.configuracion.cookiesSeguras,
    );
    return { usuario: resultado.usuario };
  }
}

function tokenDeRefrescoDe(peticion: Request): string | undefined {
  const cookies = peticion.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[COOKIE_DE_REFRESCO];
  return typeof token === 'string' && token !== '' ? token : undefined;
}
