// Lo que el backend RESPONDE en Pagos (M7). Contrato de lo que el frontend lee; lo vigilan las pruebas de contrato.
// La familia ve subtotal, cargo, total, estado y vencimiento; NUNCA el pago al cuidador, el ingreso de la plataforma
// ni la referencia de la pasarela.

export interface MovimientoDeBolsaDelBackend {
  id: string;
  tipo: string;
  // Positivo si entra saldo, negativo si sale.
  deltaDisponible: number;
  servicioId: string | null;
  creadoEn: string;
}

// `GET /bolsa`
export interface RespuestaDeBolsa {
  bolsa: {
    // Pesos que se pueden gastar ya.
    saldoDisponible: number;
    // Pesos apartados para servicios confirmados que aún no terminan.
    saldoReservado: number;
    movimientos: MovimientoDeBolsaDelBackend[];
  };
}
