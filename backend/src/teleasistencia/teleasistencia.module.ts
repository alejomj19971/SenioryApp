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
import {
  AtenderAlerta,
  GenerarAlerta,
} from './aplicacion/casos-de-uso/alertas.js';
import {
  DesactivarMedicamento,
  ListarMedicamentosDelDia,
  RegistrarMedicamento,
} from './aplicacion/casos-de-uso/medicamentos.js';
import { ObtenerResumenDeEstado } from './aplicacion/casos-de-uso/resumen.js';
import {
  DefinirRangos,
  ListarSignosVitales,
  ObtenerUltimaLectura,
  RegistrarLectura,
} from './aplicacion/casos-de-uso/signos.js';
import {
  CambiarEstadoDeToma,
  OmitirTomasVencidas,
} from './aplicacion/casos-de-uso/tomas.js';
import { MarcarAlertaNotificada } from './aplicacion/manejadores/marcar-alerta-notificada.js';
import {
  POLITICA_DE_ACCESO,
  type PoliticaDeAcceso,
} from './aplicacion/puertos/salida/politica-de-acceso.js';
import {
  REPOSITORIO_ALERTAS,
  REPOSITORIO_LECTURAS,
  REPOSITORIO_MEDICAMENTOS,
  REPOSITORIO_RANGOS,
  REPOSITORIO_TOMAS,
  type RepositorioAlertas,
  type RepositorioLecturas,
  type RepositorioMedicamentos,
  type RepositorioRangos,
  type RepositorioTomas,
} from './aplicacion/puertos/salida/repositorios.js';
import { EventosDeTeleasistencia } from './aplicacion/servicios/eventos-de-teleasistencia.js';
import { MedicamentosController } from './infraestructura/entrada/http/medicamentos.controller.js';
import { SignosYAlertasController } from './infraestructura/entrada/http/signos-y-alertas.controller.js';
import { PoliticaDeAccesoComposada } from './infraestructura/salida/acceso/politica-de-acceso-composada.js';
import { RepositorioMedicamentosDrizzle } from './infraestructura/salida/persistencia/repositorio-medicamentos-drizzle.js';
import { RepositorioTomasDrizzle } from './infraestructura/salida/persistencia/repositorio-tomas-drizzle.js';
import {
  RepositorioAlertasDrizzle,
  RepositorioLecturasDrizzle,
  RepositorioRangosDrizzle,
} from './infraestructura/salida/persistencia/repositorios-drizzle.js';

const MANEJADOR_DE_ALERTAS = Symbol('ManejadorDeAlertas');
const SONDEO_DE_OMISIONES = Symbol('SondeoDeOmisiones');

