import { RecursoNoEncontrado } from '../../../src/compartido/dominio/errores.js';
import { TokenDeRecuperacion } from '../../../src/identidad/dominio/token-de-recuperacion.js';
import type { UsuarioId } from '../../../src/identidad/dominio/ids.js';
import { RelojFalso } from '../../soporte/dobles.js';
import { AHORA, idDePrueba } from '../../soporte/identidad.js';
import {
  esperar,
  guardarFamiliar,
  hashDeTokenAleatorio,
  montarRepositoriosDeIdentidad,
  sesionDePrueba,
} from '../../soporte/repositorios-identidad.js';

const MINUTO = 60_000;

function tokenDePrueba(
  usuarioId: UsuarioId,
  opciones: { hash?: Uint8Array; ahora?: Date } = {},
) {
  return TokenDeRecuperacion.emitir({
    id: idDePrueba<'TokenDeRecuperacion'>(),
    usuarioId,
    hashDelToken: opciones.hash ?? hashDeTokenAleatorio(),
    ahora: opciones.ahora ?? AHORA,
    duracionMs: 30 * MINUTO,
  });
}

describe('RepositorioTokensDeRecuperacionDrizzle', () => {
  const repos = montarRepositoriosDeIdentidad();
  const { tokensDeRecuperacion: tokens, contexto } = repos;

  afterAll(async () => {
    await repos.pool.end();
  });

  async function filaDe(id: string) {
    const { rows } = await repos.pool.query<{ usado_en: Date | null }>(
      'select usado_en from identidad.tokens_de_recuperacion where id = $1',
      [id],
    );
    const fila = rows[0];
    if (fila === undefined) throw new Error(`No existe el token ${id}`);
    return fila;
  }

  describe('guardar y buscar por hash', () => {
    it('guarda un token y lo encuentra por el hash, con y sin bloqueo', async () => {
      const usuario = await guardarFamiliar(repos);
      const hash = hashDeTokenAleatorio();
      const token = tokenDePrueba(usuario.id, { hash });

      await tokens.guardar(token);
      const sinBloqueo = await tokens.buscarPorHashDelToken(hash);
      const conBloqueo = await contexto.ejecutar(() =>
        tokens.buscarPorHashParaActualizar(hash),
      );

      for (const encontrado of [sinBloqueo, conBloqueo]) {
        expect(encontrado).toMatchObject({
          id: token.id,
          usuarioId: usuario.id,
          creadoEn: AHORA,
          expiraEn: new Date(AHORA.getTime() + 30 * MINUTO),
          usadoEn: null,
        });
        expect(
          Buffer.from(encontrado?.hashDelToken ?? []).equals(Buffer.from(hash)),
        ).toBe(true);
      }
    });

    it('devuelve null si ningún token tiene ese hash', async () => {
      expect(
        await tokens.buscarPorHashDelToken(hashDeTokenAleatorio()),
      ).toBeNull();
      expect(
        await contexto.ejecutar(() =>
          tokens.buscarPorHashParaActualizar(hashDeTokenAleatorio()),
        ),
      ).toBeNull();
    });

    it('un hash repetido es un conflicto (señal de un generador de tokens roto)', async () => {
      const usuario = await guardarFamiliar(repos);
      const hash = hashDeTokenAleatorio();
      await tokens.guardar(tokenDePrueba(usuario.id, { hash }));

      await expect(
        tokens.guardar(tokenDePrueba(usuario.id, { hash })),
      ).rejects.toThrow(
        expect.objectContaining({ codigo: 'recuperacion.token_repetido' }),
      );
    });
  });

  describe('actualizar', () => {
    it('guarda que el token se usó', async () => {
      const usuario = await guardarFamiliar(repos);
      const token = tokenDePrueba(usuario.id);
      await tokens.guardar(token);

      token.usar(AHORA);
      await tokens.actualizar(token);

      expect((await filaDe(token.id)).usado_en).toEqual(AHORA);
    });

    it('conserva la primera marca de uso aunque otra copia lo marque después', async () => {
      const usuario = await guardarFamiliar(repos);
      const hash = hashDeTokenAleatorio();
      await tokens.guardar(tokenDePrueba(usuario.id, { hash }));
      // Dos copias leídas antes de que alguna lo use.
      const copiaA = await tokens.buscarPorHashDelToken(hash);
      const copiaB = await tokens.buscarPorHashDelToken(hash);
      copiaA?.usar(AHORA);
      await tokens.actualizar(copiaA as TokenDeRecuperacion);

      copiaB?.usar(new Date(AHORA.getTime() + MINUTO));
      await tokens.actualizar(copiaB as TokenDeRecuperacion);

      expect(
        (await filaDe((copiaA as TokenDeRecuperacion).id)).usado_en,
      ).toEqual(AHORA);
    });

    it('un token que no existe es un recurso no encontrado', async () => {
      const token = tokenDePrueba(idDePrueba());

      await expect(tokens.actualizar(token)).rejects.toThrow(
        expect.objectContaining({
          codigo: 'recuperacion.no_encontrado',
          constructor: RecursoNoEncontrado,
        }),
      );
    });
  });

  describe('buscarUltimoDeUsuario', () => {
    it('devuelve el más reciente, usado o no, y null si no hay', async () => {
      const usuario = await guardarFamiliar(repos);
      expect(await tokens.buscarUltimoDeUsuario(usuario.id)).toBeNull();
      const viejo = tokenDePrueba(usuario.id, { ahora: AHORA });
      const reciente = tokenDePrueba(usuario.id, {
        ahora: new Date(AHORA.getTime() + 5 * MINUTO),
      });
      await tokens.guardar(viejo);
      await tokens.guardar(reciente);
      reciente.usar(new Date(AHORA.getTime() + 6 * MINUTO));
      await tokens.actualizar(reciente);

      expect((await tokens.buscarUltimoDeUsuario(usuario.id))?.id).toBe(
        reciente.id,
      );
    });
  });

  describe('invalidarPendientesDeUsuario', () => {
    it('gasta los tokens sin usar de la cuenta y no toca los de otras ni los ya usados', async () => {
      const usuario = await guardarFamiliar(repos);
      const otro = await guardarFamiliar(repos);
      const a = tokenDePrueba(usuario.id);
      const b = tokenDePrueba(usuario.id);
      const yaUsado = tokenDePrueba(usuario.id);
      const ajeno = tokenDePrueba(otro.id);
      for (const t of [a, b, yaUsado, ajeno]) await tokens.guardar(t);
      yaUsado.usar(AHORA);
      await tokens.actualizar(yaUsado);
      const despues = new Date(AHORA.getTime() + MINUTO);

      const gastados = await tokens.invalidarPendientesDeUsuario(
        usuario.id,
        despues,
      );

      expect(gastados).toBe(2);
      expect((await filaDe(a.id)).usado_en).toEqual(despues);
      expect((await filaDe(b.id)).usado_en).toEqual(despues);
      expect((await filaDe(yaUsado.id)).usado_en).toEqual(AHORA);
      expect((await filaDe(ajeno.id)).usado_en).toBeNull();
    });

    it('una cuenta sin tokens gasta cero', async () => {
      expect(
        await tokens.invalidarPendientesDeUsuario(idDePrueba(), AHORA),
      ).toBe(0);
    });
  });

  describe('eliminarVencidosAntesDe', () => {
    it('borra los vencidos antes del límite y deja los demás', async () => {
      const usuario = await guardarFamiliar(repos);
      const viejo = tokenDePrueba(usuario.id, {
        ahora: new Date(AHORA.getTime() - 60 * 24 * 60 * MINUTO),
      });
      const reciente = tokenDePrueba(usuario.id);
      await tokens.guardar(viejo);
      await tokens.guardar(reciente);

      const borrados = await tokens.eliminarVencidosAntesDe(
        new Date(AHORA.getTime() - 30 * 24 * 60 * MINUTO),
      );

      expect(borrados).toBeGreaterThanOrEqual(1);
      expect(await tokens.buscarPorHashDelToken(viejo.hashDelToken)).toBeNull();
      expect(
        await tokens.buscarPorHashDelToken(reciente.hashDelToken),
      ).not.toBeNull();
    });
  });

  describe('usos simultáneos del mismo enlace', () => {
    it('mientras una transacción tiene el token, la otra espera y después lo ve gastado', async () => {
      const reloj = new RelojFalso();
      const usuario = await guardarFamiliar(repos);
      const hash = hashDeTokenAleatorio();
      await tokens.guardar(
        tokenDePrueba(usuario.id, { hash, ahora: reloj.ahora() }),
      );
      let soltar!: () => void;
      const espera = new Promise<void>((resolver) => (soltar = resolver));
      let primeraTieneElBloqueo!: () => void;
      const bloqueado = new Promise<void>((r) => (primeraTieneElBloqueo = r));
      let estadoQueVioLaSegunda: string | undefined;

      const primera = contexto.ejecutar(async () => {
        const token = await tokens.buscarPorHashParaActualizar(hash);
        primeraTieneElBloqueo();
        await espera;
        token?.usar(reloj.ahora());
        if (token) await tokens.actualizar(token);
      });
      await Promise.race([bloqueado, primera]);
      const segunda = contexto.ejecutar(async () => {
        const token = await tokens.buscarPorHashParaActualizar(hash);
        estadoQueVioLaSegunda = token?.evaluar(reloj.ahora());
      });

      await esperar(300);
      expect(estadoQueVioLaSegunda).toBeUndefined(); // sigue esperando
      soltar();
      await Promise.all([primera, segunda]);
      expect(estadoQueVioLaSegunda).toBe('usado');
    });
  });
});

