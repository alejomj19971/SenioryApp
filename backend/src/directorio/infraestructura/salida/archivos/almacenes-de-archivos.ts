import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
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

// A qué carpeta de Cloudinary va una clave, y cómo se sube y se sirve: las fotos de perfil son públicas (se
// ven en cada búsqueda) y los documentos de verificación son privados (solo el propio cuidador y un revisor).
// El formato se manda SIEMPRE explícito: sin él, Cloudinary no sabe qué extensión servir y la deja fuera de
// la dirección.
function datosDeCloudinary(clave: string): {
  tipoDeRecurso: 'image' | 'raw';
  tipoDeEntrega: 'upload' | 'authenticated';
  publicId: string;
  formato: string;
} {
  const esFoto = clave.startsWith('fotos/');
  const puntoFinal = clave.lastIndexOf('.');
  return {
    tipoDeRecurso: esFoto ? 'image' : 'raw',
    tipoDeEntrega: esFoto ? 'upload' : 'authenticated',
    publicId: clave.slice(0, puntoFinal),
    formato: clave.slice(puntoFinal + 1),
  };
}

export interface OpcionesDelAlmacenCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

// Almacén REAL (M2/M9): sube los archivos a Cloudinary y los sirve directo desde su CDN, con sus propias
// direcciones (esta clase nunca pasa por `/archivos` ni `/fotos`: esas rutas son solo del almacén local).
//
// La foto de perfil es pública (`type: upload`), igual que en el almacén local. El documento de verificación es
// privado (`type: authenticated`, con `sign_url` para que la dirección no se pueda adivinar ni construir sin
// las credenciales del servidor) — PERO, a diferencia del almacén local, esta firma NO vence por sí sola: Cloudinary
// solo expira firmas con su función de pago «token-based authentication» (`auth_token`), que esta cuenta no
// tiene activada todavía. Mientras tanto, la URL sigue siendo privada (nadie puede construirla sin el secreto),
// solo que no «vence en minutos» como promete el puerto. Activar esa función es un paso aparte (Cloudinary →
// Settings → Security) que no bloquea usar este almacén.
export class AlmacenDeArchivosCloudinary implements AlmacenDeArchivos {
  readonly disponible = true;

  constructor(opciones: OpcionesDelAlmacenCloudinary) {
    cloudinary.config({
      cloud_name: opciones.cloudName,
      api_key: opciones.apiKey,
      api_secret: opciones.apiSecret,
      secure: true,
      // Sin el «?_a=…» de telemetría del SDK en cada dirección: no aporta nada a Seniory.
      analytics: false,
    });
  }

  async guardar(
    clave: string,
    contenido: Uint8Array,
    _tipoMime: string,
  ): Promise<void> {
    if (!esClaveValida(clave)) {
      throw new Error('La clave del archivo no tiene un formato válido');
    }
    const { tipoDeRecurso, tipoDeEntrega, publicId, formato } =
      datosDeCloudinary(clave);
    await new Promise<void>((resolver, rechazar) => {
      const flujo = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: tipoDeRecurso,
          type: tipoDeEntrega,
          format: formato,
          overwrite: true,
          invalidate: true,
        },
        (error) => (error ? rechazar(error) : resolver()),
      );
      flujo.end(Buffer.from(contenido));
    });
  }

  urlFirmada(clave: string, _vigenciaEnSegundos: number): string {
    if (!esClaveValida(clave)) {
      throw new Error('La clave del archivo no tiene un formato válido');
    }
    const { tipoDeRecurso, tipoDeEntrega, publicId, formato } =
      datosDeCloudinary(clave);
    return cloudinary.url(publicId, {
      format: formato,
      resource_type: tipoDeRecurso,
      type: tipoDeEntrega,
      sign_url: true,
      secure: true,
    });
  }

  urlPublica(clave: string): string {
    if (!esClaveValida(clave) || !clave.startsWith('fotos/')) {
      throw new Error('Esa clave no se puede servir como archivo público');
    }
    const { tipoDeRecurso, publicId, formato } = datosDeCloudinary(clave);
    return cloudinary.url(publicId, {
      format: formato,
      resource_type: tipoDeRecurso,
      type: 'upload',
      secure: true,
    });
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
