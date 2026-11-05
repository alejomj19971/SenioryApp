import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../../../src/compartido/dominio/errores.js';
import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import {
  Documento,
  nombreDeArchivoSeguro,
  tipoMimeDeContenido,
} from '../../../../src/directorio/dominio/documento.js';
import type {
  CuidadorId,
  DocumentoId,
  VerificacionId,
} from '../../../../src/directorio/dominio/ids.js';
import { Verificacion } from '../../../../src/directorio/dominio/verificacion.js';
import { cuidadorDePrueba } from '../../../soporte/directorio.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2030-06-10T15:00:00.000Z');
const HOY = FechaCivil.desdeTexto('2030-06-10');
const PDF = Buffer.from('%PDF-1.4\nhola');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('tipoMimeDeContenido', () => {
  it('reconoce PDF, JPEG y PNG por sus primeros bytes', () => {
    expect(tipoMimeDeContenido(PDF)).toBe('application/pdf');
    expect(tipoMimeDeContenido(JPEG)).toBe('image/jpeg');
    expect(tipoMimeDeContenido(PNG)).toBe('image/png');
  });

  it.each([
    ['vacío', Buffer.alloc(0)],
    ['texto', Buffer.from('hola mundo')],
    ['un ejecutable', Buffer.from('MZ\x90\x00')],
    ['un zip', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ['un PDF cortado', Buffer.from('%PDF')],
    ['un PNG cortado', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['un JPEG cortado', Buffer.from([0xff, 0xd8])],
  ])('no reconoce %s', (_caso, contenido) => {
    expect(tipoMimeDeContenido(contenido)).toBeNull();
  });
});

describe('nombreDeArchivoSeguro', () => {
  it.each([
    ['mi cédula.pdf', 'mi cédula.pdf'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\yo\\título.pdf', 'título.pdf'],
    ['a\u202eb.pdf', 'ab.pdf'],
    ['con\u0000nulo.pdf', 'connulo.pdf'],
    ['   ', 'archivo'],
    ['..', 'archivo'],
    ['', 'archivo'],
    ['carpeta/', 'archivo'],
  ])('«%s» → «%s»', (entrada, esperado) => {
    expect(nombreDeArchivoSeguro(entrada)).toBe(esperado);
  });

  it('acota el largo', () => {
    expect(nombreDeArchivoSeguro('a'.repeat(500))).toHaveLength(120);
  });
});

describe('Documento', () => {
  const subir = (
    cambios: Partial<Parameters<typeof Documento.subir>[0]> = {},
  ) =>
    Documento.subir({
      id: idDePrueba<'Documento'>() as DocumentoId,
      cuidadorId: idDePrueba<'Cuidador'>() as CuidadorId,
      tipo: 'cedula',
      nombreOriginal: 'cedula.pdf',
      contenido: PDF,
      sha256: new Uint8Array(32),
      ahora: AHORA,
      ...cambios,
    });

  it('nace pendiente y privado, con una clave que genera el servidor', () => {
    const documento = subir();

    expect(documento).toMatchObject({
      estado: 'pendiente',
      esPublico: false,
      tipoMime: 'application/pdf',
      tamanoBytes: PDF.length,
    });
    expect(documento.claveDeAlmacenamiento).toBe(
      `documentos/${documento.id}.pdf`,
    );
  });

  it('la extensión de la clave sale del contenido, no del nombre', () => {
    expect(
      subir({ contenido: PNG, nombreOriginal: 'x.pdf' }).claveDeAlmacenamiento,
    ).toMatch(/\.png$/);
    expect(subir({ contenido: JPEG }).claveDeAlmacenamiento).toMatch(/\.jpg$/);
  });

  it('rechaza lo vacío, lo muy grande y lo que no es PDF ni imagen', () => {
    for (const [contenido, codigo] of [
      [Buffer.alloc(0), 'documento.tamano_invalido'],
      [Buffer.alloc(5 * 1024 * 1024 + 1), 'documento.tamano_invalido'],
      [Buffer.from('texto'), 'documento.formato_invalido'],
    ] as const) {
      expect(() => subir({ contenido })).toThrow(
        expect.objectContaining({
          constructor: ErrorDeValidacion,
          codigo,
        }) as Error,
      );
    }
  });

  it('la hoja de vida es solo PDF', () => {
    expect(() => subir({ tipo: 'hoja_de_vida', contenido: JPEG })).toThrow(
      expect.objectContaining({
        codigo: 'documento.hoja_de_vida_no_es_pdf',
      }) as Error,
    );
    expect(subir({ tipo: 'hoja_de_vida' }).tipo).toBe('hoja_de_vida');
  });

  it('solo la hoja de vida aprobada queda pública; los demás siguen privados', () => {
    const hoja = subir({ tipo: 'hoja_de_vida' });
    const cedula = subir();

    hoja.aprobar();
    cedula.aprobar();

    expect(hoja).toMatchObject({ estado: 'aprobado', esPublico: true });
    expect(cedula).toMatchObject({ estado: 'aprobado', esPublico: false });
  });

  it('rechazarlo lo deja privado, y una decisión no se repite', () => {
    const documento = subir({ tipo: 'hoja_de_vida' });
    documento.rechazar();

    expect(documento).toMatchObject({ estado: 'rechazado', esPublico: false });
    expect(() => documento.aprobar()).toThrow(
      expect.objectContaining({
        constructor: ConflictoDeEstado,
        codigo: 'documento.no_pendiente',
      }) as Error,
    );
    expect(() => documento.rechazar()).toThrow(ConflictoDeEstado);
  });
});

describe('Verificacion: el ciclo de una revisión', () => {
  const solicitada = () =>
    Verificacion.solicitar({
      id: idDePrueba<'Verificacion'>() as VerificacionId,
      cuidadorId: idDePrueba<'Cuidador'>() as CuidadorId,
      control: 'antecedentes',
      ahora: AHORA,
    });
  const REVISOR = '0198aaaa-0000-7000-8000-000000000001';

  it('nace pendiente y sin vigencia, y no cuenta como vigente', () => {
    const v = solicitada();

    expect(v).toMatchObject({
      estado: 'pendiente',
      revisadoPor: null,
      vigenteHasta: null,
    });
    expect(v.estaVigente(HOY)).toBe(false);
  });

  it('aprobada dice quién y hasta cuándo, y vale hasta el último día inclusive', () => {
    const v = solicitada();
    const hasta = FechaCivil.desdeTexto('2030-07-01');

    v.aprobar(REVISOR, hasta, HOY, AHORA);

    expect(v).toMatchObject({
      estado: 'aprobada',
      revisadoPor: REVISOR,
      revisadoEn: AHORA,
    });
    expect(v.estaVigente(FechaCivil.desdeTexto('2030-07-01'))).toBe(true);
    expect(v.estaVigente(FechaCivil.desdeTexto('2030-07-02'))).toBe(false);
  });

  it('puede aprobarse sin vencimiento', () => {
    const v = solicitada();
    v.aprobar(REVISOR, null, HOY, AHORA);

    expect(v.estaVigente(FechaCivil.desdeTexto('2099-01-01'))).toBe(true);
  });

  it('no se aprueba con una vigencia pasada ni sin revisor', () => {
    expect(() =>
      solicitada().aprobar(
        REVISOR,
        FechaCivil.desdeTexto('2030-06-09'),
        HOY,
        AHORA,
      ),
    ).toThrow(
      expect.objectContaining({
        codigo: 'verificacion.vigencia_pasada',
      }) as Error,
    );
    expect(() => solicitada().aprobar('  ', null, HOY, AHORA)).toThrow(
      expect.objectContaining({ codigo: 'verificacion.sin_revisor' }) as Error,
    );
  });

  it('rechazada exige el motivo (1 a 500 caracteres) y lo recorta', () => {
    const v = solicitada();
    v.rechazar(REVISOR, '  Está borroso  ', AHORA);

    expect(v).toMatchObject({
      estado: 'rechazada',
      motivoDeRechazo: 'Está borroso',
    });
    for (const motivo of ['', '   ', 'a'.repeat(501)]) {
      expect(() => solicitada().rechazar(REVISOR, motivo, AHORA)).toThrow(
        expect.objectContaining({
          codigo: 'verificacion.motivo_invalido',
        }) as Error,
      );
    }
  });

  it('una decisión ya tomada no se repite', () => {
    const aprobada = solicitada();
    aprobada.aprobar(REVISOR, null, HOY, AHORA);
    const rechazada = solicitada();
    rechazada.rechazar(REVISOR, 'no', AHORA);

    for (const v of [aprobada, rechazada]) {
      expect(() => v.aprobar(REVISOR, null, HOY, AHORA)).toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'verificacion.no_pendiente',
        }) as Error,
      );
      expect(() => v.rechazar(REVISOR, 'x', AHORA)).toThrow(ConflictoDeEstado);
    }
  });

  it('solo una aprobada que ya venció se marca como vencida', () => {
    const vigente = solicitada();
    vigente.aprobar(REVISOR, FechaCivil.desdeTexto('2030-07-01'), HOY, AHORA);
    const pendiente = solicitada();

    expect(() => vigente.marcarVencida(HOY)).toThrow(
      expect.objectContaining({ codigo: 'verificacion.no_vencida' }) as Error,
    );
    expect(() => pendiente.marcarVencida(HOY)).toThrow(ConflictoDeEstado);
    vigente.marcarVencida(FechaCivil.desdeTexto('2030-07-02'));
    expect(vigente.estado).toBe('vencida');
  });
});

