import { Logger } from '@nestjs/common';
import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { Notificacion } from '../../dominio/notificacion.js';
import { renderizarAviso } from '../../dominio/plantillas.js';
import type { Canal } from '../../dominio/valores-cerrados.js';
import {
  FalloDeEnvio,
  type CanalDeNotificacion,
} from '../puertos/salida/canal-de-notificacion.js';
import type {
  IntentoDeEnvio,
  RepositorioNotificaciones,
} from '../puertos/salida/repositorio-notificaciones.js';

export const AVISOS_POR_VUELTA = 50;
// Cuánto se reserva un aviso para quien lo tomó: si el proceso muere a mitad del envío, otro lo retoma después.
export const RESERVA_DEL_ENVIO_MS = 60_000;

// Envía los avisos pendientes. Es lo que corre la tarea programada, y se puede ejecutar a mano.
//
// Cada aviso va por su propio camino: tomarlo (transacción corta), enviarlo (sin transacción abierta: un
// proveedor lento no puede retener la base) y guardar el resultado (otra transacción corta). Un fallo se
// reintenta con espera creciente; agotados los intentos queda «fallida». Si una ALERTA queda fallida en todos
// sus canales y por ninguno salió, se deja constancia y se avisa al equipo (log de error; Sentry cuando exista).
export class EntregarPendientes {
  private readonly registroDeLog = new Logger('EntregarPendientes');
  private readonly canales: ReadonlyMap<Canal, CanalDeNotificacion>;
  // Las alertas ya reportadas por esta instancia: sus canales terminan casi a la vez y todos verían «ninguno
  // salió», pero el equipo solo necesita un aviso por alerta.
  private readonly alertasReportadas = new Set<string>();

  constructor(
    private readonly notificaciones: RepositorioNotificaciones,
    canales: readonly CanalDeNotificacion[],
    private readonly identidad: ConsultaDeIdentidad,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {
    this.canales = new Map(canales.map((c) => [c.canal, c]));
  }

  // Devuelve cuántos avisos tomó: si fueron muchos, conviene volver a correr de inmediato.
  async ejecutar(): Promise<number> {
    const tomadas = await this.unidadDeTrabajo.ejecutar(() =>
      this.notificaciones.reclamarPendientes(
        this.reloj.ahora(),
        AVISOS_POR_VUELTA,
        RESERVA_DEL_ENVIO_MS,
      ),
    );
    // En paralelo: una alerta con varios canales no debe esperar a que el más lento termine para salir por el otro.
    await Promise.all(tomadas.map((aviso) => this.entregar(aviso)));
    return tomadas.length;
  }

  private async entregar(aviso: Notificacion): Promise<void> {
    let intento: IntentoDeEnvio;
    try {
      const resultado = await this.enviar(aviso);
      const ahora = this.reloj.ahora();
      if (resultado === 'entregada') aviso.marcarEntregada(ahora);
      else aviso.marcarEnviada(ahora);
      intento = {
        resultado: 'exito',
        respuesta: resultado,
        intentadoEn: ahora,
      };
    } catch (error) {
      const ahora = this.reloj.ahora();
      const motivo = error instanceof Error ? error.message : String(error);
      if (error instanceof FalloDeEnvio && error.definitivo) {
        aviso.registrarFalloDefinitivo(motivo);
      } else {
        aviso.registrarFallo(ahora, motivo);
      }
      intento = { resultado: 'error', respuesta: motivo, intentadoEn: ahora };
    }
    await this.unidadDeTrabajo.ejecutar(() =>
      this.notificaciones.registrarIntento(aviso, intento),
    );
    if (aviso.prioridad === 'alta' && aviso.estado === 'fallida') {
      await this.revisarAlertaSinEntregar(aviso);
    }
  }

  private async enviar(aviso: Notificacion) {
    const canal = this.canales.get(aviso.canal);
    if (canal === undefined) {
      // Se quitó el canal de la configuración después de crear el aviso: reintentar no lo arregla.
      throw new FalloDeEnvio(
        `El canal ${aviso.canal} no está disponible en este entorno`,
        true,
      );
    }
    const contacto = await this.identidad.obtenerContacto(aviso.destinatarioId);
    if (contacto === null) {
      throw new FalloDeEnvio('La cuenta del destinatario ya no existe', true);
    }
    let texto;
    try {
      texto = renderizarAviso(aviso.tipo, aviso.parametros);
    } catch (error) {
      throw new FalloDeEnvio((error as Error).message, true);
    }
    return canal.enviar({
      destinatario: {
        usuarioId: contacto.usuarioId,
        nombre: contacto.nombre,
        correo: contacto.correo,
        telefono: contacto.telefono,
      },
      titulo: texto.titulo,
      cuerpo: texto.cuerpo,
      prioridad: aviso.prioridad,
    });
  }

  private async revisarAlertaSinEntregar(aviso: Notificacion): Promise<void> {
    const hermanas = await this.notificaciones.delMismoAviso(aviso);
    const algunaSalio = hermanas.some((h) => h.salio());
    const todasTerminaron = hermanas.every((h) => h.esFinal());
    if (algunaSalio || !todasTerminaron) return;
    const clave = `${aviso.eventoId}|${aviso.destinatarioId}|${aviso.tipo}`;
    if (this.alertasReportadas.has(clave)) return;
    this.alertasReportadas.add(clave);
    this.registroDeLog.error(
      `ALERTA SIN ENTREGAR: el aviso «${aviso.tipo}» (evento ${aviso.eventoId}) no salió por ningún canal`,
    );
    await this.auditoria.registrar({
      actorId: null,
      accion: 'notificaciones.alerta_sin_entregar',
      recursoTipo: 'evento',
      recursoId: aviso.eventoId,
      resultado: 'error',
      metadatos: { tipo: aviso.tipo, canales: hermanas.length },
    });
  }
}
