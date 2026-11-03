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
  esClaveValida,
  tipoMimeDeClave,
} from '../../salida/archivos/almacenes-de-archivos.js';
import { ClaveDeFotoDto } from './dto-de-directorio.js';

// Entrega las FOTOS DE PERFIL del almacén LOCAL (desarrollo, pruebas y staging): a diferencia de `/archivos`, sin
// firma ni vencimiento, porque una foto no es un documento privado y la familia la ve en cada búsqueda. Solo
// claves bajo «fotos/»: cualquier otra se rechaza, así un error de uso no convierte esta ruta en una forma de leer
// documentos de verificación. Con un almacén real (bucket) esta ruta no existe: el bucket entrega sus propias
// direcciones públicas.
@Controller('fotos')
export class FotosController {
  constructor(
    @Inject(ALMACEN_DE_ARCHIVOS) private readonly almacen: AlmacenDeArchivos,
  ) {}

  @Publico()
  @Get()
  async entregar(
    @Query() consulta: ClaveDeFotoDto,
    @Res() respuesta: Response,
  ): Promise<void> {
    const noEncontrado = () =>
      new RecursoNoEncontrado('No encontramos esa foto', 'foto.no_encontrada');
    if (!(this.almacen instanceof AlmacenDeArchivosLocal)) throw noEncontrado();
    if (
      !esClaveValida(consulta.clave) ||
      !consulta.clave.startsWith('fotos/')
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
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    // Pública y de larga duración a propósito: es una foto de perfil, no un documento.
    respuesta.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(ruta)
      .on('error', () => respuesta.destroy())
      .pipe(respuesta);
  }
}
