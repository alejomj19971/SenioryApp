import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import { ObtenerCuidadorEnTurno } from '../../../aplicacion/casos-de-uso/consultar-servicios.js';
import type { VistaDeCuidadorEnTurno } from '../../../aplicacion/vistas.js';

// El cuidador que está con la persona mayor ahora mismo. Comparte el prefijo `adultos-mayores` con Identidad
// pero es de Reservas: el dato sale de los servicios. El id se verifica contra los vínculos de quien pregunta.
@ApiTags('Reservas')
@Controller('adultos-mayores')
export class CuidadorEnTurnoController {
  constructor(
    @Inject(ObtenerCuidadorEnTurno)
    private readonly obtener: ObtenerCuidadorEnTurno,
  ) {}

  // Normalmente es uno solo, pero nada impide que una familia tenga más de un cuidador contratado a la vez.
  // Sin nadie en turno responde 200 con un arreglo vacío: no es un error, y así no se confunde con un 404 de
  // acceso.
  @Roles('familiar')
  @Get(':id/cuidador-en-turno')
  async enTurno(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ cuidadoresEnTurno: VistaDeCuidadorEnTurno[] }> {
    return { cuidadoresEnTurno: await this.obtener.ejecutar(usuario.id, id) };
  }
}
