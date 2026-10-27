import { Module } from '@nestjs/common';
import { CompartidoModule } from './compartido/compartido.module.js';
import { BaseDeDatosModule } from './compartido/infraestructura/base-de-datos/base-de-datos.module.js';
import { ConfiguracionModule } from './configuracion/configuracion.module.js';
import { SaludController } from './salud/salud.controller.js';

@Module({
  imports: [ConfiguracionModule, BaseDeDatosModule, CompartidoModule],
  controllers: [SaludController],
})
export class AppModule {}
