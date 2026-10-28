import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

const LARGO_MAXIMO = 254; // RFC 5321
const LARGO_MAXIMO_PARTE_LOCAL = 64;

// Caracteres que admite la parte local sin comillas (RFC 5322, solo ASCII).
const PARTE_LOCAL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// Etiquetas de dominio: letras, números y guiones, sin empezar ni terminar en guion.
const ETIQUETA = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z]{2,}$/;

// Correo electrónico normalizado: sin espacios sobrantes y en minúsculas (Andrea@x.co y andrea@x.co
// son la misma cuenta). Solo admite ASCII: los correos con caracteres internacionales casi no tienen
// soporte en los proveedores, y rechazarlos aquí evita cuentas a las que no se podría escribir.
// Es una validación práctica de forma, no una prueba de que el buzón exista.
export class Correo {
  private constructor(readonly valor: string) {}

  static crear(texto: string): Correo {
    const normalizado = texto.trim().toLowerCase();
    if (!esValido(normalizado)) {
      throw new ErrorDeValidacion('El correo no es válido', 'correo.invalido');
    }
    return new Correo(normalizado);
  }

  igualA(otro: Correo): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }
}

function esValido(correo: string): boolean {
  if (correo.length === 0 || correo.length > LARGO_MAXIMO) return false;
  const partes = correo.split('@');
  if (partes.length !== 2) return false;
  const [local, dominio] = partes as [string, string];
  if (local.length > LARGO_MAXIMO_PARTE_LOCAL || !PARTE_LOCAL.test(local)) {
    return false;
  }
  const etiquetas = dominio.split('.');
  const tld = etiquetas.at(-1) ?? '';
  return (
    etiquetas.length >= 2 &&
    etiquetas.every((e) => ETIQUETA.test(e)) &&
    TLD.test(tld)
  );
}
