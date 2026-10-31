import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { GENERADOR_DE_IDS } from '../../../src/compartido/aplicacion/puertos/generador-de-ids.js';
import { PUBLICADOR_DE_EVENTOS } from '../../../src/compartido/aplicacion/puertos/publicador-de-eventos.js';
import { RELOJ } from '../../../src/compartido/aplicacion/puertos/reloj.js';
import { UNIDAD_DE_TRABAJO } from '../../../src/compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  ServicioNoDisponible,
} from '../../../src/compartido/dominio/errores.js';
import { FechaCivil } from '../../../src/compartido/dominio/fecha-civil.js';
import type { ServicioCalificado } from '../../../src/compartido/eventos/reservas.js';
import { DespachadorDeEventos } from '../../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { RegistroDeManejadores } from '../../../src/compartido/infraestructura/outbox/registro-de-manejadores.js';
import {
  ImportarCuidador,
  type EntradaDeCuidadorImportado,
} from '../../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import { RevisarVigencias } from '../../../src/directorio/aplicacion/casos-de-uso/revisar-vigencias.js';
import {
  CONSULTA_DE_DIRECTORIO,
  type ConsultaDeDirectorio,
} from '../../../src/directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import { como, registrarFamiliar } from '../../soporte/api.js';
import { crearAppDePrueba } from '../../soporte/app.js';
import { conectarBd, nuevoId } from '../../soporte/bd.js';
import { RelojFalso } from '../../soporte/dobles.js';
import { REVISOR_DE_PRUEBA } from '../../soporte/directorio.js';

// Los casos de uso de Directorio con la aplicación completa y Postgres real: la importación de cuidadores, la
// revisión diaria de vigencias, la reseña que nace de un evento de Reservas y lo que se ofrece a otros módulos.

const reloj = new RelojFalso(new Date());
const bd = conectarBd();
const ZONA_NEGOCIO = 'America/Bogota';

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

const hoy = () => FechaCivil.hoy(reloj, ZONA_NEGOCIO);

function entrada(
  cambios: Partial<EntradaDeCuidadorImportado> = {},
): EntradaDeCuidadorImportado {
  const marca = nuevoId().slice(0, 8);
  return {
    nombre: `Marta ${marca}`,
    correo: `${marca}@cuidadores.seniory.invalid`,
    telefono: '+573001234567',
    especialidad: 'enfermeria',
    titulo: 'Enfermera profesional',
    aniosExperiencia: 6,
    tarifaHora: 25_000,
    zona: `Zona${marca}`,
    disponibilidad: ['manana', 'tarde'],
    bio: 'Cuido con paciencia.',
    controles: [
      { control: 'antecedentes', vigenteHasta: hoy().sumarDias(365).aTexto() },
      { control: 'titulos', vigenteHasta: null },
      { control: 'psicotecnica', vigenteHasta: hoy().sumarDias(365).aTexto() },
    ],
    ...cambios,
  };
}

