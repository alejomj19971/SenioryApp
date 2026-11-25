import { describe, expect, it, vi } from 'vitest';
import type { Auditoria } from '../../../src/compartido/aplicacion/puertos/auditoria.js';
import type { UsuarioAutenticado } from '../../../src/compartido/aplicacion/puertos/verificador-de-tokens.js';
import { RecursoNoEncontrado } from '../../../src/compartido/dominio/errores.js';
import { ObtenerCuidadorParaRevisor } from '../../../src/directorio/aplicacion/casos-de-uso/revision.js';
import type { RepositorioCuidadores } from '../../../src/directorio/aplicacion/puertos/salida/repositorio-cuidadores.js';
import type { RepositorioDocumentos } from '../../../src/directorio/aplicacion/puertos/salida/repositorio-documentos.js';
import { Documento } from '../../../src/directorio/dominio/documento.js';
import type { Cuidador } from '../../../src/directorio/dominio/cuidador.js';
import type {
  CuidadorId,
  DocumentoId,
} from '../../../src/directorio/dominio/ids.js';
import {
  REVISOR_DE_PRUEBA,
  cuidadorDePrueba,
} from '../../soporte/directorio.js';
import { AHORA, idDePrueba } from '../../soporte/identidad.js';

const REVISOR = {
  id: REVISOR_DE_PRUEBA,
  rol: 'administrador',
} as unknown as UsuarioAutenticado;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function caso(cuidador: Cuidador | null, documentos: Documento[] = []) {
  const registrar = vi.fn().mockResolvedValue(undefined);
  const caso = new ObtenerCuidadorParaRevisor(
    {
      buscarPorId: vi.fn().mockResolvedValue(cuidador),
    } as unknown as RepositorioCuidadores,
    {
      listarDeCuidador: vi.fn().mockResolvedValue(documentos),
    } as unknown as RepositorioDocumentos,
    { registrar } as Auditoria,
    { ahora: () => AHORA },
    'America/Bogota',
  );
  return { caso, registrar };
}

describe('ObtenerCuidadorParaRevisor', () => {
  it('entrega al cuidador, sus tres controles y sus documentos, sin el teléfono', async () => {
    const cuidador = cuidadorDePrueba({
      controles: ['antecedentes'],
      activo: false,
    });
    const documento = Documento.subir({
      id: idDePrueba<'Documento'>() as DocumentoId,
      cuidadorId: cuidador.id,
      tipo: 'antecedentes',
      nombreOriginal: 'antecedentes.pdf',
      contenido: PDF,
      sha256: new Uint8Array(32),
      ahora: AHORA,
    });
    const { caso: obtener } = caso(cuidador, [documento]);

    const vista = await obtener.ejecutar(REVISOR, cuidador.id);

    expect(vista.cuidador).toMatchObject({
      id: cuidador.id,
      nombre: 'Marta Elena Restrepo',
      estado: 'borrador',
      visible: false,
      calificacion: null,
    });
    expect(JSON.stringify(vista)).not.toContain('+573168393514');
    expect(vista.controles.map((c) => [c.control, c.estado])).toEqual([
      ['antecedentes', 'aprobada'],
      ['titulos', 'sin_solicitar'],
      ['psicotecnica', 'sin_solicitar'],
    ]);
    expect(vista.controles[0]?.verificacionId).not.toBeNull();
    expect(vista.controles[1]?.verificacionId).toBeNull();
    expect(vista.documentos).toEqual([
      expect.objectContaining({
        id: documento.id,
        tipo: 'antecedentes',
        nombre: 'antecedentes.pdf',
      }),
    ]);
  });

  it('deja en la auditoría quién abrió el expediente de quién', async () => {
    const cuidador = cuidadorDePrueba();
    const { caso: obtener, registrar } = caso(cuidador);

    await obtener.ejecutar(REVISOR, cuidador.id);

    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: REVISOR_DE_PRUEBA,
        accion: 'directorio.ver_expediente',
        recursoTipo: 'cuidador',
        recursoId: cuidador.id,
        resultado: 'permitido',
      }),
    );
  });

  it('un cuidador que no existe es «no encontrado» y no deja huella', async () => {
    const { caso: obtener, registrar } = caso(null);

    await expect(
      obtener.ejecutar(REVISOR, idDePrueba<'Cuidador'>() as CuidadorId),
    ).rejects.toBeInstanceOf(RecursoNoEncontrado);
    expect(registrar).not.toHaveBeenCalled();
  });
});
