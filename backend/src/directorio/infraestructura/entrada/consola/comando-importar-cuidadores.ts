import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { ConflictoDeEstado } from '../../../../compartido/dominio/errores.js';
import { idDesdeTexto } from '../../../../compartido/dominio/id.js';
import { esJornada } from '../../../../compartido/dominio/jornada.js';
import type { ConsultaDeIdentidad } from '../../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type {
  EntradaDeCuidadorImportado,
  ResultadoDeImportacion,
} from '../../../aplicacion/casos-de-uso/importar-cuidador.js';
import {
  controlDesdeTexto,
  especialidadDesdeTexto,
} from '../../../dominio/valores-cerrados.js';

export class ErrorDeArchivo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeArchivo';
  }
}

// Lo que `npm run cuidadores:importar -- ruta.json` lee. Un ejemplo:
//
// {
//   "revisadoPor": "<id del administrador que revisó los documentos>",
//   "cuidadores": [{
//     "nombre": "…", "correo": "…", "telefono": "+57…", "especialidad": "enfermeria",
//     "titulo": "…", "aniosExperiencia": 5, "tarifaHora": 25000, "zona": "…",
//     "disponibilidad": ["manana", "tarde"], "bio": "…",
//     "controles": [
//       { "control": "antecedentes", "vigenteHasta": "2027-03-31" },
//       { "control": "titulos", "vigenteHasta": null },
//       { "control": "psicotecnica", "vigenteHasta": "2027-03-31" }
//     ],
//     "hojaDeVida": "hojas/maria.pdf"   // opcional, ruta relativa a este archivo
//   }]
// }
export interface ArchivoDeImportacion {
  revisadoPor: string;
  cuidadores: EntradaDeCuidadorImportado[];
}

export type LectorDeArchivos = (ruta: string) => Promise<Uint8Array>;

type Objeto = Record<string, unknown>;

function objeto(valor: unknown, donde: string): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorDeArchivo(`${donde} debe ser un objeto`);
  }
  return valor as Objeto;
}

function texto(datos: Objeto, campo: string, donde: string): string {
  const valor = datos[campo];
  if (typeof valor !== 'string') {
    throw new ErrorDeArchivo(`${donde}: «${campo}» debe ser un texto`);
  }
  return valor;
}

function numero(datos: Objeto, campo: string, donde: string): number {
  const valor = datos[campo];
  if (typeof valor !== 'number') {
    throw new ErrorDeArchivo(`${donde}: «${campo}» debe ser un número`);
  }
  return valor;
}

function lista(datos: Objeto, campo: string, donde: string): unknown[] {
  const valor = datos[campo];
  if (!Array.isArray(valor)) {
    throw new ErrorDeArchivo(`${donde}: «${campo}» debe ser una lista`);
  }
  return valor;
}

