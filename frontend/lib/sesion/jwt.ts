// Lee el vencimiento (`exp`) de un token de acceso SIN verificar su firma. Es una comprobación optimista para
// decidir si conviene renovar; nunca decide permisos: el backend verifica el token de verdad en cada petición.

// Segundos que le quedan al token. Un token ausente, mal formado o sin `exp` se trata como vencido (0).
export function segundosParaVencer(token: string | undefined, ahoraEnMs: number = Date.now()): number {
  if (token === undefined || token === "") return 0;
  const partes = token.split(".");
  if (partes.length !== 3 || partes[1] === undefined) return 0;
  try {
    const relleno = "=".repeat((4 - (partes[1].length % 4)) % 4);
    const texto = atob(partes[1].replaceAll("-", "+").replaceAll("_", "/") + relleno);
    const carga: unknown = JSON.parse(texto);
    const exp = (carga as { exp?: unknown } | null)?.exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return 0;
    return Math.max(0, Math.floor(exp - ahoraEnMs / 1000));
  } catch {
    return 0;
  }
}
