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
import { CONFIGURACION } from '../configuracion/configuracion.module.js';
import type { Configuracion } from '../configuracion/variables-de-entorno.js';
import {
  CONSULTA_DE_IDENTIDAD,
  type ConsultaDeIdentidad,
} from '../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import {
  CUENTAS_DE_CUIDADORES,
  type CuentasDeCuidadores,
} from '../identidad/aplicacion/puertos/entrada/cuentas-de-cuidadores.js';
import { IdentidadModule } from '../identidad/identidad.module.js';
import { ImportarCuidador } from './aplicacion/casos-de-uso/importar-cuidador.js';
import { ListarCuidadores } from './aplicacion/casos-de-uso/listar-cuidadores.js';
import { ObtenerCuidador } from './aplicacion/casos-de-uso/obtener-cuidador.js';
import { ObtenerFiltrosDisponibles } from './aplicacion/casos-de-uso/obtener-filtros-disponibles.js';
import { ObtenerHojaDeVida } from './aplicacion/casos-de-uso/obtener-hoja-de-vida.js';
import { RevisarVigencias } from './aplicacion/casos-de-uso/revisar-vigencias.js';
import { RegistrarResenaAlCalificar } from './aplicacion/manejadores/registrar-resena-al-calificar.js';
import {
  CONSULTA_DE_DIRECTORIO,
  type ConsultaDeDirectorio,
} from './aplicacion/puertos/entrada/consulta-de-directorio.js';
import {
  ALMACEN_DE_ARCHIVOS,
  type AlmacenDeArchivos,
} from './aplicacion/puertos/salida/almacen-de-archivos.js';
import {
  REPOSITORIO_CUIDADORES,
  type RepositorioCuidadores,
} from './aplicacion/puertos/salida/repositorio-cuidadores.js';
import {
  REPOSITORIO_DOCUMENTOS,
  type RepositorioDocumentos,
} from './aplicacion/puertos/salida/repositorio-documentos.js';
import {
  REPOSITORIO_RESENAS,
  type RepositorioResenas,
} from './aplicacion/puertos/salida/repositorio-resenas.js';
import { ConsultaDeDirectorioServicio } from './aplicacion/servicios/consulta-de-directorio-servicio.js';
import { EventosDeDirectorio } from './aplicacion/servicios/eventos-de-directorio.js';
import { ArchivosController } from './infraestructura/entrada/http/archivos.controller.js';
import { CuidadoresController } from './infraestructura/entrada/http/cuidadores.controller.js';
import {
  AlmacenDeArchivosDeshabilitado,
  AlmacenDeArchivosLocal,
} from './infraestructura/salida/archivos/almacenes-de-archivos.js';
import { RepositorioCuidadoresDrizzle } from './infraestructura/salida/persistencia/repositorio-cuidadores-drizzle.js';
import { RepositorioDocumentosDrizzle } from './infraestructura/salida/persistencia/repositorio-documentos-drizzle.js';
import { RepositorioResenasDrizzle } from './infraestructura/salida/persistencia/repositorio-resenas-drizzle.js';

const MANEJADOR_DE_RESENAS = Symbol('ManejadorDeResenas');

