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
  Patch,
  Post,
  Put,
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
  AtenderAlerta,
  GenerarAlerta,
} from '../../../aplicacion/casos-de-uso/alertas.js';
import { ObtenerResumenDeEstado } from '../../../aplicacion/casos-de-uso/resumen.js';
import {
  DefinirRangos,
  ListarSignosVitales,
  ObtenerUltimaLectura,
  RegistrarLectura,
} from '../../../aplicacion/casos-de-uso/signos.js';
import type {
  VistaDeAlerta,
  VistaDeAlertaGenerada,
  VistaDeLectura,
  VistaDeResumen,
} from '../../../aplicacion/vistas.js';
import type { RangosDeReferencia } from '../../../dominio/signos.js';
import {
  AlertaDto,
  AtencionDeAlertaDto,
  ConsultaDeSignosDto,
  LecturaDto,
  RangosDto,
} from './dto-de-teleasistencia.js';

const UN_MINUTO_MS = 60_000;

const actorDe = (usuario: UsuarioAutenticado) => ({
  usuarioId: usuario.id,
  rol: usuario.rol,
});

// Lo que no se informa queda sin límite por ese lado.
function rangosDe(cuerpo: RangosDto): RangosDeReferencia {
  return {
    sistolicaMin: cuerpo.sistolicaMin ?? null,
    sistolicaMax: cuerpo.sistolicaMax ?? null,
    diastolicaMin: cuerpo.diastolicaMin ?? null,
    diastolicaMax: cuerpo.diastolicaMax ?? null,
    frecuenciaMin: cuerpo.frecuenciaMin ?? null,
    frecuenciaMax: cuerpo.frecuenciaMax ?? null,
    glucosaMin: cuerpo.glucosaMin ?? null,
    glucosaMax: cuerpo.glucosaMax ?? null,
  };
}

// Signos vitales, alertas y el resumen del inicio. Todo caso de uso empieza consultando la política de acceso.
@Controller()
export class SignosYAlertasController {
  constructor(
    @Inject(ObtenerResumenDeEstado)
    private readonly resumen: ObtenerResumenDeEstado,
    @Inject(RegistrarLectura) private readonly registrar: RegistrarLectura,
    @Inject(ListarSignosVitales) private readonly listar: ListarSignosVitales,
    @Inject(ObtenerUltimaLectura) private readonly ultima: ObtenerUltimaLectura,
    @Inject(DefinirRangos) private readonly rangos: DefinirRangos,
    @Inject(GenerarAlerta) private readonly generar: GenerarAlerta,
    @Inject(AtenderAlerta) private readonly atender: AtenderAlerta,
  ) {}

  @Roles('familiar', 'cuidador')
  @Get('adultos-mayores/:id/resumen')
  async elResumen(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ resumen: VistaDeResumen }> {
    return { resumen: await this.resumen.ejecutar(actorDe(usuario), id) };
  }

  @Roles('familiar', 'cuidador')
  @Get('adultos-mayores/:id/signos-vitales')
  async signos(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ConsultaDeSignosDto,
  ): Promise<{ lecturas: VistaDeLectura[] }> {
    return {
      lecturas: await this.listar.ejecutar(actorDe(usuario), id, consulta.dias),
    };
  }

  // Sin lecturas responde `null`, no un error (H8).
  @Roles('familiar', 'cuidador')
  @Get('adultos-mayores/:id/signos-vitales/ultima')
  async laUltima(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ lectura: VistaDeLectura | null }> {
    return { lectura: await this.ultima.ejecutar(actorDe(usuario), id) };
  }

  @Roles('familiar', 'cuidador')
  @Post('adultos-mayores/:id/signos-vitales')
  async nueva(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: LecturaDto,
  ): Promise<{ lectura: VistaDeLectura }> {
    return {
      lectura: await this.registrar.ejecutar(actorDe(usuario), id, cuerpo),
    };
  }

  // Solo la familia define los rangos (con lo que indique el profesional de salud).
  @Roles('familiar')
  @Put('adultos-mayores/:id/rangos-de-referencia')
  async definirRangos(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: RangosDto,
  ): Promise<{ rangos: RangosDeReferencia }> {
    return {
      rangos: await this.rangos.ejecutar(
        actorDe(usuario),
        id,
        rangosDe(cuerpo),
      ),
    };
  }

  // 201 cuando se crea; 200 cuando es el reintento de una alerta ya enviada con la misma `Idempotency-Key`.
  @Roles('familiar', 'cuidador')
  @Throttle({ default: { limit: 20, ttl: UN_MINUTO_MS } })
  @Post('adultos-mayores/:id/alertas')
  async nuevaAlerta(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: AlertaDto,
    @Headers('idempotency-key') clave: string | string[] | undefined,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ alerta: VistaDeAlertaGenerada }> {
    if (typeof clave !== 'string' || clave.trim() === '') {
      throw new ErrorDeValidacion(
        'Falta el encabezado Idempotency-Key',
        'idempotencia.falta',
      );
    }
    const { alerta, creada } = await this.generar.ejecutar(
      actorDe(usuario),
      id,
      cuerpo.origen,
      clave.trim(),
    );
    respuesta.status(creada ? HttpStatus.CREATED : HttpStatus.OK);
    return { alerta };
  }

  @Roles('familiar', 'cuidador')
  @HttpCode(HttpStatus.OK)
  @Patch('alertas/:id/atendida')
  async atendida(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: AtencionDeAlertaDto,
  ): Promise<{ alerta: VistaDeAlerta }> {
    return {
      alerta: await this.atender.ejecutar(actorDe(usuario), id, cuerpo.nota),
    };
  }
}
