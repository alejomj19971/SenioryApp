import { Module } from '@nestjs/common';
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
  COTIZADOR_DE_SERVICIOS,
  type CotizadorDeServicios,
} from '../pagos/aplicacion/puertos/entrada/cotizador-de-servicios.js';
import { PagosModule } from '../pagos/pagos.module.js';
import {
  AceptarServicio,
  FinalizarServicio,
  IniciarServicio,
  RechazarServicio,
} from './aplicacion/casos-de-uso/acciones-del-cuidador.js';
import { CalificarServicio } from './aplicacion/casos-de-uso/calificar-servicio.js';
import { CancelarServicio } from './aplicacion/casos-de-uso/cancelar-servicio.js';
import {
  ListarMisServicios,
  ObtenerCuidadorEnTurno,
  ObtenerServicio,
} from './aplicacion/casos-de-uso/consultar-servicios.js';
import { ExpirarSolicitudes } from './aplicacion/casos-de-uso/expirar-solicitudes.js';
import { SolicitarServicio } from './aplicacion/casos-de-uso/solicitar-servicio.js';
import {
  CONSULTA_DE_RESERVAS,
  type ConsultaDeReservas,
} from './aplicacion/puertos/entrada/consulta-de-reservas.js';
import {
  REPOSITORIO_CALIFICACIONES,
  type RepositorioCalificaciones,
} from './aplicacion/puertos/salida/repositorio-calificaciones.js';
import {
  REPOSITORIO_SERVICIOS,
  type RepositorioServicios,
} from './aplicacion/puertos/salida/repositorio-servicios.js';
import { AccesoAServicios } from './aplicacion/servicios/acceso-a-servicios.js';
import { ConsultaDeReservasServicio } from './aplicacion/servicios/consulta-de-reservas-servicio.js';
import { EjecutorDeAcciones } from './aplicacion/servicios/ejecutor-de-acciones.js';
import { EventosDeReservas } from './aplicacion/servicios/eventos-de-reservas.js';
import { VistasDeServicios } from './aplicacion/servicios/vistas-de-servicios.js';
import { CuidadorEnTurnoController } from './infraestructura/entrada/http/cuidador-en-turno.controller.js';
import { ServiciosController } from './infraestructura/entrada/http/servicios.controller.js';
import { SondeoDeExpiraciones } from './infraestructura/entrada/programado/sondeo-de-expiraciones.js';
import { RepositorioCalificacionesDrizzle } from './infraestructura/salida/persistencia/repositorio-calificaciones-drizzle.js';
import { RepositorioServiciosDrizzle } from './infraestructura/salida/persistencia/repositorio-servicios-drizzle.js';

