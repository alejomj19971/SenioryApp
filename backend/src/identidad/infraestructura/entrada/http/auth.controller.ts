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
import { RegistrarCuidadorPropio } from '../../../aplicacion/casos-de-uso/registrar-cuidador-propio.js';
import {
  RegistrarFamiliar,
  type ResultadoDeAutenticacion,
} from '../../../aplicacion/casos-de-uso/registrar-familiar.js';
import { RenovarSesion } from '../../../aplicacion/casos-de-uso/renovar-sesion.js';
import {
  RestablecerContrasena,
  type ResultadoDeRestablecimiento,
} from '../../../aplicacion/casos-de-uso/restablecer-contrasena.js';
import { SolicitarRecuperacion } from '../../../aplicacion/casos-de-uso/solicitar-recuperacion.js';
import { VerificarSegundoFactorDeInicioDeSesion } from '../../../aplicacion/casos-de-uso/verificar-segundo-factor.js';
import type { VistaDeUsuario } from '../../../aplicacion/vistas.js';
import {
  borrarCookiesDeSesion,
  COOKIE_DE_REFRESCO,
  escribirCookiesDeSesion,
} from './cookies-de-sesion.js';
import {
  InicioDeSesionDto,
  RegistroDto,
  RestablecimientoDeContrasenaDto,
  SolicitudDeRecuperacionDto,
  VerificacionDeSegundoFactorDto,
} from './dto-de-autenticacion.js';

const UN_MINUTO_MS = 60_000;

interface RespuestaDeSesion {
  usuario: VistaDeUsuario;
}

// Cuando el login pasó la contraseña pero falta el código de la app autenticadora. El desafío viaja en
// el CUERPO (no en una cookie): todavía no hay sesión que proteger, y el navegador lo necesita para
// mandarlo de vuelta en el siguiente paso.
interface RespuestaDeDesafio {
  requiereSegundoFactor: true;
  desafio: string;
  expiraEn: Date;
}

// Todas son públicas: son la puerta de entrada. Los tokens viajan SOLO en cookies, nunca en el cuerpo.
// Límites propios por IP (M1 §4.5): más estrictos que el global, porque aquí se prueban contraseñas.
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RegistrarFamiliar) private readonly registrar: RegistrarFamiliar,
    @Inject(RegistrarCuidadorPropio)
    private readonly registrarCuidador: RegistrarCuidadorPropio,
    @Inject(IniciarSesion) private readonly iniciar: IniciarSesion,
    @Inject(RenovarSesion) private readonly renovar: RenovarSesion,
    @Inject(CerrarSesion) private readonly cerrar: CerrarSesion,
    @Inject(SolicitarRecuperacion)
    private readonly solicitarRecuperacion: SolicitarRecuperacion,
    @Inject(RestablecerContrasena)
    private readonly restablecer: RestablecerContrasena,
    @Inject(VerificarSegundoFactorDeInicioDeSesion)
    private readonly verificarSegundoFactor: VerificarSegundoFactorDeInicioDeSesion,
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

  // La cuenta de un cuidador que se postula. Con ella solo puede crear su perfil y subir sus documentos: no se
  // muestra a nadie hasta que un revisor apruebe sus tres controles (E7). El rol lo decide esta ruta, no el cuerpo.
  @Publico()
  @Throttle({ default: { limit: 5, ttl: UN_MINUTO_MS } })
  @Post('registro-cuidador')
  async registroDeCuidador(
    @Body() cuerpo: RegistroDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaDeSesion> {
    const resultado = await this.registrarCuidador.ejecutar(cuerpo);
    return this.conSesion(respuesta, resultado);
  }

  @Publico()
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() cuerpo: InicioDeSesionDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaDeSesion | RespuestaDeDesafio> {
    const resultado = await this.iniciar.ejecutar(cuerpo);
    if (resultado.tipo === 'requiere_segundo_factor') {
      return {
        requiereSegundoFactor: true,
        desafio: resultado.desafio,
        expiraEn: resultado.expiraEn,
      };
    }
    return this.conSesion(respuesta, resultado.resultado);
  }

  // El segundo paso del login de un administrador con segundo factor: el código de su app autenticadora.
  // Tan estricto como el login mismo: ambos protegen la misma cuenta.
  @Publico()
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post('login/segundo-factor')
  async loginSegundoFactor(
    @Body() cuerpo: VerificacionDeSegundoFactorDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaDeSesion> {
    const resultado = await this.verificarSegundoFactor.ejecutar(
      cuerpo.desafio,
      cuerpo.codigo,
    );
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

  // «Olvidé mi contraseña». Responde 202 exista o no la cuenta (así no sirve para averiguar qué correos
  // tienen cuenta); 503 si todavía no hay un canal para enviar el enlace. Límite estricto por IP: cada
  // llamada puede significar un correo a una dirección ajena.
  @Publico()
  @Throttle({ default: { limit: 3, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('olvide-contrasena')
  async olvideContrasena(
    @Body() cuerpo: SolicitudDeRecuperacionDto,
  ): Promise<void> {
    await this.solicitarRecuperacion.ejecutar(cuerpo.correo);
  }

  // Elegir una contraseña nueva con el enlace del correo. No inicia sesión: se entra con la nueva. Si
  // tenía el segundo factor activo, demostrar que controla su correo también lo apaga (es el respaldo
  // para cuando se pierde el celular); se avisa en la respuesta para que la pantalla lo diga.
  @Publico()
  @Throttle({ default: { limit: 5, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post('restablecer-contrasena')
  restablecerContrasena(
    @Body() cuerpo: RestablecimientoDeContrasenaDto,
  ): Promise<ResultadoDeRestablecimiento> {
    return this.restablecer.ejecutar({
      token: cuerpo.token,
      contrasenaNueva: cuerpo.contrasenaNueva,
    });
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
