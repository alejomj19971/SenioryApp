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
import { ComprarBolsa } from './aplicacion/casos-de-uso/comprar-bolsa.js';
import {
  ConsultarPagos,
  ListarMisLiquidaciones,
  ListarMisPagos,
  ListarPaquetes,
  ObtenerMiBolsa,
} from './aplicacion/casos-de-uso/consultas.js';
import { CotizarServicio } from './aplicacion/casos-de-uso/cotizar-servicio.js';
import { DispersarLiquidaciones } from './aplicacion/casos-de-uso/dispersar-liquidaciones.js';
import { ExpirarPagos } from './aplicacion/casos-de-uso/expirar-pagos.js';
import { ObtenerEnlaceDePago } from './aplicacion/casos-de-uso/obtener-enlace-de-pago.js';
import { ProcesarAvisoDePasarela } from './aplicacion/casos-de-uso/procesar-aviso-de-pasarela.js';
import { CobrarServicioConfirmado } from './aplicacion/manejadores/cobrar-servicio-confirmado.js';
import { LiquidarServicioFinalizado } from './aplicacion/manejadores/liquidar-servicio-finalizado.js';
import { ReembolsarServicioCancelado } from './aplicacion/manejadores/reembolsar-servicio-cancelado.js';
import {
  CONSULTA_DE_PAGOS,
  type ConsultaDePagos,
} from './aplicacion/puertos/entrada/consulta-de-pagos.js';
import {
  COTIZADOR_DE_SERVICIOS,
  type CotizadorDeServicios,
} from './aplicacion/puertos/entrada/cotizador-de-servicios.js';
import {
  DISPERSOR_DE_PAGOS,
  type DispersorDePagos,
} from './aplicacion/puertos/salida/dispersor-de-pagos.js';
import {
  PASARELA_DE_PAGOS,
  type PasarelaDePagos,
} from './aplicacion/puertos/salida/pasarela-de-pagos.js';
import {
  REPOSITORIO_POLITICAS_DE_PRECIOS,
  type RepositorioPoliticasDePrecios,
} from './aplicacion/puertos/salida/repositorio-politicas-de-precios.js';
import {
  REPOSITORIO_AVISOS_DE_PASARELA,
  REPOSITORIO_BOLSAS,
  REPOSITORIO_LIQUIDACIONES,
  REPOSITORIO_PAGOS,
  REPOSITORIO_PAQUETES,
  type RepositorioAvisosDePasarela,
  type RepositorioBolsas,
  type RepositorioLiquidaciones,
  type RepositorioPagos,
  type RepositorioPaquetes,
} from './aplicacion/puertos/salida/repositorios.js';
import { EventosDePagos } from './aplicacion/servicios/eventos-de-pagos.js';
import { ResolucionDePagos } from './aplicacion/servicios/resolucion-de-pagos.js';
import { BolsaController } from './infraestructura/entrada/http/bolsa.controller.js';
import { CotizacionesController } from './infraestructura/entrada/http/cotizaciones.controller.js';
import { LiquidacionesController } from './infraestructura/entrada/http/liquidaciones.controller.js';
import { PagosController } from './infraestructura/entrada/http/pagos.controller.js';
import { WebhookController } from './infraestructura/entrada/http/webhook.controller.js';
import {
  DispersorDeshabilitado,
  DispersorSimulado,
} from './infraestructura/salida/dispersion/dispersores.js';
import { PasarelaDeshabilitada } from './infraestructura/salida/pasarela/pasarela-deshabilitada.js';
import { PasarelaSimulada } from './infraestructura/salida/pasarela/pasarela-simulada.js';
import { RepositorioBolsasDrizzle } from './infraestructura/salida/persistencia/repositorio-bolsas-drizzle.js';
import { RepositorioPagosDrizzle } from './infraestructura/salida/persistencia/repositorio-pagos-drizzle.js';
import { RepositorioPoliticasDePreciosDrizzle } from './infraestructura/salida/persistencia/repositorio-politicas-de-precios-drizzle.js';
import {
  RepositorioAvisosDePasarelaDrizzle,
  RepositorioLiquidacionesDrizzle,
  RepositorioPaquetesDrizzle,
} from './infraestructura/salida/persistencia/repositorios-menores-drizzle.js';

const MANEJADORES_DE_PAGOS = Symbol('ManejadoresDePagos');
const SONDEO_DE_VENCIMIENTOS = Symbol('SondeoDeVencimientos');
const SONDEO_DE_LIQUIDACIONES = Symbol('SondeoDeLiquidaciones');

