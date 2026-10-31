import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { Vinculo } from '../../dominio/vinculo.js';
import type { RepositorioAdultosMayores } from '../puertos/salida/repositorio-adultos-mayores.js';
import type { RepositorioConsentimientos } from '../puertos/salida/repositorio-consentimientos.js';
import { vistaDeAdultoMayor, type VistaDeAdultoMayor } from '../vistas.js';

// Arma lo que ve un familiar de las personas mayores a las que está vinculado: sus datos, su
// parentesco y si hay consentimiento vigente para los datos de salud. Pide los datos de todas a la
// vez (dos consultas, sin importar cuántas sean).
export class VistasDeAdultosMayores {
  constructor(
    private readonly adultosMayores: RepositorioAdultosMayores,
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async de(vinculos: readonly Vinculo[]): Promise<VistaDeAdultoMayor[]> {
    if (vinculos.length === 0) return [];
    const ids = vinculos.map((vinculo) => vinculo.adultoMayorId);
    const [adultos, vigentes] = await Promise.all([
      this.adultosMayores.listarPorIds(ids),
      this.consentimientos.listarVigentesDe(ids, 'datos_de_salud'),
    ]);
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const conConsentimiento = new Set(vigentes.map((c) => c.adultoMayorId));

    // Orden estable: primero el que se vinculó antes.
    const ordenados = [...vinculos].sort(
      (a, b) =>
        a.creadoEn.getTime() - b.creadoEn.getTime() || a.id.localeCompare(b.id),
    );
    return ordenados.flatMap((vinculo) => {
      const adulto = adultos.find((a) => a.id === vinculo.adultoMayorId);
      return adulto === undefined
        ? []
        : [
            vistaDeAdultoMayor(
              adulto,
              vinculo,
              adulto.edadEn(hoy),
              conConsentimiento.has(adulto.id),
            ),
          ];
    });
  }
}
