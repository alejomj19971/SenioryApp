import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { UsuarioActual } from '../../../../compartido/http/decoradores.js';
import { ActualizarPerfilPropio } from '../../../aplicacion/casos-de-uso/actualizar-perfil-propio.js';
import {
  ObtenerPerfilPropio,
  type Perfil,
} from '../../../aplicacion/casos-de-uso/obtener-perfil-propio.js';
import type { VistaDePerfil } from '../../../aplicacion/vistas.js';
import { ActualizarPerfilDto } from './dto-de-perfil.js';

// El perfil de quien tiene la sesión. Cualquier rol autenticado lo usa; el control de acceso es que
// cada quien solo puede pedir el suyo (el id sale del token, nunca de la ruta).
@Controller('yo')
export class PerfilController {
  constructor(
    @Inject(ObtenerPerfilPropio) private readonly obtener: ObtenerPerfilPropio,
    @Inject(ActualizarPerfilPropio)
    private readonly actualizar: ActualizarPerfilPropio,
  ) {}

  @Get()
  perfil(@UsuarioActual() usuario: UsuarioAutenticado): Promise<Perfil> {
    return this.obtener.ejecutar(usuario.id);
  }

  @Patch()
  async cambiar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: ActualizarPerfilDto,
  ): Promise<{ usuario: VistaDePerfil }> {
    return { usuario: await this.actualizar.ejecutar(usuario.id, cuerpo) };
  }
}
