import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import { RevocarConsentimiento } from '../../../aplicacion/casos-de-uso/revocar-consentimiento.js';

@Controller('consentimientos')
export class ConsentimientosController {
  constructor(
    @Inject(RevocarConsentimiento)
    private readonly revocar: RevocarConsentimiento,
  ) {}

  // Retira la autorización. Quien podría haberla otorgado puede revocarla; los demás reciben 404.
  @Roles('familiar', 'adulto_mayor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async revocarConsentimiento(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.revocar.ejecutar(usuario.id, id);
  }
}