describe('RepositorioSesionesDrizzle.revocarTodasDeUsuario', () => {
  const repos = montarRepositoriosDeIdentidad();

  afterAll(async () => {
    await repos.pool.end();
  });

  it('revoca las sesiones sin revocar de TODAS las familias del usuario y no toca las de otro', async () => {
    const usuario = await guardarFamiliar(repos);
    const otro = await guardarFamiliar(repos);
    const deUnDispositivo = sesionDePrueba(usuario.id);
    const deOtroDispositivo = sesionDePrueba(usuario.id);
    const yaRevocada = sesionDePrueba(usuario.id);
    const ajena = sesionDePrueba(otro.id);
    for (const s of [deUnDispositivo, deOtroDispositivo, yaRevocada, ajena]) {
      await repos.sesiones.guardar(s);
    }
    yaRevocada.revocar(AHORA);
    await repos.sesiones.actualizar(yaRevocada);
    const ahora = new Date(AHORA.getTime() + MINUTO);

    const revocadas = await repos.sesiones.revocarTodasDeUsuario(
      usuario.id,
      ahora,
    );

    expect(revocadas).toBe(2);
    const revocadaEn = async (hash: Uint8Array) =>
      (await repos.sesiones.buscarPorHashDelToken(hash))?.revocadaEn;
    expect(await revocadaEn(deUnDispositivo.hashDelToken)).toEqual(ahora);
    expect(await revocadaEn(deOtroDispositivo.hashDelToken)).toEqual(ahora);
    expect(await revocadaEn(yaRevocada.hashDelToken)).toEqual(AHORA);
    expect(await revocadaEn(ajena.hashDelToken)).toBeNull();
  });

  it('un usuario sin sesiones revoca cero', async () => {
    expect(
      await repos.sesiones.revocarTodasDeUsuario(idDePrueba(), AHORA),
    ).toBe(0);
  });
});
