export const COMISION_FAMILIA = 0.08;
export const COMISION_PROFESIONAL = 0.1;

export interface ResumenServicio {
  subtotal: number;
  cargoFamilia: number;
  totalFamilia: number;
  pagoProfesional: number;
  ingresoPlataforma: number;
}

export function calcularServicio(
  tarifaHora: number,
  horas: number,
): ResumenServicio {
  const subtotal = tarifaHora * horas;
  const cargoFamilia = Math.round(subtotal * COMISION_FAMILIA);
  const totalFamilia = subtotal + cargoFamilia;
  const pagoProfesional = Math.round(subtotal * (1 - COMISION_PROFESIONAL));
  const ingresoPlataforma = totalFamilia - pagoProfesional;
  return { subtotal, cargoFamilia, totalFamilia, pagoProfesional, ingresoPlataforma };
}
// Verificación: calcularServicio(20000, 1) → totalFamilia 21600, pagoProfesional 18000, ingresoPlataforma 3600
