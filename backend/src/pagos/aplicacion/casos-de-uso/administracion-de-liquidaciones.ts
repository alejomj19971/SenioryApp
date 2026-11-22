import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { UsuarioAutenticado } from '../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { LiquidacionId } from '../../dominio/ids.js';
import type { RepositorioLiquidaciones } from '../puertos/salida/repositorios.js';
import {
  vistaDeLiquidacion,
  vistaDeLiquidacionParaAdmin,
  type VistaDeLiquidacion,
  type VistaDeLiquidacionParaAdmin,
} from '../vistas.js';

const LIQUIDACIONES_POR_PAGAR_EN_EL_LISTADO = 50;

// La cola del administrador: lo que ya se puede pagar (enviada por el dispersor) y lo que todavía no se ha
// intentado (pendiente, por si el dispersor está deshabilitado). Trae a quién contactar aunque el cuidador
// ya no esté visible: un servicio ya prestado se paga igual.
export class ListarLiquidacionesPorPagar {
  constructor(
    private readonly liquidaciones: RepositorioLiquidaciones,
    private readonly directorio: ConsultaDeDirectorio,
  ) {}

  async ejecutar(): Promise<VistaDeLiquidacionParaAdmin[]> {
    const encontradas = await this.liquidaciones.listarPorEstados(
      ['enviada', 'pendiente'],
      LIQUIDACIONES_POR_PAGAR_EN_EL_LISTADO,
    );
    const vistas: VistaDeLiquidacionParaAdmin[] = [];
    for (const liquidacion of encontradas) {
      const contacto = await this.directorio.obtenerContactoDeCuidador(
        liquidacion.cuidadorId,
      );
      vistas.push(
        vistaDeLiquidacionParaAdmin(liquidacion, {
          nombre: contacto?.nombre ?? '(cuidador no encontrado)',
          telefono: contacto?.telefono ?? '',
        }),
      );
    }
    return vistas;
  }
}

// El administrador, después de transferir de verdad por fuera del sistema, lo confirma aquí. `referencia`
// es lo que escribió (p. ej. «Nequi 20/11, comprobante #123»): siempre debe quedar un rastro de qué se hizo.
export class ConfirmarPagoDeLiquidacion {
  constructor(
    private readonly liquidaciones: RepositorioLiquidaciones,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    admin: UsuarioAutenticado,
    id: LiquidacionId,
    referencia: string,
  ): Promise<VistaDeLiquidacion> {
    const liquidacion = await this.unidadDeTrabajo.ejecutar(async () => {
      const encontrada =
        await this.liquidaciones.buscarPorIdParaActualizar(id);
      if (encontrada === null) {
        throw new RecursoNoEncontrado(
          'La liquidación no existe',
          'liquidacion.no_encontrada',
        );
      }
      encontrada.registrarPago(referencia, this.reloj.ahora());
      await this.liquidaciones.actualizar(encontrada);
      return encontrada;
    });
    await this.auditoria.registrar({
      actorId: admin.id,
      accion: 'pagos.confirmar_pago_de_liquidacion',
      recursoTipo: 'liquidacion',
      recursoId: liquidacion.id,
      resultado: 'permitido',
    });
    return vistaDeLiquidacion(liquidacion);
  }
}
