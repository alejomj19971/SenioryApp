import type { Request } from 'express';
import { ErrorDeValidacion } from '../../../../compartido/dominio/errores.js';

// Lee el cuerpo de una petición como bytes, con un tope de tamaño. Se usa para subir archivos, que no pasan por el
// lector de JSON (límite de 100 KB). Se llama DESPUÉS de los guardias de autenticación: un desconocido no hace que el
// servidor reciba megabytes.
//
// Si el cliente anuncia un tamaño mayor al tope (`Content-Length`) se rechaza sin leer nada; si no lo anuncia o
// miente, se deja de acumular al pasar el tope.
export function leerCuerpoCrudo(
  peticion: Request,
  maximoBytes: number,
): Promise<Buffer> {
  const demasiado = () =>
    new ErrorDeValidacion(
      'El archivo debe pesar entre 1 byte y 5 MB',
      'documento.tamano_invalido',
    );
  const anunciado = Number(peticion.headers['content-length']);
  if (Number.isFinite(anunciado) && anunciado > maximoBytes) {
    return Promise.reject(demasiado());
  }
  return new Promise((resolver, rechazar) => {
    const trozos: Buffer[] = [];
    let total = 0;
    let excedido = false;
    peticion.on('data', (trozo: Buffer) => {
      if (excedido) return;
      total += trozo.length;
      if (total > maximoBytes) {
        excedido = true;
        trozos.length = 0;
        return;
      }
      trozos.push(trozo);
    });
    peticion.on('end', () => {
      if (excedido) rechazar(demasiado());
      else resolver(Buffer.concat(trozos));
    });
    peticion.on('error', rechazar);
  });
}
