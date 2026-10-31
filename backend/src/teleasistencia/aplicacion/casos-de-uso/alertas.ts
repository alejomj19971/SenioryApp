import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  RecursoNoEncontrado,
} from '../../../compartido/dominio/errores.js';
import type { OrigenDeAlerta } from '../../../compartido/eventos/teleasistencia.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import {
  Alerta,
  ORIGENES_PEDIDOS_POR_PERSONAS,
  type AlertaId,
} from '../../dominio/alerta.js';
import type {
  ActorDeTeleasistencia,
  PoliticaDeAcceso,
} from '../puertos/salida/politica-de-acceso.js';
import type { RepositorioAlertas } from '../puertos/salida/repositorios.js';
import type { EventosDeTeleasistencia } from '../servicios/eventos-de-teleasistencia.js';
import {
  vistaDeAlerta,
  type VistaDeAlerta,
  type VistaDeAlertaGenerada,
} from '../vistas.js';

export interface ResultadoDeAlerta {
  alerta: VistaDeAlertaGenerada;
  // Falso cuando es el reintento de una alerta ya enviada con la misma clave: devuelve la misma.
  creada: boolean;
}

// Alguien pide ayuda. Teleasistencia es una herramienta de AVISO a la familia y al cuidador en turno: no es un
// servicio de emergencias, y no hay (ni se simula) una «línea de emergencia». La pantalla siempre dice a quién se
// avisó y ofrece llamar al 123.
//
// La clave de idempotencia (la genera el cliente) hace que un reintento por mala conexión devuelva la misma
// alerta en vez de crear otra (H7). Los destinatarios se resuelven AQUÍ (los familiares vinculados y el cuidador
// en turno) y viajan en el evento: Notificaciones solo avisa, no decide a quién.
export class GenerarAlerta {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly alertas: RepositorioAlertas,
    private readonly identidad: ConsultaDeIdentidad,
    private readonly reservas: ConsultaDeReservas,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeTeleasistencia,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    origen: string,
    claveDeIdempotencia: string,
  ): Promise<ResultadoDeAlerta> {
    if (
      !(ORIGENES_PEDIDOS_POR_PERSONAS as readonly string[]).includes(origen)
    ) {
      throw new ErrorDeValidacion(
        'El origen de la alerta no es válido',
        'alerta.origen_invalido',
      );
    }
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'alerta',
      'teleasistencia.generar_alerta',
    );

    // Primero el reintento: si ya se creó, se devuelve tal cual.
    const previa = await this.alertas.buscarPorClave(
      actor.usuarioId,
      claveDeIdempotencia,
    );
    if (previa !== null) return this.repetir(previa, adultoMayorId, origen);

    const destinatarios = await this.destinatarios(adultoMayorId);
    const ahora = this.reloj.ahora();
    const alerta = Alerta.generar({
      id: this.ids.nuevo<'Alerta'>() as AlertaId,
      adultoMayorId,
      origen: origen as OrigenDeAlerta,
      generadaPor: actor.usuarioId,
      claveDeIdempotencia,
      ahora,
    });
    try {
      await this.unidadDeTrabajo.ejecutar(async () => {
        await this.alertas.guardar(alerta);
        await this.eventos.publicar(
          'teleasistencia.alerta_generada',
          {
            alertaId: alerta.id,
            adultoMayorId,
            origen: alerta.origen,
            generadaPor: actor.usuarioId,
            destinatarios,
          },
          ahora,
        );
      });
    } catch (error) {
      // Dos reintentos simultáneos con la misma clave: el segundo pierde la carrera y devuelve el del primero.
      if (
        error instanceof ConflictoDeEstado &&
        error.codigo === 'alerta.clave_repetida'
      ) {
        const ganadora = await this.alertas.buscarPorClave(
          actor.usuarioId,
          claveDeIdempotencia,
        );
        if (ganadora !== null) {
          return this.repetir(ganadora, adultoMayorId, origen);
        }
      }
      throw error;
    }
    await this.auditoria.registrar({
      actorId: actor.usuarioId,
      accion: 'teleasistencia.alerta_generada',
      recursoTipo: 'alerta',
      recursoId: alerta.id,
      resultado: 'permitido',
      metadatos: { destinatarios: destinatarios.length },
    });
    return {
      alerta: {
        ...vistaDeAlerta(alerta),
        avisadosA: await this.nombresDe(destinatarios),
      },
      creada: true,
    };
  }

  // Los familiares vinculados y el cuidador en turno, sin repetir.
  private async destinatarios(adultoMayorId: string): Promise<string[]> {
    const familiares =
      await this.identidad.listarFamiliaresVinculados(adultoMayorId);
    const cuidador = await this.reservas.obtenerCuidadorEnTurno(adultoMayorId);
    return [
      ...new Set([
        ...familiares,
        ...(cuidador?.cuidadorUsuarioId != null
          ? [cuidador.cuidadorUsuarioId]
          : []),
      ]),
    ];
  }

  private async nombresDe(usuarios: readonly string[]): Promise<string[]> {
    const contactos = await Promise.all(
      usuarios.map((id) => this.identidad.obtenerContacto(id)),
    );
    return contactos.flatMap((c) => (c === null ? [] : [c.nombre]));
  }

  // El mismo reintento devuelve la misma alerta; la misma clave para OTRA persona u origen es un error.
  private async repetir(
    previa: Alerta,
    adultoMayorId: string,
    origen: string,
  ): Promise<ResultadoDeAlerta> {
    if (previa.adultoMayorId !== adultoMayorId || previa.origen !== origen) {
      throw new ConflictoDeEstado(
        'Esa clave de idempotencia ya se usó con otra alerta',
        'alerta.clave_reutilizada',
      );
    }
    return {
      alerta: {
        ...vistaDeAlerta(previa),
        // Al repetir no se vuelve a resolver a quién se avisó: la alerta ya salió.
        avisadosA: [],
      },
      creada: false,
    };
  }
}

// Alguien de la familia (o el cuidador en turno) dice que ya atendió la alerta.
export class AtenderAlerta {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly alertas: RepositorioAlertas,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeTeleasistencia,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    alertaId: string,
    nota?: string | null,
  ): Promise<VistaDeAlerta> {
    const alerta = await this.unidadDeTrabajo.ejecutar(async () => {
      const cargada = await this.alertas.buscarPorIdParaActualizar(
        alertaId as AlertaId,
      );
      if (cargada === null) {
        throw new RecursoNoEncontrado(
          'No encontramos esa alerta',
          'alerta.no_encontrada',
        );
      }
      await this.politica.exigir(
        actor,
        cargada.adultoMayorId,
        'alerta',
        'teleasistencia.atender_alerta',
      );
      const ahora = this.reloj.ahora();
      cargada.atender(actor.usuarioId, ahora, nota);
      await this.alertas.actualizar(cargada);
      await this.eventos.publicar(
        'teleasistencia.alerta_atendida',
        {
          alertaId: cargada.id,
          adultoMayorId: cargada.adultoMayorId,
          atendidaPor: actor.usuarioId,
        },
        ahora,
      );
      return cargada;
    });
    return vistaDeAlerta(alerta);
  }
}
