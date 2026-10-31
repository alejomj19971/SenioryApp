import type { Rol } from '../../compartido/dominio/rol.js';
import type { AdultoMayor } from '../dominio/adulto-mayor.js';
import type { Consentimiento } from '../dominio/consentimiento.js';
import type { Usuario } from '../dominio/usuario.js';
import type { Vinculo } from '../dominio/vinculo.js';

// Lo que se muestra hacia afuera: nunca la credencial ni objetos de dominio.

export interface VistaDeUsuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
}

export function vistaDeUsuario(usuario: Usuario): VistaDeUsuario {
  return {
    id: usuario.id,
    nombre: usuario.nombre.valor,
    correo: usuario.correo.valor,
    rol: usuario.rol,
  };
}

// El perfil propio suma el teléfono, que la persona puede cambiar.
export interface VistaDePerfil extends VistaDeUsuario {
  telefono: string | null;
}

export function vistaDePerfil(usuario: Usuario): VistaDePerfil {
  return {
    ...vistaDeUsuario(usuario),
    telefono: usuario.telefono?.valor ?? null,
  };
}

// Una persona mayor vista por el familiar vinculado.
export interface VistaDeAdultoMayor {
  id: string;
  nombre: string;
  edad: number;
  fotoUrl: string | null;
  parentesco: string;
  esResponsable: boolean;
  // Si hay un consentimiento vigente para tratar sus datos de salud.
  consentimientoDeSalud: boolean;
}

export function vistaDeAdultoMayor(
  adultoMayor: AdultoMayor,
  vinculo: Vinculo,
  edad: number,
  consentimientoDeSalud: boolean,
): VistaDeAdultoMayor {
  return {
    id: adultoMayor.id,
    nombre: adultoMayor.nombre.valor,
    edad,
    fotoUrl: adultoMayor.fotoUrl,
    parentesco: vinculo.parentesco,
    esResponsable: vinculo.esResponsable,
    consentimientoDeSalud,
  };
}

export interface VistaDeConsentimiento {
  id: string;
  adultoMayorId: string;
  finalidad: string;
  calidad: string;
  versionDelTexto: string;
  otorgadoEn: string;
}

export function vistaDeConsentimiento(
  consentimiento: Consentimiento,
): VistaDeConsentimiento {
  return {
    id: consentimiento.id,
    adultoMayorId: consentimiento.adultoMayorId,
    finalidad: consentimiento.finalidad,
    calidad: consentimiento.calidad,
    versionDelTexto: consentimiento.versionDelTexto.valor,
    otorgadoEn: consentimiento.otorgadoEn.toISOString(),
  };
}
