import { ConflictoDeEstado } from '../../../src/compartido/dominio/errores.js';
import { Calificacion } from '../../../src/reservas/dominio/calificacion.js';
import {
  codificarCursor,
  decodificarCursor,
} from '../../../src/reservas/dominio/cursor-de-servicios.js';
import { nuevoId } from '../../soporte/bd.js';
import {
  AHORA_RESERVAS,
  CUIDADOR_USUARIO_ID,
  HOY_RESERVAS,
  servicioSolicitado,
} from '../../soporte/reservas.js';
import { esperar } from '../../soporte/repositorios-identidad.js';
import {
  guardarServicio,
  montarRepositoriosDeReservas,
  personasNuevas,
} from '../../soporte/repositorios-reservas.js';

// El repositorio de servicios contra Postgres real. La base se comparte con las demás pruebas: cada prueba usa
// sus propias personas (no hay claves foráneas entre esquemas) y nunca depende de «todo lo que hay».
describe('RepositorioServiciosDrizzle', () => {
  const repos = montarRepositoriosDeReservas();

  afterAll(async () => {
    await repos.pool.end();
  });

  const filas = async <T extends object>(
    texto: string,
    parametros: unknown[],
  ) => (await repos.pool.query<T>(texto, parametros)).rows;

  describe('guardar y leer', () => {
    it('guarda el servicio con su desglose y lo devuelve igual', async () => {
      const guardado = await guardarServicio(repos, {
        horas: 3,
        subtotal: 60_000,
        cargoFamilia: 4_800,
        totalFamilia: 64_800,
        pagoProfesional: 54_000,
      });

      const leido = await repos.servicios.buscarPorId(guardado.id);

      expect(leido).not.toBeNull();
      expect(leido).toMatchObject({
        id: guardado.id,
        familiarId: guardado.familiarId,
        adultoMayorId: guardado.adultoMayorId,
        cuidadorId: guardado.cuidadorId,
        jornada: 'manana',
        horas: 3,
        estado: 'solicitado',
        medioDePago: 'pasarela',
        tarifaHora: 20_000,
        subtotal: 60_000,
        cargoFamilia: 4_800,
        totalFamilia: 64_800,
        pagoProfesional: 54_000,
        politicaVersion: 1,
        version: 1,
        claveDeIdempotencia: guardado.claveDeIdempotencia,
      });
      expect(leido?.fecha.aTexto()).toBe(guardado.fecha.aTexto());
      expect(leido?.solicitudExpiraEn).toEqual(guardado.solicitudExpiraEn);
    });

    it('un servicio que no existe devuelve null', async () => {
      expect(
        await repos.servicios.buscarPorId(servicioSolicitado().id),
      ).toBeNull();
    });

    it('un servicio leído recuerda con qué versión se leyó', async () => {
      const guardado = await guardarServicio(repos);

      const leido = await repos.servicios.buscarPorId(guardado.id);

      expect(leido?.versionLeida).toBe(1);
      expect(leido?.transicionesPendientes).toEqual([]);
    });

    it('escribe la primera fila del historial', async () => {
      const guardado = await guardarServicio(repos);

      const historial = await filas<{
        desde: string | null;
        hacia: string;
        accion: string;
        actor_id: string | null;
      }>(
        'select desde, hacia, accion, actor_id from reservas.historial_de_estados where servicio_id = $1',
        [guardado.id],
      );

      expect(historial).toEqual([
        {
          desde: null,
          hacia: 'solicitado',
          accion: 'solicitar',
          actor_id: guardado.familiarId,
        },
      ]);
    });

    it('un servicio con aceptación automática deja dos filas en el historial', async () => {
      const guardado = await guardarServicio(repos, {
        aceptacionAutomatica: true,
      });

      const historial = await filas<{ hacia: string; actor_id: string | null }>(
        'select hacia, actor_id from reservas.historial_de_estados where servicio_id = $1 order by ocurrido_en, hacia',
        [guardado.id],
      );

      expect(historial.map((h) => h.hacia).sort()).toEqual([
        'aceptado',
        'solicitado',
      ]);
      expect(
        historial.find((h) => h.hacia === 'aceptado')?.actor_id,
      ).toBeNull();
    });
  });

  describe('sin doble reserva (E9)', () => {
    it('el mismo cuidador, fecha y franja no se pueden reservar dos veces', async () => {
      const cuidadorId = nuevoId();
      await guardarServicio(repos, { cuidadorId });

      await expect(
        guardarServicio(repos, { cuidadorId }),
      ).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'servicio.franja_ocupada',
      });
    });

    it('dos solicitudes SIMULTÁNEAS para el mismo cuidador y franja: una gana y la otra recibe 409', async () => {
      const cuidadorId = nuevoId();

      const resultados = await Promise.allSettled(
        Array.from({ length: 5 }, () => guardarServicio(repos, { cuidadorId })),
      );

      const ganadoras = resultados.filter((r) => r.status === 'fulfilled');
      const perdedoras = resultados.filter((r) => r.status === 'rejected');
      expect(ganadoras).toHaveLength(1);
      expect(perdedoras).toHaveLength(4);
      for (const perdedora of perdedoras) {
        expect(perdedora.reason).toMatchObject({
          codigo: 'servicio.franja_ocupada',
        });
      }
      const guardados = await filas(
        'select 1 from reservas.servicios where cuidador_id = $1',
        [cuidadorId],
      );
      expect(guardados).toHaveLength(1);
    });

    it('una perdedora no deja historial huérfano', async () => {
      const cuidadorId = nuevoId();
      await guardarServicio(repos, { cuidadorId });
      const perdedora = servicioSolicitado({ ...personasNuevas(), cuidadorId });

      await expect(repos.servicios.guardar(perdedora)).rejects.toThrow();

      expect(
        await filas(
          'select 1 from reservas.historial_de_estados where servicio_id = $1',
          [perdedora.id],
        ),
      ).toEqual([]);
    });

    it('otra franja, otra fecha u otro cuidador sí se pueden', async () => {
      const cuidadorId = nuevoId();
      await guardarServicio(repos, { cuidadorId, jornada: 'manana' });

      await expect(
        guardarServicio(repos, { cuidadorId, jornada: 'tarde' }),
      ).resolves.toBeDefined();
      await expect(
        guardarServicio(repos, {
          cuidadorId,
          fecha: HOY_RESERVAS.sumarDias(2),
        }),
      ).resolves.toBeDefined();
      await expect(
        guardarServicio(repos, { jornada: 'manana' }),
      ).resolves.toBeDefined();
    });

    it('cancelar libera la franja', async () => {
      const cuidadorId = nuevoId();
      const primero = await guardarServicio(repos, { cuidadorId });
      const leido = await repos.servicios.buscarPorId(primero.id);
      leido?.cancelar(primero.familiarId, AHORA_RESERVAS);
      if (leido) await repos.servicios.actualizar(leido);

      await expect(
        guardarServicio(repos, { cuidadorId }),
      ).resolves.toBeDefined();
    });
  });

  describe('idempotencia', () => {
    it('la misma familia no puede repetir una clave', async () => {
      const personas = personasNuevas();
      const clave = `clave-${nuevoId()}`;
      await guardarServicio(repos, { ...personas, claveDeIdempotencia: clave });

      await expect(
        guardarServicio(repos, {
          ...personas,
          cuidadorId: nuevoId(),
          claveDeIdempotencia: clave,
        }),
      ).rejects.toMatchObject({ codigo: 'servicio.clave_repetida' });
    });

    it('otra familia sí puede usar la misma clave', async () => {
      const clave = `clave-${nuevoId()}`;
      await guardarServicio(repos, { claveDeIdempotencia: clave });

      await expect(
        guardarServicio(repos, { claveDeIdempotencia: clave }),
      ).resolves.toBeDefined();
    });

    it('busca un servicio por familia y clave', async () => {
      const guardado = await guardarServicio(repos);

      const encontrado = await repos.servicios.buscarPorClave(
        guardado.familiarId,
        guardado.claveDeIdempotencia,
      );

      expect(encontrado?.id).toBe(guardado.id);
      expect(
        await repos.servicios.buscarPorClave(
          nuevoId(),
          guardado.claveDeIdempotencia,
        ),
      ).toBeNull();
    });
  });

  describe('actualizar con bloqueo optimista', () => {
    it('guarda el cambio, sube la versión y escribe el historial', async () => {
      const guardado = await guardarServicio(repos);
      const servicio = await repos.servicios.buscarPorId(guardado.id);
      servicio?.aceptar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS);
      if (servicio) await repos.servicios.actualizar(servicio);

      const leido = await repos.servicios.buscarPorId(guardado.id);

      expect(leido).toMatchObject({
        estado: 'aceptado',
        version: 2,
        solicitudExpiraEn: null,
      });
      expect(leido?.aceptadoEn).toEqual(AHORA_RESERVAS);
      const historial = await filas<{ hacia: string }>(
        'select hacia from reservas.historial_de_estados where servicio_id = $1',
        [guardado.id],
      );
      expect(historial.map((h) => h.hacia).sort()).toEqual([
        'aceptado',
        'solicitado',
      ]);
    });

    it('si otra persona lo cambió en el medio, falla con 409 y no escribe nada', async () => {
      const guardado = await guardarServicio(repos);
      const copiaA = await repos.servicios.buscarPorId(guardado.id);
      const copiaB = await repos.servicios.buscarPorId(guardado.id);
      copiaA?.aceptar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS);
      copiaB?.cancelar(guardado.familiarId, AHORA_RESERVAS);
      if (copiaA) await repos.servicios.actualizar(copiaA);

      await expect(
        copiaB ? repos.servicios.actualizar(copiaB) : Promise.resolve(),
      ).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'servicio.modificado',
      });

      const leido = await repos.servicios.buscarPorId(guardado.id);
      expect(leido?.estado).toBe('aceptado');
      const historial = await filas(
        'select 1 from reservas.historial_de_estados where servicio_id = $1',
        [guardado.id],
      );
      expect(historial).toHaveLength(2);
    });

    it('un servicio que no existe falla con «no encontrado»', async () => {
      const fantasma = servicioSolicitado();
      fantasma.aceptar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS);

      await expect(repos.servicios.actualizar(fantasma)).rejects.toMatchObject({
        codigo: 'servicio.no_encontrado',
      });
    });
  });

  describe('bloqueo de fila', () => {
    it('dos acciones sobre el mismo servicio se atienden una tras otra', async () => {
      const guardado = await guardarServicio(repos);
      const orden: string[] = [];

      const primera = repos.contexto.ejecutar(async () => {
        const servicio = await repos.servicios.buscarPorIdParaActualizar(
          guardado.id,
        );
        orden.push('primera toma la fila');
        await esperar(300);
        servicio?.aceptar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS);
        if (servicio) await repos.servicios.actualizar(servicio);
        orden.push('primera termina');
      });
      await esperar(100);
      const segunda = repos.contexto.ejecutar(async () => {
        const servicio = await repos.servicios.buscarPorIdParaActualizar(
          guardado.id,
        );
        orden.push(`segunda ve «${servicio?.estado}»`);
      });
      await Promise.all([primera, segunda]);

      expect(orden).toEqual([
        'primera toma la fila',
        'primera termina',
        'segunda ve «aceptado»',
      ]);
    });
  });

  describe('listar', () => {
    async function tresServicios() {
      const familiarId = nuevoId();
      const cuidadorId = nuevoId();
      const creados = [];
      for (let i = 0; i < 3; i++) {
        // El `creadoEn` de cada uno es distinto: así el orden está bien definido.
        const ahora = new Date(AHORA_RESERVAS.getTime() + i * 1000);
        creados.push(
          await guardarServicio(repos, {
            familiarId,
            cuidadorId,
            ahora,
            fecha: HOY_RESERVAS.sumarDias(i + 1),
          }),
        );
      }
      return { familiarId, cuidadorId, creados };
    }

    it('los de una familia, los más recientes primero', async () => {
      const { familiarId, creados } = await tresServicios();

      const pagina = await repos.servicios.listarDe(
        { tipo: 'familiar', familiarId },
        {},
        10,
        null,
      );

      expect(pagina.servicios.map((s) => s.id)).toEqual(
        [...creados].reverse().map((s) => s.id),
      );
      expect(pagina.siguiente).toBeNull();
    });

    it('los de un cuidador', async () => {
      const { cuidadorId, creados } = await tresServicios();

      const pagina = await repos.servicios.listarDe(
        { tipo: 'cuidador', cuidadorId },
        {},
        10,
        null,
      );

      expect(pagina.servicios).toHaveLength(creados.length);
    });

    it('no mezcla los de otra familia', async () => {
      await tresServicios();

      const pagina = await repos.servicios.listarDe(
        { tipo: 'familiar', familiarId: nuevoId() },
        {},
        10,
        null,
      );

      expect(pagina.servicios).toEqual([]);
    });

    it('filtra por estado', async () => {
      const { familiarId, creados } = await tresServicios();
      const primero = await repos.servicios.buscarPorId(creados[0]!.id);
      primero?.cancelar(familiarId, AHORA_RESERVAS);
      if (primero) await repos.servicios.actualizar(primero);

      const canceladas = await repos.servicios.listarDe(
        { tipo: 'familiar', familiarId },
        { estado: 'cancelado' },
        10,
        null,
      );

      expect(canceladas.servicios.map((s) => s.id)).toEqual([creados[0]!.id]);
    });

    it('pagina con cursor sin repetir ni saltarse a nadie', async () => {
      const { familiarId, creados } = await tresServicios();
      const esperado = [...creados].reverse().map((s) => s.id);

      const vistos: string[] = [];
      let cursor = null as Awaited<
        ReturnType<typeof repos.servicios.listarDe>
      >['siguiente'];
      let paginas = 0;
      do {
        const pagina = await repos.servicios.listarDe(
          { tipo: 'familiar', familiarId },
          {},
          1,
          cursor,
        );
        vistos.push(...pagina.servicios.map((s) => s.id));
        cursor = pagina.siguiente;
        paginas += 1;
      } while (cursor !== null && paginas < 10);

      expect(vistos).toEqual(esperado);
      expect(paginas).toBe(3);
    });

    it('si entra un servicio nuevo entre dos páginas, nadie se repite', async () => {
      const { familiarId, creados } = await tresServicios();
      const primera = await repos.servicios.listarDe(
        { tipo: 'familiar', familiarId },
        {},
        2,
        null,
      );

      await guardarServicio(repos, {
        familiarId,
        ahora: new Date(AHORA_RESERVAS.getTime() + 60_000),
        fecha: HOY_RESERVAS.sumarDias(9),
      });
      const segunda = await repos.servicios.listarDe(
        { tipo: 'familiar', familiarId },
        {},
        10,
        primera.siguiente,
      );

      const vistos = [...primera.servicios, ...segunda.servicios].map(
        (s) => s.id,
      );
      expect(new Set(vistos).size).toBe(vistos.length);
      expect(vistos).toContain(creados[0]!.id);
    });

    it('el cursor guarda fecha e id y se reconstruye', async () => {
      const { familiarId } = await tresServicios();
      const pagina = await repos.servicios.listarDe(
        { tipo: 'familiar', familiarId },
        {},
        1,
        null,
      );

      expect(pagina.siguiente).not.toBeNull();
      const ida = decodificarCursor(codificarCursor(pagina.siguiente!));
      expect(ida).toEqual(pagina.siguiente);
    });
  });

  describe('solicitudes vencidas', () => {
    it('lista las solicitadas cuyo plazo ya pasó, y solo esas', async () => {
      const vencida = await guardarServicio(repos);
      const vigente = await guardarServicio(repos, {
        ahora: new Date(AHORA_RESERVAS.getTime() + 3 * 60 * 60_000),
        fecha: HOY_RESERVAS.sumarDias(3),
      });
      const aceptada = await guardarServicio(repos, {
        aceptacionAutomatica: true,
      });
      const pasado = new Date(AHORA_RESERVAS.getTime() + 2 * 60 * 60_000 + 1);

      const ids = await repos.servicios.listarSolicitudesVencidas(pasado, 1000);

      expect(ids).toContain(vencida.id);
      expect(ids).not.toContain(vigente.id);
      expect(ids).not.toContain(aceptada.id);
    });

    it('respeta el límite', async () => {
      await guardarServicio(repos);
      await guardarServicio(repos);

      const ids = await repos.servicios.listarSolicitudesVencidas(
        new Date(AHORA_RESERVAS.getTime() + 5 * 60 * 60_000),
        1,
      );

      expect(ids).toHaveLength(1);
    });
  });

  describe('activos de una persona mayor', () => {
    it('trae los aceptados y en curso desde la fecha, no los pendientes ni los cancelados', async () => {
      const adultoMayorId = nuevoId();
      const aceptado = await guardarServicio(repos, {
        adultoMayorId,
        aceptacionAutomatica: true,
      });
      await guardarServicio(repos, { adultoMayorId, jornada: 'tarde' }); // solicitado
      const cancelado = await guardarServicio(repos, {
        adultoMayorId,
        jornada: 'noche',
      });
      const leido = await repos.servicios.buscarPorId(cancelado.id);
      leido?.cancelar(cancelado.familiarId, AHORA_RESERVAS);
      if (leido) await repos.servicios.actualizar(leido);

      const activos = await repos.servicios.listarActivosDeAdultoMayor(
        adultoMayorId,
        HOY_RESERVAS,
      );

      expect(activos.map((s) => s.id)).toEqual([aceptado.id]);
    });

    it('no trae los anteriores a la fecha pedida', async () => {
      const adultoMayorId = nuevoId();
      await guardarServicio(repos, {
        adultoMayorId,
        aceptacionAutomatica: true,
      });

      const activos = await repos.servicios.listarActivosDeAdultoMayor(
        adultoMayorId,
        HOY_RESERVAS.sumarDias(5),
      );

      expect(activos).toEqual([]);
    });
  });
});

