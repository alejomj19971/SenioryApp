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
import { TelefonoE164 } from '../../dominio/telefono-e164.js';
import { Usuario } from '../../dominio/usuario.js';
import type {
  CuentasDeCuidadores,
  DatosDeCuentaDeCuidador,
} from '../puertos/entrada/cuentas-de-cuidadores.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { HashDeContrasenas } from '../puertos/salida/hash-de-contrasenas.js';
import type { RepositorioUsuarios } from '../puertos/salida/repositorio-usuarios.js';

// La cuenta de un cuidador cargado por el equipo. Nace con una contraseña aleatoria que no se muestra a
// nadie: hasta que la persona use «Olvidé mi contraseña» la cuenta no se puede abrir. No inicia sesión
// ni queda a mitad de camino: si falla algo, quien la llama revierte su transacción.
export class CrearCuentaDeCuidador implements CuentasDeCuidadores {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly hash: HashDeContrasenas,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly comunes: DiccionarioDeContrasenasComunes,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async crearCuentaDeCuidador(
    datos: DatosDeCuentaDeCuidador,
  ): Promise<{ usuarioId: string }> {
    const correo = Correo.crear(datos.correo);
    const nombre = NombrePersona.crear(datos.nombre);
    const telefono =
      datos.telefono === undefined || datos.telefono === null
        ? null
        : TelefonoE164.crear(datos.telefono);
    const contrasena = Contrasena.crear(
      this.tokensOpacos.generar().token,
      this.comunes,
    );

    const ahora = this.reloj.ahora();
    const id = this.ids.nuevo<'Usuario'>();
    const cuenta = Usuario.registrarCuidador({
      id,
      correo,
      nombre,
      telefono,
      credencial: Credencial.nueva(
        id,
        await this.hash.calcular(contrasena),
        ahora,
      ),
      ahora,
    });
    // Lanza ConflictoDeEstado (`usuario.correo_ya_registrado`) si el correo ya tiene cuenta.
    await this.usuarios.guardar(cuenta);

    await this.auditoria.registrar({
      actorId: null,
      accion: 'identidad.crear_cuenta_de_cuidador',
      recursoTipo: 'usuario',
      recursoId: id,
      resultado: 'permitido',
    });
    return { usuarioId: id };
  }
}