// Módulo de Teleasistencia (M6): los medicamentos, los signos vitales y las alertas. Es el ÚNICO que guarda datos
// de salud, y todo caso de uso empieza consultando la política de acceso. No exporta nada: nadie lo llama, los demás
// módulos se enteran por eventos que no llevan datos clínicos. Las clases se crean con fábricas para que la capa de
// aplicación no dependa de decoradores de Nest.
@Module({
  imports: [IdentidadModule, DirectorioModule, ReservasModule],
  controllers: [MedicamentosController, SignosYAlertasController],
  providers: [
    // Persistencia y acceso
    {
      provide: REPOSITORIO_MEDICAMENTOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioMedicamentosDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_TOMAS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioTomasDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_LECTURAS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioLecturasDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_RANGOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioRangosDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_ALERTAS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioAlertasDrizzle(contexto),
    },
    {
      provide: POLITICA_DE_ACCESO,
      inject: [
        CONSULTA_DE_IDENTIDAD,
        CONSULTA_DE_RESERVAS,
        CONSULTA_DE_DIRECTORIO,
        AUDITORIA,
      ],
      useFactory: (
        identidad: ConsultaDeIdentidad,
        reservas: ConsultaDeReservas,
        directorio: ConsultaDeDirectorio,
        auditoria: Auditoria,
      ): PoliticaDeAcceso =>
        new PoliticaDeAccesoComposada(
          identidad,
          reservas,
          directorio,
          auditoria,
        ),
    },
    {
      provide: EventosDeTeleasistencia,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDeTeleasistencia(publicador, ids, contexto),
    },

    // Medicamentos y tomas
    {
      provide: RegistrarMedicamento,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_MEDICAMENTOS,
        REPOSITORIO_TOMAS,
        UNIDAD_DE_TRABAJO,
        RELOJ,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        medicamentos: RepositorioMedicamentos,
        tomas: RepositorioTomas,
        unidadDeTrabajo: UnidadDeTrabajo,
        reloj: Reloj,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new RegistrarMedicamento(
          politica,
          medicamentos,
          tomas,
          unidadDeTrabajo,
          reloj,
          ids,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: DesactivarMedicamento,
      inject: [POLITICA_DE_ACCESO, REPOSITORIO_MEDICAMENTOS, AUDITORIA, RELOJ],
      useFactory: (
        politica: PoliticaDeAcceso,
        medicamentos: RepositorioMedicamentos,
        auditoria: Auditoria,
        reloj: Reloj,
      ) => new DesactivarMedicamento(politica, medicamentos, auditoria, reloj),
    },
    {
      provide: ListarMedicamentosDelDia,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_MEDICAMENTOS,
        REPOSITORIO_TOMAS,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        medicamentos: RepositorioMedicamentos,
        tomas: RepositorioTomas,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ListarMedicamentosDelDia(
          politica,
          medicamentos,
          tomas,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: CambiarEstadoDeToma,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_TOMAS,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        tomas: RepositorioTomas,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new CambiarEstadoDeToma(
          politica,
          tomas,
          unidadDeTrabajo,
          auditoria,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: OmitirTomasVencidas,
      inject: [
        REPOSITORIO_TOMAS,
        REPOSITORIO_MEDICAMENTOS,
        UNIDAD_DE_TRABAJO,
        EventosDeTeleasistencia,
        AUDITORIA,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        tomas: RepositorioTomas,
        medicamentos: RepositorioMedicamentos,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeTeleasistencia,
        auditoria: Auditoria,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new OmitirTomasVencidas(
          tomas,
          medicamentos,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          configuracion.zonaHorariaNegocio,
          configuracion.toleranciaDeTomaMinutos,
        ),
    },
    // La tarea programada que marca como omitidas las tomas que pasaron la tolerancia.
    {
      provide: SONDEO_DE_OMISIONES,
      inject: [OmitirTomasVencidas, CONFIGURACION],
      useFactory: (omitir: OmitirTomasVencidas, configuracion: Configuracion) =>
        new SondeoPeriodico(
          'SondeoDeOmisiones',
          () => omitir.ejecutar(),
          configuracion.intervaloOmisionTomasMs,
        ),
    },

    // Signos vitales
    {
      provide: RegistrarLectura,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_LECTURAS,
        REPOSITORIO_RANGOS,
        UNIDAD_DE_TRABAJO,
        EventosDeTeleasistencia,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        lecturas: RepositorioLecturas,
        rangos: RepositorioRangos,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeTeleasistencia,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new RegistrarLectura(
          politica,
          lecturas,
          rangos,
          unidadDeTrabajo,
          eventos,
          reloj,
          ids,
        ),
    },
    {
      provide: ListarSignosVitales,
      inject: [POLITICA_DE_ACCESO, REPOSITORIO_LECTURAS, RELOJ],
      useFactory: (
        politica: PoliticaDeAcceso,
        lecturas: RepositorioLecturas,
        reloj: Reloj,
      ) => new ListarSignosVitales(politica, lecturas, reloj),
    },
    {
      provide: ObtenerUltimaLectura,
      inject: [POLITICA_DE_ACCESO, REPOSITORIO_LECTURAS],
      useFactory: (politica: PoliticaDeAcceso, lecturas: RepositorioLecturas) =>
        new ObtenerUltimaLectura(politica, lecturas),
    },
    {
      provide: DefinirRangos,
      inject: [POLITICA_DE_ACCESO, REPOSITORIO_RANGOS, RELOJ],
      useFactory: (
        politica: PoliticaDeAcceso,
        rangos: RepositorioRangos,
        reloj: Reloj,
      ) => new DefinirRangos(politica, rangos, reloj),
    },

    // Alertas y resumen
    {
      provide: GenerarAlerta,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_ALERTAS,
        CONSULTA_DE_IDENTIDAD,
        CONSULTA_DE_RESERVAS,
        UNIDAD_DE_TRABAJO,
        EventosDeTeleasistencia,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        alertas: RepositorioAlertas,
        identidad: ConsultaDeIdentidad,
        reservas: ConsultaDeReservas,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeTeleasistencia,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new GenerarAlerta(
          politica,
          alertas,
          identidad,
          reservas,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          ids,
        ),
    },
    {
      provide: AtenderAlerta,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_ALERTAS,
        UNIDAD_DE_TRABAJO,
        EventosDeTeleasistencia,
        RELOJ,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        alertas: RepositorioAlertas,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeTeleasistencia,
        reloj: Reloj,
      ) =>
        new AtenderAlerta(politica, alertas, unidadDeTrabajo, eventos, reloj),
    },
    {
      provide: ObtenerResumenDeEstado,
      inject: [
        POLITICA_DE_ACCESO,
        REPOSITORIO_MEDICAMENTOS,
        REPOSITORIO_TOMAS,
        REPOSITORIO_LECTURAS,
        REPOSITORIO_ALERTAS,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        politica: PoliticaDeAcceso,
        medicamentos: RepositorioMedicamentos,
        tomas: RepositorioTomas,
        lecturas: RepositorioLecturas,
        alertas: RepositorioAlertas,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ObtenerResumenDeEstado(
          politica,
          medicamentos,
          tomas,
          lecturas,
          alertas,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },

    // Reacciona a eventos de otros módulos
    {
      provide: MANEJADOR_DE_ALERTAS,
      inject: [REPOSITORIO_ALERTAS],
      useFactory: (alertas: RepositorioAlertas) =>
        new MarcarAlertaNotificada(alertas),
    },
  ],
  exports: [],
})
export class TeleasistenciaModule implements OnModuleInit {
  constructor(
    @Inject(RegistroDeManejadores)
    private readonly registro: RegistroDeManejadores,
    @Inject(MANEJADOR_DE_ALERTAS)
    private readonly marcarAlertaNotificada: MarcarAlertaNotificada,
    // Solo para que Nest lo cree y llame a sus ganchos de arranque y cierre.
    @Inject(SONDEO_DE_OMISIONES) private readonly sondeo: SondeoPeriodico,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.marcarAlertaNotificada);
  }
}