describe('RepositorioCalificacionesDrizzle', () => {
  const repos = montarRepositoriosDeReservas();

  afterAll(async () => {
    await repos.pool.end();
  });

  const calificar = (
    servicioId: Calificacion['servicioId'],
    familiarId: string,
    valor = 5,
  ) =>
    Calificacion.crear({
      servicioId,
      familiarId,
      calificacion: valor,
      comentario: 'Muy atenta.',
      creadaEn: AHORA_RESERVAS,
    });

  it('guarda y lee la calificación de un servicio', async () => {
    const servicio = await guardarServicio(repos);

    await repos.calificaciones.guardar(
      calificar(servicio.id, servicio.familiarId, 4),
    );

    const leida = await repos.calificaciones.buscarPorServicio(servicio.id);
    expect(leida).toMatchObject({
      servicioId: servicio.id,
      familiarId: servicio.familiarId,
      calificacion: 4,
      comentario: 'Muy atenta.',
    });
  });

  it('un servicio se califica una sola vez', async () => {
    const servicio = await guardarServicio(repos);
    await repos.calificaciones.guardar(
      calificar(servicio.id, servicio.familiarId),
    );

    await expect(
      repos.calificaciones.guardar(
        calificar(servicio.id, servicio.familiarId, 1),
      ),
    ).rejects.toMatchObject({
      constructor: ConflictoDeEstado,
      codigo: 'calificacion.ya_existe',
    });
  });

  it('un servicio sin calificar devuelve null', async () => {
    const servicio = await guardarServicio(repos);

    expect(
      await repos.calificaciones.buscarPorServicio(servicio.id),
    ).toBeNull();
  });

  it('lee varias de una vez', async () => {
    const a = await guardarServicio(repos);
    const b = await guardarServicio(repos);
    const sinCalificar = await guardarServicio(repos);
    await repos.calificaciones.guardar(calificar(a.id, a.familiarId, 5));
    await repos.calificaciones.guardar(calificar(b.id, b.familiarId, 2));

    const mapa = await repos.calificaciones.buscarPorServicios([
      a.id,
      b.id,
      sinCalificar.id,
    ]);

    expect([...mapa.keys()].sort()).toEqual([a.id, b.id].sort());
    expect(mapa.get(b.id)?.calificacion).toBe(2);
    expect((await repos.calificaciones.buscarPorServicios([])).size).toBe(0);
  });
});
