import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import {
  Contrasena,
  type DiccionarioDeContrasenasComunes,
} from '../../dominio/contrasena.js';
import { Correo } from '../../dominio/correo.js';
import { Credencial } from '../../dominio/credencial.js';
import { NombrePersona } from '../../dominio/nombre-persona.js';
import { Usuario } from '../../dominio/usuario.js';
import type { HashDeContrasenas } from '../puertos/salida/hash-de-contrasenas.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';
import { vistaDeUsuario, type VistaDeUsuario } from '../vistas.js';

export interface EntradaDeAdministrador {
  nombre: string;
  correo: string;
  contrasena: string;
}

// Crea una cuenta de administrador. NO está en la API: un administrador solo se crea desde la línea de
// comandos del propio servidor (`npm run crear-admin`), porque nadie puede darse ese rol por internet.
// Aplica las mismas reglas de contraseña que el registro público.
export class CrearAdministrador {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly hash: HashDeContrasenas,
    private readonly comunes: DiccionarioDeContrasenasComunes,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(entrada: EntradaDeAdministrador): Promise<VistaDeUsuario> {
    const correo = Correo.crear(entrada.correo);
    const nombre = NombrePersona.crear(entrada.nombre);
    const contrasena = Contrasena.crear(entrada.contrasena, this.comunes);

    const ahora = this.reloj.ahora();
    const id = this.ids.nuevo<'Usuario'>();
    const administrador = Usuario.crearAdministrador({
      id,
      correo,
      nombre,
      credencial: Credencial.nueva(
        id,
        await this.hash.calcular(contrasena),
        ahora,
      ),
      ahora,
    });
    // Lanza ConflictoDeEstado (`usuario.correo_ya_registrado`) si el correo ya tiene cuenta.
    await this.usuarios.guardar(administrador);

    await this.auditoria.registrar({
      // Lo hace quien tiene acceso al servidor, no una persona con sesión.
      actorId: null,
      accion: 'identidad.crear_administrador',
      recursoTipo: 'usuario',
      recursoId: id,
      resultado: 'permitido',
    });
    return vistaDeUsuario(administrador);
  }
}
