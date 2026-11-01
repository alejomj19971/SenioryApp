import type { NestExpressApplication } from '@nestjs/platform-express';
import { como, SECRETO_BFF } from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';

// GET /salud/operacion: lo que mira el monitor del equipo. Solo conteos, con una clave de operación.

const CLAVE = 'clave-de-operacion-solo-para-pruebas-0123456789';
const bd = conectarBd();

interface Estado {
  outbox: {
    pendientes: number;
    vencidos: number;
    retrasoMaximoSegundos: number;
    conReintentos: number;
    fallidosEnLaSemana: number;
  };
}

describe('operación (API)', () => {
  let app: NestExpressApplication;
  const insertados: string[] = [];

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF, SECRETO_DE_OPERACION: CLAVE },
    });
  });

  afterAll(async () => {
    if (insertados.length > 0) {
      await bd.query(
        'delete from compartido.outbox where id = any($1::uuid[])',
        [insertados],
      );
    }
    await app.close();
    await bd.end();
  });

  const consultar = (clave?: string) => {
    const peticion = como(app).get('/api/v1/salud/operacion');
    return clave === undefined
      ? peticion
      : peticion.set('X-Seniory-Operacion', clave);
  };

  const estado = async (): Promise<Estado['outbox']> =>
    ((await consultar(CLAVE)).body as Estado).outbox;

  // Un evento del outbox con la hora y el estado que se pidan, tal como lo dejaría el despachador.
  async function evento(cambios: {
    minutosAtras: number;
    proximaEnMinutos?: number;
    procesado?: boolean;
    fallido?: boolean;
    intentos?: number;
  }): Promise<void> {
    const id = nuevoId();
    insertados.push(id);
    await bd.query(
      `insert into compartido.outbox (id, tipo, version, datos, id_de_correlacion, creado_en, procesado_en, fallido_en, intentos, proxima_ejecucion)
       values ($1, 'prueba.operacion', 1, '{}', $2,
         now() - make_interval(mins => $3),
         case when $4 then now() end,
         case when $5 then now() end,
         $6,
         now() + make_interval(mins => $7))`,
      [
        id,
        nuevoId(),
        cambios.minutosAtras,
        cambios.procesado ?? false,
        cambios.fallido ?? false,
        cambios.intentos ?? 0,
        cambios.proximaEnMinutos ?? -cambios.minutosAtras,
      ],
    );
  }

  it('sin la clave, o con otra, responde 401', async () => {
    const sin = await consultar();
    const mala = await consultar('otra-clave');
    const casiIgual = await consultar(`${CLAVE}x`);

    expect(sin.status).toBe(401);
    expect(mala.status).toBe(401);
    expect(casiIgual.status).toBe(401);
    expect(sin.body).toMatchObject({ codigo: 'operacion.clave_invalida' });
  });

  it('con la clave devuelve solo conteos', async () => {
    const respuesta = await consultar(CLAVE);

    expect(respuesta.status).toBe(200);
    expect(Object.keys((respuesta.body as Estado).outbox).sort()).toEqual([
      'conReintentos',
      'fallidosEnLaSemana',
      'pendientes',
      'retrasoMaximoSegundos',
      'vencidos',
    ]);
  });

  it('cuenta lo pendiente, lo vencido, los reintentos y los fallidos, y mide el retraso del más viejo', async () => {
    const antes = await estado();
    // Uno que ya le tocaba hace 10 minutos, con un reintento; uno que le toca en una hora (no cuenta como retraso);
    // uno ya procesado y uno que agotó sus reintentos.
    await evento({ minutosAtras: 10, intentos: 1 });
    await evento({ minutosAtras: 1, proximaEnMinutos: 60 });
    await evento({ minutosAtras: 20, procesado: true });
    await evento({ minutosAtras: 30, fallido: true, intentos: 10 });

    const despues = await estado();

    expect(despues.pendientes - antes.pendientes).toBe(2);
    expect(despues.vencidos - antes.vencidos).toBe(1);
    expect(despues.conReintentos - antes.conReintentos).toBe(1);
    expect(despues.fallidosEnLaSemana - antes.fallidosEnLaSemana).toBe(1);
    expect(despues.retrasoMaximoSegundos).toBeGreaterThanOrEqual(600);
  });

  it('la ruta no existe si no hay clave configurada', async () => {
    const sinClave = await crearAppDePrueba({ variables: { SECRETO_BFF } });
    try {
      const respuesta = await como(sinClave)
        .get('/api/v1/salud/operacion')
        .set('X-Seniory-Operacion', CLAVE);

      expect(respuesta.status).toBe(404);
    } finally {
      await sinClave.close();
    }
  });
});