describe('Cuidador: editar el perfil y enviarlo a revisión', () => {
  const nuevo = () => {
    const cuidador = cuidadorDePrueba({ activo: false, controles: [] });
    return cuidador;
  };

  it('cambia solo lo que viene, valida con las mismas reglas y sube la versión', () => {
    const cuidador = nuevo();
    const version = cuidador.version;

    cuidador.actualizarPerfil(
      { tarifaHora: 31_000, zona: ' Poblado  Sur ' },
      AHORA,
    );

    expect(cuidador).toMatchObject({
      zona: 'Poblado Sur',
      version: version + 1,
    });
    expect(cuidador.tarifaHora.valor).toBe(31_000);
    expect(cuidador.titulo).toBe('Técnica en Enfermería — SENA');
  });

  it('un cambio inválido no deja nada a medias', () => {
    const cuidador = nuevo();
    const antes = {
      tarifa: cuidador.tarifaHora.valor,
      version: cuidador.version,
    };

    expect(() =>
      cuidador.actualizarPerfil({ tarifaHora: 40_000, telefono: 'mal' }, AHORA),
    ).toThrow(
      expect.objectContaining({
        codigo: 'cuidador.telefono_invalido',
      }) as Error,
    );

    expect(cuidador.tarifaHora.valor).toBe(antes.tarifa);
    expect(cuidador.version).toBe(antes.version);
  });

  it('la aceptación automática la cambia el propio cuidador', () => {
    const cuidador = nuevo();

    cuidador.actualizarPerfil({ aceptacionAutomatica: true }, AHORA);

    expect(cuidador.aceptacionAutomatica).toBe(true);
  });

  it('especialidad y título se congelan al activarse; lo demás sigue libre', () => {
    const cuidador = nuevo();
    cuidador.activar(AHORA);

    expect(() => cuidador.actualizarPerfil({ titulo: 'Otro' }, AHORA)).toThrow(
      expect.objectContaining({ codigo: 'cuidador.dato_verificado' }) as Error,
    );
    expect(() =>
      cuidador.actualizarPerfil({ especialidad: 'auxiliar' }, AHORA),
    ).toThrow(ConflictoDeEstado);
    expect(() =>
      cuidador.actualizarPerfil({ bio: 'Nueva presentación' }, AHORA),
    ).not.toThrow();
  });

  it('un suspendido no cambia nada', () => {
    const cuidador = nuevo();
    cuidador.suspender(AHORA);

    expect(() => cuidador.actualizarPerfil({ bio: 'x' }, AHORA)).toThrow(
      expect.objectContaining({ codigo: 'cuidador.suspendido' }) as Error,
    );
  });

  it('fija el pin del mapa (nace sin ubicación)', () => {
    const cuidador = nuevo();
    expect(cuidador.ubicacion).toBeNull();

    cuidador.actualizarPerfil(
      { latitud: 6.244203, longitud: -75.581212 },
      AHORA,
    );

    expect(cuidador.ubicacion).toEqual({
      latitud: 6.244203,
      longitud: -75.581212,
    });
  });

  it('no deja mover solo una de las dos coordenadas', () => {
    const cuidador = nuevo();

    expect(() => cuidador.actualizarPerfil({ latitud: 6.24 }, AHORA)).toThrow(
      expect.objectContaining({
        codigo: 'cuidador.ubicacion_incompleta',
      }) as Error,
    );
    expect(() =>
      cuidador.actualizarPerfil({ longitud: -75.58 }, AHORA),
    ).toThrow(
      expect.objectContaining({
        codigo: 'cuidador.ubicacion_incompleta',
      }) as Error,
    );
    expect(cuidador.ubicacion).toBeNull();
  });

  it('rechaza un punto fuera de Colombia', () => {
    const cuidador = nuevo();

    expect(() =>
      cuidador.actualizarPerfil({ latitud: 40.7128, longitud: -74.006 }, AHORA),
    ).toThrow(
      expect.objectContaining({
        codigo: 'ubicacion.fuera_de_colombia',
      }) as Error,
    );
  });

  it('distanciaHastaKm es null sin ubicación propia, y crece con la distancia real', () => {
    const sinUbicacion = nuevo();
    expect(
      sinUbicacion.distanciaHastaKm({ latitud: 6.25, longitud: -75.56 }),
    ).toBeNull();

    // Medellín.
    const cuidador = nuevo();
    cuidador.actualizarPerfil(
      { latitud: 6.244203, longitud: -75.581212 },
      AHORA,
    );
    // Bogotá: ~240 km en línea recta desde Medellín.
    const distancia = cuidador.distanciaHastaKm({
      latitud: 4.710989,
      longitud: -74.072092,
    });
    expect(distancia).not.toBeNull();
    expect(distancia as number).toBeGreaterThan(200);
    expect(distancia as number).toBeLessThan(280);
    expect(cuidador.distanciaHastaKm(cuidador.ubicacion!)).toBeCloseTo(0, 6);
  });

  it('cambia la foto de inmediato, sin pasar por revisión', () => {
    const cuidador = nuevo();
    const version = cuidador.version;

    cuidador.cambiarFoto(
      'http://localhost:3001/api/v1/fotos?clave=fotos%2Fabc.jpg',
      AHORA,
    );

    expect(cuidador.fotoUrl).toBe(
      'http://localhost:3001/api/v1/fotos?clave=fotos%2Fabc.jpg',
    );
    expect(cuidador.version).toBe(version + 1);
  });

  it('un suspendido no cambia su foto', () => {
    const cuidador = nuevo();
    cuidador.suspender(AHORA);

    expect(() => cuidador.cambiarFoto('http://x/foto.jpg', AHORA)).toThrow(
      expect.objectContaining({ codigo: 'cuidador.suspendido' }) as Error,
    );
  });

  it('solo un borrador se envía a revisión, una vez', () => {
    const cuidador = nuevo();

    cuidador.enviarARevision(AHORA);

    expect(cuidador.estado).toBe('en_revision');
    expect(() => cuidador.enviarARevision(AHORA)).toThrow(
      expect.objectContaining({
        codigo: 'cuidador.no_enviable_a_revision',
      }) as Error,
    );
  });
});
