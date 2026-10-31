import { ConflictoDeEstado } from '../../../src/compartido/dominio/errores.js';
import { FechaCivil } from '../../../src/compartido/dominio/fecha-civil.js';
import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { ORIGENES_DE_ALERTA } from '../../../src/compartido/eventos/teleasistencia.js';
import {
  Alerta,
  ESTADOS_DE_ALERTA,
  type AlertaId,
} from '../../../src/teleasistencia/dominio/alerta.js';
import {
  horaDelDia,
  Medicamento,
  type MedicamentoId,
} from '../../../src/teleasistencia/dominio/medicamento.js';
import {
  FUENTES_DE_LECTURA,
  LecturaDeSignos,
  RANGOS_PLAUSIBLES,
  RANGOS_POR_DEFECTO,
  type LecturaId,
} from '../../../src/teleasistencia/dominio/signos.js';
import { ESTADOS_DE_TOMA } from '../../../src/teleasistencia/dominio/toma.js';
import { RepositorioMedicamentosDrizzle } from '../../../src/teleasistencia/infraestructura/salida/persistencia/repositorio-medicamentos-drizzle.js';
import { RepositorioTomasDrizzle } from '../../../src/teleasistencia/infraestructura/salida/persistencia/repositorio-tomas-drizzle.js';
import {
  RepositorioAlertasDrizzle,
  RepositorioLecturasDrizzle,
  RepositorioRangosDrizzle,
} from '../../../src/teleasistencia/infraestructura/salida/persistencia/repositorios-drizzle.js';
import { conectarDrizzle, nuevoId } from '../../soporte/bd.js';
import { idDePrueba } from '../../soporte/identidad.js';

