import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RecursoNoEncontrado } from '../../../../compartido/dominio/errores.js';
import { Publico } from '../../../../compartido/http/decoradores.js';
import {
  ALMACEN_DE_ARCHIVOS,
  type AlmacenDeArchivos,
} from '../../../aplicacion/puertos/salida/almacen-de-archivos.js';
import {
  AlmacenDeArchivosLocal,
  tipoMimeDeClave,
} from '../../salida/archivos/almacenes-de-archivos.js';
import { ArchivoFirmadoDto } from './dto-de-directorio.js';

// Entrega los archivos del almacén LOCAL (desarrollo, pruebas y staging) a quien trae una dirección firmada y
// vigente. Es pública a propósito: la firma es la credencial, y por eso vence en minutos. Con un almacén
// real (bucket privado) esta ruta no existe: el bucket entrega sus propias direcciones firmadas.
// Cualquier falla (firma mala, vencida, archivo ausente) responde igual, «no encontrado», sin pistas.
@Controller('archivos')
export class ArchivosController {
  constructor(
    @Inject(ALMACEN_DE_ARCHIVOS) private readonly almacen: AlmacenDeArchivos,
  ) {}

  @Publico()
  @Get()
  async entregar(
    @Query() consulta: ArchivoFirmadoDto,
    @Res() respuesta: Response,
  ): Promise<void> {
    const noEncontrado = () =>
      new RecursoNoEncontrado(
        'No encontramos ese archivo',
        'archivo.no_encontrado',
      );
    if (!(this.almacen instanceof AlmacenDeArchivosLocal)) throw noEncontrado();
    if (
      !this.almacen.firmaEsValida(
        consulta.clave,
        consulta.expira,
        consulta.firma,
      )
    ) {
      throw noEncontrado();
    }
    const ruta = this.almacen.rutaDe(consulta.clave);
    const tamano = await stat(ruta).then(
      (datos) => datos.size,
      () => null,
    );
    if (tamano === null) throw noEncontrado();

    respuesta.setHeader('Content-Type', tipoMimeDeClave(consulta.clave));
    respuesta.setHeader('Content-Length', String(tamano));
    respuesta.setHeader('Content-Disposition', 'inline');
    // Sin sniffing y sin caché compartida: es un documento de una persona.
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.setHeader('Cache-Control', 'private, no-store');
    createReadStream(ruta)
      .on('error', () => respuesta.destroy())
      .pipe(respuesta);
  }
}
