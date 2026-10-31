// Un paquete de la bolsa de horas prepago: la familia paga `precio` y recibe `credito` (la diferencia es el
// descuento). Es un dato de referencia: el equipo de negocio lo aprueba y lo carga; el código no inventa paquetes.
export interface PaqueteDeBolsa {
  codigo: string;
  // Solo para mostrar («equivale a unas 20 horas»): el saldo se lleva en pesos, no en horas.
  horasReferencia: number;
  descuentoBps: number;
  // Pesos que quedan en la bolsa al pagar.
  credito: number;
  // Pesos que paga la familia.
  precio: number;
  activo: boolean;
}
