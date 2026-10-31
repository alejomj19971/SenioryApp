import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import {
  RecursoNoEncontrado,
  ServicioNoDisponible,
} from '../../../compartido/dominio/errores.js';
import { Dinero } from '../../../compartido/dominio/dinero.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import { calcularServicio } from '../../dominio/calculo-de-servicio.js';
import type {
  CotizacionDeServicio,
  CotizadorDeServicios,
} from '../puertos/entrada/cotizador-de-servicios.js';
import type { RepositorioPoliticasDePrecios } from '../puertos/salida/repositorio-politicas-de-precios.js';

// Cotiza un servicio: cuánto paga la familia y cuánto recibe el profesional. La tarifa sale SIEMPRE del
// directorio (el cliente solo dice a quién y cuántas horas), y las comisiones, de la política vigente.
// Solo lee: no guarda nada, así que no necesita transacción.
export class CotizarServicio implements CotizadorDeServicios {
  constructor(
    private readonly directorio: ConsultaDeDirectorio,
    private readonly politicas: RepositorioPoliticasDePrecios,
    private readonly reloj: Reloj,
  ) {}

  async cotizar(
    cuidadorId: string,
    horas: number,
  ): Promise<CotizacionDeServicio> {
    const cuidador =
      await this.directorio.obtenerCuidadorParaContratar(cuidadorId);
    if (cuidador === null) {
      throw new RecursoNoEncontrado(
        'No encontramos a ese cuidador',
        'cuidador.no_encontrado',
      );
    }
    const politica = await this.politicas.obtenerVigente(this.reloj.ahora());
    if (politica === null) {
      // No se inventan comisiones: sin política no se cotiza (la migración siembra la versión 1).
      throw new ServicioNoDisponible(
        'No se puede calcular el costo por ahora',
        'cotizacion.sin_politica',
      );
    }
    const desglose = calcularServicio(
      Dinero.pesos(cuidador.tarifaHora),
      horas,
      politica,
    );
    return {
      cuidadorId: cuidador.id,
      horas,
      tarifaHora: cuidador.tarifaHora,
      politicaVersion: politica.version,
      comisionFamiliaBps: politica.comisionFamiliaBps,
      subtotal: desglose.subtotal.valor,
      cargoFamilia: desglose.cargoFamilia.valor,
      totalFamilia: desglose.totalFamilia.valor,
      pagoProfesional: desglose.pagoProfesional.valor,
      ingresoPlataforma: desglose.ingresoPlataforma.valor,
    };
  }
}
