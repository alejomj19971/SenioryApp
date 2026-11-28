import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { como, SECRETO_BFF } from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import {
  nuevaFamilia,
  nuevoCuidador,
  type Cuidador,
  type Familia,
} from '../soporte/escenario.js';

// Pagos de PRUEBA que se aprueban solos (PASARELA_SIMULADA_APRUEBA_SOLA): la familia pide el enlace de pago y, a los pocos
// segundos, el cobro queda aprobado SIN pasar por ningún proveedor. El aviso entra por el MISMO camino firmado que usaría una
// pasarela real: la aplicación le habla a su propia API por HTTP, así que aquí el servidor escucha de verdad en un puerto.
// El reloj de la aplicación está en el lunes 10 de junio de 2030 a las 10:00 en Bogotá; la espera de la aprobación usa el reloj
// real (son unos segundos).

const PUERTO = 38_417;
const INICIO = '2030-06-10T15:00:00.000Z';
const HOY = '2030-06-10';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

const clave = () => `clave-${nuevoId()}`;

describe('pagos de prueba que se aprueban solos (API)', () => {
  let app: NestExpressApplication;
  let familia: Familia;
  let cuidador: Cuidador;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: {
        SECRETO_BFF,
        REQUIERE_PAGO_APROBADO: 'true',
        PASARELA_SIMULADA_APRUEBA_SOLA: 'true',
        URL_PUBLICA_DE_LA_API: `http://127.0.0.1:${PUERTO}/api/v1`,
      },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
    await app.listen(PUERTO, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  beforeEach(async () => {
    reloj.fijar(INICIO);
    familia = await nuevaFamilia(app);
    cuidador = await nuevoCuidador(app, reloj, { aceptacionAutomatica: true });
  });

  async function procesarEventos(): Promise<void> {
    const despachador = app.get(DespachadorDeEventos, { strict: false });
    for (let i = 0; i < 6; i++) await despachador.esperarEntregas();
  }

  // Un servicio aceptado de hoy a las 10:30: el cobro queda creado y pendiente.
  async function servicioPorPagar(): Promise<{ id: string; pagoId: string }> {
    const respuesta = await como(app)
      .post('/api/v1/servicios')
      .set('Cookie', familia.cookie)
      .set('Idempotency-Key', clave())
      .send({
        adultoMayorId: familia.adultoMayorId,
        cuidadorId: cuidador.cuidadorId,
        fecha: HOY,
        horaInicio: 630,
        horas: 2,
        medioDePago: 'pasarela',
      });
    expect([200, 201]).toContain(respuesta.status);
    const id = (respuesta.body as { servicio: { id: string } }).servicio.id;
    await procesarEventos();
    const [pago] = await filas<{ id: string }>(
      'select id from pagos.pagos where servicio_id = $1',
      [id],
    );
    if (pago === undefined) throw new Error('El cobro no se creó');
    return { id, pagoId: pago.id };
  }

  const estadoDelPago = async (pagoId: string) =>
    (
      await filas<{ estado: string }>(
        'select estado from pagos.pagos where id = $1',
        [pagoId],
      )
    )[0]?.estado;

  // La aprobación llega por HTTP unos segundos después: se espera con el reloj real.
  async function esperarEstado(pagoId: string, esperado: string) {
    const limite = Date.now() + 10_000;
    while ((await estadoDelPago(pagoId)) !== esperado) {
      if (Date.now() > limite) {
        throw new Error(
          `El pago no llegó a «${esperado}» (está «${String(await estadoDelPago(pagoId))}»)`,
        );
      }
      await new Promise((resolver) => setTimeout(resolver, 100));
    }
  }

  const pedirEnlace = (pagoId: string) =>
    como(app)
      .post(`/api/v1/pagos/${pagoId}/enlace`)
      .set('Cookie', familia.cookie);

  const iniciar = async (servicioId: string) =>
    como(app)
      .post(`/api/v1/servicios/${servicioId}/iniciar`)
      .set('Cookie', await cuidador.cookie())
      .send({});

  it('el enlace de pago lleva a la pantalla de retorno de Seniory, no a un proveedor', async () => {
    const { pagoId } = await servicioPorPagar();

    const respuesta = await pedirEnlace(pagoId);

    expect(respuesta.status).toBe(200);
    expect((respuesta.body as { urlDePago: string }).urlDePago).toBe(
      `http://localhost:3000/app/pagos/retorno?pago=${pagoId}`,
    );
  });

  it('al pedir el enlace, el pago queda APROBADO solo y el cuidador puede iniciar el turno', async () => {
    const { id, pagoId } = await servicioPorPagar();
    // Antes de pagar, el cuidador no puede iniciar (el pago es obligatorio).
    const sinPago = await iniciar(id);
    expect(sinPago.status).toBe(422);
    expect(sinPago.body).toMatchObject({ codigo: 'servicio.pago_pendiente' });

    await pedirEnlace(pagoId);
    await esperarEstado(pagoId, 'aprobado');
    await procesarEventos();

    const conPago = await iniciar(id);
    expect(conPago.status).toBe(200);
    expect(conPago.body).toMatchObject({ servicio: { estado: 'en_curso' } });
  });

  it('la aprobación entra por el aviso firmado de siempre: queda UN solo evento de pago aprobado, aunque pidan el enlace varias veces', async () => {
    const { pagoId } = await servicioPorPagar();

    await pedirEnlace(pagoId);
    await pedirEnlace(pagoId);
    await pedirEnlace(pagoId);
    await esperarEstado(pagoId, 'aprobado');
    await new Promise((resolver) => setTimeout(resolver, 2_000));

    const eventos = await filas(
      `select 1 from compartido.outbox where tipo = 'pagos.pago_aprobado' and datos->>'pagoId' = $1`,
      [pagoId],
    );
    expect(eventos).toHaveLength(1);
  });

  it('un aviso falso (sin la firma correcta) NO aprueba nada: el camino firmado sigue protegido', async () => {
    const { pagoId } = await servicioPorPagar();

    const respuesta = await como(app)
      .post('/api/v1/pagos/webhook/simulada')
      .set('x-seniory-firma', 'firma-falsa')
      .send({
        idEvento: 'falso-1',
        tipo: 'pago.aprobado',
        referencia: pagoId,
        monto: 43_200,
      });

    expect(respuesta.status).toBe(401);
    expect(await estadoDelPago(pagoId)).toBe('pendiente');
  });
});
