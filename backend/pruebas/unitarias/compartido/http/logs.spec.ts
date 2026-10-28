import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pinoHttp, type Options } from 'pino-http';
import { opcionesDeLogs } from '../../../../src/compartido/http/logs.js';
import {
  configuracionDesdeVariables,
  validarVariables,
} from '../../../../src/configuracion/variables-de-entorno.js';

// M1 §6 (Logs): el log de una petición con credenciales no contiene contraseñas, correos ni cookies.
// Se prueba con las opciones REALES de la aplicación (`opcionesDeLogs`) sobre un servidor mínimo: el
// log de pino-http escribe a un arreglo en vez de a la salida estándar, que no se puede leer de forma
// fiable dentro de las pruebas.

const configuracion = configuracionDesdeVariables(
  validarVariables({
    NODE_ENV: 'test',
    URL_BASE_DE_DATOS: 'postgres://seniory:seniory@localhost:5434/seniory',
    ORIGENES_PERMITIDOS: 'http://localhost:3000',
    SECRETO_JWT_ACCESO: 'secreto-jwt-solo-para-pruebas-0123456789',
    NIVEL_DE_LOG: 'info',
  }),
);

const COOKIE_DE_ACCESO = 'seniory_acceso=TOKEN-DE-ACCESO-SECRETO';
const COOKIE_DE_REFRESCO = 'seniory_refresco=TOKEN-DE-REFRESCO-SECRETO';

async function registrarUnaPeticion(): Promise<string> {
  const lineas: string[] = [];
  const opciones = opcionesDeLogs(configuracion).pinoHttp as Options;
  const registrar = pinoHttp(opciones, {
    write: (linea: string) => void lineas.push(linea),
  });
  const servidor = createServer((peticion, respuesta) => {
    registrar(peticion, respuesta);
    // Lo que escribe /auth/login: las cookies de sesión nuevas.
    respuesta.setHeader('Set-Cookie', [
      'seniory_acceso=NUEVO-ACCESO-SECRETO; HttpOnly',
      'seniory_refresco=NUEVO-REFRESCO-SECRETO; HttpOnly',
    ]);
    // Un descuido típico: registrar el cuerpo recibido junto con otros datos.
    peticion.log.info(
      {
        cuerpo: {
          correo: 'andrea@ejemplo.co',
          contrasena: 'contraseña-secreta-1',
          telefono: '+573001234567',
        },
      },
      'cuerpo recibido',
    );
    respuesta.end();
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  try {
    const { port } = servidor.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Cookie: `${COOKIE_DE_ACCESO}; ${COOKIE_DE_REFRESCO}`,
        Authorization: 'Bearer TOKEN-BEARER-SECRETO',
        'X-Seniory-BFF': 'secreto-compartido-con-el-bff',
      },
    });
  } finally {
    await new Promise<void>((listo) => servidor.close(() => listo()));
  }
  return lineas.join('');
}

describe('logs de una petición de autenticación', () => {
  it('no incluye cookies, tokens, secreto del BFF, contraseña, correo ni teléfono', async () => {
    const log = await registrarUnaPeticion();

    // La prueba solo vale si el log registró la petición y el cuerpo.
    expect(log).toContain('/api/v1/auth/login');
    expect(log).toContain('cuerpo recibido');
    expect(log).toContain('[oculto]');
    for (const secreto of [
      'TOKEN-DE-ACCESO-SECRETO',
      'TOKEN-DE-REFRESCO-SECRETO',
      'NUEVO-ACCESO-SECRETO',
      'NUEVO-REFRESCO-SECRETO',
      'TOKEN-BEARER-SECRETO',
      'secreto-compartido-con-el-bff',
      'contraseña-secreta-1',
      'andrea@ejemplo.co',
      '+573001234567',
    ]) {
      expect(log).not.toContain(secreto);
    }
  });
});
