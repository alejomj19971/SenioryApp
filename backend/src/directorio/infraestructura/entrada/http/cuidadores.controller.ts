import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ListarCuidadores } from '../../../aplicacion/casos-de-uso/listar-cuidadores.js';
import type { PaginaDeVistas } from '../../../aplicacion/casos-de-uso/listar-cuidadores.js';
import { ObtenerCuidador } from '../../../aplicacion/casos-de-uso/obtener-cuidador.js';
import {
  ObtenerFiltrosDisponibles,
  type VistaDeFiltrosDisponibles,
} from '../../../aplicacion/casos-de-uso/obtener-filtros-disponibles.js';
import { ObtenerFotoDeCuidador } from '../../../aplicacion/casos-de-uso/obtener-foto-de-cuidador.js';
import { ObtenerHojaDeVida } from '../../../aplicacion/casos-de-uso/obtener-hoja-de-vida.js';
import type { VistaDeCuidadorConResenas } from '../../../aplicacion/vistas.js';
import { BusquedaDeCuidadoresDto } from './dto-de-directorio.js';

// El directorio de cuidadores. Exige sesión (cualquier rol): el catálogo no es público. Solo muestra a los
// cuidadores con sus tres controles vigentes; el teléfono nunca sale por aquí.
@Controller('cuidadores')
export class CuidadoresController {
  constructor(
    @Inject(ListarCuidadores) private readonly listar: ListarCuidadores,
    @Inject(ObtenerFiltrosDisponibles)
    private readonly filtros: ObtenerFiltrosDisponibles,
    @Inject(ObtenerCuidador) private readonly obtener: ObtenerCuidador,
    @Inject(ObtenerHojaDeVida) private readonly hojaDeVida: ObtenerHojaDeVida,
    @Inject(ObtenerFotoDeCuidador)
    private readonly fotoDeCuidador: ObtenerFotoDeCuidador,
  ) {}

  @Get()
  busqueda(
    @Query() consulta: BusquedaDeCuidadoresDto,
  ): Promise<PaginaDeVistas> {
    return this.listar.ejecutar(consulta);
  }

  // Antes que `:id`, para que «filtros» no se tome por un identificador.
  @Get('filtros')
  opciones(): Promise<VistaDeFiltrosDisponibles> {
    return this.filtros.ejecutar();
  }

  @Get(':id')
  async detalle(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ cuidador: VistaDeCuidadorConResenas }> {
    return { cuidador: await this.obtener.ejecutar(id) };
  }

  // Redirige a una dirección firmada que vence en minutos: el archivo nunca tiene un enlace permanente.
  @Get(':id/hoja-de-vida')
  async hoja(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    const { url } = await this.hojaDeVida.ejecutar(id);
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.redirect(302, url);
  }

  // Redirige a la foto de perfil: una dirección pública y cacheable (o la que trajo la importación), nunca la
  // del backend directamente, así el navegador nunca habla con el backend ni con un origen externo (lo sigue el
  // servidor de Next).
  @Get(':id/foto')
  async foto(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    const { url } = await this.fotoDeCuidador.ejecutar(id);
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.redirect(302, url);
  }
}
