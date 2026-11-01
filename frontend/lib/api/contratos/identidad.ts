// Lo que el backend RESPONDE en Identidad (M1). El OpenAPI no declara respuestas, así que este archivo es el
// contrato: lo vigilan las pruebas de contrato contra el backend local. Solo lo importan los servicios y la
// sesión; las pantallas usan los tipos de `lib/types.ts`.

export type Rol = "familiar" | "adulto_mayor" | "cuidador" | "administrador";

export interface UsuarioDelBackend {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
}

export interface PerfilDelBackend {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  telefono: string | null;
}

export interface AdultoMayorDelBackend {
  id: string;
  nombre: string;
  edad: number;
  fotoUrl: string | null;
  parentesco: string;
  esResponsable: boolean;
  // Hay un consentimiento vigente para tratar sus datos de salud.
  consentimientoDeSalud: boolean;
}

// `GET /yo`
export interface RespuestaDePerfil {
  usuario: PerfilDelBackend;
  adultosMayores: AdultoMayorDelBackend[];
}

// `POST /auth/registro`, `/auth/registro-cuidador` y `/auth/login` (los tokens viajan solo en cookies).
export interface RespuestaDeSesion {
  usuario: UsuarioDelBackend;
}

// `POST /adultos-mayores`
export interface RespuestaDeAdultoMayor {
  adultoMayor: AdultoMayorDelBackend;
}