// Los repositorios de Teleasistencia contra Postgres real. La base se comparte con las demás pruebas: cada prueba
// usa su propia persona mayor (no hay claves foráneas entre esquemas) y nunca depende de «todo lo que hay».
describe('repositorios de Teleasistencia', () => {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  const medicamentos = new RepositorioMedicamentosDrizzle(contexto);
  const tomas = new RepositorioTomasDrizzle(contexto);
  const lecturas = new RepositorioLecturasDrizzle(contexto);
  const rangos = new RepositorioRangosDrizzle(contexto);
  const alertas = new RepositorioAlertasDrizzle(contexto);

  afterAll(async () => {
    await pool.end();
  });

  const AHORA = new Date('2026-10-21T15:00:00.000Z');
  const HOY = FechaCivil.desdeTexto('2026-10-21'); // miércoles
  const USUARIO = nuevoId();

  const filas = async <T extends object>(
    texto: string,
    parametros: unknown[],
  ) => (await pool.query<T>(texto, parametros)).rows;

  function medicamento(
    adultoMayorId: string,
    cambios: Record<string, unknown> = {},
  ) {
    return Medicamento.registrar({
      id: idDePrueba<'Medicamento'>() as MedicamentoId,
      adultoMayorId,
      nombre: 'Losartán',
      dosis: '50 mg',
      horarios: ['08:00', '20:00'],
      vigenteDesde: HOY,
      creadoPor: USUARIO,
      ahora: AHORA,
      ...cambios,
    });
  }

  describe('constantes del dominio y CHECK de la base de datos', () => {
    const literales = async (restriccion: string) => {
      const { rows } = await pool.query<{ definicion: string }>(
        `select pg_get_constraintdef(c.oid) as definicion
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
         where n.nspname = 'teleasistencia' and c.conname = $1`,
        [restriccion],
      );
      const definicion = rows[0]?.definicion;
      if (definicion === undefined)
        throw new Error(`No existe el CHECK ${restriccion}`);
      return [...definicion.matchAll(/'([^']+)'::text/g)]
        .map((m) => m[1] as string)
        .sort();
    };

    it.each([
      ['estados de toma', 'tomas_estado_valido', ESTADOS_DE_TOMA],
      ['estados de alerta', 'alertas_estado_valido', ESTADOS_DE_ALERTA],
      ['orígenes de alerta', 'alertas_origen_valido', ORIGENES_DE_ALERTA],
      ['fuentes de lectura', 'lecturas_fuente_valida', FUENTES_DE_LECTURA],
    ] as const)(
      'los %s coinciden (%s)',
      async (_nombre, restriccion, constantes) => {
        expect(await literales(restriccion)).toEqual([...constantes].sort());
      },
    );

    it('los rangos plausibles del dominio son los del CHECK de la base', async () => {
      const { rows } = await pool.query<{ definicion: string }>(
        `select pg_get_constraintdef(c.oid) as definicion
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
         where n.nspname = 'teleasistencia' and c.conname = 'lecturas_rangos_plausibles'`,
      );
      const numeros =
        (rows[0]?.definicion ?? '').match(/\d+/g)?.map(Number) ?? [];
      const esperado = Object.values(RANGOS_PLAUSIBLES).flatMap((r) => [
        r.min,
        r.max,
      ]);

      // Cada medida aparece como «>= min» y «<= max» en el CHECK normalizado.
      for (const valor of esperado) expect(numeros).toContain(valor);
    });
  });

  describe('medicamentos', () => {
    it('guarda el medicamento con sus horarios y lo lee igual', async () => {
      const persona = nuevoId();
      const m = medicamento(persona, {
        indicaciones: 'Con el desayuno',
        diasDeLaSemana: [1, 3, 5],
        vigenteHasta: HOY.sumarDias(30),
      });

      await medicamentos.guardar(m);

      const leido = await medicamentos.buscarPorId(m.id);
      expect(leido).toMatchObject({
        id: m.id,
        adultoMayorId: persona,
        nombre: 'Losartán',
        dosis: '50 mg',
        indicaciones: 'Con el desayuno',
        horarios: ['08:00', '20:00'],
        diasDeLaSemana: [1, 3, 5],
        activo: true,
        creadoPor: USUARIO,
      });
      expect(leido?.vigenteDesde.aTexto()).toBe('2026-10-21');
      expect(leido?.vigenteHasta?.aTexto()).toBe('2026-11-20');
    });

    it('el medicamento y sus horarios se guardan juntos o no se guarda ninguno', async () => {
      const m = medicamento(nuevoId());
      await medicamentos.guardar(m);

      // Mismo id otra vez: el segundo intento falla y no deja horarios huérfanos.
      await expect(medicamentos.guardar(m)).rejects.toThrow();

      const horarios = await filas(
        'select 1 from teleasistencia.horarios_de_medicamento where medicamento_id = $1',
        [m.id],
      );
      expect(horarios).toHaveLength(2);
    });

    it('un medicamento que no existe devuelve null', async () => {
      expect(
        await medicamentos.buscarPorId(
          idDePrueba<'Medicamento'>() as MedicamentoId,
        ),
      ).toBeNull();
    });

    it('lista solo los activos de esa persona', async () => {
      const persona = nuevoId();
      const activo = medicamento(persona, { nombre: 'Metformina' });
      const suspendido = medicamento(persona, { nombre: 'Aspirina' });
      await medicamentos.guardar(activo);
      await medicamentos.guardar(suspendido);
      await medicamentos.guardar(medicamento(nuevoId()));
      suspendido.desactivar(AHORA);
      await medicamentos.actualizar(suspendido);

      const lista = await medicamentos.listarActivos(persona);

      expect(lista.map((m) => m.nombre)).toEqual(['Metformina']);
      expect(lista[0]?.horarios).toEqual(['08:00', '20:00']);
    });

    it('desactivar conserva el medicamento (historial) pero lo saca de los activos', async () => {
      const m = medicamento(nuevoId());
      await medicamentos.guardar(m);
      m.desactivar(AHORA);
      await medicamentos.actualizar(m);

      const leido = await medicamentos.buscarPorId(m.id);

      expect(leido?.activo).toBe(false);
    });

    it('la base rechaza un nombre vacío', async () => {
      await expect(
        pool.query(
          `insert into teleasistencia.medicamentos (id, adulto_mayor_id, nombre, dosis, dias_semana, vigente_desde, creado_por)
           values ($1, $2, '', '1', '{1}', '2026-10-21', $3)`,
          [nuevoId(), nuevoId(), USUARIO],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('tomas', () => {
    it('genera una toma por horario del día', async () => {
      const m = medicamento(nuevoId());
      await medicamentos.guardar(m);

      await tomas.generarDelDia(m, HOY);

      const delDia = await tomas.listarDelDia(m.adultoMayorId, HOY);
      expect(delDia.map((t) => [t.horaProgramada, t.estado])).toEqual([
        ['08:00', 'pendiente'],
        ['20:00', 'pendiente'],
      ]);
      expect(delDia[0]?.fecha.aTexto()).toBe('2026-10-21');
    });

    it('generar dos veces no duplica nada', async () => {
      const m = medicamento(nuevoId());
      await medicamentos.guardar(m);

      await tomas.generarDelDia(m, HOY);
      await tomas.generarDelDia(m, HOY);

      expect(await tomas.listarDelDia(m.adultoMayorId, HOY)).toHaveLength(2);
    });

    it('generar muchas veces A LA VEZ tampoco duplica', async () => {
      const m = medicamento(nuevoId());
      await medicamentos.guardar(m);

      await Promise.all(
        Array.from({ length: 8 }, () => tomas.generarDelDia(m, HOY)),
      );

      expect(await tomas.listarDelDia(m.adultoMayorId, HOY)).toHaveLength(2);
    });

    it('no genera en un día que al medicamento no le toca', async () => {
      // Lunes, miércoles y viernes; el 22 es jueves.
      const m = medicamento(nuevoId(), { diasDeLaSemana: [1, 3, 5] });
      await medicamentos.guardar(m);

      await tomas.generarDelDia(m, HOY.sumarDias(1));

      expect(
        await tomas.listarDelDia(m.adultoMayorId, HOY.sumarDias(1)),
      ).toEqual([]);
    });

    it('no genera antes de empezar ni después de terminar', async () => {
      const m = medicamento(nuevoId(), { vigenteHasta: HOY.sumarDias(2) });
      await medicamentos.guardar(m);

      await tomas.generarDelDia(m, HOY.sumarDias(-1));
      await tomas.generarDelDia(m, HOY.sumarDias(3));

      expect(
        await tomas.listarDelDia(m.adultoMayorId, HOY.sumarDias(-1)),
      ).toEqual([]);
      expect(
        await tomas.listarDelDia(m.adultoMayorId, HOY.sumarDias(3)),
      ).toEqual([]);
    });

    it('no mezcla las tomas de otra persona ni de otro día', async () => {
      const m = medicamento(nuevoId());
      const otra = medicamento(nuevoId());
      await medicamentos.guardar(m);
      await medicamentos.guardar(otra);
      await tomas.generarDelDia(m, HOY);
      await tomas.generarDelDia(otra, HOY);
      await tomas.generarDelDia(m, HOY.sumarDias(1));

      const delDia = await tomas.listarDelDia(m.adultoMayorId, HOY);

      expect(delDia).toHaveLength(2);
      expect(delDia.every((t) => t.adultoMayorId === m.adultoMayorId)).toBe(
        true,
      );
    });

    describe('actualizar con bloqueo optimista', () => {
      async function unaToma() {
        const m = medicamento(nuevoId());
        await medicamentos.guardar(m);
        await tomas.generarDelDia(m, HOY);
        const [primera] = await tomas.listarDelDia(m.adultoMayorId, HOY);
        return primera!;
      }

      it('guarda el cambio y sube la versión', async () => {
        const toma = await unaToma();
        toma.marcarTomada(USUARIO, AHORA, HOY);

        await tomas.actualizar(toma);

        const leida = await tomas.buscarPorId(toma.id);
        expect(leida).toMatchObject({
          estado: 'tomada',
          registradaPor: USUARIO,
          registradaEn: AHORA,
          version: 2,
        });
      });

      it('si otra persona la cambió en el medio, falla con 409 y no pisa nada', async () => {
        const original = await unaToma();
        const copiaA = await tomas.buscarPorId(original.id);
        const copiaB = await tomas.buscarPorId(original.id);
        copiaA?.marcarTomada(USUARIO, AHORA, HOY);
        copiaB?.omitir();
        if (copiaA) await tomas.actualizar(copiaA);

        await expect(
          copiaB ? tomas.actualizar(copiaB) : Promise.resolve(),
        ).rejects.toMatchObject({
          constructor: ConflictoDeEstado,
          codigo: 'toma.modificada',
        });

        expect((await tomas.buscarPorId(original.id))?.estado).toBe('tomada');
      });

      it('una toma que no existe falla con «no encontrada»', async () => {
        const toma = await unaToma();
        await pool.query('delete from teleasistencia.tomas where id = $1', [
          toma.id,
        ]);
        toma.marcarTomada(USUARIO, AHORA, HOY);

        await expect(tomas.actualizar(toma)).rejects.toMatchObject({
          codigo: 'toma.no_encontrada',
        });
      });

      it('deshacer deja la toma pendiente, sin quién ni cuándo', async () => {
        const toma = await unaToma();
        toma.marcarTomada(USUARIO, AHORA, HOY);
        await tomas.actualizar(toma);
        const leida = (await tomas.buscarPorId(toma.id))!;
        leida.desmarcar(HOY);

        await tomas.actualizar(leida);

        expect(await tomas.buscarPorId(toma.id)).toMatchObject({
          estado: 'pendiente',
          registradaPor: null,
          registradaEn: null,
          version: 3,
        });
      });
    });

    describe('vencidas', () => {
      // Las 08:00 de Bogotá del 21 son las 13:00Z.
      const a = (hora: string) => new Date(`2026-10-21T${hora}:00-05:00`);

      it('lista las pendientes cuya hora programada ya pasó, en la hora de Colombia', async () => {
        const m = medicamento(nuevoId());
        await medicamentos.guardar(m);
        await tomas.generarDelDia(m, HOY);
        const todas = await tomas.listarDelDia(m.adultoMayorId, HOY);
        const de08 = todas.find((t) => t.horaProgramada === '08:00')!;
        const de20 = todas.find((t) => t.horaProgramada === '20:00')!;

        const a0759 = await tomas.listarVencidas(
          a('07:59'),
          'America/Bogota',
          1000,
        );
        const a0800 = await tomas.listarVencidas(
          a('08:00'),
          'America/Bogota',
          1000,
        );
        const a2001 = await tomas.listarVencidas(
          a('20:01'),
          'America/Bogota',
          1000,
        );

        expect(a0759).not.toContain(de08.id);
        expect(a0800).toContain(de08.id);
        expect(a0800).not.toContain(de20.id);
        expect(a2001).toEqual(expect.arrayContaining([de08.id, de20.id]));
      });

      it('no lista las que ya se tomaron ni las omitidas', async () => {
        const m = medicamento(nuevoId(), { horarios: ['08:00'] });
        await medicamentos.guardar(m);
        await tomas.generarDelDia(m, HOY);
        const [toma] = await tomas.listarDelDia(m.adultoMayorId, HOY);
        toma!.marcarTomada(USUARIO, AHORA, HOY);
        await tomas.actualizar(toma!);

        const vencidas = await tomas.listarVencidas(
          a('23:59'),
          'America/Bogota',
          1000,
        );

        expect(vencidas).not.toContain(toma!.id);
      });

      it('respeta el límite', async () => {
        for (let i = 0; i < 3; i++) {
          const m = medicamento(nuevoId(), { horarios: ['08:00'] });
          await medicamentos.guardar(m);
          await tomas.generarDelDia(m, HOY);
        }

        expect(
          await tomas.listarVencidas(a('23:59'), 'America/Bogota', 2),
        ).toHaveLength(2);
      });
    });
  });

  describe('lecturas y rangos', () => {
    const lectura = (persona: string, cambios: Record<string, unknown> = {}) =>
      LecturaDeSignos.registrar({
        id: idDePrueba<'Lectura'>() as LecturaId,
        adultoMayorId: persona,
        tomadaEn: AHORA,
        presionSistolica: 120,
        presionDiastolica: 80,
        fuente: 'manual',
        registradaPor: USUARIO,
        rangos: RANGOS_POR_DEFECTO,
        ahora: AHORA,
        ...cambios,
      });

    it('guarda una lectura y la devuelve igual', async () => {
      const persona = nuevoId();
      const l = lectura(persona, { frecuenciaCardiaca: 72, glucosa: 95 });

      await lecturas.guardar(l);

      expect(await lecturas.ultima(persona)).toMatchObject({
        id: l.id,
        presionSistolica: 120,
        presionDiastolica: 80,
        frecuenciaCardiaca: 72,
        glucosa: 95,
        fueraDeRango: false,
        fuente: 'manual',
        registradaPor: USUARIO,
      });
    });

    it('una lectura con una sola medida guarda las demás como null (H8)', async () => {
      const persona = nuevoId();
      await lecturas.guardar(
        lectura(persona, {
          presionSistolica: null,
          presionDiastolica: null,
          glucosa: 100,
        }),
      );

      expect(await lecturas.ultima(persona)).toMatchObject({
        presionSistolica: null,
        presionDiastolica: null,
        glucosa: 100,
      });
    });

    it('sin lecturas, la última es null y la lista va vacía', async () => {
      const persona = nuevoId();

      expect(await lecturas.ultima(persona)).toBeNull();
      expect(await lecturas.listarDesde(persona, new Date(0))).toEqual([]);
    });

    it('lista desde una fecha, las más recientes primero, sin las de otra persona', async () => {
      const persona = nuevoId();
      const hace = (dias: number) =>
        new Date(AHORA.getTime() - dias * 86_400_000);
      const vieja = lectura(persona, { tomadaEn: hace(10) });
      const media = lectura(persona, { tomadaEn: hace(3) });
      const nueva = lectura(persona, { tomadaEn: hace(1) });
      for (const l of [vieja, nueva, media, lectura(nuevoId())])
        await lecturas.guardar(l);

      const ultimos7 = await lecturas.listarDesde(persona, hace(7));

      expect(ultimos7.map((l) => l.id)).toEqual([nueva.id, media.id]);
      expect((await lecturas.ultima(persona))?.id).toBe(nueva.id);
    });

    it('la base rechaza una presión diastólica mayor que la sistólica y una lectura sin medidas', async () => {
      const base = [nuevoId(), nuevoId(), AHORA.toISOString()];
      await expect(
        pool.query(
          `insert into teleasistencia.lecturas_signos (id, adulto_mayor_id, tomada_en, presion_sistolica, presion_diastolica, fuente)
           values ($1, $2, $3, 100, 120, 'manual')`,
          base,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          `insert into teleasistencia.lecturas_signos (id, adulto_mayor_id, tomada_en, fuente)
           values ($1, $2, $3, 'manual')`,
          [nuevoId(), nuevoId(), AHORA.toISOString()],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('los rangos de una persona se guardan y se reemplazan', async () => {
      const persona = nuevoId();
      expect(await rangos.obtener(persona)).toBeNull();

      await rangos.guardar(
        persona,
        { ...RANGOS_POR_DEFECTO, sistolicaMax: 160 },
        USUARIO,
        AHORA,
      );
      await rangos.guardar(
        persona,
        { ...RANGOS_POR_DEFECTO, sistolicaMax: 150, glucosaMin: null },
        USUARIO,
        AHORA,
      );

      expect(await rangos.obtener(persona)).toEqual({
        ...RANGOS_POR_DEFECTO,
        sistolicaMax: 150,
        glucosaMin: null,
      });
      expect(
        await filas(
          'select 1 from teleasistencia.rangos_de_referencia where adulto_mayor_id = $1',
          [persona],
        ),
      ).toHaveLength(1);
    });
  });

  describe('alertas', () => {
    const alerta = (
      persona: string,
      usuario = USUARIO,
      clave = `clave-${nuevoId()}`,
    ) =>
      Alerta.generar({
        id: idDePrueba<'Alerta'>() as AlertaId,
        adultoMayorId: persona,
        origen: 'boton',
        generadaPor: usuario,
        claveDeIdempotencia: clave,
        ahora: AHORA,
      });

    it('guarda una alerta y la devuelve igual', async () => {
      const persona = nuevoId();
      const a = alerta(persona);

      await alertas.guardar(a);

      expect(await alertas.buscarPorId(a.id)).toMatchObject({
        id: a.id,
        adultoMayorId: persona,
        origen: 'boton',
        estado: 'generada',
        generadaPor: USUARIO,
        generadaEn: AHORA,
        primeraEntregaEn: null,
      });
    });

    it('la misma persona no puede repetir una clave, pero otra sí', async () => {
      const clave = `clave-${nuevoId()}`;
      const usuario = nuevoId();
      await alertas.guardar(alerta(nuevoId(), usuario, clave));

      await expect(
        alertas.guardar(alerta(nuevoId(), usuario, clave)),
      ).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'alerta.clave_repetida',
      });
      await expect(
        alertas.guardar(alerta(nuevoId(), nuevoId(), clave)),
      ).resolves.toBeUndefined();
    });

    it('busca por quién y clave', async () => {
      const usuario = nuevoId();
      const a = alerta(nuevoId(), usuario);
      await alertas.guardar(a);

      expect(
        (await alertas.buscarPorClave(usuario, a.claveDeIdempotencia))?.id,
      ).toBe(a.id);
      expect(
        await alertas.buscarPorClave(nuevoId(), a.claveDeIdempotencia),
      ).toBeNull();
    });

    it('guarda la entrega y la atención', async () => {
      const a = alerta(nuevoId());
      await alertas.guardar(a);
      const cargada = (await alertas.buscarPorId(a.id))!;
      cargada.registrarEntrega(new Date(AHORA.getTime() + 4_000));
      await alertas.actualizar(cargada);
      const luego = (await alertas.buscarPorId(a.id))!;
      luego.atender(USUARIO, new Date(AHORA.getTime() + 60_000), 'Ya la llamé');
      await alertas.actualizar(luego);

      expect(await alertas.buscarPorId(a.id)).toMatchObject({
        estado: 'atendida',
        primeraEntregaEn: new Date(AHORA.getTime() + 4_000),
        atendidaPor: USUARIO,
        nota: 'Ya la llamé',
      });
    });

    it('cuenta solo las que siguen sin atender', async () => {
      const persona = nuevoId();
      const abierta = alerta(persona);
      const atendida = alerta(persona);
      await alertas.guardar(abierta);
      await alertas.guardar(atendida);
      const cargada = (await alertas.buscarPorId(atendida.id))!;
      cargada.atender(USUARIO, AHORA);
      await alertas.actualizar(cargada);
      await alertas.guardar(alerta(nuevoId()));

      expect(await alertas.contarAbiertas(persona)).toBe(1);
    });
  });

  it('las horas se conservan sin segundos', () => {
    expect(horaDelDia('08:00:00')).toBe('08:00');
  });
});
