import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { AlmacenDeArchivos } from '../../../aplicacion/puertos/salida/almacen-de-archivos.js';

// Una clave de almacén es «carpeta/uuid.extensión»: la genera el servidor, nunca la persona. Se valida
// siempre antes de tocar el disco (nada de «../» ni rutas absolutas).
export const FORMATO_DE_CLAVE =
  /^[a-z][a-z0-9-]{0,30}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

export function esClaveValida(clave: string): boolean {
  return FORMATO_DE_CLAVE.test(clave);
}

const TIPOS_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export function tipoMimeDeClave(clave: string): string {
  const extension = clave.slice(clave.lastIndexOf('.') + 1);
  return TIPOS_POR_EXTENSION[extension] ?? 'application/octet-stream';
}

function firmaDe(secreto: string, clave: string, expira: number): string {
  return createHmac('sha256', secreto)
    .update(`${clave}\n${expira}`)
    .digest('base64url');
}

export interface OpcionesDelAlmacenLocal {
  // Carpeta donde se guardan los archivos.
  directorio: string;
  // Con él se firman las direcciones: sin la firma correcta, un archivo no se entrega.
  secreto: string;
  // Dirección pública de la API (por ejemplo, http://localhost:3001/api/v1) a la que apuntan las URL.
  urlPublicaDeLaApi: string;
  // El reloj, en milisegundos. Se inyecta para poder avanzar el tiempo en las pruebas.
  ahoraMs: () => number;
}

// SOLO PARA DESARROLLO, PRUEBAS Y STAGING: guarda los archivos en una carpeta del servidor y entrega
// direcciones firmadas que vencen en minutos. En producción no se admite (la configuración lo rechaza): los
// discos de los hosting suelen perder los archivos en cada despliegue, y aquí hay documentos de personas.
export class AlmacenDeArchivosLocal implements AlmacenDeArchivos {
  readonly disponible = true;

  constructor(private readonly opciones: OpcionesDelAlmacenLocal) {}

  async guardar(
    clave: string,
    contenido: Uint8Array,
    _tipoMime: string,
  ): Promise<void> {
    const ruta = this.rutaDe(clave);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido);
  }

  urlFirmada(clave: string, vigenciaEnSegundos: number): string {
    if (!esClaveValida(clave)) {
      throw new Error('La clave del archivo no tiene un formato válido');
    }
    const expira =
      Math.floor(this.opciones.ahoraMs() / 1000) + vigenciaEnSegundos;
    const firma = firmaDe(this.opciones.secreto, clave, expira);
    const consulta = new URLSearchParams({
      clave,
      expira: String(expira),
      firma,
    });
    return `${this.opciones.urlPublicaDeLaApi}/archivos?${consulta.toString()}`;
  }

  // La foto de perfil: pública, sin firma ni vencimiento. Solo para claves bajo «fotos/»; cualquier otra carpeta
  // (documentos de verificación) lanza, para que un error de uso no filtre un archivo privado.
  urlPublica(clave: string): string {
    if (!esClaveValida(clave) || !clave.startsWith('fotos/')) {
      throw new Error('Esa clave no se puede servir como archivo público');
    }
    return `${this.opciones.urlPublicaDeLaApi}/fotos?${new URLSearchParams({ clave }).toString()}`;
  }

  // ¿La dirección que llegó es una de las que firmamos, y todavía no venció? Comparación en tiempo constante.
  firmaEsValida(clave: string, expira: number, firma: string): boolean {
    if (!esClaveValida(clave)) return false;
    if (!Number.isSafeInteger(expira)) return false;
    if (expira * 1000 <= this.opciones.ahoraMs()) return false;
    const esperada = Buffer.from(firmaDe(this.opciones.secreto, clave, expira));
    const recibida = Buffer.from(firma);
    return (
      esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
    );
  }

  // La ruta en disco de una clave, siempre dentro de la carpeta del almacén.
  rutaDe(clave: string): string {
    if (!esClaveValida(clave)) {
      throw new Error('La clave del archivo no tiene un formato válido');
    }
    const base = resolve(this.opciones.directorio);
    const ruta = resolve(base, clave);
    if (!ruta.startsWith(base + sep)) {
      throw new Error('La clave del archivo sale de la carpeta del almacén');
    }
    return ruta;
  }
}

// Producción mientras no haya un almacén real: no guarda ni entrega nada, y lo dice.
export class AlmacenDeArchivosDeshabilitado implements AlmacenDeArchivos {
  readonly disponible = false;

  guardar(): Promise<void> {
    return Promise.reject(
      new Error('No hay un almacén de archivos configurado'),
    );
  }

  urlFirmada(): string {
    throw new Error('No hay un almacén de archivos configurado');
  }

  urlPublica(): string {
    throw new Error('No hay un almacén de archivos configurado');
  }
}
