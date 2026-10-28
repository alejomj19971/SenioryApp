import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  Rol,
  UsuarioAutenticado,
} from '../aplicacion/puertos/verificador-de-tokens.js';
import { NoAutenticado } from '../dominio/errores.js';

export const CLAVE_PUBLICO = 'seniory:publico';
export const CLAVE_ROLES = 'seniory:roles';

// Toda ruta exige sesión salvo que se marque así, de forma explícita y visible en el controlador.
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

// Roles que pueden usar la ruta o el controlador; otro rol recibe 403.
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

export type PeticionAutenticada = Request & { usuario?: UsuarioAutenticado };

// Inyecta en el controlador el usuario que dejó el guard de autenticación.
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const usuario = contexto
      .switchToHttp()
      .getRequest<PeticionAutenticada>().usuario;
    // Solo pasa si la ruta se marcó @Publico() y aun así pide el usuario: error de programación
    // que se trata como falta de sesión, nunca como un usuario vacío.
    if (usuario === undefined) throw new NoAutenticado();
    return usuario;
  },
);
