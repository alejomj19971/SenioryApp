// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  abrirSesion,
  backendDisponible,
  crearCuenta,
  pedir,
  URL_DEL_BACKEND,
  type CuentaDePrueba,
} from "../soporte/backend-local";

// Contrato de Teleasistencia (INTEGRACION §6) contra el backend local real. Sin el backend encendido se omite.

const disponible = await backendDisponible();

interface Familia {
  cuenta: CuentaDePrueba;
  cookie: string;
  personaId: string;
}

async function nuevaFamilia(): Promise<Familia> {
  const cuenta = await crearCuenta({ lista: true });
  const cookie = await abrirSesion(cuenta);
  const perfil = (await (await pedir("/yo", { cookie, ip: cuenta.ip })).json()) as { adultosMayores: { id: string }[] };
  return { cuenta, cookie, personaId: perfil.adultosMayores[0]?.id as string };
}

describe.skipIf(!disponible)("contrato de Teleasistencia con el backend local", () => {
  let f: Familia;
  const llamar = (ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) => pedir(ruta, { cookie: f.cookie, ip: f.cuenta.ip, ...opciones });

  beforeAll(async () => {
    f = await nuevaFamilia();
  }, 30_000);

  it("una familia nueva: resumen vacío, sin medicamentos, sin lecturas (listas vacías, nunca un error)", async () => {
    const resumen = await llamar(`/adultos-mayores/${f.personaId}/resumen`);
    expect(resumen.status).toBe(200);
    const { resumen: r } = (await resumen.json()) as { resumen: Record<string, unknown> };
    expect(Object.keys(r).sort()).toEqual(["alertasSinAtender", "fecha", "proximaToma", "tomasDeHoy", "ultimaLectura"]);
    expect(r).toMatchObject({ tomasDeHoy: { total: 0, tomadas: 0, pendientes: 0, omitidas: 0 }, proximaToma: null, ultimaLectura: null, alertasSinAtender: 0 });

    const meds = (await (await llamar(`/adultos-mayores/${f.personaId}/medicamentos`)).json()) as { fecha: string; medicamentos: unknown[] };
    expect(meds.medicamentos).toEqual([]);
    expect(meds.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(await (await llamar(`/adultos-mayores/${f.personaId}/signos-vitales`)).json()).toEqual({ lecturas: [] });
    expect(await (await llamar(`/adultos-mayores/${f.personaId}/signos-vitales/ultima`)).json()).toEqual({ lectura: null });
  });

  it("registrar un medicamento genera las tomas del día; marcarlas y deshacerlas", async () => {
    const creado = await llamar(`/adultos-mayores/${f.personaId}/medicamentos`, {
      metodo: "POST",
      cuerpo: { nombre: "Losartán", dosis: "50 mg", indicaciones: "Con el desayuno", horarios: ["08:00", "20:00"] },
    });
    expect(creado.status).toBe(201);
    const { medicamento } = (await creado.json()) as { medicamento: Record<string, unknown> };
    expect(Object.keys(medicamento).sort()).toEqual(["diasDeLaSemana", "dosis", "horarios", "id", "indicaciones", "nombre", "vigenteDesde", "vigenteHasta"]);

    const lista = (await (await llamar(`/adultos-mayores/${f.personaId}/medicamentos`)).json()) as {
      medicamentos: { id: string; nombre: string; tomas: { id: string; horaProgramada: string; estado: string; registradaEn: string | null }[] }[];
    };
    const m = lista.medicamentos[0] as (typeof lista.medicamentos)[number];
    expect(m.nombre).toBe("Losartán");
    expect(m.tomas).toHaveLength(2);
    expect(m.tomas.map((t) => t.horaProgramada)).toEqual(["08:00", "20:00"]);
    expect(m.tomas.every((t) => t.estado === "pendiente" || t.estado === "omitida")).toBe(true);

    const toma = m.tomas[1] as (typeof m.tomas)[number];
    const marcada = await llamar(`/medicamentos/${m.id}/tomas/${toma.id}`, { metodo: "PATCH", cuerpo: { estado: "tomada" } });
    expect(marcada.status).toBe(200);
    expect(((await marcada.json()) as { toma: { estado: string; registradaEn: string } }).toma).toMatchObject({ estado: "tomada" });

    const deshecha = await llamar(`/medicamentos/${m.id}/tomas/${toma.id}`, { metodo: "PATCH", cuerpo: { estado: "pendiente" } });
    expect(deshecha.status).toBe(200);
    expect(((await deshecha.json()) as { toma: { estado: string } }).toma.estado).toBe("pendiente");
  });

  it("dejar de tomar un medicamento lo quita de la lista (204)", async () => {
    const creado = (await (await llamar(`/adultos-mayores/${f.personaId}/medicamentos`, { metodo: "POST", cuerpo: { nombre: "Calcio", dosis: "1 tableta", horarios: ["21:00"] } })).json()) as { medicamento: { id: string } };

    const desactivado = await llamar(`/medicamentos/${creado.medicamento.id}/desactivar`, { metodo: "POST" });
    expect(desactivado.status).toBe(204);

    const lista = (await (await llamar(`/adultos-mayores/${f.personaId}/medicamentos`)).json()) as { medicamentos: { id: string }[] };
    expect(lista.medicamentos.map((m) => m.id)).not.toContain(creado.medicamento.id);
  });

  it("un medicamento inválido se rechaza con errores por campo (horario mal escrito, sin horarios, nombre vacío)", async () => {
    const respuesta = await llamar(`/adultos-mayores/${f.personaId}/medicamentos`, { metodo: "POST", cuerpo: { nombre: "", dosis: "1", horarios: ["25:99"] } });

    expect(respuesta.status).toBe(400);
    const { errores } = (await respuesta.json()) as { errores: { campo: string }[] };
    expect(errores.map((e) => e.campo).sort()).toEqual(expect.arrayContaining(["horarios", "nombre"]));
  });

  it("signos vitales: la presión va completa, los valores deben ser plausibles, y la lectura queda en la lista y como «última»", async () => {
    const solaSistolica = await llamar(`/adultos-mayores/${f.personaId}/signos-vitales`, { metodo: "POST", cuerpo: { presionSistolica: 120 } });
    expect(solaSistolica.status).toBe(400);
    const imposible = await llamar(`/adultos-mayores/${f.personaId}/signos-vitales`, { metodo: "POST", cuerpo: { frecuenciaCardiaca: 5000 } });
    expect(imposible.status).toBe(400);
    const vacia = await llamar(`/adultos-mayores/${f.personaId}/signos-vitales`, { metodo: "POST", cuerpo: {} });
    expect(vacia.status).toBe(400);

    const creada = await llamar(`/adultos-mayores/${f.personaId}/signos-vitales`, {
      metodo: "POST",
      cuerpo: { presionSistolica: 123, presionDiastolica: 77, frecuenciaCardiaca: 71, glucosa: 95 },
    });
    expect(creada.status).toBe(201);
    const { lectura } = (await creada.json()) as { lectura: Record<string, unknown> };
    expect(Object.keys(lectura).sort()).toEqual(["frecuenciaCardiaca", "fuente", "fueraDeRango", "glucosa", "id", "presionDiastolica", "presionSistolica", "tomadaEn"]);
    expect(lectura).toMatchObject({ presionSistolica: 123, presionDiastolica: 77, frecuenciaCardiaca: 71, glucosa: 95, fueraDeRango: false, fuente: "manual" });

    const ultima = (await (await llamar(`/adultos-mayores/${f.personaId}/signos-vitales/ultima`)).json()) as { lectura: { id: string } };
    expect(ultima.lectura.id).toBe((lectura as { id: string }).id);
    const lista = (await (await llamar(`/adultos-mayores/${f.personaId}/signos-vitales?dias=7`)).json()) as { lecturas: unknown[] };
    expect(lista.lecturas.length).toBeGreaterThanOrEqual(1);
  });

  it("una lectura fuera de rango se marca, y las medidas sueltas (solo glucosa) son válidas", async () => {
    const alta = await llamar(`/adultos-mayores/${f.personaId}/signos-vitales`, { metodo: "POST", cuerpo: { glucosa: 400 } });
    expect(alta.status).toBe(201);
    expect(((await alta.json()) as { lectura: { fueraDeRango: boolean; presionSistolica: number | null } }).lectura).toMatchObject({ fueraDeRango: true, presionSistolica: null });
  });

  it("la alerta: exige Idempotency-Key, dice A QUIÉN se avisó, y reintentar con la misma clave devuelve la misma", async () => {
    const enviar = (clave: string | null, origen = "boton") =>
      fetch(`${URL_DEL_BACKEND}/adultos-mayores/${f.personaId}/alertas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Seniory-BFF": process.env.SENIORY_BFF_SECRETO ?? "",
          "X-Cliente-IP": f.cuenta.ip,
          Cookie: f.cookie,
          ...(clave === null ? {} : { "Idempotency-Key": clave }),
        },
        body: JSON.stringify({ origen }),
      });

    expect((await enviar(null)).status).toBe(400);
    expect((await enviar(randomUUID(), "magia")).status).toBe(400);

    const clave = randomUUID();
    const primera = await enviar(clave);
    expect(primera.status).toBe(201);
    const { alerta } = (await primera.json()) as { alerta: Record<string, unknown> };
    expect(Object.keys(alerta).sort()).toEqual(["atendidaEn", "avisadosA", "estado", "generadaEn", "id", "nota", "origen", "primeraEntregaEn"]);
    expect(alerta).toMatchObject({ origen: "boton", estado: "generada" });
    expect(Array.isArray(alerta.avisadosA)).toBe(true);

    const repetida = await enviar(clave);
    expect(repetida.status).toBe(200);
    expect(((await repetida.json()) as { alerta: { id: string } }).alerta.id).toBe(alerta.id);

    // La voz es otro origen válido
    expect((await enviar(randomUUID(), "voz")).status).toBe(201);

    // El resumen cuenta las alertas sin atender
    const resumen = (await (await llamar(`/adultos-mayores/${f.personaId}/resumen`)).json()) as { resumen: { alertasSinAtender: number } };
    expect(resumen.resumen.alertasSinAtender).toBeGreaterThanOrEqual(1);

    // Y se puede atender
    const atendida = await llamar(`/alertas/${alerta.id as string}/atendida`, { metodo: "PATCH", cuerpo: { nota: "Ya hablé con ella" } });
    expect(atendida.status).toBe(200);
    expect(((await atendida.json()) as { alerta: { estado: string } }).alerta.estado).toBe("atendida");
  });

  it("una familia ajena recibe 404 en todo (no se revela que la persona existe)", async () => {
    const ajena = await nuevaFamilia();
    const rutas = ["resumen", "medicamentos", "signos-vitales", "signos-vitales/ultima"];

    for (const ruta of rutas) {
      const respuesta = await pedir(`/adultos-mayores/${f.personaId}/${ruta}`, { cookie: ajena.cookie, ip: ajena.cuenta.ip });
      expect(respuesta.status, ruta).toBe(404);
    }
    const alerta = await fetch(`${URL_DEL_BACKEND}/adultos-mayores/${f.personaId}/alertas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Seniory-BFF": process.env.SENIORY_BFF_SECRETO ?? "", "X-Cliente-IP": ajena.cuenta.ip, Cookie: ajena.cookie, "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ origen: "boton" }),
    });
    expect(alerta.status).toBe(404);
  });
});
