import { Global, Module } from '@nestjs/common';
import { CONFIGURACION } from '../configuracion/configuracion.module.js';
import type { Configuracion } from '../configuracion/variables-de-entorno.js';
import { AUDITORIA } from './aplicacion/puertos/auditoria.js';
import { CONTEXTO_DE_PETICION } from './aplicacion/puertos/contexto-de-peticion.js';
import {
  GENERADOR_DE_IDS,
  type GeneradorDeIds,
} from './aplicacion/puertos/generador-de-ids.js';
import { PUBLICADOR_DE_EVENTOS } from './aplicacion/puertos/publicador-de-eventos.js';
import { RELOJ, type Reloj } from './aplicacion/puertos/reloj.js';
import { UNIDAD_DE_TRABAJO } from './aplicacion/puertos/unidad-de-trabajo.js';
import { AuditoriaPostgres } from './infraestructura/auditoria/auditoria-postgres.js';
import {
  BASE_DE_DATOS,
  type BaseDeDatos,
} from './infraestructura/base-de-datos/base-de-datos.module.js';
import { ContextoTransaccional } from './infraestructura/base-de-datos/contexto-transaccional.js';
import { ContextoDePeticionAls } from './infraestructura/contexto-de-peticion-als.js';
import { GeneradorDeIdsUuidV7 } from './infraestructura/generador-de-ids-uuid-v7.js';
import { DespachadorDeEventos } from './infraestructura/outbox/despachador-de-eventos.js';
import { PublicadorDeEventosOutbox } from './infraestructura/outbox/publicador-de-eventos-outbox.js';
import { RegistroDeManejadores } from './infraestructura/outbox/registro-de-manejadores.js';
import { SondeoDelOutbox } from './infraestructura/outbox/sondeo-del-outbox.js';
import { RelojDelSistema } from './infraestructura/reloj-del-sistema.js';

// Lo transversal que usan todos los módulos (M0 §4.7 y §4.8). Es global: cada módulo inyecta los
// puertos por su símbolo sin importarlo. Las clases se crean con fábricas para que no dependan de
// decoradores de Nest y las pruebas puedan instanciarlas directamente.
@Global()
@Module({
  providers: [
    { provide: RELOJ, useClass: RelojDelSistema },
    { provide: GENERADOR_DE_IDS, useClass: GeneradorDeIdsUuidV7 },
    {
      provide: ContextoTransaccional,
      inject: [BASE_DE_DATOS],
      useFactory: (bd: BaseDeDatos) => new ContextoTransaccional(bd),
    },
    { provide: UNIDAD_DE_TRABAJO, useExisting: ContextoTransaccional },
    {
      provide: RegistroDeManejadores,
      useFactory: () => new RegistroDeManejadores(),
    },
    {
      provide: ContextoDePeticionAls,
      useFactory: () => new ContextoDePeticionAls(),
    },
    { provide: CONTEXTO_DE_PETICION, useExisting: ContextoDePeticionAls },
    {
      provide: DespachadorDeEventos,
      inject: [
        BASE_DE_DATOS,
        ContextoTransaccional,
        RegistroDeManejadores,
        RELOJ,
        ContextoDePeticionAls,
      ],
      useFactory: (
        bd: BaseDeDatos,
        contexto: ContextoTransaccional,
        registro: RegistroDeManejadores,
        reloj: Reloj,
        contextoDePeticion: ContextoDePeticionAls,
      ) =>
        new DespachadorDeEventos(
          bd,
          contexto,
          registro,
          reloj,
          contextoDePeticion,
        ),
    },
    {
      provide: PUBLICADOR_DE_EVENTOS,
      inject: [ContextoTransaccional, DespachadorDeEventos],
      useFactory: (
        contexto: ContextoTransaccional,
        despachador: DespachadorDeEventos,
      ) => new PublicadorDeEventosOutbox(contexto, despachador),
    },
    {
      provide: AUDITORIA,
      inject: [BASE_DE_DATOS, GENERADOR_DE_IDS, RELOJ, ContextoDePeticionAls],
      useFactory: (
        bd: BaseDeDatos,
        generador: GeneradorDeIds,
        reloj: Reloj,
        contextoDePeticion: ContextoDePeticionAls,
      ) => new AuditoriaPostgres(bd, generador, reloj, contextoDePeticion),
    },
    {
      provide: SondeoDelOutbox,
      inject: [DespachadorDeEventos, CONFIGURACION],
      useFactory: (
        despachador: DespachadorDeEventos,
        configuracion: Configuracion,
      ) =>
        new SondeoDelOutbox(despachador, configuracion.intervaloSondeoOutboxMs),
    },
  ],
  exports: [
    // Puertos que usan los casos de uso.
    RELOJ,
    GENERADOR_DE_IDS,
    UNIDAD_DE_TRABAJO,
    PUBLICADOR_DE_EVENTOS,
    AUDITORIA,
    CONTEXTO_DE_PETICION,
    // Para la infraestructura de los módulos: sus repositorios piden la conexión al contexto
    // y registran sus manejadores de eventos al iniciar.
    ContextoTransaccional,
    RegistroDeManejadores,
    // Para la capa HTTP: el middleware abre el contexto de cada petición.
    ContextoDePeticionAls,
  ],
})
export class CompartidoModule {}
