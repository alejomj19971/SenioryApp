import type { MessageEvent } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Reloj } from '../../../../compartido/aplicacion/puertos/reloj.js';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import type { ConexionesDeFlujos } from '../../../../compartido/infraestructura/sse/conexiones-de-flujos.js';
import {
  MENSAJES_NUEVOS_POR_VUELTA,
  type ObtenerMensajesNuevos,
} from '../../../aplicacion/casos-de-uso/mensajes.js';
import { vistaDeMensaje } from '../../../aplicacion/vistas.js';
import {
  codificarCursor,
  esPosterior,
  type CursorDeMensajes,
} from '../../../dominio/cursor-de-mensajes.js';
import type { ConcentradorDeFlujos } from './concentrador-de-flujos.js';

export interface OpcionesDelFlujo {
  // Cada cuánto revisa si hay mensajes nuevos cuando nadie lo despierta.
  sondeoMs: number;
  // Cada cuánto manda una señal de vida si no hay mensajes (para que ningún intermediario cierre la conexión).
  latidoMs: number;
  // Cuánto dura una conexión antes de cerrarla: la interfaz se reconecta sola, y con eso la sesión se vuelve a
  // verificar (no queda abierta una conexión con una sesión vencida).
  vidaMaximaMs: number;
  // Cuánto hacia atrás de lo último entregado se vuelve a mirar. Un mensaje se confirma (commit) un poco DESPUÉS de
  // que se le puso la hora; mirar solo «lo posterior a lo último» podría saltarse uno que se confirmó tarde.
  ventanaMs: number;
}

export const OPCIONES_DEL_FLUJO: OpcionesDelFlujo = {
  sondeoMs: 2_000,
  latidoMs: 20_000,
  vidaMaximaMs: 10 * 60_000,
  ventanaMs: 10_000,
};

const FALLOS_SEGUIDOS_PARA_CERRAR = 3;

// El flujo de mensajes en vivo (SSE) de una persona: todos los mensajes nuevos de todas sus conversaciones.
//
// - Cada mensaje sale con `id` = su posición en la línea de tiempo. Si la conexión se cae, el navegador se reconecta
//   con `Last-Event-ID` y el flujo sigue desde ahí: no se pierde nada.
// - Se entrega AL MENOS UNA VEZ: tras reconectar, o por la ventana de seguridad de arriba, puede repetir mensajes de
//   los últimos segundos. La interfaz los reconoce por su `id`.
// - Se consulta la base cada pocos segundos (y al instante cuando alguien escribe y este servidor se entera): no
//   depende de la memoria de ningún proceso, y funciona igual con varias instancias.
// - Las conversaciones se vuelven a leer en cada vuelta, así que si la persona deja de ser parte de una, sus
//   mensajes dejan de llegar de inmediato.
export class FlujoDeMensajes {
  private readonly registro = new Logger('FlujoDeMensajes');

  constructor(
    private readonly nuevos: ObtenerMensajesNuevos,
    private readonly concentrador: ConcentradorDeFlujos,
    private readonly conexiones: ConexionesDeFlujos,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesDelFlujo = OPCIONES_DEL_FLUJO,
  ) {}

  // Falla ANTES de transmitir (con un error normal) si ya hay demasiadas conexiones de esta persona.
  abrir(
    usuario: UsuarioAutenticado,
    retomarDesde: CursorDeMensajes | null,
  ): Observable<MessageEvent> {
    this.conexiones.verificarCupo(usuario.id);
    return new Observable<MessageEvent>((suscriptor) => {
      let activo = true;
      let despertar: (() => void) | null = null;

      const esperar = (milisegundos: number) =>
        new Promise<void>((resolver) => {
          const temporizador = setTimeout(terminar, milisegundos);
          despertar = terminar;
          function terminar(): void {
            clearTimeout(temporizador);
            despertar = null;
            resolver();
          }
        });

      const cerrar = () => {
        if (!activo) return;
        activo = false;
        despertar?.();
        suscriptor.complete();
      };
      const soltarCupo = this.conexiones.registrar(usuario.id, cerrar);
      const dejarDeEscuchar = this.concentrador.suscribir(usuario.id, () =>
        despertar?.(),
      );

      void this.ciclo(usuario, retomarDesde, {
        estaActivo: () => activo,
        esperar,
        emitir: (evento) => suscriptor.next(evento),
        cerrar,
      });

      return () => {
        activo = false;
        despertar?.();
        soltarCupo();
        dejarDeEscuchar();
      };
    });
  }

  private async ciclo(
    usuario: UsuarioAutenticado,
    retomarDesde: CursorDeMensajes | null,
    conexion: {
      estaActivo: () => boolean;
      esperar: (milisegundos: number) => Promise<void>;
      emitir: (evento: MessageEvent) => void;
      cerrar: () => void;
    },
  ): Promise<void> {
    const { sondeoMs, latidoMs, vidaMaximaMs, ventanaMs } = this.opciones;
    const inicio = Date.now();
    // Sin `Last-Event-ID` se empieza «desde ahora»: la interfaz ya leyó el historial por la API.
    let cursor: CursorDeMensajes = retomarDesde ?? {
      creadoEn: this.reloj.ahora(),
      id: '',
    };
    // Lo ya entregado en esta conexión, con su hora, para no repetirlo dentro de la ventana de seguridad.
    const entregados = new Map<string, number>();
    let ultimaSenal = Date.now();
    let fallosSeguidos = 0;

    while (conexion.estaActivo()) {
      if (Date.now() - inicio >= vidaMaximaMs) {
        conexion.cerrar();
        return;
      }
      let habiaMas = false;
      try {
        const mensajes = await this.nuevos.ejecutar(
          usuario,
          new Date(cursor.creadoEn.getTime() - ventanaMs),
        );
        fallosSeguidos = 0;
        let enviados = 0;
        for (const mensaje of mensajes) {
          if (!conexion.estaActivo()) return;
          if (entregados.has(mensaje.id)) continue;
          entregados.set(mensaje.id, mensaje.creadoEn.getTime());
          const punto = { creadoEn: mensaje.creadoEn, id: mensaje.id };
          if (esPosterior(punto, cursor)) cursor = punto;
          conexion.emitir({
            id: codificarCursor(punto),
            type: 'mensaje',
            data: vistaDeMensaje(mensaje, usuario.id),
          });
          enviados += 1;
        }
        // Lo que ya quedó atrás de la ventana no volverá a aparecer en la consulta: se olvida.
        const limite = cursor.creadoEn.getTime() - 2 * ventanaMs;
        for (const [id, creadoEn] of entregados) {
          if (creadoEn < limite) entregados.delete(id);
        }
        if (enviados > 0) ultimaSenal = Date.now();
        habiaMas =
          enviados > 0 && mensajes.length >= MENSAJES_NUEVOS_POR_VUELTA;
      } catch (error) {
        fallosSeguidos += 1;
        this.registro.warn(
          `No se pudieron leer los mensajes nuevos: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (fallosSeguidos >= FALLOS_SEGUIDOS_PARA_CERRAR) {
          // Se cierra para que la interfaz se reconecte (con su `Last-Event-ID`) en vez de quedar colgada.
          conexion.cerrar();
          return;
        }
      }
      if (habiaMas) continue;
      if (Date.now() - ultimaSenal >= latidoMs) {
        conexion.emitir({ type: 'latido', data: {} });
        ultimaSenal = Date.now();
      }
      await conexion.esperar(sondeoMs);
    }
  }
}
