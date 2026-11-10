import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AlmacenDeArchivosCloudinary,
  AlmacenDeArchivosDeshabilitado,
  AlmacenDeArchivosLocal,
  esClaveValida,
  tipoMimeDeClave,
} from '../../../../src/directorio/infraestructura/salida/archivos/almacenes-de-archivos.js';

const CLAVE = 'hojas-de-vida/0198aaaa-0000-7000-8000-000000000001.pdf';
const SECRETO = 'un-secreto-de-prueba-de-32-caracteres!';

describe('esClaveValida', () => {
  it.each([
    CLAVE,
    'fotos/0198aaaa-0000-7000-8000-000000000001.jpg',
    'fotos/0198aaaa-0000-7000-8000-000000000001.png',
  ])('acepta %s', (clave) => {
    expect(esClaveValida(clave)).toBe(true);
  });

  it.each([
    '',
    '../secreto.pdf',
    'hojas-de-vida/../../.env',
    '/etc/passwd',
    'C:\\Windows\\system.pdf',
    'hojas-de-vida/no-es-uuid.pdf',
    'hojas-de-vida/0198aaaa-0000-7000-8000-000000000001.exe',
    'hojas-de-vida/0198aaaa-0000-7000-8000-000000000001.pdf/extra',
    'hojas-de-vida/0198aaaa-0000-7000-8000-000000000001.pdf\0.png',
    'Hojas/0198aaaa-0000-7000-8000-000000000001.pdf',
    'a/b/0198aaaa-0000-7000-8000-000000000001.pdf',
  ])('rechaza %j', (clave) => {
    expect(esClaveValida(clave)).toBe(false);
  });
});

describe('tipoMimeDeClave', () => {
  it('deduce el tipo por la extensión', () => {
    expect(tipoMimeDeClave(CLAVE)).toBe('application/pdf');
    expect(tipoMimeDeClave('fotos/x.jpg')).toBe('image/jpeg');
    expect(tipoMimeDeClave('fotos/x.png')).toBe('image/png');
    expect(tipoMimeDeClave('fotos/x.bin')).toBe('application/octet-stream');
  });
});

describe('AlmacenDeArchivosLocal', () => {
  let carpeta: string;
  let ahora: number;
  let almacen: AlmacenDeArchivosLocal;

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'seniory-unidad-'));
    ahora = Date.parse('2026-10-21T15:00:00.000Z');
    almacen = new AlmacenDeArchivosLocal({
      directorio: carpeta,
      secreto: SECRETO,
      urlPublicaDeLaApi: 'http://localhost:3001/api/v1',
      ahoraMs: () => ahora,
    });
  });

  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  const parametros = (url: string) => new URL(url).searchParams;

  it('guarda el archivo dentro de su carpeta', async () => {
    await almacen.guardar(
      CLAVE,
      Buffer.from('%PDF-contenido'),
      'application/pdf',
    );

    expect((await readFile(almacen.rutaDe(CLAVE))).toString()).toBe(
      '%PDF-contenido',
    );
    expect(almacen.rutaDe(CLAVE).startsWith(carpeta)).toBe(true);
  });

  it('está disponible', () => {
    expect(almacen.disponible).toBe(true);
  });

  it('la dirección firmada apunta a la API y vence en el tiempo pedido', () => {
    const url = almacen.urlFirmada(CLAVE, 300);

    expect(url.startsWith('http://localhost:3001/api/v1/archivos?')).toBe(true);
    const p = parametros(url);
    expect(p.get('clave')).toBe(CLAVE);
    expect(Number(p.get('expira'))).toBe(ahora / 1000 + 300);
  });

  it('una dirección recién firmada es válida', () => {
    const p = parametros(almacen.urlFirmada(CLAVE, 300));

    expect(
      almacen.firmaEsValida(
        p.get('clave') as string,
        Number(p.get('expira')),
        p.get('firma') as string,
      ),
    ).toBe(true);
  });

  it('deja de ser válida cuando vence (justo en el instante de vencer ya no)', () => {
    const p = parametros(almacen.urlFirmada(CLAVE, 300));
    const valida = () =>
      almacen.firmaEsValida(
        CLAVE,
        Number(p.get('expira')),
        p.get('firma') as string,
      );

    ahora += 299_000;
    expect(valida()).toBe(true);
    ahora += 1_000;
    expect(valida()).toBe(false);
  });

  it('no sirve si cambian la clave, el vencimiento o la firma', () => {
    const p = parametros(almacen.urlFirmada(CLAVE, 300));
    const expira = Number(p.get('expira'));
    const firma = p.get('firma') as string;
    const otraClave = 'hojas-de-vida/0198aaaa-0000-7000-8000-000000000002.pdf';

    expect(almacen.firmaEsValida(otraClave, expira, firma)).toBe(false);
    expect(almacen.firmaEsValida(CLAVE, expira + 1, firma)).toBe(false);
    expect(almacen.firmaEsValida(CLAVE, expira, `${firma}x`)).toBe(false);
    expect(almacen.firmaEsValida(CLAVE, expira, '')).toBe(false);
  });

  it('una firma hecha con otro secreto no sirve', () => {
    const otro = new AlmacenDeArchivosLocal({
      directorio: carpeta,
      secreto: 'otro-secreto-distinto-de-32-caracteres!',
      urlPublicaDeLaApi: 'http://localhost:3001/api/v1',
      ahoraMs: () => ahora,
    });
    const p = parametros(otro.urlFirmada(CLAVE, 300));

    expect(
      almacen.firmaEsValida(
        CLAVE,
        Number(p.get('expira')),
        p.get('firma') as string,
      ),
    ).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5e300])(
    'un vencimiento absurdo (%s) no es válido',
    (expira) => {
      expect(almacen.firmaEsValida(CLAVE, expira, 'x')).toBe(false);
    },
  );

  it('se niega a firmar o ubicar claves peligrosas', () => {
    for (const clave of [
      '../x.pdf',
      '/etc/passwd',
      'hojas-de-vida/../../.env',
    ]) {
      expect(() => almacen.urlFirmada(clave, 300)).toThrow();
      expect(() => almacen.rutaDe(clave)).toThrow();
    }
    expect(almacen.firmaEsValida('../x.pdf', 9_999_999_999, 'x')).toBe(false);
  });
});

