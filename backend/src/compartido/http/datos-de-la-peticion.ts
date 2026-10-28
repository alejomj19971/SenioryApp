import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { v7 as uuidv7 } from 'uuid';

// Correlación e IP del cliente de cada petición (M0 §4.10). Se calculan una sola vez y se guardan en
// la propia petición, porque las piden varias piezas en distinto orden: el middleware de contexto,
// el log de pino-http y el límite de peticiones.

export const CABECERA_ID_DE_PETICION = 'x-request-id';
export const CABECERA_SECRETO_BFF = 'x-seniory-bff';
export const CABECERA_IP_DEL_CLIENTE = 'x-cliente-ip';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALCULADOS = Symbol('datosDeLaPeticion');

interface Calculados {
  idDeCorrelacion?: string;
  ipDelCliente?: string;
}

type PeticionConDatos = IncomingMessage & { [CALCULADOS]?: Calculados };

function calculados(peticion: IncomingMessage): Calculados {
  const conDatos = peticion as PeticionConDatos;
  conDatos[CALCULADOS] ??= {};
  return conDatos[CALCULADOS];
}

function cabecera(
  peticion: IncomingMessage,
  nombre: string,
): string | undefined {
  const valor = peticion.headers[nombre];
  return Array.isArray(valor) ? valor[0] : valor;
}

// Usa el `X-Request-Id` que llega si es un UUID (así el frontend y la API comparten el ID en sus
// logs); si no viene o no es válido, genera uno. Siempre lo devuelve en la respuesta.
export function idDeCorrelacionDe(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
): string {
  const datos = calculados(peticion);
  if (datos.idDeCorrelacion === undefined) {
    const recibido = cabecera(peticion, CABECERA_ID_DE_PETICION)?.trim();
    datos.idDeCorrelacion =
      recibido !== undefined && FORMATO_UUID.test(recibido)
        ? recibido.toLowerCase()
        : uuidv7();
    respuesta.setHeader('X-Request-Id', datos.idDeCorrelacion);
  }
  return datos.idDeCorrelacion;
}

// Todas las peticiones del frontend llegan desde los servidores de Next (BFF), así que la IP de la
// conexión es la de esos servidores. Solo si `X-Seniory-BFF` trae el secreto compartido se cree en
// `X-Cliente-IP`; nunca en `X-Forwarded-For` de origen desconocido.
export function ipDelClienteDe(
  peticion: IncomingMessage,
  secretoBff: string | null,
): string {
  const datos = calculados(peticion);
  if (datos.ipDelCliente === undefined) {
    const ipDeLaConexion = peticion.socket.remoteAddress ?? 'desconocida';
    const declarada = cabecera(peticion, CABECERA_IP_DEL_CLIENTE)?.trim();
    const confiable =
      secretoBff !== null &&
      declarada !== undefined &&
      isIP(declarada) !== 0 &&
      secretoCorrecto(cabecera(peticion, CABECERA_SECRETO_BFF), secretoBff);
    datos.ipDelCliente = confiable ? declarada : ipDeLaConexion;
  }
  return datos.ipDelCliente;
}

// Comparación en tiempo constante: medir cuánto tarda la respuesta no revela cuántos caracteres
// del secreto se acertaron. Se comparan los hashes para que ambos lados tengan el mismo largo.
function secretoCorrecto(
  recibido: string | undefined,
  esperado: string,
): boolean {
  if (recibido === undefined) return false;
  const hash = (texto: string) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(hash(recibido), hash(esperado));
}
