import { describe, expect, it, vi } from 'vitest';
import type { Auditoria } from '../../../src/compartido/aplicacion/puertos/auditoria.js';
import type { UnidadDeTrabajo } from '../../../src/compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { UsuarioAutenticado } from '../../../src/compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../src/compartido/dominio/errores.js';
import {
  ReactivarCuidador,
  SuspenderCuidador,
} from '../../../src/directorio/aplicacion/casos-de-uso/revision.js';
import type { RepositorioCuidadores } from '../../../src/directorio/aplicacion/puertos/salida/repositorio-cuidadores.js';
import type { EventosDeDirectorio } from '../../../src/directorio/aplicacion/servicios/eventos-de-directorio.js';
import type { Cuidador } from '../../../src/directorio/dominio/cuidador.js';
import type { CuidadorId } from '../../../src/directorio/dominio/ids.js';
import {
  REVISOR_DE_PRUEBA,
  cuidadorDePrueba,
} from '../../soporte/directorio.js';
import { AHORA, idDePrueba } from '../../soporte/identidad.js';

const REVISOR = {
  id: REVISOR_DE_PRUEBA,
  rol: 'administrador',
} as unknown as UsuarioAutenticado;

const USUARIO_DEL_CUIDADOR = '0198aaaa-0000-7000-8000-0000000000c1';

const unidadDeTrabajo = {
  ejecutar: <T>(trabajo: () => Promise<T>) => trabajo(),
} as unknown as UnidadDeTrabajo;

function entorno(cuidador: Cuidador | null) {
  const actualizar = vi.fn().mockResolvedValue(undefined);
  const publicar = vi.fn().mockResolvedValue(undefined);
  const registrar = vi.fn().mockResolvedValue(undefined);
  const cuidadores = {
    buscarPorIdParaActualizar: vi.fn().mockResolvedValue(cuidador),
    actualizar,
  } as unknown as RepositorioCuidadores;
  const eventos = { publicar } as unknown as EventosDeDirectorio;
  const auditoria = { registrar } as Auditoria;
  const reloj = { ahora: () => AHORA };
  return {
    suspender: new SuspenderCuidador(
      cuidadores,
      unidadDeTrabajo,
      eventos,
      auditoria,
      reloj,
    ),
    reactivar: new ReactivarCuidador(
      cuidadores,
      unidadDeTrabajo,
      eventos,
      auditoria,
      reloj,
      'America/Bogota',
    ),
    actualizar,
    publicar,
    registrar,
  };
}

