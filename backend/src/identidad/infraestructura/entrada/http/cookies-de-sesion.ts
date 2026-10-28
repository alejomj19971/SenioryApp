import type { CookieOptions, Response } from 'express';
import type { TokensDeSesion } from '../../../aplicacion/servicios/emisor-de-sesiones.js';
import { COOKIE_DE_ACCESO } from '../../../../compartido/http/guardias.js';

export const COOKIE_DE_REFRESCO = 'seniory_refresco';
// El refresco solo viaja a las rutas de sesión, no a cada petición de la API.
const RUTA_DEL_REFRESCO = '/api/v1/auth';

function opciones(path: string, cookiesSeguras: boolean): CookieOptions {
  return { httpOnly: true, secure: cookiesSeguras, sameSite: 'lax', path };
}

// Las cookies de sesión: invisibles para JavaScript (HttpOnly), solo por https (Secure, salvo en
// local) y sin enviarse desde otros sitios (SameSite=Lax). Next las reenvía al navegador a partir de
// estos `Set-Cookie` (BFF).
export function escribirCookiesDeSesion(
  respuesta: Response,
  tokens: TokensDeSesion,
  cookiesSeguras: boolean,
): void {
  respuesta.cookie(COOKIE_DE_ACCESO, tokens.acceso, {
    ...opciones('/', cookiesSeguras),
    expires: tokens.accesoExpiraEn,
  });
  respuesta.cookie(COOKIE_DE_REFRESCO, tokens.refresco, {
    ...opciones(RUTA_DEL_REFRESCO, cookiesSeguras),
    expires: tokens.refrescoExpiraEn,
  });
}

export function borrarCookiesDeSesion(
  respuesta: Response,
  cookiesSeguras: boolean,
): void {
  respuesta.clearCookie(COOKIE_DE_ACCESO, opciones('/', cookiesSeguras));
  respuesta.clearCookie(
    COOKIE_DE_REFRESCO,
    opciones(RUTA_DEL_REFRESCO, cookiesSeguras),
  );
}
