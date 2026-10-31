import { Module } from '@nestjs/common';
import { RELOJ, type Reloj } from '../compartido/aplicacion/puertos/reloj.js';
import { ContextoTransaccional } from '../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import {
  CONSULTA_DE_DIRECTORIO,
  type ConsultaDeDirectorio,
} from '../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import { DirectorioModule } from '../directorio/directorio.module.js';
import { CotizarServicio } from './aplicacion/casos-de-uso/cotizar-servicio.js';
import {
  COTIZADOR_DE_SERVICIOS,
  type CotizadorDeServicios,
} from './aplicacion/puertos/entrada/cotizador-de-servicios.js';
import {
  REPOSITORIO_POLITICAS_DE_PRECIOS,
  type RepositorioPoliticasDePrecios,
} from './aplicacion/puertos/salida/repositorio-politicas-de-precios.js';
import { CotizacionesController } from './infraestructura/entrada/http/cotizaciones.controller.js';
import { RepositorioPoliticasDePreciosDrizzle } from './infraestructura/salida/persistencia/repositorio-politicas-de-precios-drizzle.js';

// Módulo de Pagos. En esta etapa (M3) solo cotiza; el cobro, las bolsas y la liquidación llegan con M7.
// Exporta SOLO `COTIZADOR_DE_SERVICIOS`: el repositorio de políticas es privado.
@Module({
  imports: [DirectorioModule],
  controllers: [CotizacionesController],
  providers: [
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
  ],
  exports: [COTIZADOR_DE_SERVICIOS],
})
export class PagosModule {}
