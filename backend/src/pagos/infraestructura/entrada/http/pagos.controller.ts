import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import { ListarMisPagos } from '../../../aplicacion/casos-de-uso/consultas.js';
import { ObtenerEnlaceDePago } from '../../../aplicacion/casos-de-uso/obtener-enlace-de-pago.js';
import type { VistaDePago } from '../../../aplicacion/vistas.js';
import type { PagoId } from '../../../dominio/ids.js';

const UN_MINUTO_MS = 60_000;

// Los pagos de la familia. Un pago ajeno responde «no encontrado», igual que uno que no existe.
@Controller('pagos')
export class PagosController {
  constructor(
    @Inject(ListarMisPagos) private readonly listar: ListarMisPagos,
    @Inject(ObtenerEnlaceDePago) private readonly enlaces: ObtenerEnlaceDePago,
  ) {}

  @Roles('familiar')
  @Get()
  async misPagos(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ pagos: VistaDePago[] }> {
    return { pagos: await this.listar.ejecutar(usuario.id) };
  }

  // El enlace al que el BFF manda a la familia a pagar. Pedirlo dos veces devuelve el mismo cobro.
  @Roles('familiar')
  @Throttle({ default: { limit: 20, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post(':id/enlace')
  async enlace(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ urlDePago: string; venceEn: string }> {
    const enlace = await this.enlaces.ejecutar(usuario.id, id as PagoId);
    return {
      urlDePago: enlace.urlDePago,
      venceEn: enlace.venceEn.toISOString(),
    };
  }
}
