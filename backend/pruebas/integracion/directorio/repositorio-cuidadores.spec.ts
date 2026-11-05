import { ConflictoDeEstado } from '../../../src/compartido/dominio/errores.js';
import { crearFiltros } from '../../../src/directorio/dominio/filtros-de-cuidadores.js';
import type { CuidadorId } from '../../../src/directorio/dominio/ids.js';
import { Resena } from '../../../src/directorio/dominio/resena.js';
import { nuevoId } from '../../soporte/bd.js';
import { esperar } from '../../soporte/repositorios-identidad.js';
import { HOY_DE_PRUEBA } from '../../soporte/directorio.js';
import { AHORA, idDePrueba } from '../../soporte/identidad.js';
import {
  guardarCuidador,
  montarRepositoriosDeDirectorio,
} from '../../soporte/repositorios-directorio.js';

// El repositorio de cuidadores contra Postgres real. La base se comparte con las demás pruebas, así que cada
// prueba marca a sus cuidadores con una zona propia y filtra por ella: nunca depende de «todo lo que hay».
describe('RepositorioCuidadoresDrizzle', () => {
  const repos = montarRepositoriosDeDirectorio();

  afterAll(async () => {
    await repos.pool.end();
  });

  // Una zona que solo existe en esta prueba. Es un texto sin tildes ni espacios raros: se compara normalizada.
  const zonaUnica = () => `Zona${nuevoId().slice(0, 8)}`;

  async function listar(
    zona: string,
    extra: Parameters<typeof crearFiltros>[0] = {},
    limite = 50,
    cursor = null as Parameters<typeof repos.cuidadores.listarVisibles>[2],
  ) {
    return repos.cuidadores.listarVisibles(
      crearFiltros({ zona, ...extra }),
      limite,
      cursor,
    );
  }

  async function conResenas(id: CuidadorId, calificaciones: number[]) {
    const cuidador = await repos.cuidadores.buscarPorId(id);
    if (cuidador === null) throw new Error('No existe el cuidador de prueba');
    for (const calificacion of calificaciones) {
      cuidador.registrarResena(calificacion, AHORA);
    }
    await repos.cuidadores.actualizar(cuidador);
  }

  describe('guardar y leer', () => {
    it('guarda al cuidador con sus tres controles y lo devuelve igual', async () => {
      const guardado = await guardarCuidador(repos, {
        zona: zonaUnica(),
        usuarioId: nuevoId(),
      });

      const leido = await repos.cuidadores.buscarPorId(guardado.id);

      expect(leido).not.toBeNull();
      expect(leido?.nombre).toBe(guardado.nombre);
      expect(leido?.telefono).toBe(guardado.telefono);
      expect(leido?.tarifaHora.valor).toBe(guardado.tarifaHora.valor);
      expect(leido?.disponibilidad).toEqual(guardado.disponibilidad);
      expect(leido?.visible).toBe(true);
      expect(leido?.estado).toBe('activo');
      expect(leido?.verificaciones).toHaveLength(3);
      expect(leido?.esVisible(HOY_DE_PRUEBA)).toBe(true);
    });

    it('un cuidador sin ID existente devuelve null', async () => {
      expect(await repos.cuidadores.buscarPorId(idDePrueba<'Cuidador'>())).toBe(
        null,
      );
    });

    it('una segunda ficha para la misma cuenta se rechaza y no deja nada a medias', async () => {
      const usuarioId = nuevoId();
      await guardarCuidador(repos, { usuarioId, zona: zonaUnica() });
      const repetido = idDePrueba<'Cuidador'>();

      await expect(
        guardarCuidador(repos, {
          id: repetido,
          usuarioId,
          zona: zonaUnica(),
        }),
      ).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'cuidador.usuario_ya_tiene_perfil',
      });
      expect(await repos.cuidadores.buscarPorId(repetido)).toBeNull();
    });

    it('un cuidador en borrador se guarda oculto', async () => {
      const zona = zonaUnica();
      const borrador = await guardarCuidador(repos, { zona, activo: false });

      expect((await repos.cuidadores.buscarPorId(borrador.id))?.visible).toBe(
        false,
      );
      expect((await listar(zona)).cuidadores).toEqual([]);
    });
  });

  describe('búsqueda', () => {
    it('solo muestra a los visibles', async () => {
      const zona = zonaUnica();
      const visible = await guardarCuidador(repos, { zona });
      await guardarCuidador(repos, { zona, activo: false });
      await guardarCuidador(repos, {
        zona,
        controles: ['antecedentes', 'titulos'],
      });

      const { cuidadores } = await listar(zona);

      expect(cuidadores.map((c) => c.id)).toEqual([visible.id]);
    });

    it('«jose» encuentra a «José» (sin importar tildes ni mayúsculas)', async () => {
      const zona = zonaUnica();
      const jose = await guardarCuidador(repos, {
        zona,
        nombre: 'José Hernán Cárdenas',
      });
      await guardarCuidador(repos, { zona, nombre: 'Marta Ramírez' });

      for (const busqueda of ['jose', 'JOSÉ', 'cardenas', 'hernan cárdenas']) {
        const { cuidadores } = await listar(zona, { busqueda });
        expect(cuidadores.map((c) => c.id)).toEqual([jose.id]);
      }
    });

    it('la búsqueda también mira la especialidad', async () => {
      const zona = zonaUnica();
      const fisio = await guardarCuidador(repos, {
        zona,
        especialidad: 'fisioterapia',
        nombre: 'Ana Pérez',
      });
      await guardarCuidador(repos, { zona, especialidad: 'auxiliar' });

      const { cuidadores } = await listar(zona, { busqueda: 'fisio' });

      expect(cuidadores.map((c) => c.id)).toEqual([fisio.id]);
    });

    it('los comodines de LIKE escritos por la persona no son comodines', async () => {
      const zona = zonaUnica();
      await guardarCuidador(repos, { zona, nombre: 'Marta Ramírez' });

      for (const busqueda of ['%', '_', 'm%a', '\\']) {
        expect((await listar(zona, { busqueda })).cuidadores).toEqual([]);
      }
    });

    it('un texto malicioso no rompe la consulta ni trae filas', async () => {
      const zona = zonaUnica();
      await guardarCuidador(repos, { zona });

      const { cuidadores } = await listar(zona, {
        busqueda: `'; drop table directorio.cuidadores; --`,
      });

      expect(cuidadores).toEqual([]);
      expect((await listar(zona)).cuidadores).toHaveLength(1);
    });

    it('combina especialidad, jornada y tarifa máxima', async () => {
      const zona = zonaUnica();
      const esperado = await guardarCuidador(repos, {
        zona,
        especialidad: 'enfermeria',
        disponibilidad: ['noche'],
        tarifaHora: 20_000,
      });
      await guardarCuidador(repos, {
        zona,
        especialidad: 'enfermeria',
        disponibilidad: ['manana'],
        tarifaHora: 20_000,
      });
      await guardarCuidador(repos, {
        zona,
        especialidad: 'enfermeria',
        disponibilidad: ['noche'],
        tarifaHora: 40_000,
      });
      await guardarCuidador(repos, {
        zona,
        especialidad: 'auxiliar',
        disponibilidad: ['noche'],
        tarifaHora: 20_000,
      });

      const { cuidadores } = await listar(zona, {
        especialidad: 'enfermeria',
        jornada: 'noche',
        tarifaMaxima: 25_000,
      });

      expect(cuidadores.map((c) => c.id)).toEqual([esperado.id]);
    });

    it('busca por cercanía: ordena por distancia real y deja afuera a quien no tiene ubicación', async () => {
      const zona = zonaUnica();
      // Medellín (centro).
      const medellin = { latitud: 6.244203, longitud: -75.581212 };
      // El Poblado: a pocos km de `medellin`.
      const cercano = await guardarCuidador(repos, {
        zona,
        ubicacion: { latitud: 6.209764, longitud: -75.567229 },
      });
      // Bogotá: a unos 240 km.
      const lejano = await guardarCuidador(repos, {
        zona,
        ubicacion: { latitud: 4.710989, longitud: -74.072092 },
      });
      // Sin ubicación propia: no participa en esta búsqueda.
      await guardarCuidador(repos, { zona });

      const { cuidadores } = await listar(zona, {
        lat: medellin.latitud,
        lon: medellin.longitud,
      });

      expect(cuidadores.map((c) => c.id)).toEqual([cercano.id, lejano.id]);
    });

    it('la paginación por cercanía trae a todos una sola vez, en orden de distancia', async () => {
      const zona = zonaUnica();
      const medellin = { latitud: 6.244203, longitud: -75.581212 };
      const a = await guardarCuidador(repos, {
        zona,
        ubicacion: { latitud: 6.209764, longitud: -75.567229 },
      });
      const b = await guardarCuidador(repos, {
        zona,
        ubicacion: { latitud: 5.069878, longitud: -75.517738 },
      });
      const c = await guardarCuidador(repos, {
        zona,
        ubicacion: { latitud: 4.710989, longitud: -74.072092 },
      });

      const vistos: string[] = [];
      let cursor = null as Parameters<
        typeof repos.cuidadores.listarVisibles
      >[2];
      let paginas = 0;
      do {
        const pagina = await listar(
          zona,
          { lat: medellin.latitud, lon: medellin.longitud },
          1,
          cursor,
        );
        vistos.push(...pagina.cuidadores.map((cuidador) => cuidador.id));
        cursor = pagina.siguiente;
        paginas += 1;
      } while (cursor !== null && paginas < 10);

      expect(vistos).toEqual([a.id, b.id, c.id]);
      expect(paginas).toBe(3);
    });

    it('el filtro de zona compara sin tildes ni mayúsculas', async () => {
      const marca = nuevoId().slice(0, 8);
      const cuidador = await guardarCuidador(repos, {
        zona: `Belén ${marca}`,
      });

      const { cuidadores } = await repos.cuidadores.listarVisibles(
        crearFiltros({ zona: `BELEN ${marca}` }),
        10,
        null,
      );

      expect(cuidadores.map((c) => c.id)).toEqual([cuidador.id]);
    });
  });

  describe('orden y paginación', () => {
    // A: promedio 5; B: promedio 4,5; C y D sin reseñas con la misma tarifa (desempata el id).
    async function cuatroCuidadores(zona: string) {
      const a = await guardarCuidador(repos, { zona, tarifaHora: 30_000 });
      const b = await guardarCuidador(repos, { zona, tarifaHora: 20_000 });
      const c = await guardarCuidador(repos, { zona, tarifaHora: 10_000 });
      const d = await guardarCuidador(repos, { zona, tarifaHora: 10_000 });
      await conResenas(a.id, [5, 5]);
      await conResenas(b.id, [4, 5]);
      const sinReseñas = [c.id, d.id].sort();
      return [a.id, b.id, ...sinReseñas];
    }

    it('ordena por mejor calificación, luego menor tarifa y luego id', async () => {
      const zona = zonaUnica();
      const orden = await cuatroCuidadores(zona);

      const { cuidadores } = await listar(zona);

      expect(cuidadores.map((c) => c.id)).toEqual(orden);
      expect(cuidadores.map((c) => c.calificacion())).toEqual([
        5,
        4.5,
        null,
        null,
      ]);
    });

    it('recorrer las páginas trae a todos una sola vez y en el mismo orden', async () => {
      const zona = zonaUnica();
      const orden = await cuatroCuidadores(zona);

      const vistos: string[] = [];
      let cursor = null as Parameters<
        typeof repos.cuidadores.listarVisibles
      >[2];
      let paginas = 0;
      do {
        const pagina = await listar(zona, {}, 1, cursor);
        vistos.push(...pagina.cuidadores.map((c) => c.id));
        cursor = pagina.siguiente;
        paginas += 1;
      } while (cursor !== null && paginas < 10);

      expect(vistos).toEqual(orden);
      expect(paginas).toBe(4);
    });

    it('la última página no trae «siguiente»', async () => {
      const zona = zonaUnica();
      await cuatroCuidadores(zona);

      const pagina = await listar(zona, {}, 4);

      expect(pagina.cuidadores).toHaveLength(4);
      expect(pagina.siguiente).toBeNull();
    });

    it('si alguien entra a la lista entre dos páginas, nadie se repite ni se salta', async () => {
      const zona = zonaUnica();
      const orden = await cuatroCuidadores(zona);
      const primera = await listar(zona, {}, 2);

      // Aparece uno nuevo con la peor calificación: queda al final, no cambia lo ya visto.
      const nuevo = await guardarCuidador(repos, { zona, tarifaHora: 90_000 });
      const segunda = await listar(zona, {}, 10, primera.siguiente);

      const vistos = [...primera.cuidadores, ...segunda.cuidadores].map(
        (c) => c.id,
      );
      expect(vistos.slice(0, 4)).toEqual(orden);
      expect(vistos).toContain(nuevo.id);
      expect(new Set(vistos).size).toBe(vistos.length);
    });
  });

  describe('filtros disponibles', () => {
    it('ofrece las zonas de los visibles, cada una escrita una sola vez', async () => {
      const marca = nuevoId().slice(0, 8);
      await guardarCuidador(repos, {
        zona: `Centro ${marca}`,
        tarifaHora: 99_000,
      });
      await guardarCuidador(repos, { zona: `centro ${marca}` });
      await guardarCuidador(repos, {
        zona: `Oculta ${marca}`,
        activo: false,
      });

      const { zonas, tarifaMaxima } =
        await repos.cuidadores.obtenerFiltrosDisponibles();

      expect(
        zonas.filter((z) => z.toLowerCase() === `centro ${marca}`),
      ).toHaveLength(1);
      expect(zonas.some((z) => z.toLowerCase() === `oculta ${marca}`)).toBe(
        false,
      );
      expect(tarifaMaxima).toBeGreaterThanOrEqual(99_000);
    });
  });

  describe('control vencido', () => {
    it('lista solo a los visibles a quienes ya se les venció un control', async () => {
      const cuidador = await guardarCuidador(repos, { zona: zonaUnica() });
      const conOtroVigente = HOY_DE_PRUEBA.sumarDias(100);
      const vencidos = HOY_DE_PRUEBA.sumarDias(400);

      expect(
        await repos.cuidadores.listarIdsVisiblesConControlVencido(
          HOY_DE_PRUEBA,
        ),
      ).not.toContain(cuidador.id);
      expect(
        await repos.cuidadores.listarIdsVisiblesConControlVencido(
          conOtroVigente,
        ),
      ).not.toContain(cuidador.id);
      expect(
        await repos.cuidadores.listarIdsVisiblesConControlVencido(vencidos),
      ).toContain(cuidador.id);
    });

    it('un cuidador oculto no aparece aunque tenga controles vencidos', async () => {
      const oculto = await guardarCuidador(repos, {
        zona: zonaUnica(),
        activo: false,
      });

      expect(
        await repos.cuidadores.listarIdsVisiblesConControlVencido(
          HOY_DE_PRUEBA.sumarDias(400),
        ),
      ).not.toContain(oculto.id);
    });
  });

  describe('actualizar', () => {
    it('guarda contadores, estado y visibilidad', async () => {
      const guardado = await guardarCuidador(repos, { zona: zonaUnica() });
      const cuidador = await repos.cuidadores.buscarPorIdParaActualizar(
        guardado.id,
      );
      if (cuidador === null) throw new Error('Debía existir');

      cuidador.registrarResena(4, AHORA);
      cuidador.suspender(AHORA);
      await repos.cuidadores.actualizar(cuidador);

      const leido = await repos.cuidadores.buscarPorId(guardado.id);
      expect(leido?.cantidadResenas).toBe(1);
      expect(leido?.calificacion()).toBe(4);
      expect(leido?.estado).toBe('suspendido');
      expect(leido?.visible).toBe(false);
      expect(leido?.version).toBe(cuidador.version);
    });

    it('un cambio de contadores no falla porque un control venció (solo la visibilidad se revisa)', async () => {
      const guardado = await guardarCuidador(repos, { zona: zonaUnica() });
      const cuidador = await repos.cuidadores.buscarPorId(guardado.id);
      if (cuidador === null) throw new Error('Debía existir');

      cuidador.registrarResena(5, AHORA);

      await expect(
        repos.cuidadores.actualizar(cuidador),
      ).resolves.toBeUndefined();
    });

    it('ocultar por vigencia deja de mostrarlo en la búsqueda', async () => {
      const zona = zonaUnica();
      const guardado = await guardarCuidador(repos, { zona });
      const cuidador = await repos.cuidadores.buscarPorId(guardado.id);
      if (cuidador === null) throw new Error('Debía existir');

      expect(
        cuidador.recalcularVisibilidad(HOY_DE_PRUEBA.sumarDias(400), AHORA),
      ).toBe('oculto');
      await repos.cuidadores.actualizar(cuidador);

      expect((await listar(zona)).cuidadores).toEqual([]);
    });

    it('un cuidador inexistente falla con «no encontrado»', async () => {
      const fantasma = await guardarCuidador(repos, { zona: zonaUnica() });
      await repos.pool.query(
        'delete from directorio.verificaciones where cuidador_id = $1',
        [fantasma.id],
      );
      await repos.pool.query(
        'delete from directorio.cuidadores where id = $1',
        [fantasma.id],
      );

      await expect(repos.cuidadores.actualizar(fantasma)).rejects.toMatchObject(
        {
          codigo: 'cuidador.no_encontrado',
        },
      );
    });
  });

  describe('bloqueo para actualizar', () => {
    it('dos actualizaciones del mismo cuidador se atienden una tras otra', async () => {
      const guardado = await guardarCuidador(repos, { zona: zonaUnica() });
      const orden: string[] = [];

      const primera = repos.contexto.ejecutar(async () => {
        const cuidador = await repos.cuidadores.buscarPorIdParaActualizar(
          guardado.id,
        );
        orden.push('primera toma la fila');
        await esperar(300);
        cuidador?.registrarResena(5, AHORA);
        if (cuidador) await repos.cuidadores.actualizar(cuidador);
        orden.push('primera termina');
      });
      await esperar(100);
      const segunda = repos.contexto.ejecutar(async () => {
        const cuidador = await repos.cuidadores.buscarPorIdParaActualizar(
          guardado.id,
        );
        orden.push('segunda toma la fila');
        cuidador?.registrarResena(3, AHORA);
        if (cuidador) await repos.cuidadores.actualizar(cuidador);
      });
      await Promise.all([primera, segunda]);

      expect(orden).toEqual([
        'primera toma la fila',
        'primera termina',
        'segunda toma la fila',
      ]);
      // Nadie pisó a nadie: las dos reseñas cuentan.
      const leido = await repos.cuidadores.buscarPorId(guardado.id);
      expect(leido?.cantidadResenas).toBe(2);
      expect(leido?.sumaCalificaciones).toBe(8);
    });
  });
});