// Módulo de Directorio (M2): los cuidadores que las familias buscan. Exporta SOLO `CONSULTA_DE_DIRECTORIO`
// (el puerto de entrada para Reservas, Notificaciones y Teleasistencia). Repositorios y almacén son
// privados. Las clases se crean con fábricas para que la capa de aplicación no dependa de decoradores de
// Nest.
@Module({
  imports: [IdentidadModule],
  controllers: [CuidadoresController, ArchivosController],
  providers: [
    // Persistencia y archivos
    {
      provide: REPOSITORIO_CUIDADORES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioCuidadoresDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_RESENAS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioResenasDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_DOCUMENTOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioDocumentosDrizzle(contexto),
    },
    {
      provide: ALMACEN_DE_ARCHIVOS,
      inject: [CONFIGURACION, RELOJ],
      useFactory: (
        configuracion: Configuracion,
        reloj: Reloj,
      ): AlmacenDeArchivos =>
        configuracion.almacenDeArchivos === 'local' &&
        configuracion.secretoDeArchivos !== null
          ? new AlmacenDeArchivosLocal({
              directorio: configuracion.directorioDeArchivos,
              secreto: configuracion.secretoDeArchivos,
              urlPublicaDeLaApi: configuracion.urlPublicaDeLaApi,
              ahoraMs: () => reloj.ahora().getTime(),
            })
          : new AlmacenDeArchivosDeshabilitado(),
    },
    {
      provide: EventosDeDirectorio,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDeDirectorio(publicador, ids, contexto),
    },

    // Casos de uso
    {
      provide: ListarCuidadores,
      inject: [REPOSITORIO_CUIDADORES],
      useFactory: (cuidadores: RepositorioCuidadores) =>
        new ListarCuidadores(cuidadores),
    },
    {
      provide: ObtenerFiltrosDisponibles,
      inject: [REPOSITORIO_CUIDADORES],
      useFactory: (cuidadores: RepositorioCuidadores) =>
        new ObtenerFiltrosDisponibles(cuidadores),
    },
    {
      provide: ObtenerCuidador,
      inject: [
        REPOSITORIO_CUIDADORES,
        REPOSITORIO_RESENAS,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        cuidadores: RepositorioCuidadores,
        resenas: RepositorioResenas,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ObtenerCuidador(
          cuidadores,
          resenas,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: ObtenerHojaDeVida,
      inject: [
        REPOSITORIO_CUIDADORES,
        REPOSITORIO_DOCUMENTOS,
        ALMACEN_DE_ARCHIVOS,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        cuidadores: RepositorioCuidadores,
        documentos: RepositorioDocumentos,
        almacen: AlmacenDeArchivos,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ObtenerHojaDeVida(
          cuidadores,
          documentos,
          almacen,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },

    // Lo que corre desde la consola del servidor (npm run cuidadores:importar y
    // cuidadores:revisar-vigencias); no tiene ruta en la API.
    {
      provide: ImportarCuidador,
      inject: [
        CUENTAS_DE_CUIDADORES,
        REPOSITORIO_CUIDADORES,
        REPOSITORIO_DOCUMENTOS,
        ALMACEN_DE_ARCHIVOS,
        UNIDAD_DE_TRABAJO,
        EventosDeDirectorio,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        cuentas: CuentasDeCuidadores,
        cuidadores: RepositorioCuidadores,
        documentos: RepositorioDocumentos,
        almacen: AlmacenDeArchivos,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeDirectorio,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new ImportarCuidador(
          cuentas,
          cuidadores,
          documentos,
          almacen,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          ids,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: RevisarVigencias,
      inject: [
        REPOSITORIO_CUIDADORES,
        UNIDAD_DE_TRABAJO,
        EventosDeDirectorio,
        AUDITORIA,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        cuidadores: RepositorioCuidadores,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeDirectorio,
        auditoria: Auditoria,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new RevisarVigencias(
          cuidadores,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },

    // Reacciona a eventos de otros módulos
    {
      provide: MANEJADOR_DE_RESENAS,
      inject: [
        REPOSITORIO_CUIDADORES,
        REPOSITORIO_RESENAS,
        CONSULTA_DE_IDENTIDAD,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        cuidadores: RepositorioCuidadores,
        resenas: RepositorioResenas,
        identidad: ConsultaDeIdentidad,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new RegistrarResenaAlCalificar(
          cuidadores,
          resenas,
          identidad,
          reloj,
          ids,
        ),
    },

    // Lo que otros módulos pueden usar
    {
      provide: CONSULTA_DE_DIRECTORIO,
      inject: [REPOSITORIO_CUIDADORES, RELOJ, CONFIGURACION],
      useFactory: (
        cuidadores: RepositorioCuidadores,
        reloj: Reloj,
        configuracion: Configuracion,
      ): ConsultaDeDirectorio =>
        new ConsultaDeDirectorioServicio(
          cuidadores,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
  ],
  exports: [CONSULTA_DE_DIRECTORIO],
})
export class DirectorioModule implements OnModuleInit {
  constructor(
    @Inject(RegistroDeManejadores)
    private readonly registro: RegistroDeManejadores,
    @Inject(MANEJADOR_DE_RESENAS)
    private readonly manejadorDeResenas: RegistrarResenaAlCalificar,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.manejadorDeResenas);
  }
}
