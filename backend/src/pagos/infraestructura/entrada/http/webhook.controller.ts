import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ErrorDeValidacion } from '../../../../compartido/dominio/errores.js';
import { Publico } from '../../../../compartido/http/decoradores.js';
import {
  ProcesarAvisoDePasarela,
  type ResultadoDelAviso,
} from '../../../aplicacion/casos-de-uso/procesar-aviso-de-pasarela.js';

const UN_MINUTO_MS = 60_000;

// Donde la pasarela cuenta cómo terminó un pago. Es pública a propósito: la pasarela no tiene sesión, y la
// credencial es la FIRMA del aviso, que se verifica sobre el cuerpo exacto (por eso se lee el cuerpo crudo). Sin
// firma válida responde 401 y no hace nada. Responde 200 a todo lo que sí venía firmado, aunque no lo aplique (aviso
// repetido, pago desconocido): la pasarela reintenta lo que no se confirma y reintentar no lo arregla.
@Controller('pagos/webhook')
export class WebhookController {
  constructor(
    @Inject(ProcesarAvisoDePasarela)
    private readonly procesar: ProcesarAvisoDePasarela,
  ) {}

  @Publico()
  // Más holgado que el resto: un proveedor puede mandar ráfagas, y verificar una firma es barato.
  @Throttle({ default: { limit: 300, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.OK)
  @Post(':proveedor')
  async recibir(
    @Param('proveedor') proveedor: string,
    @Req() peticion: RawBodyRequest<Request>,
  ): Promise<{ resultado: ResultadoDelAviso }> {
    const cuerpoCrudo = peticion.rawBody;
    if (cuerpoCrudo === undefined || cuerpoCrudo.length === 0) {
      throw new ErrorDeValidacion(
        'El aviso no trae cuerpo',
        'pagos.aviso_invalido',
      );
    }
    const resultado = await this.procesar.ejecutar({
      proveedor,
      cuerpoCrudo,
      cuerpo: peticion.body as unknown,
      encabezados: peticion.headers,
    });
    return { resultado };
  }
}
