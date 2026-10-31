import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import { ObtenerAdultoMayor } from '../../../aplicacion/casos-de-uso/obtener-adulto-mayor.js';
import { OtorgarConsentimiento } from '../../../aplicacion/casos-de-uso/otorgar-consentimiento.js';
import { RegistrarAdultoMayor } from '../../../aplicacion/casos-de-uso/registrar-adulto-mayor.js';
import type {
  VistaDeAdultoMayor,
  VistaDeConsentimiento,
} from '../../../aplicacion/vistas.js';
import {
  ConsentimientoDto,
  RegistroDeAdultoMayorDto,
} from './dto-de-perfil.js';

// Las personas mayores que un familiar cuida. El id de la ruta siempre se verifica contra los vínculos
// de quien pregunta: sin vínculo, la respuesta es 404 (no se revela que la persona existe).
@Controller('adultos-mayores')
export class AdultosMayoresController {
  constructor(
    @Inject(RegistrarAdultoMayor)
    private readonly registrar: RegistrarAdultoMayor,
    @Inject(ObtenerAdultoMayor) private readonly obtener: ObtenerAdultoMayor,
    @Inject(OtorgarConsentimiento)
    private readonly otorgar: OtorgarConsentimiento,
  ) {}

  @Roles('familiar')
  @Post()
  async registro(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: RegistroDeAdultoMayorDto,
  ): Promise<{ adultoMayor: VistaDeAdultoMayor }> {
    return { adultoMayor: await this.registrar.ejecutar(usuario.id, cuerpo) };
  }

  @Roles('familiar')
  @Get(':id')
  async detalle(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ adultoMayor: VistaDeAdultoMayor }> {
    return { adultoMayor: await this.obtener.ejecutar(usuario.id, id) };
  }

  // Lo otorga un familiar vinculado o la propia persona mayor (si tiene cuenta).
  @Roles('familiar', 'adulto_mayor')
  @Post(':id/consentimientos')
  async consentir(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: ConsentimientoDto,
  ): Promise<{ consentimiento: VistaDeConsentimiento }> {
    return {
      consentimiento: await this.otorgar.ejecutar(usuario.id, id, cuerpo),
    };
  }
}
