import { Controller, Get } from '@nestjs/common';

export interface EstadoDeSalud {
  estado: 'ok';
}

// Solo indica que el proceso está vivo. La verificación de la base de datos
// (/salud/listo) llega con la capa HTTP transversal (docs/backend/M0, PR 5).
@Controller('salud')
export class SaludController {
  @Get()
  vivo(): EstadoDeSalud {
    return { estado: 'ok' };
  }
}