describe('casos de uso de Directorio', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  beforeEach(() => reloj.fijar(new Date()));

  const importar = () => app.get(ImportarCuidador, { strict: false });
  const revisar = () => app.get(RevisarVigencias, { strict: false });

  describe('importar un cuidador', () => {
    it('crea su cuenta de cuidador, su perfil visible, los tres controles aprobados y el aviso', async () => {
      const datos = entrada();

      const { cuidadorId, usuarioId } = await importar().ejecutar(
        datos,
        REVISOR_DE_PRUEBA,
      );

      const [usuario] = await filas<{ rol: string; correo: string }>(
        'select rol, correo from identidad.usuarios where id = $1',
        [usuarioId],
      );
      expect(usuario).toEqual({ rol: 'cuidador', correo: datos.correo });
      const [cuidador] = await filas<{
        estado: string;
        visible: boolean;
        usuario_id: string;
      }>(
        'select estado, visible, usuario_id from directorio.cuidadores where id = $1',
        [cuidadorId],
      );
      expect(cuidador).toEqual({
        estado: 'activo',
        visible: true,
        usuario_id: usuarioId,
      });
      const controles = await filas<{
        control: string;
        estado: string;
        revisado_por: string;
      }>(
        'select control, estado, revisado_por from directorio.verificaciones where cuidador_id = $1 order by control',
        [cuidadorId],
      );
      expect(controles).toEqual([
        {
          control: 'antecedentes',
          estado: 'aprobada',
          revisado_por: REVISOR_DE_PRUEBA,
        },
        {
          control: 'psicotecnica',
          estado: 'aprobada',
          revisado_por: REVISOR_DE_PRUEBA,
        },
        {
          control: 'titulos',
          estado: 'aprobada',
          revisado_por: REVISOR_DE_PRUEBA,
        },
      ]);
      const eventos = await filas(
        `select 1 from compartido.outbox where tipo = 'directorio.cuidador_visible' and datos->>'cuidadorId' = $1`,
        [cuidadorId],
      );
      expect(eventos).toHaveLength(1);
      const auditoria = await filas(
        `select 1 from compartido.auditoria where accion = 'directorio.importar_cuidador' and recurso_id = $1`,
        [cuidadorId],
      );
      expect(auditoria).toHaveLength(1);
    });

    it('la cuenta nace con una contraseña que nadie conoce: no se puede entrar con ninguna', async () => {
      const datos = entrada();
      await importar().ejecutar(datos, REVISOR_DE_PRUEBA);

      for (const contrasena of ['una contraseña larga y única', datos.correo]) {
        const respuesta = await como(app)
          .post('/api/v1/auth/login')
          .send({ correo: datos.correo, contrasena });
        expect(respuesta.status).toBe(401);
      }
    });

    it('un correo que ya tiene cuenta se rechaza y no crea nada del cuidador', async () => {
      const datos = entrada();
      await importar().ejecutar(datos, REVISOR_DE_PRUEBA);

      await expect(
        importar().ejecutar(
          { ...datos, nombre: `Otra ${nuevoId().slice(0, 6)}` },
          REVISOR_DE_PRUEBA,
        ),
      ).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'usuario.correo_ya_registrado',
      });
      expect(
        await filas('select 1 from directorio.cuidadores where zona = $1', [
          datos.zona,
        ]),
      ).toHaveLength(1);
    });

    it('si el perfil no es válido, tampoco queda la cuenta (todo o nada)', async () => {
      const datos = entrada({ tarifaHora: 0 });

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({ codigo: 'cuidador.tarifa_invalida' });

      expect(
        await filas('select 1 from identidad.usuarios where correo = $1', [
          datos.correo,
        ]),
      ).toEqual([]);
    });

    it('exige los tres controles', async () => {
      const datos = entrada({
        controles: [{ control: 'antecedentes', vigenteHasta: null }],
      });

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({
        constructor: ErrorDeValidacion,
        codigo: 'importacion.faltan_controles',
      });
      expect(
        await filas('select 1 from identidad.usuarios where correo = $1', [
          datos.correo,
        ]),
      ).toEqual([]);
    });

    it('rechaza un control repetido', async () => {
      const base = entrada();
      const datos = {
        ...base,
        controles: [...base.controles, base.controles[0]!],
      };

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({ codigo: 'importacion.control_repetido' });
    });

    it('rechaza un control que ya está vencido', async () => {
      const datos = entrada({
        controles: [
          {
            control: 'antecedentes',
            vigenteHasta: hoy().sumarDias(-1).aTexto(),
          },
          { control: 'titulos', vigenteHasta: null },
          { control: 'psicotecnica', vigenteHasta: null },
        ],
      });

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({ codigo: 'importacion.control_vencido' });
    });

    it('sin almacén de archivos no se puede cargar la hoja de vida, y no queda nada a medias', async () => {
      const datos = entrada({
        hojaDeVida: {
          nombreOriginal: 'hoja.pdf',
          contenido: Buffer.from('%PDF-1.4 contenido'),
        },
      });

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({
        constructor: ServicioNoDisponible,
        codigo: 'archivos.no_disponible',
      });
      expect(
        await filas('select 1 from identidad.usuarios where correo = $1', [
          datos.correo,
        ]),
      ).toEqual([]);
      expect(
        await filas('select 1 from directorio.cuidadores where zona = $1', [
          datos.zona,
        ]),
      ).toEqual([]);
    });

    it('una hoja de vida que no es PDF se rechaza antes de tocar la base', async () => {
      const datos = entrada({
        hojaDeVida: {
          nombreOriginal: 'hoja.pdf',
          contenido: Buffer.from('MZ esto es un ejecutable'),
        },
      });

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({ codigo: 'importacion.hoja_de_vida_no_es_pdf' });
    });

    it('una hoja de vida de más de 5 MB se rechaza', async () => {
      const grande = Buffer.alloc(5 * 1024 * 1024 + 1);
      grande.write('%PDF-');
      const datos = entrada({
        hojaDeVida: { nombreOriginal: 'hoja.pdf', contenido: grande },
      });

      await expect(
        importar().ejecutar(datos, REVISOR_DE_PRUEBA),
      ).rejects.toMatchObject({
        codigo: 'importacion.hoja_de_vida_muy_grande',
      });
    });
  });

  describe('revisión diaria de vigencias', () => {
    it('oculta al cuidador cuando se le vence un control, avisa, y no lo repite', async () => {
      const vigenteHasta = hoy().aTexto(); // vale todo el día de hoy
      const { cuidadorId } = await importar().ejecutar(
        entrada({
          controles: [
            { control: 'antecedentes', vigenteHasta },
            { control: 'titulos', vigenteHasta: null },
            { control: 'psicotecnica', vigenteHasta: null },
          ],
        }),
        REVISOR_DE_PRUEBA,
      );
      const visible = async () =>
        (
          await filas<{ visible: boolean }>(
            'select visible from directorio.cuidadores where id = $1',
            [cuidadorId],
          )
        )[0]?.visible;

      // Hoy todavía vale: la revisión no lo toca.
      await revisar().ejecutar();
      expect(await visible()).toBe(true);

      // Pasan dos días.
      reloj.avanzar(2 * 24 * 60 * 60_000);
      const primera = await revisar().ejecutar();
      const segunda = await revisar().ejecutar();

      expect(primera.ocultados).toBeGreaterThanOrEqual(1);
      expect(await visible()).toBe(false);
      const avisos = await filas(
        `select 1 from compartido.outbox where tipo = 'directorio.cuidador_oculto' and datos->>'cuidadorId' = $1`,
        [cuidadorId],
      );
      // Dos corridas, un solo aviso: la segunda ya no lo encuentra visible.
      expect(avisos).toHaveLength(1);
      expect(segunda.ocultados).toBeLessThanOrEqual(primera.ocultados - 1);
    });

    it('no toca a quien tiene sus controles al día', async () => {
      const { cuidadorId } = await importar().ejecutar(
        entrada(),
        REVISOR_DE_PRUEBA,
      );

      await revisar().ejecutar();

      expect(
        (
          await filas<{ visible: boolean }>(
            'select visible from directorio.cuidadores where id = $1',
            [cuidadorId],
          )
        )[0]?.visible,
      ).toBe(true);
    });
  });

  describe('reseña que nace del evento «servicio calificado»', () => {
    const ids = () => app.get(GENERADOR_DE_IDS, { strict: false });

    async function publicar(datos: ServicioCalificado['datos']) {
      const evento: ServicioCalificado = {
        id: ids().nuevo(),
        tipo: 'reservas.servicio_calificado',
        version: 1,
        ocurridoEn: reloj.ahora().toISOString(),
        idDeCorrelacion: ids().nuevo(),
        datos,
      };
      await app
        .get(UNIDAD_DE_TRABAJO, { strict: false })
        .ejecutar(() =>
          app.get(PUBLICADOR_DE_EVENTOS, { strict: false }).publicar(evento),
        );
      await app.get(DespachadorDeEventos, { strict: false }).esperarEntregas();
    }

    const contadores = async (cuidadorId: string) =>
      (
        await filas<{ cantidad_resenas: number; suma_calificaciones: number }>(
          'select cantidad_resenas, suma_calificaciones from directorio.cuidadores where id = $1',
          [cuidadorId],
        )
      )[0];

    it('el módulo registra su manejador para ese evento', () => {
      const registrados = app
        .get(RegistroDeManejadores, { strict: false })
        .para('reservas.servicio_calificado');

      expect(registrados.map((m) => m.nombre)).toContain(
        'directorio.registrar_resena',
      );
    });

    it('guarda la reseña con el autor abreviado y actualiza el promedio', async () => {
      const { cuidadorId } = await importar().ejecutar(
        entrada(),
        REVISOR_DE_PRUEBA,
      );
      const familiar = await registrarFamiliar(como(app));
      const servicioId = nuevoId();

      await publicar({
        servicioId,
        cuidadorId,
        familiarId: familiar.id,
        calificacion: 5,
        comentario: 'Excelente trato.',
      });

      const [resena] = await filas<{
        autor_visible: string;
        calificacion: number;
        comentario: string;
      }>(
        'select autor_visible, calificacion, comentario from directorio.resenas where servicio_id = $1',
        [servicioId],
      );
      expect(resena).toEqual({
        autor_visible: 'Andrea G.',
        calificacion: 5,
        comentario: 'Excelente trato.',
      });
      expect(await contadores(cuidadorId)).toEqual({
        cantidad_resenas: 1,
        suma_calificaciones: 5,
      });
    });

    it('es idempotente: el mismo servicio calificado dos veces cuenta una sola', async () => {
      const { cuidadorId } = await importar().ejecutar(
        entrada(),
        REVISOR_DE_PRUEBA,
      );
      const familiar = await registrarFamiliar(como(app));
      const datos = {
        servicioId: nuevoId(),
        cuidadorId,
        familiarId: familiar.id,
        calificacion: 4,
        comentario: null,
      };

      await publicar(datos);
      await publicar(datos);

      expect(await contadores(cuidadorId)).toEqual({
        cantidad_resenas: 1,
        suma_calificaciones: 4,
      });
    });

    it('si la cuenta de quien calificó ya no existe, la reseña dice «Una familia»', async () => {
      const { cuidadorId } = await importar().ejecutar(
        entrada(),
        REVISOR_DE_PRUEBA,
      );
      const servicioId = nuevoId();

      await publicar({
        servicioId,
        cuidadorId,
        familiarId: nuevoId(),
        calificacion: 3,
        comentario: null,
      });

      const [resena] = await filas<{ autor_visible: string }>(
        'select autor_visible from directorio.resenas where servicio_id = $1',
        [servicioId],
      );
      expect(resena?.autor_visible).toBe('Una familia');
    });

    it('dos calificaciones simultáneas del mismo cuidador cuentan las dos', async () => {
      const { cuidadorId } = await importar().ejecutar(
        entrada(),
        REVISOR_DE_PRUEBA,
      );
      const familiar = await registrarFamiliar(como(app));
      const dePrueba = (calificacion: number) => ({
        servicioId: nuevoId(),
        cuidadorId,
        familiarId: familiar.id,
        calificacion,
        comentario: null,
      });

      await Promise.all([publicar(dePrueba(5)), publicar(dePrueba(3))]);

      expect(await contadores(cuidadorId)).toEqual({
        cantidad_resenas: 2,
        suma_calificaciones: 8,
      });
    });

    it('si el cuidador no existe, el evento queda fallido para revisarlo, sin perderse', async () => {
      const servicioId = nuevoId();

      await publicar({
        servicioId,
        cuidadorId: nuevoId(),
        familiarId: nuevoId(),
        calificacion: 5,
        comentario: null,
      });

      const [evento] = await filas<{
        procesado_en: Date | null;
        intentos: number;
        ultimo_error: string;
      }>(
        `select procesado_en, intentos, ultimo_error from compartido.outbox
         where tipo = 'reservas.servicio_calificado' and datos->>'servicioId' = $1`,
        [servicioId],
      );
      expect(evento?.procesado_en).toBeNull();
      expect(evento?.intentos).toBe(1);
      expect(evento?.ultimo_error).toContain('no existe');
      expect(
        await filas('select 1 from directorio.resenas where servicio_id = $1', [
          servicioId,
        ]),
      ).toEqual([]);
    });
  });

  describe('lo que Directorio ofrece a otros módulos', () => {
    const consulta = () =>
      app.get<ConsultaDeDirectorio>(CONSULTA_DE_DIRECTORIO, { strict: false });

    it('entrega lo necesario para contratar a un cuidador visible, sin el teléfono', async () => {
      const datos = entrada({ tarifaHora: 27_000 });
      const { cuidadorId } = await importar().ejecutar(
        datos,
        REVISOR_DE_PRUEBA,
      );

      const resultado =
        await consulta().obtenerCuidadorParaContratar(cuidadorId);

      expect(resultado).toEqual({
        id: cuidadorId,
        nombre: datos.nombre,
        tarifaHora: 27_000,
        zona: datos.zona,
        aceptacionAutomatica: false,
      });
    });

    it('no entrega a quien no se muestra (suspendido o inexistente)', async () => {
      const { cuidadorId } = await importar().ejecutar(
        entrada(),
        REVISOR_DE_PRUEBA,
      );
      await bd.query(
        `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
        [cuidadorId],
      );

      expect(
        await consulta().obtenerCuidadorParaContratar(cuidadorId),
      ).toBeNull();
      expect(
        await consulta().obtenerCuidadorParaContratar(nuevoId()),
      ).toBeNull();
    });

    it('entrega el contacto aunque el cuidador ya no se muestre: un servicio contratado se atiende', async () => {
      const datos = entrada();
      const { cuidadorId, usuarioId } = await importar().ejecutar(
        datos,
        REVISOR_DE_PRUEBA,
      );
      await bd.query(
        `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
        [cuidadorId],
      );

      expect(await consulta().obtenerContactoDeCuidador(cuidadorId)).toEqual({
        cuidadorId,
        usuarioId,
        nombre: datos.nombre,
        telefono: '+573001234567',
      });
      expect(await consulta().obtenerContactoDeCuidador(nuevoId())).toBeNull();
    });
  });
});
