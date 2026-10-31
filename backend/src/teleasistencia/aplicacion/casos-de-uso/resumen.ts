import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type {
  ActorDeTeleasistencia,
  PoliticaDeAcceso,
} from '../puertos/salida/politica-de-acceso.js';
import type {
  RepositorioAlertas,
  RepositorioLecturas,
  RepositorioMedicamentos,
  RepositorioTomas,
} from '../puertos/salida/repositorios.js';
import type { VistaDeResumen } from '../vistas.js';

// Lo que necesitan el inicio y la barra inferior, en UNA consulta en vez de una por pantalla: cómo va el día con
// los medicamentos, cuál es la próxima toma, la última lectura y cuántas alertas siguen sin atender.
export class ObtenerResumenDeEstado {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly medicamentos: RepositorioMedicamentos,
    private readonly tomas: RepositorioTomas,
    private readonly lecturas: RepositorioLecturas,
    private readonly alertas: RepositorioAlertas,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
  ): Promise<VistaDeResumen> {
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'lectura',
      'teleasistencia.leer_resumen',
    );
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHoraria);
    const activos = await this.medicamentos.listarActivos(adultoMayorId);
    for (const medicamento of activos) {
      await this.tomas.generarDelDia(medicamento, hoy);
    }
    const nombres = new Map(activos.map((m) => [m.id as string, m.nombre]));
    // Solo las tomas de medicamentos que se siguen tomando.
    const delDia = (await this.tomas.listarDelDia(adultoMayorId, hoy)).filter(
      (t) => nombres.has(t.medicamentoId),
    );
    const proxima = delDia.find((t) => t.estado === 'pendiente');
    const ultima = await this.lecturas.ultima(adultoMayorId);
    return {
      fecha: hoy.aTexto(),
      tomasDeHoy: {
        total: delDia.length,
        tomadas: delDia.filter((t) => t.estado === 'tomada').length,
        pendientes: delDia.filter((t) => t.estado === 'pendiente').length,
        omitidas: delDia.filter((t) => t.estado === 'omitida').length,
      },
      proximaToma:
        proxima === undefined
          ? null
          : {
              medicamentoId: proxima.medicamentoId,
              nombre: nombres.get(proxima.medicamentoId) ?? '',
              horaProgramada: proxima.horaProgramada,
            },
      ultimaLectura:
        ultima === null
          ? null
          : {
              tomadaEn: ultima.tomadaEn.toISOString(),
              fueraDeRango: ultima.fueraDeRango,
            },
      alertasSinAtender: await this.alertas.contarAbiertas(adultoMayorId),
    };
  }
}