describe('RepositorioResenasDrizzle', () => {
  const repos = montarRepositoriosDeDirectorio();

  afterAll(async () => {
    await repos.pool.end();
  });

  function resenaDe(
    cuidadorId: CuidadorId,
    opciones: { servicioId?: string; calificacion?: number; ahora?: Date } = {},
  ) {
    return Resena.crear({
      id: idDePrueba<'Resena'>(),
      cuidadorId,
      servicioId: opciones.servicioId ?? nuevoId(),
      nombreDelAutor: 'Andrea Gómez',
      calificacion: opciones.calificacion ?? 5,
      comentario: 'Muy atenta con mi mamá.',
      ahora: opciones.ahora ?? AHORA,
    });
  }

  it('guarda una reseña y la devuelve con el autor abreviado', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const resena = resenaDe(cuidador.id);

    await repos.resenas.guardar(resena);

    const [leida] = await repos.resenas.listarVisiblesDeCuidador(
      cuidador.id,
      10,
    );
    expect(leida?.id).toBe(resena.id);
    expect(leida?.autorVisible).toBe('Andrea G.');
    expect(leida?.comentario).toBe('Muy atenta con mi mamá.');
  });

  it('un servicio tiene una sola reseña', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const servicioId = nuevoId();
    await repos.resenas.guardar(resenaDe(cuidador.id, { servicioId }));

    expect(await repos.resenas.existeParaServicio(servicioId)).toBe(true);
    await expect(
      repos.resenas.guardar(resenaDe(cuidador.id, { servicioId })),
    ).rejects.toMatchObject({
      constructor: ConflictoDeEstado,
      codigo: 'resena.ya_existe',
    });
  });

  it('un servicio sin reseña no existe', async () => {
    expect(await repos.resenas.existeParaServicio(nuevoId())).toBe(false);
  });

  it('lista las más recientes primero, sin las ocultas y respetando el límite', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const vieja = resenaDe(cuidador.id, {
      ahora: new Date('2026-01-01T10:00:00Z'),
    });
    const media = resenaDe(cuidador.id, {
      ahora: new Date('2026-02-01T10:00:00Z'),
    });
    const nueva = resenaDe(cuidador.id, {
      ahora: new Date('2026-03-01T10:00:00Z'),
    });
    const oculta = resenaDe(cuidador.id, {
      ahora: new Date('2026-04-01T10:00:00Z'),
    });
    for (const r of [vieja, media, nueva, oculta]) {
      await repos.resenas.guardar(r);
    }
    await repos.pool.query(
      'update directorio.resenas set oculta = true where id = $1',
      [oculta.id],
    );

    const todas = await repos.resenas.listarVisiblesDeCuidador(cuidador.id, 10);
    const dos = await repos.resenas.listarVisiblesDeCuidador(cuidador.id, 2);

    expect(todas.map((r) => r.id)).toEqual([nueva.id, media.id, vieja.id]);
    expect(dos.map((r) => r.id)).toEqual([nueva.id, media.id]);
  });
});

