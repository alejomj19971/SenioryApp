// Espera a que algo que ocurre en segundo plano llegue a su destino. Para los efectos de otras instancias de la
// aplicación sobre la misma base compartida (otro archivo de prueba entregó un aviso, por ejemplo): esta prueba no
// puede esperar «sus» entregas, porque no son suyas. Consulta cada 50 ms y falla con el último valor visto si pasan
// `limiteMs` sin que se cumpla.
export async function esperarQue<T>(
  consultar: () => Promise<T>,
  cumple: (valor: T) => boolean,
  limiteMs = 5_000,
): Promise<T> {
  const hasta = Date.now() + limiteMs;
  let valor = await consultar();
  while (!cumple(valor) && Date.now() < hasta) {
    await new Promise((resolver) => setTimeout(resolver, 50));
    valor = await consultar();
  }
  return valor;
}
