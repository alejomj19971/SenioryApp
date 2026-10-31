import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  AUDITORIA,
  type Auditoria,
} from '../../src/compartido/aplicacion/puertos/auditoria.js';
import {
  RELOJ,
  type Reloj,
} from '../../src/compartido/aplicacion/puertos/reloj.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../../src/compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ExpirarSolicitudes } from '../../src/reservas/aplicacion/casos-de-uso/expirar-solicitudes.js';
import {
  REPOSITORIO_SERVICIOS,
  type RepositorioServicios,
} from '../../src/reservas/aplicacion/puertos/salida/repositorio-servicios.js';
import { EventosDeReservas } from '../../src/reservas/aplicacion/servicios/eventos-de-reservas.js';

// La tarea que cancela las solicitudes sin respuesta, pero SOLO sobre estos servicios.
//
// La base de datos se comparte entre los archivos de prueba, que corren a la vez y con relojes propios: la tarea
// completa cancelaría también las solicitudes de las demás pruebas (las que justo estén esperando al cuidador) y las
// volvería intermitentes. Con esta, cada prueba expira únicamente lo suyo.
export function expirarSolicitudesDe(
  app: NestExpressApplication,
  servicioIds: readonly string[],
): ExpirarSolicitudes {
  const real = app.get<RepositorioServicios>(REPOSITORIO_SERVICIOS, {
    strict: false,
  });
  const soloEstos = Object.create(real, {
    listarSolicitudesVencidas: {
      value: async (ahora: Date) =>
        (await real.listarSolicitudesVencidas(ahora, 10_000)).filter((id) =>
          servicioIds.includes(id),
        ),
    },
  }) as RepositorioServicios;
  return new ExpirarSolicitudes(
    soloEstos,
    app.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO, { strict: false }),
    app.get(EventosDeReservas, { strict: false }),
    app.get<Auditoria>(AUDITORIA, { strict: false }),
    app.get<Reloj>(RELOJ, { strict: false }),
  );
}
