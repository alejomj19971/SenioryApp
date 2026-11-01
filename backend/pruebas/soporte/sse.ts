import http from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { nuevaIp, SECRETO_BFF } from './api.js';

export interface EventoSse {
  id?: string;
  tipo?: string;
  datos: unknown;
}

export interface ConexionSse {
  status: number;
  // Lo que llevan los encabezados de la respuesta.
  encabezados: http.IncomingHttpHeaders;
  eventos: EventoSse[];
  // Si la respuesta no es un flujo (un error), su cuerpo.
  cuerpo: string;
  // Espera a que haya `n` eventos de ese tipo (o a que pase el tiempo) y los devuelve.
  esperar(tipo: string, n: number, limiteMs?: number): Promise<EventoSse[]>;
  cerrada(): boolean;
  cerrar(): void;
}

// Abre una conexión de eventos en vivo contra el servidor de la prueba, como lo haría un navegador (o el BFF): con la
// cookie de sesión y, tras una reconexión, `Last-Event-ID`. Interpreta el formato `id:` / `event:` / `data:`.
export async function abrirFlujo(
  app: NestExpressApplication,
  ruta: string,
  opciones: { cookie?: string; ultimoEvento?: string } = {},
): Promise<ConexionSse> {
  if (!app.getHttpServer().listening) await app.listen(0, '127.0.0.1');
  const url = new URL(ruta, await app.getUrl());
  const encabezados: Record<string, string> = {
    Accept: 'text/event-stream',
    'X-Seniory-BFF': SECRETO_BFF,
    'X-Cliente-IP': nuevaIp(),
  };
  if (opciones.cookie !== undefined) encabezados.Cookie = opciones.cookie;
  if (opciones.ultimoEvento !== undefined) {
    encabezados['Last-Event-ID'] = opciones.ultimoEvento;
  }

  return new Promise((resolver, rechazar) => {
    const peticion = http.get(url, { headers: encabezados }, (respuesta) => {
      const eventos: EventoSse[] = [];
      let cuerpo = '';
      let pendiente = '';
      let terminada = false;
      const esFlujo = String(respuesta.headers['content-type']).includes(
        'text/event-stream',
      );
      respuesta.setEncoding('utf8');
      respuesta.on('data', (trozo: string) => {
        if (!esFlujo) {
          cuerpo += trozo;
          return;
        }
        pendiente += trozo;
        let corte = pendiente.indexOf('\n\n');
        while (corte >= 0) {
          const bloque = pendiente.slice(0, corte);
          pendiente = pendiente.slice(corte + 2);
          const evento = interpretar(bloque);
          if (evento !== null) eventos.push(evento);
          corte = pendiente.indexOf('\n\n');
        }
      });
      respuesta.on('close', () => {
        terminada = true;
      });
      resolver({
        status: respuesta.statusCode ?? 0,
        encabezados: respuesta.headers,
        eventos,
        get cuerpo() {
          return cuerpo;
        },
        async esperar(tipo, n, limiteMs = 8_000) {
          const hasta = Date.now() + limiteMs;
          const delTipo = () => eventos.filter((e) => e.tipo === tipo);
          while (delTipo().length < n && Date.now() < hasta) {
            await new Promise((r) => setTimeout(r, 25));
          }
          return delTipo();
        },
        cerrada: () => terminada,
        cerrar: () => {
          peticion.destroy();
        },
      });
    });
    peticion.on('error', (error) => {
      // Cerrar a propósito también produce un error de socket: solo importa si ocurre antes de responder.
      rechazar(error);
    });
  });
}

function interpretar(bloque: string): EventoSse | null {
  let id: string | undefined;
  let tipo: string | undefined;
  const datos: string[] = [];
  for (const linea of bloque.split('\n')) {
    if (linea.startsWith(':')) continue;
    if (linea.startsWith('id:')) id = linea.slice(3).trim();
    else if (linea.startsWith('event:')) tipo = linea.slice(6).trim();
    else if (linea.startsWith('data:')) datos.push(linea.slice(5).trim());
  }
  if (datos.length === 0 && tipo === undefined && id === undefined) return null;
  const texto = datos.join('\n');
  let valor: unknown = texto;
  try {
    valor = JSON.parse(texto);
  } catch {
    // Se deja como texto.
  }
  return { id, tipo, datos: valor };
}
