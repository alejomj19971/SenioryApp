// Validaciones de los formularios de cuenta. Replican las reglas del backend (DTO y dominio de Identidad) para
// responder rápido y sin ir al servidor; el backend tiene siempre la última palabra.

export const LARGO_MINIMO_DE_CONTRASENA = 10;
export const LARGO_MAXIMO_DE_CONTRASENA = 128;

export const PARENTESCOS = [
  { valor: "hijo_hija", etiqueta: "Hijo o hija" },
  { valor: "nieto_nieta", etiqueta: "Nieto o nieta" },
  { valor: "conyuge", etiqueta: "Cónyuge" },
  { valor: "hermano_hermana", etiqueta: "Hermano o hermana" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

const EDAD_MAXIMA = 120;
const FORMATO_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_DE_TELEFONO = /^\+[1-9]\d{7,14}$/;

export const texto = (datos: FormData, campo: string): string => {
  const valor = datos.get(campo);
  return typeof valor === "string" ? valor : "";
};

export function validarNombre(nombre: string, etiqueta = "El nombre"): string | undefined {
  const limpio = nombre.trim();
  if (limpio === "") return `${etiqueta} es obligatorio.`;
  if (limpio.length > 100) return `${etiqueta} debe tener 100 caracteres o menos.`;
  return undefined;
}

export function validarCorreo(correo: string): string | undefined {
  const limpio = correo.trim();
  if (limpio === "") return "El correo es obligatorio.";
  if (limpio.length > 254 || !FORMATO_DE_CORREO.test(limpio)) return "Escribe un correo válido, por ejemplo nombre@correo.com.";
  return undefined;
}

export function validarContrasenaNueva(contrasena: string): string | undefined {
  if (contrasena.length < LARGO_MINIMO_DE_CONTRASENA) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_DE_CONTRASENA} caracteres.`;
  }
  if (contrasena.length > LARGO_MAXIMO_DE_CONTRASENA) {
    return `La contraseña debe tener ${LARGO_MAXIMO_DE_CONTRASENA} caracteres o menos.`;
  }
  return undefined;
}

// El backend pide formato internacional (+573001234567). Quien escribe un celular colombiano de diez dígitos
// que empieza por 3 («300 123 4567») no tiene por qué saberlo: se completa con +57.
export function normalizarTelefono(telefono: string): string {
  const sinEspacios = telefono.replace(/[\s().-]/g, "");
  return /^3\d{9}$/.test(sinEspacios) ? `+57${sinEspacios}` : sinEspacios;
}

export function validarTelefonoOpcional(telefono: string): string | undefined {
  if (telefono.trim() === "") return undefined;
  return FORMATO_DE_TELEFONO.test(normalizarTelefono(telefono))
    ? undefined
    : "Escribe un celular válido, por ejemplo 300 123 4567.";
}

const MESES_CON_31 = new Set([1, 3, 5, 7, 8, 10, 12]);
function diasDelMes(mes: number, anio: number): number {
  if (mes === 2) return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 29 : 28;
  return MESES_CON_31.has(mes) ? 31 : 30;
}

// Día, mes y año por separado (tres listas: más fáciles que el calendario del navegador para quien tiene poca
// experiencia digital). Devuelve la fecha `AAAA-MM-DD` o el error.
export function validarFechaDeNacimiento(
  dia: string,
  mes: string,
  anio: string,
  hoy: Date = new Date(),
): { fecha: string } | { error: string } {
  if (dia === "" || mes === "" || anio === "") return { error: "Elige el día, el mes y el año de nacimiento." };
  const [d, m, a] = [Number(dia), Number(mes), Number(anio)];
  if (![d, m, a].every(Number.isInteger) || m < 1 || m > 12 || d < 1 || d > diasDelMes(m, a)) {
    return { error: "Esa fecha no existe. Revisa el día, el mes y el año." };
  }
  const anioActual = hoy.getUTCFullYear();
  const nacimiento = Date.UTC(a, m - 1, d);
  if (nacimiento > hoy.getTime()) return { error: "La fecha de nacimiento no puede ser futura." };
  if (anioActual - a > EDAD_MAXIMA) return { error: `La edad no puede superar los ${EDAD_MAXIMA} años.` };
  const dos = (n: number) => String(n).padStart(2, "0");
  return { fecha: `${a}-${dos(m)}-${dos(d)}` };
}

export function validarParentesco(parentesco: string): string | undefined {
  return PARENTESCOS.some((p) => p.valor === parentesco) ? undefined : "Elige tu parentesco con la persona.";
}

// Quita los campos sin error para que `errores` sea vacío cuando todo está bien.
export function soloErrores(errores: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(errores).filter((par): par is [string, string] => par[1] !== undefined));
}
