import type { CotizacionDeServicio } from './puertos/entrada/cotizador-de-servicios.js';

// Lo que ve la familia al cotizar. Es una lista blanca: el pago al profesional, el ingreso de la plataforma y
// la comisión del profesional NO están aquí. Una prueba de instantánea vigila que no crezca sin que se note.
export interface VistaDeCotizacion {
  cuidadorId: string;
  horas: number;
  tarifaHora: number;
  subtotal: number;
  cargoDeServicio: {
    // En porcentaje legible (8 para 800 puntos básicos; 7,5 para 750).
    porcentaje: number;
    monto: number;
  };
  totalFamilia: number;
  // Se envía de vuelta al contratar para que el servidor sepa con qué comisiones se mostró el precio.
  politicaVersion: number;
}

export function vistaDeCotizacion(
  cotizacion: CotizacionDeServicio,
): VistaDeCotizacion {
  return {
    cuidadorId: cotizacion.cuidadorId,
    horas: cotizacion.horas,
    tarifaHora: cotizacion.tarifaHora,
    subtotal: cotizacion.subtotal,
    cargoDeServicio: {
      porcentaje: cotizacion.comisionFamiliaBps / 100,
      monto: cotizacion.cargoFamilia,
    },
    totalFamilia: cotizacion.totalFamilia,
    politicaVersion: cotizacion.politicaVersion,
  };
}
