import type { Dinero } from '../../compartido/dominio/dinero.js';
import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { PoliticaDePrecios } from './politica-de-precios.js';

// Las horas de un servicio: el mismo rango que el CHECK `servicios_horas_validas` de la base de datos.
export const HORAS_MINIMAS = 1;
export const HORAS_MAXIMAS = 8;

export interface DesgloseDeServicio {
  // tarifa por hora × horas.
  subtotal: Dinero;
  // Lo que la plataforma le suma a la familia.
  cargoFamilia: Dinero;
  // Lo que paga la familia: subtotal + cargo.
  totalFamilia: Dinero;
  // Lo que recibe el profesional: subtotal menos la comisión que se le descuenta.
  pagoProfesional: Dinero;
  // Lo que se queda la plataforma: total de la familia − pago al profesional.
  ingresoPlataforma: Dinero;
}

// El costo de un servicio. Función pura, en pesos enteros: nada de decimales, y los redondeos son siempre al
// peso más cercano con la mitad hacia arriba (`Dinero.porcentaje`).
//
// Invariantes (con pruebas de propiedades):
//   totalFamilia      = subtotal + cargoFamilia
//   subtotal          = pagoProfesional + comisión del profesional   (ningún peso se pierde)
//   ingresoPlataforma = totalFamilia − pagoProfesional ≥ 0
//
// El pago al profesional se calcula como «subtotal − comisión» y no como «subtotal × 90 %»: así el redondeo
// de la mitad nunca regala ni pierde un peso entre el profesional y la plataforma.
export function calcularServicio(
  tarifaHora: Dinero,
  horas: number,
  politica: PoliticaDePrecios,
): DesgloseDeServicio {
  if (tarifaHora.valor <= 0) {
    throw new ErrorDeValidacion(
      'La tarifa por hora debe ser mayor que cero',
      'servicio.tarifa_invalida',
    );
  }
  if (
    !Number.isInteger(horas) ||
    horas < HORAS_MINIMAS ||
    horas > HORAS_MAXIMAS
  ) {
    throw new ErrorDeValidacion(
      `Las horas deben ser un entero entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}`,
      'servicio.horas_invalidas',
    );
  }
  const subtotal = tarifaHora.multiplicarPor(horas);
  const cargoFamilia = subtotal.porcentaje(politica.comisionFamiliaBps);
  const totalFamilia = subtotal.sumar(cargoFamilia);
  const comisionProfesional = subtotal.porcentaje(
    politica.comisionProfesionalBps,
  );
  const pagoProfesional = subtotal.restar(comisionProfesional);
  const ingresoPlataforma = totalFamilia.restar(pagoProfesional);
  return {
    subtotal,
    cargoFamilia,
    totalFamilia,
    pagoProfesional,
    ingresoPlataforma,
  };
}