// Módulo de Pagos: cotiza (M3) y cobra (M7). Cobra al confirmarse un servicio, lleva la bolsa de horas prepago de
// cada familia como un libro de movimientos, devuelve el dinero al cancelarse y liquida al cuidador al terminar.
//
// Exporta SOLO `COTIZADOR_DE_SERVICIOS` y `CONSULTA_DE_PAGOS`; los repositorios y la pasarela son privados. Con
// Reservas se habla por eventos (cobrar, reembolsar, liquidar) y nunca al revés: Reservas ya depende de Pagos para
// cotizar, así que Pagos no puede consultarla.
//
// La pasarela y el dispersor son adaptadores intercambiables. Hoy hay uno simulado (desarrollo y pruebas, prohibido
// en producción) y uno deshabilitado que responde «no disponible»; el proveedor real llega cuando se decida.
@Module({
  imports: [DirectorioModule],
  controllers: [
    CotizacionesController,
    BolsaController,
    PagosController,
    WebhookController,
    LiquidacionesController,
  ],
  providers: [
    // Cotización (M3)
    {
      provide: REPOSITORIO_POLITICAS_DE_PRECIOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioPoliticasDePreciosDrizzle(contexto),
    },
    {
      provide: COTIZADOR_DE_SERVICIOS,
      inject: [CONSULTA_DE_DIRECTORIO, REPOSITORIO_POLITICAS_DE_PRECIOS, RELOJ],
      useFactory: (
        directorio: ConsultaDeDirectorio,
        politicas: RepositorioPoliticasDePrecios,
        reloj: Reloj,
      ): CotizadorDeServicios =>
        new CotizarServicio(directorio, politicas, reloj),
    },

    // Persistencia
    {
      provide: REPOSITORIO_PAGOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioPagosDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_BOLSAS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioBolsasDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_LIQUIDACIONES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioLiquidacionesDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_AVISOS_DE_PASARELA,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioAvisosDePasarelaDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_PAQUETES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioPaquetesDrizzle(contexto),
    },

    // Proveedores externos, según la configuración
    {
      provide: PASARELA_DE_PAGOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): PasarelaDePagos => {
        if (configuracion.pasarelaDePagos === 'deshabilitada') {
          return new PasarelaDeshabilitada();
        }
        if (configuracion.secretoDePasarela === null) {
          throw new Error('La pasarela simulada necesita SECRETO_DE_PASARELA');
        }
        return new PasarelaSimulada(
          configuracion.secretoDePasarela,
          configuracion.urlPublicaDeLaApi,
        );
      },
    },
    {
      provide: DISPERSOR_DE_PAGOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): DispersorDePagos =>
        configuracion.dispersorDePagos === 'simulado'
          ? new DispersorSimulado()
          : new DispersorDeshabilitado(),
    },

    // Servicios de aplicación
    {
      provide: EventosDePagos,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDePagos(publicador, ids, contexto),
    },
    {
      provide: ResolucionDePagos,
      inject: [
        REPOSITORIO_BOLSAS,
        REPOSITORIO_PAQUETES,
        EventosDePagos,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        bolsas: RepositorioBolsas,
        paquetes: RepositorioPaquetes,
        eventos: EventosDePagos,
        ids: GeneradorDeIds,
      ) => new ResolucionDePagos(bolsas, paquetes, eventos, ids),
    },

    // Casos de uso
    {
      provide: ObtenerEnlaceDePago,
      inject: [
        REPOSITORIO_PAGOS,
        PASARELA_DE_PAGOS,
        UNIDAD_DE_TRABAJO,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        pagos: RepositorioPagos,
        pasarela: PasarelaDePagos,
        unidadDeTrabajo: UnidadDeTrabajo,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ObtenerEnlaceDePago(
          pagos,
          pasarela,
          unidadDeTrabajo,
          reloj,
          configuracion.minutosParaPagar,
        ),
    },
    {
      provide: ComprarBolsa,
      inject: [
        REPOSITORIO_PAQUETES,
        REPOSITORIO_PAGOS,
        PASARELA_DE_PAGOS,
        ObtenerEnlaceDePago,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        paquetes: RepositorioPaquetes,
        pagos: RepositorioPagos,
        pasarela: PasarelaDePagos,
        enlaces: ObtenerEnlaceDePago,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new ComprarBolsa(
          paquetes,
          pagos,
          pasarela,
          enlaces,
          unidadDeTrabajo,
          auditoria,
          reloj,
          ids,
        ),
    },
    {
      provide: ProcesarAvisoDePasarela,
      inject: [
        PASARELA_DE_PAGOS,
        REPOSITORIO_PAGOS,
        REPOSITORIO_AVISOS_DE_PASARELA,
        ResolucionDePagos,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        pasarela: PasarelaDePagos,
        pagos: RepositorioPagos,
        avisos: RepositorioAvisosDePasarela,
        resolucion: ResolucionDePagos,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new ProcesarAvisoDePasarela(
          pasarela,
          pagos,
          avisos,
          resolucion,
          unidadDeTrabajo,
          auditoria,
          reloj,
          ids,
        ),
    },
    {
      provide: ExpirarPagos,
      inject: [
        REPOSITORIO_PAGOS,
        PASARELA_DE_PAGOS,
        ResolucionDePagos,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        pagos: RepositorioPagos,
        pasarela: PasarelaDePagos,
        resolucion: ResolucionDePagos,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new ExpirarPagos(
          pagos,
          pasarela,
          resolucion,
          unidadDeTrabajo,
          auditoria,
          reloj,
          configuracion.minutosParaPagar,
        ),
    },
    {
      provide: DispersarLiquidaciones,
      inject: [
        REPOSITORIO_LIQUIDACIONES,
        DISPERSOR_DE_PAGOS,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        liquidaciones: RepositorioLiquidaciones,
        dispersor: DispersorDePagos,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new DispersarLiquidaciones(
          liquidaciones,
          dispersor,
          unidadDeTrabajo,
          auditoria,
          reloj,
        ),
    },

    // Las tareas programadas: vencer los pagos sin pagar y pagarle al cuidador.
    {
      provide: SONDEO_DE_VENCIMIENTOS,
      inject: [ExpirarPagos, CONFIGURACION],
      useFactory: (expirar: ExpirarPagos, configuracion: Configuracion) =>
        new SondeoPeriodico(
          'SondeoDeVencimientosDePagos',
          async () => {
            const { vencidos, recuperados } = await expirar.ejecutar();
            return vencidos + recuperados;
          },
          configuracion.intervaloExpiracionPagosMs,
        ),
    },
    {
      provide: SONDEO_DE_LIQUIDACIONES,
      inject: [DispersarLiquidaciones, CONFIGURACION],
      useFactory: (
        dispersar: DispersarLiquidaciones,
        configuracion: Configuracion,
      ) =>
        new SondeoPeriodico(
          'SondeoDeLiquidaciones',
          async () => {
            const { pagadas, enviadas, rechazadas } =
              await dispersar.ejecutar();
            return pagadas + enviadas + rechazadas;
          },
          configuracion.intervaloLiquidacionMs,
        ),
    },

    // Consultas
    {
      provide: ListarPaquetes,
      inject: [REPOSITORIO_PAQUETES],
      useFactory: (paquetes: RepositorioPaquetes) =>
        new ListarPaquetes(paquetes),
    },
    {
      provide: ObtenerMiBolsa,
      inject: [REPOSITORIO_BOLSAS],
      useFactory: (bolsas: RepositorioBolsas) => new ObtenerMiBolsa(bolsas),
    },
    {
      provide: ListarMisPagos,
      inject: [REPOSITORIO_PAGOS, CONFIGURACION],
      useFactory: (pagos: RepositorioPagos, configuracion: Configuracion) =>
        new ListarMisPagos(pagos, configuracion.minutosParaPagar),
    },
    {
      provide: ListarMisLiquidaciones,
      inject: [REPOSITORIO_LIQUIDACIONES, CONSULTA_DE_DIRECTORIO],
      useFactory: (
        liquidaciones: RepositorioLiquidaciones,
        directorio: ConsultaDeDirectorio,
      ) => new ListarMisLiquidaciones(liquidaciones, directorio),
    },
    {
      provide: CONSULTA_DE_PAGOS,
      inject: [REPOSITORIO_BOLSAS],
      useFactory: (bolsas: RepositorioBolsas): ConsultaDePagos =>
        new ConsultarPagos(bolsas),
    },

    // Reacciona a los eventos de Reservas
    {
      provide: MANEJADORES_DE_PAGOS,
      inject: [
        REPOSITORIO_PAGOS,
        REPOSITORIO_BOLSAS,
        REPOSITORIO_LIQUIDACIONES,
        REPOSITORIO_POLITICAS_DE_PRECIOS,
        PASARELA_DE_PAGOS,
        ResolucionDePagos,
        EventosDePagos,
        GENERADOR_DE_IDS,
        RELOJ,
      ],
      useFactory: (
        pagos: RepositorioPagos,
        bolsas: RepositorioBolsas,
        liquidaciones: RepositorioLiquidaciones,
        politicas: RepositorioPoliticasDePrecios,
        pasarela: PasarelaDePagos,
        resolucion: ResolucionDePagos,
        eventos: EventosDePagos,
        ids: GeneradorDeIds,
        reloj: Reloj,
      ) => [
        new CobrarServicioConfirmado(
          pagos,
          bolsas,
          politicas,
          resolucion,
          eventos,
          ids,
          reloj,
        ),
        new ReembolsarServicioCancelado(
          pagos,
          bolsas,
          pasarela,
          eventos,
          ids,
          reloj,
        ),
        new LiquidarServicioFinalizado(
          pagos,
          bolsas,
          liquidaciones,
          eventos,
          ids,
          reloj,
        ),
      ],
    },
  ],
  exports: [COTIZADOR_DE_SERVICIOS, CONSULTA_DE_PAGOS],
})
export class PagosModule implements OnModuleInit {
  constructor(
    @Inject(RegistroDeManejadores)
    private readonly registro: RegistroDeManejadores,
    @Inject(MANEJADORES_DE_PAGOS)
    private readonly manejadores: (
      | CobrarServicioConfirmado
      | ReembolsarServicioCancelado
      | LiquidarServicioFinalizado
    )[],
    // Solo para que Nest los cree y llame a sus ganchos de arranque y cierre.
    @Inject(SONDEO_DE_VENCIMIENTOS)
    private readonly vencimientos: SondeoPeriodico,
    @Inject(SONDEO_DE_LIQUIDACIONES)
    private readonly liquidaciones: SondeoPeriodico,
  ) {}

  onModuleInit(): void {
    for (const manejador of this.manejadores) {
      this.registro.registrar(manejador as never);
    }
  }
}