describe('AlmacenDeArchivosCloudinary', () => {
  const almacen = new AlmacenDeArchivosCloudinary({
    cloudName: 'demo',
    apiKey: '123456789012345',
    apiSecret: 'un-secreto-de-prueba',
  });
  const CLAVE_DE_DOCUMENTO =
    'documentos/0198aaaa-0000-7000-8000-000000000001.pdf';
  const CLAVE_DE_FOTO = 'fotos/0198aaaa-0000-7000-8000-000000000001.jpg';

  it('está disponible', () => {
    expect(almacen.disponible).toBe(true);
  });

  it('la foto de perfil tiene una dirección pública (tipo «upload», sin firma)', () => {
    const url = almacen.urlPublica(CLAVE_DE_FOTO);

    expect(url).toBe(
      'https://res.cloudinary.com/demo/image/upload/v1/fotos/0198aaaa-0000-7000-8000-000000000001.jpg',
    );
  });

  it('se niega a dar una dirección pública de un documento (no es una foto)', () => {
    expect(() => almacen.urlPublica(CLAVE_DE_DOCUMENTO)).toThrow(
      /no se puede servir como archivo público/,
    );
  });

  it('el documento tiene una dirección privada y firmada (tipo «authenticated»)', () => {
    const url = almacen.urlFirmada(CLAVE_DE_DOCUMENTO, 300);

    expect(url).toMatch(
      /^https:\/\/res\.cloudinary\.com\/demo\/raw\/authenticated\/s--[\w-]+--\/v1\/documentos\/0198aaaa-0000-7000-8000-000000000001\.pdf$/,
    );
  });

  it('dos claves distintas firman distinto (no se puede reusar la firma de un documento en otro)', () => {
    const otraClave = 'documentos/0198aaaa-0000-7000-8000-000000000002.pdf';

    expect(almacen.urlFirmada(CLAVE_DE_DOCUMENTO, 300)).not.toBe(
      almacen.urlFirmada(otraClave, 300),
    );
  });

  it('se niega a firmar o publicar claves peligrosas', () => {
    for (const clave of ['../x.pdf', '/etc/passwd', 'a/b/x.pdf']) {
      expect(() => almacen.urlFirmada(clave, 300)).toThrow();
      expect(() => almacen.urlPublica(clave)).toThrow();
    }
  });
});

describe('AlmacenDeArchivosDeshabilitado', () => {
  const almacen = new AlmacenDeArchivosDeshabilitado();

  it('dice que no está disponible y no finge guardar ni firmar', async () => {
    expect(almacen.disponible).toBe(false);
    await expect(almacen.guardar()).rejects.toThrow(/almacén de archivos/);
    expect(() => almacen.urlFirmada()).toThrow(/almacén de archivos/);
  });
});