// Módulo de Reservas (M4): contratación y ciclo de vida del servicio. Exporta SOLO `CONSULTA_DE_RESERVAS` (el
// puerto de entrada para Pagos, Notificaciones, Teleasistencia y Mensajería). Repositorios y casos de uso son
// privados. Las clases se crean con fábricas para que la capa de aplicación no dependa de decoradores de Nest.
@Module({
  imports: [IdentidadModule, DirectorioModule, PagosModule],
  controllers: [ServiciosController, CuidadorEnTurnoController],
  providers: [
    // Persistencia
    {
      provide: REPOSITORIO_SERVICIOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioServiciosDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_CALIFICACIONES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioCalificacionesDrizzle(contexto),
    },

    // Piezas compartidas por los casos de uso
    {
      provide: EventosDeReservas,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDeReservas(publicador, ids, contexto),
    },
    {
      provide: AccesoAServicios,
      inject: [REPOSITORIO_SERVICIOS, CONSULTA_DE_DIRECTORIO, AUDITORIA],
      useFactory: (
        servicios: RepositorioServicios,
        directorio: ConsultaDeDirectorio,
        auditoria: Auditoria,
      ) => new AccesoAServicios(servicios, directorio, auditoria),
    },
    {
      provide: EjecutorDeAcciones,
      inject: [
        AccesoAServicios,
        REPOSITORIO_SERVICIOS,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        acceso: AccesoAServicios,
        servicios: RepositorioServicios,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new EjecutorDeAcciones(
          acceso,
          servicios,
          unidadDeTrabajo,
          auditoria,
          reloj,
        ),
    },
    {
      provide: VistasDeServicios,
      inject: [
        CONSULTA_DE_IDENTIDAD,
        CONSULTA_DE_DIRECTORIO,
        REPOSITORIO_CALIFICACIONES,
      ],
      useFactory: (
        identidad: ConsultaDeIdentidad,
        directorio: ConsultaDeDirectorio,
        calificaciones: RepositorioCalificaciones,
      ) => new VistasDeServicios(identidad, directorio, calificaciones),
    },

    // Casos de uso de la familia
    {
      provide: SolicitarServicio,
      inject: [
        REPOSITORIO_SERVICIOS,
        CONSULTA_DE_IDENTIDAD,
        CONSULTA_DE_DIRECTORIO,
        COTIZADOR_DE_SERVICIOS,
        UNIDAD_DE_TRABAJO,
        EventosDeReservas,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        servicios: RepositorioServicios,
        identidad: ConsultaDeIdentidad,
        directorio: ConsultaDeDirectorio,
        cotizador: CotizadorDeServicios,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeReservas,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new SolicitarServicio(
          servicios,
          identidad,
          directorio,
          cotizador,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          ids,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: CancelarServicio,
      inject: [EjecutorDeAcciones, EventosDeReservas, CONFIGURACION],
      useFactory: (
        ejecutor: EjecutorDeAcciones,
        eventos: EventosDeReservas,
        configuracion: Configuracion,
      ) =>
        new CancelarServicio(
          ejecutor,
          eventos,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: CalificarServicio,
      inject: [
        AccesoAServicios,
        REPOSITORIO_CALIFICACIONES,
        UNIDAD_DE_TRABAJO,
        EventosDeReservas,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        acceso: AccesoAServicios,
        calificaciones: RepositorioCalificaciones,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeReservas,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new CalificarServicio(
          acceso,
          calificaciones,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
        ),
    },

    // Casos de uso del cuidador
    {
      provide: AceptarServicio,
      inject: [EjecutorDeAcciones, CONSULTA_DE_DIRECTORIO, EventosDeReservas],
      useFactory: (
        ejecutor: EjecutorDeAcciones,
        directorio: ConsultaDeDirectorio,
        eventos: EventosDeReservas,
      ) => new AceptarServicio(ejecutor, directorio, eventos),
    },
    {
      provide: RechazarServicio,
      inject: [EjecutorDeAcciones, EventosDeReservas],
      useFactory: (ejecutor: EjecutorDeAcciones, eventos: EventosDeReservas) =>
        new RechazarServicio(ejecutor, eventos),
    },
    {
      provide: IniciarServicio,
      inject: [EjecutorDeAcciones, EventosDeReservas, CONFIGURACION],
      useFactory: (
        ejecutor: EjecutorDeAcciones,
        eventos: EventosDeReservas,
        configuracion: Configuracion,
      ) =>
        new IniciarServicio(
          ejecutor,
          eventos,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: FinalizarServicio,
      inject: [EjecutorDeAcciones, EventosDeReservas],
      useFactory: (ejecutor: EjecutorDeAcciones, eventos: EventosDeReservas) =>
        new FinalizarServicio(ejecutor, eventos),
    },

    // Consultas
    {
      provide: ObtenerServicio,
      inject: [AccesoAServicios, VistasDeServicios],
      useFactory: (acceso: AccesoAServicios, vistas: VistasDeServicios) =>
        new ObtenerServicio(acceso, vistas),
    },
    {
      provide: ListarMisServicios,
      inject: [
        REPOSITORIO_SERVICIOS,
        CONSULTA_DE_DIRECTORIO,
        VistasDeServicios,
      ],
      useFactory: (
        servicios: RepositorioServicios,
        directorio: ConsultaDeDirectorio,
        vistas: VistasDeServicios,
      ) => new ListarMisServicios(servicios, directorio, vistas),
    },
    {
      provide: ObtenerCuidadorEnTurno,
      inject: [
        REPOSITORIO_SERVICIOS,
        CONSULTA_DE_IDENTIDAD,
        CONSULTA_DE_DIRECTORIO,
        VistasDeServicios,
        AUDITORIA,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        servicios: RepositorioServicios,
        identidad: ConsultaDeIdentidad,
        directorio: ConsultaDeDirectorio,
        vistas: VistasDeServicios,
        auditoria: Auditoria,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ObtenerCuidadorEnTurno(
          servicios,
          identidad,
          directorio,
          vistas,
          auditoria,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },

    // La tarea programada que cancela las solicitudes sin respuesta
    {
      provide: ExpirarSolicitudes,
      inject: [
        REPOSITORIO_SERVICIOS,
        UNIDAD_DE_TRABAJO,
        EventosDeReservas,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        servicios: RepositorioServicios,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeReservas,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new ExpirarSolicitudes(
          servicios,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
        ),
    },
    {
      provide: SondeoDeExpiraciones,
      inject: [ExpirarSolicitudes, CONFIGURACION],
      useFactory: (expirar: ExpirarSolicitudes, configuracion: Configuracion) =>
        new SondeoDeExpiraciones(
          expirar,
          configuracion.intervaloExpiracionServiciosMs,
        ),
    },

    // Lo que otros módulos pueden usar
    {
      provide: CONSULTA_DE_RESERVAS,
      inject: [
        REPOSITORIO_SERVICIOS,
        CONSULTA_DE_DIRECTORIO,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        servicios: RepositorioServicios,
        directorio: ConsultaDeDirectorio,
        reloj: Reloj,
        configuracion: Configuracion,
      ): ConsultaDeReservas =>
        new ConsultaDeReservasServicio(
          servicios,
          directorio,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
  ],
  exports: [CONSULTA_DE_RESERVAS],
})
export class ReservasModule {}
