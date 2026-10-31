import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CONFIGURACION } from '../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../configuracion/variables-de-entorno.js';
import {
  VERIFICADOR_DE_TOKENS,
  type Rol,
  type VerificadorDeTokens,
} from '../aplicacion/puertos/verificador-de-tokens.js';
import { NoAutenticado, SinPermiso } from '../dominio/errores.js';
import { ipDelClienteDe } from './datos-de-la-peticion.js';
import {
  CLAVE_PUBLICO,
  CLAVE_ROLES,
  type PeticionAutenticada,
} from './decoradores.js';

export const COOKIE_DE_ACCESO = 'seniory_acceso';

// Los métodos que no cambian nada: un sitio ajeno puede provocarlos, pero no puede leer la respuesta
// (CORS) ni causa daño.
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defensa contra CSRF (junto con `SameSite=Lax` en las cookies, M1 §4.4): en una petición que cambia
// algo, si el navegador declara de qué sitio viene (`Origin`), tiene que ser uno de los permitidos.
//
// Las llamadas del BFF de Next son de servidor a servidor y NO traen ese encabezado: se aceptan (la
// autenticación sigue siendo obligatoria). Los navegadores SÍ lo envían en todo `POST`, `PATCH` o
// `DELETE` entre sitios, así que una página ajena no puede esquivar esta comprobación.
@Injectable()
export class GuardDeOrigen implements CanActivate {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<Request>();
    if (METODOS_SEGUROS.has(peticion.method)) return true;
    const origen = peticion.headers.origin;
    if (origen === undefined) return true; // llamada del BFF
    if (this.configuracion.origenesPermitidos.includes(origen)) return true;
    if (
      !this.configuracion.esProduccion &&
      origen === this.origenPropio(peticion)
    ) {
      // La documentación de Swagger (solo fuera de producción) llama a la API desde su propio origen.
      return true;
    }
    throw new SinPermiso(
      'La petición viene de un sitio no permitido',
      'origen_no_permitido',
    );
  }

  private origenPropio(peticion: Request): string {
    return `${peticion.protocol}://${peticion.get('host') ?? ''}`;
  }
}

// Global y DENIEGA POR DEFECTO (M0 §4.10): una ruta nueva que olvide @Publico() queda protegida,
// nunca expuesta. Lee el token de la cookie que pone el frontend; fuera de producción también
// acepta `Authorization: Bearer` para probar la API con herramientas como Swagger o curl.
@Injectable()
export class GuardDeAutenticacion implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(VERIFICADOR_DE_TOKENS)
    private readonly verificador: VerificadorDeTokens,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean | undefined>(
      CLAVE_PUBLICO,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (publico === true) return true;

    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const token = this.tokenDe(peticion);
    if (token === undefined) throw new NoAutenticado();
    peticion.usuario = await this.verificador.verificar(token);
    return true;
  }

  private tokenDe(peticion: Request): string | undefined {
    const cookies = peticion.cookies as Record<string, string> | undefined;
    const deLaCookie = cookies?.[COOKIE_DE_ACCESO];
    if (deLaCookie !== undefined && deLaCookie !== '') return deLaCookie;
    if (this.configuracion.esProduccion) return undefined;
    const [esquema, token] = (peticion.headers.authorization ?? '').split(' ');
    return esquema === 'Bearer' && token !== undefined && token !== ''
      ? token
      : undefined;
  }
}

@Injectable()
export class GuardDeRoles implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      CLAVE_ROLES,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (roles === undefined) return true;
    const usuario = contexto
      .switchToHttp()
      .getRequest<PeticionAutenticada>().usuario;
    if (usuario === undefined) throw new NoAutenticado();
    if (!roles.includes(usuario.rol)) throw new SinPermiso();
    return true;
  }
}

// Límite de peticiones por IP del cliente real: la del navegador si la petición viene del BFF con
// el secreto correcto, o la de la conexión en cualquier otro caso (M0 §4.10).
@Injectable()
export class GuardDeLimiteDePeticiones extends ThrottlerGuard {
  @Inject(CONFIGURACION) private readonly configuracion!: Configuracion;

  protected override getTracker(peticion: Request): Promise<string> {
    return Promise.resolve(
      ipDelClienteDe(peticion, this.configuracion.secretoBff),
    );
  }
}
