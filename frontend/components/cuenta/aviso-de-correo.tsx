import { AvisoDeCorreoSinVerificar } from "@/components/cuenta/aviso-de-correo-sin-verificar";
import { verificarSesion } from "@/lib/sesion";

// Pone el aviso «Confirma tu correo» arriba de la aplicación, solo mientras el correo de la cuenta no esté confirmado. Usa la
// misma consulta del perfil que ya hace el resto de la página (se memoriza durante el render), así que no suma una petición.
export async function AvisoDeCorreo() {
  const { usuario } = await verificarSesion();
  if (usuario.correoVerificado) return null;
  return <AvisoDeCorreoSinVerificar correo={usuario.correo} />;
}
