// Lo único de Pagos (además de cotizar) que otros módulos pueden usar. Son datos mínimos: ningún módulo toca las
// tablas de `pagos`.
export interface ConsultaDePagos {
  // Reservas, al solicitar un servicio que se paga con la bolsa: ¿le alcanza el saldo disponible? Es una
  // comprobación a tiempo: lo que cuenta es la reserva que se hace al confirmarse el servicio, que puede fallar
  // si mientras tanto se gastó el saldo.
  bolsaAlcanzaPara(familiarId: string, monto: number): Promise<boolean>;
}

export const CONSULTA_DE_PAGOS = Symbol('ConsultaDePagos');
