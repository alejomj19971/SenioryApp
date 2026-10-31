import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { nuevoId } from './bd.js';

// Ayudas para las pruebas de API que necesitan una persona con sesión iniciada.

export const SECRETO_BFF = 's'.repeat(40);
export const CONTRASENA = 'una contraseña larga y única';

// Cada prueba usa su propia IP (la del «navegador» que el BFF declara): los límites por ruta son por
// IP y las pruebas no deben gastarse el cupo unas a otras.
let contadorDeIps = 0;
export function nuevaIp(): string {
  const n = ++contadorDeIps;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

export interface Sesion {
  acceso: string;
  refresco: string;
}

export type Peticion = (ruta: string) => request.Test;

// Lo que haría el BFF de Next: llegar con el secreto compartido y la IP del navegador.
export interface Cliente {
  get: Peticion;
  post: Peticion;
  patch: Peticion;
  delete: Peticion;
}

export function como(app: NestExpressApplication, ip = nuevaIp()): Cliente {
  const conIp = (peticion: request.Test) =>
    peticion.set('X-Seniory-BFF', SECRETO_BFF).set('X-Cliente-IP', ip);
  const servidor = () => request(app.getHttpServer());
  return {
    get: (ruta) => conIp(servidor().get(ruta)),
    post: (ruta) => conIp(servidor().post(ruta)),
    patch: (ruta) => conIp(servidor().patch(ruta)),
    delete: (ruta) => conIp(servidor().delete(ruta)),
  };
}

export function sesionDe(respuesta: request.Response): Sesion {
  const lineas =
    (respuesta.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const valor = (nombre: string) => {
    const linea = lineas.find((l) => l.startsWith(`${nombre}=`));
    const texto = linea?.split(';')[0]?.slice(nombre.length + 1);
    if (texto === undefined || texto === '') {
      throw new Error(`La respuesta no escribió la cookie ${nombre}`);
    }
    return texto;
  };
  return {
    acceso: valor('seniory_acceso'),
    refresco: valor('seniory_refresco'),
  };
}

export const conSesion = (sesion: Pick<Sesion, 'acceso'>) =>
  `seniory_acceso=${sesion.acceso}`;

export const correoNuevo = () => `${nuevoId()}@prueba.seniory.invalid`;

export interface Persona {
  id: string;
  correo: string;
  sesion: Sesion;
}

// Registra a un familiar (siempre se crea con el rol «familiar») y deja su sesión iniciada.
export async function registrarFamiliar(cliente: Cliente): Promise<Persona> {
  const correo = correoNuevo();
  const respuesta = await cliente.post('/api/v1/auth/registro').send({
    nombre: 'Andrea Gómez',
    correo,
    contrasena: CONTRASENA,
    versionPolitica: 'v1',
  });
  if (respuesta.status !== 201) {
    throw new Error(`El registro falló: ${respuesta.status}`);
  }
  return {
    id: (respuesta.body as { usuario: { id: string } }).usuario.id,
    correo,
    sesion: sesionDe(respuesta),
  };
}

// Vuelve a iniciar sesión: sirve para obtener un token con el rol que la base tenga en ese momento.
export async function iniciarSesion(
  cliente: Cliente,
  correo: string,
): Promise<Sesion> {
  const respuesta = await cliente
    .post('/api/v1/auth/login')
    .send({ correo, contrasena: CONTRASENA });
  if (respuesta.status !== 200) {
    throw new Error(`El inicio de sesión falló: ${respuesta.status}`);
  }
  return sesionDe(respuesta);
}
