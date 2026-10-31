import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDePagos } from '../puertos/entrada/consulta-de-pagos.js';
import type {
  RepositorioBolsas,
  RepositorioLiquidaciones,
  RepositorioPagos,
  RepositorioPaquetes,
} from '../puertos/salida/repositorios.js';
import {
  vistaDeBolsa,
  vistaDeLiquidacion,
  vistaDePago,
  vistaDePaquete,
  type VistaDeBolsa,
  type VistaDeLiquidacion,
  type VistaDePago,
  type VistaDePaquete,
} from '../vistas.js';

const MOVIMIENTOS_EN_LA_BOLSA = 20;
const PAGOS_EN_EL_LISTADO = 50;
const LIQUIDACIONES_EN_EL_LISTADO = 50;

// Lo que cualquiera puede ver: qué paquetes de bolsa hay a la venta. Sin filas hasta que el equipo de negocio los
// apruebe (docs/PENDIENTES.md), y entonces la lista va vacía: nunca se inventan paquetes.
export class ListarPaquetes {
  constructor(private readonly paquetes: RepositorioPaquetes) {}

  async ejecutar(): Promise<VistaDePaquete[]> {
    return (await this.paquetes.listarActivos()).map(vistaDePaquete);
  }
}

// El saldo de la bolsa de la familia y sus últimos movimientos. Una familia que nunca compró tiene la bolsa en
// cero (no se crea una fila solo por mirarla).
export class ObtenerMiBolsa {
  constructor(private readonly bolsas: RepositorioBolsas) {}

  async ejecutar(familiarId: string): Promise<VistaDeBolsa> {
    const bolsa = await this.bolsas.buscarPorFamiliar(familiarId);
    if (bolsa === null)
      return { saldoDisponible: 0, saldoReservado: 0, movimientos: [] };
    return vistaDeBolsa(
      bolsa,
      await this.bolsas.ultimosMovimientos(bolsa.id, MOVIMIENTOS_EN_LA_BOLSA),
    );
  }
}

// Los pagos de la familia, los más recientes primero. Solo los suyos: el pago al cuidador y el ingreso de la
// plataforma no salen en ninguna vista de la familia.
export class ListarMisPagos {
  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly minutosParaPagar: number,
  ) {}

  async ejecutar(pagadorId: string): Promise<VistaDePago[]> {
    return (
      await this.pagos.listarDePagador(pagadorId, PAGOS_EN_EL_LISTADO)
    ).map((pago) => vistaDePago(pago, this.minutosParaPagar));
  }
}

// Lo que se le debe al cuidador y lo que ya se le pagó. Una cuenta que no es de un cuidador no tiene liquidaciones:
// la lista va vacía.
export class ListarMisLiquidaciones {
  constructor(
    private readonly liquidaciones: RepositorioLiquidaciones,
    private readonly directorio: ConsultaDeDirectorio,
  ) {}

  async ejecutar(usuarioId: string): Promise<VistaDeLiquidacion[]> {
    const cuidador = await this.directorio.obtenerCuidadorPorUsuario(usuarioId);
    if (cuidador === null) return [];
    return (
      await this.liquidaciones.listarDeCuidador(
        cuidador.cuidadorId,
        LIQUIDACIONES_EN_EL_LISTADO,
      )
    ).map(vistaDeLiquidacion);
  }
}

export class ConsultarPagos implements ConsultaDePagos {
  constructor(private readonly bolsas: RepositorioBolsas) {}

  async bolsaAlcanzaPara(familiarId: string, monto: number): Promise<boolean> {
    const bolsa = await this.bolsas.buscarPorFamiliar(familiarId);
    return bolsa?.alcanzaPara(monto) ?? false;
  }
}
