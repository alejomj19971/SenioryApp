import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import {
  AUDITORIA,
  type Auditoria,
} from '../compartido/aplicacion/puertos/auditoria.js';
import {
  CONTEXTO_DE_PETICION,
  type ContextoDePeticion,
} from '../compartido/aplicacion/puertos/contexto-de-peticion.js';
import {
  GENERADOR_DE_IDS,
  type GeneradorDeIds,
} from '../compartido/aplicacion/puertos/generador-de-ids.js';
import {
  PUBLICADOR_DE_EVENTOS,
  type PublicadorDeEventos,
} from '../compartido/aplicacion/puertos/publicador-de-eventos.js';
import { RELOJ, type Reloj } from '../compartido/aplicacion/puertos/reloj.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ContextoTransaccional } from '../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { ManejadorDeEventos } from '../compartido/aplicacion/puertos/manejador-de-eventos.js';
import { RegistroDeManejadores } from '../compartido/infraestructura/outbox/registro-de-manejadores.js';
import { SondeoPeriodico } from '../compartido/infraestructura/sondeo-periodico.js';
import { CONFIGURACION } from '../configuracion/configuracion.module.js';
import type { Configuracion } from '../configuracion/variables-de-entorno.js';
import {
  CONSULTA_DE_DIRECTORIO,
  type ConsultaDeDirectorio,
} from '../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import { DirectorioModule } from '../directorio/directorio.module.js';
import {
  CONSULTA_DE_IDENTIDAD,
  type ConsultaDeIdentidad,
} from '../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import { IdentidadModule } from '../identidad/identidad.module.js';
import {
  CONSULTA_DE_RESERVAS,
  type ConsultaDeReservas,
} from '../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import { ReservasModule } from '../reservas/reservas.module.js';
import { CrearAvisos } from './aplicacion/casos-de-uso/crear-avisos.js';
import { EntregarPendientes } from './aplicacion/casos-de-uso/entregar-pendientes.js';
import { ListarMisNotificaciones } from './aplicacion/casos-de-uso/listar-mis-notificaciones.js';
import { AvisarCambioDeServicio } from './aplicacion/manejadores/avisar-cambio-de-servicio.js';
import {
  AvisarAlerta,
  AvisarLecturaFueraDeRango,
  AvisarMedicamentoOmitido,
} from './aplicacion/manejadores/avisar-de-teleasistencia.js';
import { EventosDeNotificaciones } from './aplicacion/servicios/eventos-de-notificaciones.js';
import {
  CANALES_DE_NOTIFICACION,
  type CanalDeNotificacion,
} from './aplicacion/puertos/salida/canal-de-notificacion.js';
import {
  REPOSITORIO_NOTIFICACIONES,
  type RepositorioNotificaciones,
} from './aplicacion/puertos/salida/repositorio-notificaciones.js';
import { NotificacionesController } from './infraestructura/entrada/http/notificaciones.controller.js';
import {
  CanalDeApp,
  CanalSimulado,
} from './infraestructura/salida/canales/canales.js';
import { RepositorioNotificacionesDrizzle } from './infraestructura/salida/persistencia/repositorio-notificaciones-drizzle.js';

const MANEJADORES_DE_SERVICIO = Symbol('ManejadoresDeServicio');
const MANEJADORES_DE_TELEASISTENCIA = Symbol('ManejadoresDeTeleasistencia');
const SONDEO_DE_ENTREGAS = Symbol('SondeoDeEntregas');

// Los eventos del ciclo de vida del servicio que generan avisos, cada uno con su nombre estable (el despachador
// lo guarda para no repetir el trabajo: no se puede cambiar).
const EVENTOS_CON_AVISO = [
  ['reservas.servicio_solicitado', 'notificaciones.avisar_servicio_solicitado'],
  ['reservas.servicio_confirmado', 'notificaciones.avisar_servicio_confirmado'],
  ['reservas.servicio_iniciado', 'notificaciones.avisar_servicio_iniciado'],
  ['reservas.servicio_finalizado', 'notificaciones.avisar_servicio_finalizado'],
  ['reservas.servicio_cancelado', 'notificaciones.avisar_servicio_cancelado'],
] as const;

