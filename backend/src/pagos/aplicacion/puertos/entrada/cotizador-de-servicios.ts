// El costo completo de un servicio, en pesos enteros. Es la versión INTERNA: trae el pago al profesional y el
// ingreso de la plataforma, que una familia nunca debe ver. Reservas (M4) la usa para guardar el servicio con
// los montos con los que se cotizó.
export interface CotizacionDeServicio {
  cuidadorId: string;
  horas: number;
  // La tarifa se toma del directorio en el momento de cotizar; el cliente nunca la envía.
  tarifaHora: number;
  // Con qué versión de las comisiones se calculó: el servicio la guarda y no cambia aunque cambien las comisiones.
  politicaVersion: number;
  comisionFamiliaBps: number;
  subtotal: number;
  cargoFamilia: number;
  totalFamilia: number;
  pagoProfesional: number;
  ingresoPlataforma: number;
}

// Lo único de Pagos que otros módulos pueden usar en esta etapa.
export interface CotizadorDeServicios {
  // Lanza RecursoNoEncontrado (`cuidador.no_encontrado`) si el cuidador no existe o no está visible: no se
  // cotiza a quien una familia no puede contratar. Lanza ErrorDeValidacion si las horas no son de 1 a 8.
  cotizar(cuidadorId: string, horas: number): Promise<CotizacionDeServicio>;
}

export const COTIZADOR_DE_SERVICIOS = Symbol('CotizadorDeServicios');