// Convierte el texto del archivo en entradas para el caso de uso. Solo revisa la FORMA (que cada campo sea
// del tipo esperado y que los valores cerrados existan); las reglas de negocio (tarifa, teléfono, vigencias…)
// las aplica el dominio al importar. `rutaBase` es la carpeta del archivo, de donde salen las hojas de vida.
export async function leerArchivoDeImportacion(
  contenido: string,
  rutaBase: string,
  leer: LectorDeArchivos = (ruta) => readFile(ruta),
): Promise<ArchivoDeImportacion> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(contenido);
  } catch {
    throw new ErrorDeArchivo('El archivo no es un JSON válido');
  }
  const raiz = objeto(crudo, 'El archivo');
  const revisadoPor = idDesdeTexto(texto(raiz, 'revisadoPor', 'El archivo'));

  const cuidadores: EntradaDeCuidadorImportado[] = [];
  const crudos = lista(raiz, 'cuidadores', 'El archivo');
  if (crudos.length === 0) {
    throw new ErrorDeArchivo('El archivo no trae ningún cuidador');
  }
  for (const [indice, elemento] of crudos.entries()) {
    const donde = `Cuidador ${indice + 1}`;
    const datos = objeto(elemento, donde);
    const hoja = datos.hojaDeVida;
    if (hoja !== undefined && typeof hoja !== 'string') {
      throw new ErrorDeArchivo(`${donde}: «hojaDeVida» debe ser una ruta`);
    }
    const entrada: EntradaDeCuidadorImportado = {
      nombre: texto(datos, 'nombre', donde),
      correo: texto(datos, 'correo', donde),
      telefono: texto(datos, 'telefono', donde),
      especialidad: especialidadDesdeTexto(texto(datos, 'especialidad', donde)),
      titulo: texto(datos, 'titulo', donde),
      aniosExperiencia: numero(datos, 'aniosExperiencia', donde),
      tarifaHora: numero(datos, 'tarifaHora', donde),
      zona: texto(datos, 'zona', donde),
      disponibilidad: lista(datos, 'disponibilidad', donde).map((jornada) => {
        if (typeof jornada !== 'string' || !esJornada(jornada)) {
          throw new ErrorDeArchivo(`${donde}: jornada no válida`);
        }
        return jornada;
      }),
      bio: texto(datos, 'bio', donde),
      controles: lista(datos, 'controles', donde).map((control) => {
        const c = objeto(control, `${donde}: un control`);
        const vigenteHasta = c.vigenteHasta;
        if (vigenteHasta !== null && typeof vigenteHasta !== 'string') {
          throw new ErrorDeArchivo(
            `${donde}: «vigenteHasta» debe ser una fecha AAAA-MM-DD o null`,
          );
        }
        return {
          control: controlDesdeTexto(texto(c, 'control', donde)),
          vigenteHasta,
        };
      }),
    };
    if (typeof datos.fotoUrl === 'string') entrada.fotoUrl = datos.fotoUrl;
    if (typeof hoja === 'string') {
      const ruta = resolve(rutaBase, hoja);
      entrada.hojaDeVida = {
        nombreOriginal: basename(ruta),
        contenido: await leerHoja(leer, ruta, donde),
      };
    }
    cuidadores.push(entrada);
  }
  return { revisadoPor, cuidadores };
}

async function leerHoja(
  leer: LectorDeArchivos,
  ruta: string,
  donde: string,
): Promise<Uint8Array> {
  try {
    return await leer(ruta);
  } catch {
    throw new ErrorDeArchivo(
      `${donde}: no se pudo leer la hoja de vida ${ruta}`,
    );
  }
}

export interface CasoImportarCuidador {
  ejecutar(
    entrada: EntradaDeCuidadorImportado,
    revisadoPor: string,
  ): Promise<ResultadoDeImportacion>;
}

// Importa todos los cuidadores del archivo, uno por uno. Si uno falla se sigue con los demás y al final se
// informa qué pasó con cada uno: cada cuidador es todo o nada, así que un fallo no deja nada a medias.
// Un correo que ya tiene cuenta se informa como «ya existía», así el comando se puede repetir.
export async function importarCuidadores(
  rutaDelArchivo: string,
  caso: CasoImportarCuidador,
  identidad: ConsultaDeIdentidad,
): Promise<{ mensajes: string[]; fallaron: number }> {
  const contenido = await readFile(rutaDelArchivo, 'utf8');
  const archivo = await leerArchivoDeImportacion(
    contenido,
    dirname(resolve(rutaDelArchivo)),
  );
  if ((await identidad.obtenerContacto(archivo.revisadoPor)) === null) {
    throw new ErrorDeArchivo(
      '«revisadoPor» no es una cuenta existente: use el id del administrador (lo muestra `npm run crear-admin`)',
    );
  }
  return importarEntradas(archivo, caso);
}

export async function importarEntradas(
  archivo: ArchivoDeImportacion,
  caso: CasoImportarCuidador,
): Promise<{ mensajes: string[]; fallaron: number }> {
  const mensajes: string[] = [];
  let fallaron = 0;
  for (const entrada of archivo.cuidadores) {
    try {
      const resultado = await caso.ejecutar(entrada, archivo.revisadoPor);
      mensajes.push(
        `Importado: ${entrada.nombre} (id ${resultado.cuidadorId}).`,
      );
    } catch (error) {
      if (
        error instanceof ConflictoDeEstado &&
        error.codigo === 'usuario.correo_ya_registrado'
      ) {
        mensajes.push(`Ya existía: ${entrada.nombre} (${entrada.correo}).`);
        continue;
      }
      fallaron += 1;
      const motivo = error instanceof Error ? error.message : String(error);
      mensajes.push(`NO importado: ${entrada.nombre}: ${motivo}`);
    }
  }
  return { mensajes, fallaron };
}
