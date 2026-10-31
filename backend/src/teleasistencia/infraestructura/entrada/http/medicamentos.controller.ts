import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import {
  DesactivarMedicamento,
  ListarMedicamentosDelDia,
  RegistrarMedicamento,
} from '../../../aplicacion/casos-de-uso/medicamentos.js';
import { CambiarEstadoDeToma } from '../../../aplicacion/casos-de-uso/tomas.js';
import type {
  VistaDeMedicamento,
  VistaDeMedicamentoDelDia,
  VistaDeToma,
} from '../../../aplicacion/vistas.js';
import {
  CambioDeTomaDto,
  ConsultaDeMedicamentosDto,
  MedicamentoDto,
} from './dto-de-teleasistencia.js';

const actorDe = (usuario: UsuarioAutenticado) => ({
  usuarioId: usuario.id,
  rol: usuario.rol,
});

// El plan de medicamentos y sus tomas. Todo caso de uso empieza consultando la política de acceso: la familia
// vinculada (con consentimiento) o el cuidador con un servicio activo; cualquier otra persona recibe 404.
@Controller()
export class MedicamentosController {
  constructor(
    @Inject(ListarMedicamentosDelDia)
    private readonly listar: ListarMedicamentosDelDia,
    @Inject(RegistrarMedicamento)
    private readonly registrar: RegistrarMedicamento,
    @Inject(DesactivarMedicamento)
    private readonly desactivar: DesactivarMedicamento,
    @Inject(CambiarEstadoDeToma) private readonly tomas: CambiarEstadoDeToma,
  ) {}

  @Roles('familiar', 'cuidador')
  @Get('adultos-mayores/:id/medicamentos')
  async medicamentos(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ConsultaDeMedicamentosDto,
  ): Promise<{ fecha: string; medicamentos: VistaDeMedicamentoDelDia[] }> {
    return this.listar.ejecutar(actorDe(usuario), id, consulta.fecha);
  }

  // Solo la familia cambia el plan.
  @Roles('familiar')
  @Post('adultos-mayores/:id/medicamentos')
  async nuevo(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: MedicamentoDto,
  ): Promise<{ medicamento: VistaDeMedicamento }> {
    return {
      medicamento: await this.registrar.ejecutar(actorDe(usuario), id, cuerpo),
    };
  }

  @Roles('familiar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('medicamentos/:id/desactivar')
  async dejarDeTomar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.desactivar.ejecutar(actorDe(usuario), id);
  }

  // Marcar («tomada») o deshacer («pendiente») una toma.
  @Roles('familiar', 'cuidador')
  @Patch('medicamentos/:id/tomas/:tomaId')
  async cambiarToma(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tomaId', ParseUUIDPipe) tomaId: string,
    @Body() cuerpo: CambioDeTomaDto,
  ): Promise<{ toma: VistaDeToma }> {
    const actor = actorDe(usuario);
    return {
      toma:
        cuerpo.estado === 'tomada'
          ? await this.tomas.marcarTomada(actor, id, tomaId)
          : await this.tomas.desmarcar(actor, id, tomaId),
    };
  }
}
