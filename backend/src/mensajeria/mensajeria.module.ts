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
import { ConexionesDeFlujos } from '../compartido/infraestructura/sse/conexiones-de-flujos.js';
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
  AbrirConversacion,
  ListarMisConversaciones,
} from './aplicacion/casos-de-uso/conversaciones.js';
import {
  EnviarMensaje,
  ListarMensajes,
  ObtenerMensajesNuevos,
} from './aplicacion/casos-de-uso/mensajes.js';
import { DespertarFlujosAlEnviar } from './aplicacion/manejadores/despertar-flujos.js';
import {
  AVISADOR_DE_FLUJOS,
  type AvisadorDeFlujos,
} from './aplicacion/puertos/salida/avisador-de-flujos.js';
import {
  REPOSITORIO_CONVERSACIONES,
  REPOSITORIO_MENSAJES,
  type RepositorioConversaciones,
  type RepositorioMensajes,
} from './aplicacion/puertos/salida/repositorios.js';
import { AccesoAConversaciones } from './aplicacion/servicios/acceso-a-conversaciones.js';
import { EventosDeMensajeria } from './aplicacion/servicios/eventos-de-mensajeria.js';
import { VistasDeConversaciones } from './aplicacion/servicios/vistas-de-conversaciones.js';
import { ConversacionesController } from './infraestructura/entrada/http/conversaciones.controller.js';
import { ConcentradorDeFlujos } from './infraestructura/entrada/sse/concentrador-de-flujos.js';
import { FlujoDeMensajes } from './infraestructura/entrada/sse/flujo-de-mensajes.js';
import {
  RepositorioConversacionesDrizzle,
  RepositorioMensajesDrizzle,
} from './infraestructura/salida/persistencia/repositorios-drizzle.js';

const MANEJADOR_DE_FLUJOS = Symbol('ManejadorDeFlujos');

// Módulo de Mensajería (M8): el chat entre la familia y el cuidador. No exporta nada: nadie lo llama, los demás
// módulos se enteran por eventos que no llevan el texto de los mensajes. Para saber si dos personas pueden
// escribirse pregunta a Reservas (`hayServicioActivoEntre`) en cada envío. Las clases se crean con fábricas para que
// la capa de aplicación no dependa de decoradores de Nest.
@Module({
  imports: [IdentidadModule, DirectorioModule, ReservasModule],
  controllers: [ConversacionesController],
  providers: [
    // Persistencia
    {
      provide: REPOSITORIO_CONVERSACIONES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioConversacionesDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_MENSAJES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioMensajesDrizzle(contexto),
    },

    // Piezas compartidas por los casos de uso
    {
      provide: AccesoAConversaciones,
      inject: [REPOSITORIO_CONVERSACIONES, CONSULTA_DE_DIRECTORIO, AUDITORIA],
      useFactory: (
        conversaciones: RepositorioConversaciones,
        directorio: ConsultaDeDirectorio,
        auditoria: Auditoria,
      ) => new AccesoAConversaciones(conversaciones, directorio, auditoria),
    },
    {
      provide: VistasDeConversaciones,
      inject: [
        CONSULTA_DE_IDENTIDAD,
        CONSULTA_DE_DIRECTORIO,
        CONSULTA_DE_RESERVAS,
      ],
      useFactory: (
        identidad: ConsultaDeIdentidad,
        directorio: ConsultaDeDirectorio,
        reservas: ConsultaDeReservas,
      ) => new VistasDeConversaciones(identidad, directorio, reservas),
    },
    {
      provide: EventosDeMensajeria,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDeMensajeria(publicador, ids, contexto),
    },

    // Casos de uso
    {
      provide: AbrirConversacion,
      inject: [
        REPOSITORIO_CONVERSACIONES,
        CONSULTA_DE_DIRECTORIO,
        CONSULTA_DE_RESERVAS,
        VistasDeConversaciones,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        conversaciones: RepositorioConversaciones,
        directorio: ConsultaDeDirectorio,
        reservas: ConsultaDeReservas,
        vistas: VistasDeConversaciones,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new AbrirConversacion(
          conversaciones,
          directorio,
          reservas,
          vistas,
          auditoria,
          reloj,
          ids,
        ),
    },
    {
      provide: ListarMisConversaciones,
      inject: [
        REPOSITORIO_CONVERSACIONES,
        AccesoAConversaciones,
        VistasDeConversaciones,
      ],
      useFactory: (
        conversaciones: RepositorioConversaciones,
        acceso: AccesoAConversaciones,
        vistas: VistasDeConversaciones,
      ) => new ListarMisConversaciones(conversaciones, acceso, vistas),
    },
    {
      provide: EnviarMensaje,
      inject: [
        AccesoAConversaciones,
        REPOSITORIO_CONVERSACIONES,
        REPOSITORIO_MENSAJES,
        CONSULTA_DE_RESERVAS,
        CONSULTA_DE_DIRECTORIO,
        UNIDAD_DE_TRABAJO,
        EventosDeMensajeria,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        acceso: AccesoAConversaciones,
        conversaciones: RepositorioConversaciones,
        mensajes: RepositorioMensajes,
        reservas: ConsultaDeReservas,
        directorio: ConsultaDeDirectorio,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeMensajeria,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new EnviarMensaje(
          acceso,
          conversaciones,
          mensajes,
          reservas,
          directorio,
          unidadDeTrabajo,
          eventos,
          reloj,
          ids,
        ),
    },
    {
      provide: ListarMensajes,
      inject: [AccesoAConversaciones, REPOSITORIO_MENSAJES],
      useFactory: (
        acceso: AccesoAConversaciones,
        mensajes: RepositorioMensajes,
      ) => new ListarMensajes(acceso, mensajes),
    },
    {
      provide: ObtenerMensajesNuevos,
      inject: [
        AccesoAConversaciones,
        REPOSITORIO_CONVERSACIONES,
        REPOSITORIO_MENSAJES,
      ],
      useFactory: (
        acceso: AccesoAConversaciones,
        conversaciones: RepositorioConversaciones,
        mensajes: RepositorioMensajes,
      ) => new ObtenerMensajesNuevos(acceso, conversaciones, mensajes),
    },

    // En vivo
    {
      provide: ConcentradorDeFlujos,
      useFactory: () => new ConcentradorDeFlujos(),
    },
    { provide: AVISADOR_DE_FLUJOS, useExisting: ConcentradorDeFlujos },
    {
      provide: FlujoDeMensajes,
      inject: [
        ObtenerMensajesNuevos,
        ConcentradorDeFlujos,
        ConexionesDeFlujos,
        RELOJ,
      ],
      useFactory: (
        nuevos: ObtenerMensajesNuevos,
        concentrador: ConcentradorDeFlujos,
        conexiones: ConexionesDeFlujos,
        reloj: Reloj,
      ) => new FlujoDeMensajes(nuevos, concentrador, conexiones, reloj),
    },

    // Reacciona a su propio evento: despierta las conexiones en vivo.
    {
      provide: MANEJADOR_DE_FLUJOS,
      inject: [AVISADOR_DE_FLUJOS],
      useFactory: (avisador: AvisadorDeFlujos) =>
        new DespertarFlujosAlEnviar(avisador),
    },
  ],
  exports: [],
})
export class MensajeriaModule implements OnModuleInit {
  constructor(
    @Inject(RegistroDeManejadores)
    private readonly registro: RegistroDeManejadores,
    @Inject(MANEJADOR_DE_FLUJOS)
    private readonly despertarFlujos: DespertarFlujosAlEnviar,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.despertarFlujos);
  }
}