describe('RepositorioDocumentosDrizzle', () => {
  const repos = montarRepositoriosDeDirectorio();

  afterAll(async () => {
    await repos.pool.end();
  });

  const datosDeHoja = (cuidadorId: CuidadorId, subidoEn = AHORA) => {
    const id = nuevoId();
    return {
      id,
      cuidadorId,
      claveDeAlmacenamiento: `hojas-de-vida/${id}.pdf`,
      nombreOriginal: 'hoja.pdf',
      tipoMime: 'application/pdf' as const,
      tamanoBytes: 1234,
      sha256: new Uint8Array(32).fill(7),
      subidoEn,
    };
  };

  it('guarda la hoja de vida aprobada y pública, y la encuentra', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const datos = datosDeHoja(cuidador.id);

    await repos.documentos.guardarHojaDeVidaAprobada(datos);

    expect(await repos.documentos.buscarHojaDeVidaPublica(cuidador.id)).toEqual(
      {
        id: datos.id,
        claveDeAlmacenamiento: datos.claveDeAlmacenamiento,
        tipoMime: 'application/pdf',
        nombreOriginal: 'hoja.pdf',
      },
    );
  });

  it('sin hoja de vida devuelve null', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });

    expect(
      await repos.documentos.buscarHojaDeVidaPublica(cuidador.id),
    ).toBeNull();
  });

  it('un documento de verificación (cédula) NUNCA sale como hoja de vida pública', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const id = nuevoId();
    await repos.pool.query(
      `insert into directorio.documentos
         (id, cuidador_id, tipo, clave_almacenamiento, nombre_original, tipo_mime, tamano_bytes, sha256, estado, es_publico)
       values ($1, $2, 'cedula', $3, 'cedula.pdf', 'application/pdf', 10, $4, 'aprobado', false)`,
      [id, cuidador.id, `cedulas/${id}.pdf`, Buffer.alloc(32, 1)],
    );

    expect(
      await repos.documentos.buscarHojaDeVidaPublica(cuidador.id),
    ).toBeNull();
  });

  it('una hoja de vida pendiente (no aprobada) tampoco sale', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const id = nuevoId();
    await repos.pool.query(
      `insert into directorio.documentos
         (id, cuidador_id, tipo, clave_almacenamiento, nombre_original, tipo_mime, tamano_bytes, sha256, estado, es_publico)
       values ($1, $2, 'hoja_de_vida', $3, 'hoja.pdf', 'application/pdf', 10, $4, 'pendiente', false)`,
      [id, cuidador.id, `hojas-de-vida/${id}.pdf`, Buffer.alloc(32, 1)],
    );

    expect(
      await repos.documentos.buscarHojaDeVidaPublica(cuidador.id),
    ).toBeNull();
  });

  it('si hay varias hojas aprobadas, entrega la más reciente', async () => {
    const cuidador = await guardarCuidador(repos, { zona: 'Laureles' });
    const vieja = datosDeHoja(cuidador.id, new Date('2026-01-01T10:00:00Z'));
    const nueva = datosDeHoja(cuidador.id, new Date('2026-06-01T10:00:00Z'));
    await repos.documentos.guardarHojaDeVidaAprobada(vieja);
    await repos.documentos.guardarHojaDeVidaAprobada(nueva);

    expect(
      (await repos.documentos.buscarHojaDeVidaPublica(cuidador.id))?.id,
    ).toBe(nueva.id);
  });
});
