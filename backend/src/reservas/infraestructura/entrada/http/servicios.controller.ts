import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { ErrorDeValidacion } from '../../../../compartido/dominio/errores.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import {
  AceptarServicio,
  FinalizarServicio,
  IniciarServicio,
  RechazarServicio,
} from '../../../aplicacion/casos-de-uso/acciones-del-cuidador.js';
import { CalificarServicio } from '../../../aplicacion/casos-de-uso/calificar-servicio.js';
import { CancelarServicio } from '../../../aplicacion/casos-de-uso/cancelar-servicio.js';
import {
  ListarMisServicios,
  ObtenerServicio,
  type Consultante,
} from '../../../aplicacion/casos-de-uso/consultar-servicios.js';
import { SolicitarServicio } from '../../../aplicacion/casos-de-uso/solicitar-servicio.js';
import type { RolConAcceso } from '../../../aplicacion/servicios/acceso-a-servicios.js';
import { VistasDeServicios } from '../../../aplicacion/servicios/vistas-de-servicios.js';
import type {
  PaginaDeVistasDeServicios,
  VistaDeCalificacion,
  VistaDeServicio,
  VistaDeServicioParaFamilia,
} from '../../../aplicacion/vistas.js';
import type { Servicio } from '../../../dominio/servicio.js';
import {
  CalificacionDto,
  ListadoDeServiciosDto,
  SolicitudDeServicioDto,
} from './dto-de-servicios.js';

const UN_MINUTO_MS = 60_000;

// Los servicios que contrata la familia y atiende el cuidador. Cada acción verifica quién es el actor y su
// relación con el servicio: uno ajeno responde 404. El monto lo calcula el servidor; el cliente nunca lo envía.
// La familia y el cuidador ven vistas distintas: cada quien ve solo lo que le corresponde del dinero.
@Controller('servicios')
export class ServiciosController {
  constructor(
    @Inject(SolicitarServicio) private readonly solicitar: SolicitarServicio,
    @Inject(AceptarServicio) private readonly aceptar: AceptarServicio,
    @Inject(RechazarServicio) private readonly rechazar: RechazarServicio,
    @Inject(IniciarServicio) private readonly iniciar: IniciarServicio,
    @Inject(FinalizarServicio) private readonly finalizar: FinalizarServicio,
    @Inject(CancelarServicio) private readonly cancelar: CancelarServicio,
    @Inject(CalificarServicio) private readonly calificar: CalificarServicio,
    @Inject(ObtenerServicio) private readonly obtener: ObtenerServicio,
    @Inject(ListarMisServicios) private readonly listar: ListarMisServicios,
    @Inject(VistasDeServicios) private readonly vistas: VistasDeServicios,
  ) {}

  // 201 cuando se crea; 200 cuando es el reintento de una solicitud ya hecha con la misma `Idempotency-Key`.
  @Roles('familiar')
  @Throttle({ default: { limit: 20, ttl: UN_MINUTO_MS } })
  @Post()
  async crear(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: SolicitudDeServicioDto,
    @Headers('idempotency-key') clave: string | string[] | undefined,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ servicio: VistaDeServicioParaFamilia }> {
    if (typeof clave !== 'string' || clave.trim() === '') {
      throw new ErrorDeValidacion(
        'Falta el encabezado Idempotency-Key',
        'idempotencia.falta',
      );
    }
    const { servicio, creado } = await this.solicitar.ejecutar(
      usuario.id,
      cuerpo,
      clave.trim(),
    );
    respuesta.status(creado ? HttpStatus.CREATED : HttpStatus.OK);
    return { servicio: await this.paraFamilia(servicio) };
  }

  @Roles('familiar', 'cuidador')
  @Get()
  listado(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query() consulta: ListadoDeServiciosDto,
  ): Promise<PaginaDeVistasDeServicios> {
    return this.listar.ejecutar(consultanteDe(usuario), consulta);
  }

  @Roles('familiar', 'cuidador')
  @Get(':id')
  async detalle(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ servicio: VistaDeServicio }> {
    return {
      servicio: await this.obtener.ejecutar(consultanteDe(usuario), id),
    };
  }

  @Roles('cuidador')
  @HttpCode(HttpStatus.OK)
  @Post(':id/aceptar')
  async aceptarServicio(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comoCuidador(await this.aceptar.ejecutar(usuario.id, id));
  }

  @Roles('cuidador')
  @HttpCode(HttpStatus.OK)
  @Post(':id/rechazar')
  async rechazarServicio(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comoCuidador(await this.rechazar.ejecutar(usuario.id, id));
  }

  @Roles('cuidador')
  @HttpCode(HttpStatus.OK)
  @Post(':id/iniciar')
  async iniciarServicio(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comoCuidador(await this.iniciar.ejecutar(usuario.id, id));
  }

  @Roles('cuidador')
  @HttpCode(HttpStatus.OK)
  @Post(':id/finalizar')
  async finalizarServicio(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comoCuidador(await this.finalizar.ejecutar(usuario.id, id));
  }

  @Roles('familiar')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancelar')
  async cancelarServicio(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ servicio: VistaDeServicioParaFamilia }> {
    return {
      servicio: await this.paraFamilia(
        await this.cancelar.ejecutar(usuario.id, id),
      ),
    };
  }

  @Roles('familiar')
  @Post(':id/calificacion')
  async calificarServicio(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: CalificacionDto,
  ): Promise<{ calificacion: VistaDeCalificacion }> {
    const calificacion = await this.calificar.ejecutar(usuario.id, id, cuerpo);
    return {
      calificacion: {
        calificacion: calificacion.calificacion,
        comentario: calificacion.comentario,
      },
    };
  }

  private async paraFamilia(
    servicio: Servicio,
  ): Promise<VistaDeServicioParaFamilia> {
    const [vista] = await this.vistas.paraFamilia([servicio]);
    return vista as VistaDeServicioParaFamilia;
  }

  private async comoCuidador(servicio: Servicio) {
    const [vista] = await this.vistas.paraCuidador([servicio]);
    return { servicio: vista };
  }
}

// Los roles de la ruta ya se limitaron con @Roles: aquí solo se estrecha el tipo.
function consultanteDe(usuario: UsuarioAutenticado): Consultante {
  return { usuarioId: usuario.id, rol: usuario.rol as RolConAcceso };
}
