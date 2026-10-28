import { FechaCivil } from '../../src/compartido/dominio/fecha-civil.js';
import { GeneradorDeIdsUuidV7 } from '../../src/compartido/infraestructura/generador-de-ids-uuid-v7.js';
import { AdultoMayor } from '../../src/identidad/dominio/adulto-mayor.js';
import { Correo } from '../../src/identidad/dominio/correo.js';
import type { DiccionarioDeContrasenasComunes } from '../../src/identidad/dominio/contrasena.js';
import { Credencial } from '../../src/identidad/dominio/credencial.js';
import type {
  AdultoMayorId,
  UsuarioId,
} from '../../src/identidad/dominio/ids.js';
import { NombrePersona } from '../../src/identidad/dominio/nombre-persona.js';
import { Usuario } from '../../src/identidad/dominio/usuario.js';
import { Vinculo } from '../../src/identidad/dominio/vinculo.js';

// Fábricas de objetos de Identidad para pruebas unitarias: valores válidos que cada prueba modifica
// para romper UNA regla.

// UUID v7 reales y únicos: las pruebas de integración comparten una base de datos entre archivos,
// y con IDs secuenciales (que reinician en cada archivo) se pisarían entre sí.
const generador = new GeneradorDeIdsUuidV7();
export const idDePrueba = <Marca extends string>() => generador.nuevo<Marca>();

export const AHORA = new Date('2026-10-21T15:00:00.000Z');
export const HOY = FechaCivil.desdeTexto('2026-10-21');

// Un hash con la forma de uno de argon2id (no es un hash real de ninguna contraseña).
export const HASH_DE_PRUEBA =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA';

export const sinComunes: DiccionarioDeContrasenasComunes = {
  contiene: () => false,
};

export function credencialDePrueba(
  usuarioId: UsuarioId = idDePrueba<'Usuario'>(),
  ahora: Date = AHORA,
): Credencial {
  return Credencial.nueva(usuarioId, HASH_DE_PRUEBA, ahora);
}

export function usuarioDePrueba(
  opciones: { id?: UsuarioId; correo?: string; ahora?: Date } = {},
): Usuario {
  const id = opciones.id ?? idDePrueba<'Usuario'>();
  const ahora = opciones.ahora ?? AHORA;
  return Usuario.registrarFamiliar({
    id,
    correo: Correo.crear(opciones.correo ?? `${id}@prueba.invalid`),
    nombre: NombrePersona.crear('Andrea Gómez'),
    credencial: credencialDePrueba(id, ahora),
    ahora,
  });
}

export function adultoMayorDePrueba(
  opciones: {
    id?: AdultoMayorId;
    creadoPor?: UsuarioId;
    usuarioId?: UsuarioId | null;
  } = {},
): AdultoMayor {
  return AdultoMayor.reconstruir({
    id: opciones.id ?? idDePrueba<'AdultoMayor'>(),
    nombre: NombrePersona.crear('Carmen Gómez'),
    fechaDeNacimiento: FechaCivil.desdeTexto('1948-03-15'),
    fotoUrl: null,
    usuarioId: opciones.usuarioId ?? null,
    creadoPor: opciones.creadoPor ?? idDePrueba<'Usuario'>(),
    creadoEn: AHORA,
    actualizadoEn: AHORA,
  });
}

export function vinculoDePrueba(
  familiarId: UsuarioId,
  adultoMayorId: AdultoMayorId,
): Vinculo {
  return Vinculo.crear({
    id: idDePrueba<'Vinculo'>(),
    familiarId,
    adultoMayorId,
    parentesco: 'hijo_hija',
    esResponsable: true,
    ahora: AHORA,
  });
}
