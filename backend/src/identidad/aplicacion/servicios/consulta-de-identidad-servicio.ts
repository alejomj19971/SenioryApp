import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { AdultoMayorId, UsuarioId } from '../../dominio/ids.js';
import type { FinalidadDeConsentimiento } from '../../dominio/valores-cerrados.js';
import type {
  AdultoMayorResumen,
  ConsultaDeIdentidad,
  Contacto,
} from '../puertos/entrada/consulta-de-identidad.js';
import type { RepositorioAdultosMayores } from '../puertos/salida/repositorio-adultos-mayores.js';
import type { RepositorioConsentimientos } from '../puertos/salida/repositorio-consentimientos.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import type { RepositorioVinculos } from '../puertos/salida/repositorio-vinculos.js';

// Implementa lo que Identidad ofrece a los demás módulos. Los IDs llegan como texto porque el
// llamador no conoce los tipos de este módulo.
export class ConsultaDeIdentidadServicio implements ConsultaDeIdentidad {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly adultosMayores: RepositorioAdultosMayores,
    private readonly vinculos: RepositorioVinculos,
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async obtenerContacto(usuarioId: string): Promise<Contacto | null> {
    const usuario = await this.usuarios.buscarPorId(usuarioId as UsuarioId);
    if (usuario?.estado !== 'activo') return null;
    return {
      usuarioId: usuario.id,
      nombre: usuario.nombre.valor,
      correo: usuario.correo.valor,
      telefono: usuario.telefono?.valor ?? null,
    };
  }

  async obtenerAdultoMayor(id: string): Promise<AdultoMayorResumen | null> {
    const adultoMayor = await this.adultosMayores.buscarPorId(
      id as AdultoMayorId,
    );
    if (adultoMayor === null) return null;
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    return {
      id: adultoMayor.id,
      nombre: adultoMayor.nombre.valor,
      edad: adultoMayor.edadEn(hoy),
      fotoUrl: adultoMayor.fotoUrl,
    };
  }

  async esFamiliarVinculado(
    usuarioId: string,
    adultoMayorId: string,
  ): Promise<boolean> {
    const vinculo = await this.vinculos.buscarActivo(
      usuarioId as UsuarioId,
      adultoMayorId as AdultoMayorId,
    );
    return vinculo !== null;
  }

  async tieneConsentimientoVigente(
    adultoMayorId: string,
    finalidad: FinalidadDeConsentimiento,
  ): Promise<boolean> {
    const vigente = await this.consentimientos.buscarVigente(
      adultoMayorId as AdultoMayorId,
      finalidad,
    );
    return vigente !== null;
  }

  async listarFamiliaresVinculados(adultoMayorId: string): Promise<string[]> {
    const vinculos = await this.vinculos.listarActivosDeAdultoMayor(
      adultoMayorId as AdultoMayorId,
    );
    return vinculos.map((vinculo) => vinculo.familiarId);
  }
}
