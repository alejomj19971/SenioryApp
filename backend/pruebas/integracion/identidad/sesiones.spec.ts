import { RecursoNoEncontrado } from '../../../src/compartido/dominio/errores.js';
import { VENTANA_DE_GRACIA_MS } from '../../../src/identidad/dominio/sesion-de-refresco.js';
import { RelojFalso } from '../../soporte/dobles.js';
import { AHORA, idDePrueba } from '../../soporte/identidad.js';
import {
  esperar,
  guardarFamiliar,
  hashDeTokenAleatorio,
  montarRepositoriosDeIdentidad,
  sesionDePrueba,
} from '../../soporte/repositorios-identidad.js';

const DIA = 24 * 60 * 60_000;

describe('RepositorioSesionesDrizzle', () => {
  const repos = montarRepositoriosDeIdentidad();
  const { sesiones, contexto } = repos;

  afterAll(async () => {
    await repos.pool.end();
  });

  async function filaDe(id: string) {
    const { rows } = await repos.pool.query<{
      reemplazada_en: Date | null;
      reemplazada_por: string | null;
      revocada_en: Date | null;
    }>(
      'select reemplazada_en, reemplazada_por, revocada_en from identidad.sesiones_refresco where id = $1',
      [id],
    );
    const fila = rows[0];
    if (fila === undefined) throw new Error(`No existe la sesión ${id}`);
    return fila;
  }

  describe('guardar y buscar por hash', () => {
    it('guarda una sesión y la encuentra por el hash de su token', async () => {
      const usuario = await guardarFamiliar(repos);
      const hash = hashDeTokenAleatorio();
      const sesion = sesionDePrueba(usuario.id, { hash });

      await sesiones.guardar(sesion);
      const encontrada = await sesiones.buscarPorHashDelToken(hash);

      expect(encontrada).toMatchObject({
        id: sesion.id,
        usuarioId: usuario.id,
        familiaId: sesion.familiaId,
        emitidaEn: AHORA,
        expiraEn: new Date(AHORA.getTime() + 30 * DIA),
        reemplazadaEn: null,
        reemplazadaPor: null,
        revocadaEn: null,
      });
      expect(
        Buffer.from(encontrada?.hashDelToken ?? []).equals(Buffer.from(hash)),
      ).toBe(true);
    });

    it('devuelve null si ninguna sesión tiene ese hash', async () => {
      expect(
        await sesiones.buscarPorHashDelToken(hashDeTokenAleatorio()),
      ).toBeNull();
    });

    it('un hash repetido es un conflicto (señal de un generador de tokens roto)', async () => {
      const usuario = await guardarFamiliar(repos);
      const hash = hashDeTokenAleatorio();
      await sesiones.guardar(sesionDePrueba(usuario.id, { hash }));

      await expect(
        sesiones.guardar(sesionDePrueba(usuario.id, { hash })),
      ).rejects.toThrow(
        expect.objectContaining({ codigo: 'sesion.token_repetido' }),
      );
    });
  });

  describe('actualizar', () => {
    it('guarda el reemplazo de una sesión y cuál la reemplazó', async () => {
      const usuario = await guardarFamiliar(repos);
      const vieja = sesionDePrueba(usuario.id);
      const nueva = sesionDePrueba(usuario.id, { familiaId: vieja.familiaId });
      await sesiones.guardar(vieja);
      await sesiones.guardar(nueva);

      vieja.rotar(AHORA, nueva.id);
      await sesiones.actualizar(vieja);

      expect(await filaDe(vieja.id)).toEqual({
        reemplazada_en: AHORA,
        reemplazada_por: nueva.id,
        revocada_en: null,
      });
    });

    it('nunca sobrescribe la primera marca: renovar a la vez no extiende la ventana de gracia', async () => {
      const reloj = new RelojFalso();
      const usuario = await guardarFamiliar(repos);
      const original = sesionDePrueba(usuario.id, { ahora: reloj.ahora() });
      const primera = sesionDePrueba(usuario.id, {
        familiaId: original.familiaId,
      });
      const segunda = sesionDePrueba(usuario.id, {
        familiaId: original.familiaId,
      });
      await sesiones.guardar(original);
      await sesiones.guardar(primera);
      await sesiones.guardar(segunda);
      const primeraMarca = reloj.ahora();

      // Dos renovaciones leen la misma sesión «válida» y cada una la marca como reemplazada.
      const copiaA = await sesiones.buscarPorHashDelToken(
        original.hashDelToken,
      );
      const copiaB = await sesiones.buscarPorHashDelToken(
        original.hashDelToken,
      );
      copiaA?.rotar(primeraMarca, primera.id);
      await sesiones.actualizar(copiaA ?? original);
      reloj.avanzar(20_000);
      if (copiaB) {
        // La segunda no vio la marca de la primera (leyó antes), así que cree que la sesión es válida.
        copiaB.rotar(reloj.ahora(), segunda.id);
        await sesiones.actualizar(copiaB);
      }

      expect(await filaDe(original.id)).toEqual({
        reemplazada_en: primeraMarca,
        reemplazada_por: primera.id,
        revocada_en: null,
      });
      const recargada = await sesiones.buscarPorHashDelToken(
        original.hashDelToken,
      );
      reloj.avanzar(VENTANA_DE_GRACIA_MS - 20_000 + 1);
      expect(recargada?.evaluarUso(reloj.ahora())).toBe('reutilizada');
    });

    it('guarda la revocación y conserva el primer instante aunque otra copia revoque después', async () => {
      const usuario = await guardarFamiliar(repos);
      const sesion = sesionDePrueba(usuario.id);
      await sesiones.guardar(sesion);
      const despues = new Date(AHORA.getTime() + 60_000);
      // Dos copias leídas antes de que alguna revoque: cada una cree que la sesión sigue vigente.
      const copiaA = await sesiones.buscarPorHashDelToken(sesion.hashDelToken);
      const copiaB = await sesiones.buscarPorHashDelToken(sesion.hashDelToken);

      copiaA?.revocar(AHORA);
      await sesiones.actualizar(copiaA ?? sesion);
      copiaB?.revocar(despues);
      await sesiones.actualizar(copiaB ?? sesion);

      expect((await filaDe(sesion.id)).revocada_en).toEqual(AHORA);
    });

    it('una sesión que no existe es un recurso no encontrado', async () => {
      const sesion = sesionDePrueba(idDePrueba());

      await expect(sesiones.actualizar(sesion)).rejects.toThrow(
        expect.objectContaining({
          codigo: 'sesion.no_encontrada',
          constructor: RecursoNoEncontrado,
        }),
      );
    });
  });

  describe('revocarFamilia', () => {
    it('revoca todas las sesiones sin revocar de la familia y no toca las demás', async () => {
      const usuario = await guardarFamiliar(repos);
      const familia = idDePrueba<'FamiliaDeSesiones'>();
      const a = sesionDePrueba(usuario.id, { familiaId: familia });
      const b = sesionDePrueba(usuario.id, { familiaId: familia });
      const yaRevocada = sesionDePrueba(usuario.id, { familiaId: familia });
      const deOtraFamilia = sesionDePrueba(usuario.id);
      for (const s of [a, b, yaRevocada, deOtraFamilia])
        await sesiones.guardar(s);
      yaRevocada.revocar(AHORA);
      await sesiones.actualizar(yaRevocada);
      const ahora = new Date(AHORA.getTime() + 60_000);

      const revocadas = await sesiones.revocarFamilia(familia, ahora);

      expect(revocadas).toBe(2);
      expect((await filaDe(a.id)).revocada_en).toEqual(ahora);
      expect((await filaDe(b.id)).revocada_en).toEqual(ahora);
      expect((await filaDe(yaRevocada.id)).revocada_en).toEqual(AHORA);
      expect((await filaDe(deOtraFamilia.id)).revocada_en).toBeNull();
    });

    it('una familia sin sesiones revoca cero', async () => {
      expect(await sesiones.revocarFamilia(idDePrueba(), AHORA)).toBe(0);
    });
  });

  describe('eliminarVencidasAntesDe', () => {
    it('borra las vencidas antes del límite, incluida una cadena de reemplazos, y deja las demás', async () => {
      const usuario = await guardarFamiliar(repos);
      const familia = idDePrueba<'FamiliaDeSesiones'>();
      const hace60Dias = new Date(AHORA.getTime() - 60 * DIA);
      // Una cadena A → B (A fue reemplazada por B), las dos ya vencidas hace más de 30 días.
      const a = sesionDePrueba(usuario.id, {
        familiaId: familia,
        ahora: hace60Dias,
        duracionMs: 5 * DIA,
      });
      const b = sesionDePrueba(usuario.id, {
        familiaId: familia,
        ahora: new Date(hace60Dias.getTime() + DIA),
        duracionMs: 5 * DIA,
      });
      const reciente = sesionDePrueba(usuario.id, { ahora: AHORA });
      const vencidaHaceUnaSemana = sesionDePrueba(usuario.id, {
        ahora: new Date(AHORA.getTime() - 10 * DIA),
        duracionMs: 3 * DIA,
      });
      for (const s of [a, b, reciente, vencidaHaceUnaSemana])
        await sesiones.guardar(s);
      a.rotar(a.emitidaEn, b.id);
      await sesiones.actualizar(a);

      const borradas = await sesiones.eliminarVencidasAntesDe(
        new Date(AHORA.getTime() - 30 * DIA),
      );

      expect(borradas).toBeGreaterThanOrEqual(2);
      expect(await sesiones.buscarPorHashDelToken(a.hashDelToken)).toBeNull();
      expect(await sesiones.buscarPorHashDelToken(b.hashDelToken)).toBeNull();
      expect(
        await sesiones.buscarPorHashDelToken(reciente.hashDelToken),
      ).not.toBeNull();
      expect(
        await sesiones.buscarPorHashDelToken(vencidaHaceUnaSemana.hashDelToken),
      ).not.toBeNull();
    });
  });

  describe('renovaciones simultáneas', () => {
    it('mientras una transacción tiene la sesión, la otra espera y después ya ve el reemplazo', async () => {
      const usuario = await guardarFamiliar(repos);
      const original = sesionDePrueba(usuario.id);
      const nueva = sesionDePrueba(usuario.id, {
        familiaId: original.familiaId,
      });
      await sesiones.guardar(original);
      await sesiones.guardar(nueva);
      let soltar!: () => void;
      const espera = new Promise<void>((resolver) => (soltar = resolver));
      let primeraTieneElBloqueo!: () => void;
      const bloqueado = new Promise<void>((r) => (primeraTieneElBloqueo = r));
      let usoQueVioLaSegunda: string | undefined;

      const primera = contexto.ejecutar(async () => {
        const sesion = await sesiones.buscarPorHashDelToken(
          original.hashDelToken,
        );
        primeraTieneElBloqueo();
        await espera;
        sesion?.rotar(AHORA, nueva.id);
        if (sesion) await sesiones.actualizar(sesion);
      });
      await Promise.race([bloqueado, primera]);
      const segunda = contexto.ejecutar(async () => {
        const sesion = await sesiones.buscarPorHashDelToken(
          original.hashDelToken,
        );
        usoQueVioLaSegunda = sesion?.evaluarUso(AHORA);
      });

      await esperar(300);
      expect(usoQueVioLaSegunda).toBeUndefined(); // sigue esperando
      soltar();
      await Promise.all([primera, segunda]);
      expect(usoQueVioLaSegunda).toBe('en_gracia'); // ya vio que la primera la reemplazó
    });
  });
});