// Módulo de Notificaciones (M5): convierte lo que pasa en el sistema en avisos para las personas. No exporta
// nada: nadie lo llama, solo reacciona a eventos. Los canales son adaptadores intercambiables; hoy solo hay la
// aplicación misma (la campana), y el correo, el SMS y WhatsApp llegan cuando se elijan proveedores. Las clases se
// crean con fábricas para que la capa de aplicación no dependa de decoradores de Nest.
@Module({
  imports: [IdentidadModule, DirectorioModule, ReservasModule],
  controllers: [NotificacionesController],
  providers: [
    {
      provide: REPOSITORIO_NOTIFICACIONES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioNotificacionesDrizzle(contexto),
    },
    // Los canales que existen en este entorno. Uno sin proveedor NO se registra: no se finge que existe.
    {
      provide: CANALES_DE_NOTIFICACION,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): CanalDeNotificacion[] => [
        new CanalDeApp(),
        ...(configuracion.canalesDeNotificacionSimulados
          ? (['correo', 'sms', 'whatsapp', 'push'] as const).map(
              (canal) => new CanalSimulado(canal),
            )
          : []),
      ],
    },
    {
      provide: CrearAvisos,
      inject: [
        REPOSITORIO_NOTIFICACIONES,
        CANALES_DE_NOTIFICACION,
        GENERADOR_DE_IDS,
        RELOJ,
      ],
      useFactory: (
        notificaciones: RepositorioNotificaciones,
        canales: CanalDeNotificacion[],
        ids: GeneradorDeIds,
        reloj: Reloj,
      ) => new CrearAvisos(notificaciones, canales, ids, reloj),
    },
    {
      provide: EventosDeNotificaciones,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDeNotificaciones(publicador, ids, contexto),
    },
    {
      provide: EntregarPendientes,
      inject: [
        REPOSITORIO_NOTIFICACIONES,
        CANALES_DE_NOTIFICACION,
        CONSULTA_DE_IDENTIDAD,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
        EventosDeNotificaciones,
      ],
      useFactory: (
        notificaciones: RepositorioNotificaciones,
        canales: CanalDeNotificacion[],
        identidad: ConsultaDeIdentidad,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
        eventos: EventosDeNotificaciones,
      ) =>
        new EntregarPendientes(
          notificaciones,
          canales,
          identidad,
          unidadDeTrabajo,
          auditoria,
          reloj,
          eventos,
        ),
    },
    {
      provide: ListarMisNotificaciones,
      inject: [REPOSITORIO_NOTIFICACIONES],
      useFactory: (notificaciones: RepositorioNotificaciones) =>
        new ListarMisNotificaciones(notificaciones),
    },
    {
      provide: MANEJADORES_DE_SERVICIO,
      inject: [CONSULTA_DE_RESERVAS, CONSULTA_DE_DIRECTORIO, CrearAvisos],
      useFactory: (
        reservas: ConsultaDeReservas,
        directorio: ConsultaDeDirectorio,
        avisos: CrearAvisos,
      ) =>
        EVENTOS_CON_AVISO.map(
          ([tipo, nombre]) =>
            new AvisarCambioDeServicio(
              tipo,
              nombre,
              reservas,
              directorio,
              avisos,
            ),
        ),
    },
    {
      provide: MANEJADORES_DE_TELEASISTENCIA,
      inject: [CONSULTA_DE_IDENTIDAD, CONSULTA_DE_RESERVAS, CrearAvisos],
      useFactory: (
        identidad: ConsultaDeIdentidad,
        reservas: ConsultaDeReservas,
        avisos: CrearAvisos,
      ) => [
        new AvisarAlerta(identidad, avisos),
        new AvisarMedicamentoOmitido(identidad, reservas, avisos),
        new AvisarLecturaFueraDeRango(identidad, reservas, avisos),
      ],
    },
    // La tarea programada que envía los avisos pendientes (y reintenta los que fallaron).
    {
      provide: SONDEO_DE_ENTREGAS,
      inject: [EntregarPendientes, CONFIGURACION],
      useFactory: (
        entregar: EntregarPendientes,
        configuracion: Configuracion,
      ) =>
        new SondeoPeriodico(
          'SondeoDeEntregas',
          () => entregar.ejecutar(),
          configuracion.intervaloEntregaNotificacionesMs,
        ),
    },
  ],
  exports: [],
})
export class NotificacionesModule implements OnModuleInit {
  constructor(
    @Inject(RegistroDeManejadores)
    private readonly registro: RegistroDeManejadores,
    @Inject(MANEJADORES_DE_SERVICIO)
    private readonly manejadores: AvisarCambioDeServicio<never>[],
    @Inject(MANEJADORES_DE_TELEASISTENCIA)
    private readonly manejadoresDeTeleasistencia: ManejadorDeEventos[],
    // Solo para que Nest lo cree y llame a sus ganchos de arranque y cierre.
    @Inject(SONDEO_DE_ENTREGAS) private readonly sondeo: SondeoPeriodico,
  ) {}

  onModuleInit(): void {
    for (const manejador of this.manejadores) {
      this.registro.registrar(manejador as never);
    }
    for (const manejador of this.manejadoresDeTeleasistencia) {
      this.registro.registrar(manejador);
    }
  }
}