describe('SuspenderCuidador', () => {
  it('suspende a un cuidador activo y visible: lo oculta, avisa que se suspendió y que se ocultó, y lo deja en la auditoría', async () => {
    const cuidador = cuidadorDePrueba({ usuarioId: USUARIO_DEL_CUIDADOR });
    const { suspender, actualizar, publicar, registrar } = entorno(cuidador);

    const resultado = await suspender.ejecutar(REVISOR, cuidador.id);

    expect(resultado).toEqual({ estado: 'suspendido', visible: false });
    expect(actualizar).toHaveBeenCalledWith(cuidador);
    expect(publicar.mock.calls.map((llamada) => llamada[0])).toEqual([
      'directorio.cuidador_suspendido',
      'directorio.cuidador_oculto',
    ]);
    // Lleva la cuenta del cuidador para que Identidad se la bloquee.
    expect(publicar).toHaveBeenCalledWith(
      'directorio.cuidador_suspendido',
      { cuidadorId: cuidador.id, usuarioId: USUARIO_DEL_CUIDADOR },
      AHORA,
    );
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: REVISOR_DE_PRUEBA,
        accion: 'directorio.suspender_cuidador',
        recursoTipo: 'cuidador',
        recursoId: cuidador.id,
        resultado: 'permitido',
      }),
    );
  });

  it('suspender a uno activo pero que ya no se muestra avisa solo de la suspensión (no hay nada que ocultar)', async () => {
    // Activo con controles faltantes: no es visible.
    const cuidador = cuidadorDePrueba({ controles: ['antecedentes'] });
    expect(cuidador.visible).toBe(false);
    const { suspender, publicar } = entorno(cuidador);

    await suspender.ejecutar(REVISOR, cuidador.id);

    expect(publicar.mock.calls.map((llamada) => llamada[0])).toEqual([
      'directorio.cuidador_suspendido',
    ]);
  });

  it('solo se suspende a un cuidador activo: uno en borrador o ya suspendido es 409 y no deja rastro', async () => {
    const enBorrador = cuidadorDePrueba({ activo: false });
    const yaSuspendido = cuidadorDePrueba();
    yaSuspendido.suspender(AHORA);

    for (const cuidador of [enBorrador, yaSuspendido]) {
      const { suspender, actualizar, publicar, registrar } = entorno(cuidador);
      await expect(
        suspender.ejecutar(REVISOR, cuidador.id),
      ).rejects.toBeInstanceOf(ConflictoDeEstado);
      expect(actualizar).not.toHaveBeenCalled();
      expect(publicar).not.toHaveBeenCalled();
      expect(registrar).not.toHaveBeenCalled();
    }
  });

  it('un cuidador que no existe es «no encontrado»', async () => {
    const { suspender } = entorno(null);

    await expect(
      suspender.ejecutar(REVISOR, idDePrueba<'Cuidador'>() as CuidadorId),
    ).rejects.toBeInstanceOf(RecursoNoEncontrado);
  });
});

describe('ReactivarCuidador', () => {
  it('lo devuelve a activo y, con sus tres controles vigentes, vuelve a mostrarse', async () => {
    const cuidador = cuidadorDePrueba({ usuarioId: USUARIO_DEL_CUIDADOR });
    cuidador.suspender(AHORA);
    const { reactivar, actualizar, publicar, registrar } = entorno(cuidador);

    const resultado = await reactivar.ejecutar(REVISOR, cuidador.id);

    expect(resultado).toEqual({ estado: 'activo', visible: true });
    expect(actualizar).toHaveBeenCalledWith(cuidador);
    // Avisa que se reactivó (Identidad le reabre la cuenta) y que vuelve a mostrarse.
    expect(publicar.mock.calls.map((llamada) => llamada[0])).toEqual([
      'directorio.cuidador_reactivado',
      'directorio.cuidador_visible',
    ]);
    expect(publicar).toHaveBeenCalledWith(
      'directorio.cuidador_reactivado',
      { cuidadorId: cuidador.id, usuarioId: USUARIO_DEL_CUIDADOR },
      AHORA,
    );
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'directorio.reactivar_cuidador',
        recursoId: cuidador.id,
      }),
    );
  });

  it('si le falta algún control vigente, vuelve a activo pero sigue oculto', async () => {
    const cuidador = cuidadorDePrueba({
      controles: ['antecedentes', 'titulos'],
    });
    cuidador.suspender(AHORA);
    const { reactivar, publicar } = entorno(cuidador);

    const resultado = await reactivar.ejecutar(REVISOR, cuidador.id);

    expect(resultado).toEqual({ estado: 'activo', visible: false });
    // Se reabre la cuenta, pero no vuelve a mostrarse: no hay aviso de «visible».
    expect(publicar.mock.calls.map((llamada) => llamada[0])).toEqual([
      'directorio.cuidador_reactivado',
    ]);
  });

  it('solo se reactiva a un cuidador suspendido', async () => {
    const cuidador = cuidadorDePrueba();
    const { reactivar, actualizar, registrar } = entorno(cuidador);

    await expect(
      reactivar.ejecutar(REVISOR, cuidador.id),
    ).rejects.toBeInstanceOf(ConflictoDeEstado);
    expect(actualizar).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });
});
