import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import {
  AbrirDocumentoParaRevisor,
  ListarHojasDeVidaPendientes,
  ListarVerificaciones,
  ObtenerCuidadorParaRevisor,
  RevisarHojaDeVida,
  RevisarVerificacion,
  type DecisionDelRevisor,
  type HojaDeVidaPendiente,
} from '../../../aplicacion/casos-de-uso/revision.js';
import type {
  VistaDeCuidadorParaRevisor,
  VistaDeDocumento,
  VistaDeVerificacionParaRevisor,
} from '../../../aplicacion/vistas-de-postulacion.js';
import type {
  CuidadorId,
  DocumentoId,
  VerificacionId,
} from '../../../dominio/ids.js';
import {
  ListadoDeVerificacionesDto,
  RevisionDeDocumentoDto,
  RevisionDeVerificacionDto,
} from './dto-de-postulacion.js';

// El panel de los revisores. Solo administradores. Cada decisión y cada apertura de un documento privado queda en la
// auditoría. (Pendiente: segundo factor para administradores, decisión abierta.)
@ApiTags('Directorio')
@Controller('verificaciones')
@Roles('administrador')
export class VerificacionesController {
  constructor(
    @Inject(ListarVerificaciones)
    private readonly listar: ListarVerificaciones,
    @Inject(RevisarVerificacion) private readonly revisar: RevisarVerificacion,
    @Inject(AbrirDocumentoParaRevisor)
    private readonly abrir: AbrirDocumentoParaRevisor,
    @Inject(ListarHojasDeVidaPendientes)
    private readonly hojas: ListarHojasDeVidaPendientes,
    @Inject(RevisarHojaDeVida) private readonly revisarHoja: RevisarHojaDeVida,
    @Inject(ObtenerCuidadorParaRevisor)
    private readonly expediente: ObtenerCuidadorParaRevisor,
  ) {}

  @Get()
  async cola(
    @Query() consulta: ListadoDeVerificacionesDto,
  ): Promise<{ verificaciones: VistaDeVerificacionParaRevisor[] }> {
    return { verificaciones: await this.listar.ejecutar(consulta.estado) };
  }

  // Antes que `:id`, para que «hojas-de-vida» no se tome por un identificador.
  @Get('hojas-de-vida')
  async hojasPendientes(): Promise<{ hojasDeVida: HojaDeVidaPendiente[] }> {
    return { hojasDeVida: await this.hojas.ejecutar() };
  }

  // El expediente de un cuidador: sus tres controles y todos sus documentos. Antes que `:id`.
  @Get('cuidadores/:id')
  async expedienteDelCuidador(
    @UsuarioActual() revisor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VistaDeCuidadorParaRevisor> {
    return this.expediente.ejecutar(revisor, id as CuidadorId);
  }

  // Redirige a una dirección firmada que vence en dos minutos.
  @Get('documentos/:id')
  async documento(
    @UsuarioActual() revisor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    const { url } = await this.abrir.ejecutar(revisor, id as DocumentoId);
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.redirect(302, url);
  }

  @Patch('documentos/:id')
  async revisarDocumento(
    @UsuarioActual() revisor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: RevisionDeDocumentoDto,
  ): Promise<{ documento: VistaDeDocumento }> {
    return {
      documento: await this.revisarHoja.ejecutar(
        revisor,
        id as DocumentoId,
        cuerpo.decision,
      ),
    };
  }

  @Patch(':id')
  async decidir(
    @UsuarioActual() revisor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: RevisionDeVerificacionDto,
  ): Promise<{ verificacion: { estado: string; cuidadorVisible: boolean } }> {
    const decision: DecisionDelRevisor =
      cuerpo.decision === 'aprobar'
        ? { decision: 'aprobar', vigenteHasta: cuerpo.vigenteHasta ?? null }
        : { decision: 'rechazar', motivo: cuerpo.motivo ?? '' };
    return {
      verificacion: await this.revisar.ejecutar(
        revisor,
        id as VerificacionId,
        decision,
      ),
    };
  }
}
