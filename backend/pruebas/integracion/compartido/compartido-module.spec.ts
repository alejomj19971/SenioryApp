import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import {
  PUBLICADOR_DE_EVENTOS,
  type PublicadorDeEventos,
} from '../../../src/compartido/aplicacion/puertos/publicador-de-eventos.js';
import { RELOJ } from '../../../src/compartido/aplicacion/puertos/reloj.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../../../src/compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { EventoDeIntegracion } from '../../../src/compartido/eventos/evento-de-integracion.js';
import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { RegistroDeManejadores } from '../../../src/compartido/infraestructura/outbox/registro-de-manejadores.js';
import { CONFIGURACION } from '../../../src/configuracion/configuracion.module.js';
import {
  configuracionDesdeVariables,
  validarVariables,
} from '../../../src/configuracion/variables-de-entorno.js';
import { conectarBd, nuevoId } from '../../soporte/bd.js';
import { RelojFalso } from '../../soporte/dobles.js';

// La aplicación completa, con la base de pruebas y el sondeo encendido cada 20 ms.
// El reloj está en 1985 para que el sondeo solo vea los eventos de esta prueba.
describe('CompartidoModule en la aplicación', () => {
  const reloj = new RelojFalso('1985-06-01T12:00:00.000Z');
  const pool = conectarBd();
  let app: INestApplication;

  beforeAll(async () => {
    const configuracion = configuracionDesdeVariables(
      validarVariables({
        NODE_ENV: 'test',
        URL_BASE_DE_DATOS: inject('urlBdPrueba'),
        ORIGENES_PERMITIDOS: 'http://localhost:3000',
        INTERVALO_SONDEO_OUTBOX_MS: '20',
      }),
    );
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracion)
      .overrideProvider(RELOJ)
      .useValue(reloj)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await pool.end();
  });

  function manejadorQueAnota(tipo: string) {
    const recibidos: EventoDeIntegracion[] = [];
    app.get(RegistroDeManejadores).registrar({
      nombre: `prueba.${nuevoId()}`,
      tipo,
      manejar: (evento) => {
        recibidos.push(evento);
        return Promise.resolve();
      },
    });
    return recibidos;
  }

  it('la unidad de trabajo inyectada es el contexto transaccional', () => {
    expect(app.get(UNIDAD_DE_TRABAJO)).toBe(app.get(ContextoTransaccional));
  });

  it('un evento publicado por un caso de uso llega a su manejador', async () => {
    const tipo = 'prueba.publicado_por_caso_de_uso';
    const recibidos = manejadorQueAnota(tipo);
    const id = nuevoId();

    await app.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO).ejecutar(() =>
      app.get<PublicadorDeEventos>(PUBLICADOR_DE_EVENTOS).publicar({
        id,
        tipo,
        version: 1,
        ocurridoEn: reloj.ahora().toISOString(),
        idDeCorrelacion: nuevoId(),
        datos: { saludo: 'hola' },
      }),
    );

    await vi.waitFor(() => expect(recibidos.map((e) => e.id)).toEqual([id]));
  });

  it('el sondeo recupera un evento que nadie entregó (por ejemplo, tras un reinicio)', async () => {
    const tipo = 'prueba.recuperado_por_sondeo';
    const recibidos = manejadorQueAnota(tipo);
    const id = nuevoId();
    // Escrito directamente en la base: no hubo aviso al despachador.
    await pool.query(
      `insert into compartido.outbox (id, tipo, version, datos, id_de_correlacion, creado_en, proxima_ejecucion)
       values ($1, $2, 1, '{}', $3, '1985-06-01T11:00:00Z', '1985-06-01T11:00:00Z')`,
      [id, tipo, nuevoId()],
    );

    await vi.waitFor(() => expect(recibidos.map((e) => e.id)).toEqual([id]), {
      timeout: 5_000,
    });
  });

  it('se apaga en orden: detiene el sondeo antes de cerrar las conexiones', async () => {
    await expect(app.close()).resolves.toBeUndefined();
  });
});
