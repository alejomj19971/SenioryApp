import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { consultaDeFiltros, filtrosDeConsulta, sanearFiltros } from "@/lib/filtros-de-cuidadores";

// Los filtros de la búsqueda viven en la URL: todo lo que llega de ahí es entrada de cualquiera.
describe("filtros de la búsqueda (URL ↔ filtros)", () => {
  it("lee los filtros válidos de la URL", () => {
    expect(
      filtrosDeConsulta({ busqueda: " marta ", especialidad: "enfermeria", zona: "Laureles", jornada: "tarde", tarifaMaxima: "25000" }),
    ).toEqual({ busqueda: "marta", especialidad: "enfermeria", zona: "Laureles", jornada: "tarde", tarifaMaxima: 25_000 });
  });

  it("descarta en silencio lo inválido (una URL vieja o escrita a mano no rompe la página)", () => {
    expect(
      filtrosDeConsulta({ especialidad: "brujeria", jornada: "madrugada", tarifaMaxima: "mucho", busqueda: "   ", zona: "x".repeat(201) }),
    ).toEqual({});
  });

  it.each(["0", "-5", "1.5", "99999999999", "NaN", ""])("la tarifa máxima «%s» no es válida", (tarifa) => {
    expect(filtrosDeConsulta({ tarifaMaxima: tarifa })).toEqual({});
  });

  it("si un parámetro viene repetido, usa el primero", () => {
    expect(filtrosDeConsulta({ zona: ["Belén", "Laureles"] })).toEqual({ zona: "Belén" });
  });

  it("sanearFiltros no acepta lo que no es un objeto ni campos de más", () => {
    expect(sanearFiltros(null)).toEqual({});
    expect(sanearFiltros("texto")).toEqual({});
    expect(sanearFiltros({ especialidad: "auxiliar", rol: "administrador", __proto__: { x: 1 } })).toEqual({ especialidad: "auxiliar" });
  });

  it("sanearFiltros acepta la tarifa como número (viene de una acción) y la rechaza si no es entera", () => {
    expect(sanearFiltros({ tarifaMaxima: 30_000 })).toEqual({ tarifaMaxima: 30_000 });
    expect(sanearFiltros({ tarifaMaxima: 30_000.5 })).toEqual({});
  });

  it("la consulta de la URL sale siempre en el mismo orden y es vacía sin filtros", () => {
    expect(consultaDeFiltros({})).toBe("");
    expect(consultaDeFiltros({ tarifaMaxima: 20_000, busqueda: "ana lópez", zona: "El Poblado" })).toBe(
      "busqueda=ana+l%C3%B3pez&zona=El+Poblado&tarifaMaxima=20000",
    );
  });

  it("ida y vuelta: lo que se escribe en la URL se lee igual", () => {
    const filtros = { busqueda: "José", especialidad: "fisioterapia" as const, zona: "Belén", jornada: "noche" as const, tarifaMaxima: 18_000 };
    expect(filtrosDeConsulta(Object.fromEntries(new URLSearchParams(consultaDeFiltros(filtros))))).toEqual(filtros);
  });
});

// El servicio mapea el contrato del backend a los tipos de las pantallas; el cliente HTTP se sustituye.
const leerDelBackend = vi.fn();
const pedirAlBackend = vi.fn();
const redirect = vi.fn((destino: string): never => {
  throw new Error(`REDIRECT:${destino}`);
});
vi.mock("@/lib/api/cliente-servidor", () => ({ leerDelBackend, pedirAlBackend, RUTA_DE_INGRESO: "/ingresar" }));
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));
vi.mock("@/lib/configuracion", () => ({ urlDelBackend: () => "http://backend.local:3001/api/v1" }));

const servicio = await import("@/lib/services/cuidadores");

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const delBackend = (extra: object = {}) => ({
  id: UUID,
  nombre: "Andrés Felipe Zapata",
  fotoUrl: null,
  especialidad: "acompanamiento",
  titulo: "Cuidador con curso de primeros auxilios",
  aniosExperiencia: 4,
  tarifaHora: 16_000,
  zona: "El Poblado",
  disponibilidad: ["tarde", "noche"],
  bio: "Acompañamiento en casa.",
  calificacion: null,
  cantidadResenas: 0,
  serviciosCompletados: 0,
  aceptacionAutomatica: false,
  controlesVerificados: ["antecedentes", "titulos", "psicotecnica"],
  ...extra,
});

beforeEach(() => {
  leerDelBackend.mockReset();
  pedirAlBackend.mockReset();
  redirect.mockClear();
});

describe("listarCuidadores", () => {
  it("busca en el servidor con los filtros y el cursor, y mapea el contrato a los tipos de la pantalla", async () => {
    leerDelBackend.mockResolvedValue({ cuidadores: [delBackend({ calificacion: 4.8, cantidadResenas: 3 })], siguiente: "cursor-2" });

    const pagina = await servicio.listarCuidadores({ especialidad: "acompanamiento", zona: "El Poblado" }, "cursor-1");

    expect(leerDelBackend).toHaveBeenCalledWith("/cuidadores", {
      consulta: { especialidad: "acompanamiento", zona: "El Poblado", cursor: "cursor-1" },
    });
    expect(pagina.siguiente).toBe("cursor-2");
    expect(pagina.cuidadores[0]).toEqual({
      id: UUID,
      nombre: "Andrés Felipe Zapata",
      foto: "",
      especialidad: "acompanamiento",
      titulo: "Cuidador con curso de primeros auxilios",
      aniosExperiencia: 4,
      tarifaHora: 16_000,
      zona: "El Poblado",
      disponibilidad: ["tarde", "noche"],
      calificacion: 4.8,
      cantidadResenas: 3,
      serviciosCompletados: 0,
      bio: "Acompañamiento en casa.",
      verificacion: { antecedentes: true, titulos: true, psicotecnica: true },
    });
  });

  it("sin filtros ni cursor, no manda parámetros", async () => {
    leerDelBackend.mockResolvedValue({ cuidadores: [], siguiente: null });

    await servicio.listarCuidadores();

    expect(leerDelBackend).toHaveBeenCalledWith("/cuidadores", { consulta: {} });
  });

  it("una calificación nula sigue siendo nula (no «0 estrellas») y nada de contacto llega a la pantalla", async () => {
    // Aunque el backend (por error) mandara un teléfono, el mapeo es una lista blanca: no pasa.
    leerDelBackend.mockResolvedValue({ cuidadores: [delBackend({ telefono: "+573000000001", correo: "x@y.co" })], siguiente: null });

    const { cuidadores } = await servicio.listarCuidadores();

    expect(cuidadores[0]?.calificacion).toBeNull();
    expect(JSON.stringify(cuidadores)).not.toMatch(/telefono|3000000001|correo|@/);
  });

  it("la foto del backend se conserva si existe", async () => {
    leerDelBackend.mockResolvedValue({ cuidadores: [delBackend({ fotoUrl: "https://cdn.seniory.co/f.jpg" })], siguiente: null });

    expect((await servicio.listarCuidadores()).cuidadores[0]?.foto).toBe("https://cdn.seniory.co/f.jpg");
  });
});

describe("obtenerCuidador", () => {
  it("mapea el perfil con sus reseñas (el comentario nulo queda vacío)", async () => {
    leerDelBackend.mockResolvedValue({
      cuidador: {
        ...delBackend({ calificacion: 5, cantidadResenas: 2 }),
        resenas: [
          { id: "r1", autor: "Andrea G.", calificacion: 5, comentario: "Muy puntual", fecha: "2026-10-30T15:00:00.000Z" },
          { id: "r2", autor: "Luis P.", calificacion: 5, comentario: null, fecha: "2026-10-31T15:00:00.000Z" },
        ],
      },
    });

    const cuidador = await servicio.obtenerCuidador(UUID);

    expect(leerDelBackend).toHaveBeenCalledWith(`/cuidadores/${UUID}`);
    expect(cuidador?.resenas).toEqual([
      { id: "r1", autor: "Andrea G.", calificacion: 5, comentario: "Muy puntual", fecha: "2026-10-30T15:00:00.000Z" },
      { id: "r2", autor: "Luis P.", calificacion: 5, comentario: "", fecha: "2026-10-31T15:00:00.000Z" },
    ]);
  });

  it("un id que no es un UUID no llega al backend (daría 400): es «no encontrado»", async () => {
    expect(await servicio.obtenerCuidador("c-marta-restrepo")).toBeNull();
    expect(await servicio.obtenerCuidador("../../etc/passwd")).toBeNull();
    expect(leerDelBackend).not.toHaveBeenCalled();
  });

  it("un control no aprobado no aparece como verificado", async () => {
    leerDelBackend.mockResolvedValue({ cuidador: { ...delBackend({ controlesVerificados: ["antecedentes"] }), resenas: [] } });

    expect((await servicio.obtenerCuidador(UUID))?.verificacion).toEqual({ antecedentes: true, titulos: false, psicotecnica: false });
  });
});

describe("obtenerOpcionesDeBusqueda", () => {
  it("toma las zonas y la tarifa más alta de quienes se muestran", async () => {
    leerDelBackend.mockResolvedValue({ zonas: ["Belén"], tarifaMaxima: 38_000, especialidades: [], jornadas: [] });

    expect(await servicio.obtenerOpcionesDeBusqueda()).toEqual({ zonas: ["Belén"], tarifaMaxima: 38_000 });
  });
});

describe("tieneHojaDeVida", () => {
  it("una redirección del backend significa que existe (la dirección firmada se descarta)", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://x/archivos?firma=1" } }));

    expect(await servicio.tieneHojaDeVida(UUID)).toBe(true);
  });

  it.each([404, 503])("%i significa que no se ofrece", async (estado) => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: estado }));

    expect(await servicio.tieneHojaDeVida(UUID)).toBe(false);
  });

  it("sin sesión (401) lleva a ingresar", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(servicio.tieneHojaDeVida(UUID)).rejects.toThrow("REDIRECT:/ingresar");
  });

  it("un error inesperado se lanza (lo atrapa error.tsx)", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(servicio.tieneHojaDeVida(UUID)).rejects.toBeInstanceOf(ErrorDeApi);
  });

  it("un id que no es UUID no consulta nada", async () => {
    expect(await servicio.tieneHojaDeVida("nada")).toBe(false);
    expect(pedirAlBackend).not.toHaveBeenCalled();
  });
});

describe("abrirHojaDeVida (el servidor de Next entrega el PDF)", () => {
  const fetchFalso = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
  });
  const pdf = () => new Response("%PDF-1.4 …", { status: 200, headers: { "content-type": "application/pdf" } });
  const redireccion = (destino: string) => new Response(null, { status: 302, headers: { location: destino } });

  it("sigue la dirección firmada del propio backend y entrega el PDF", async () => {
    pedirAlBackend.mockResolvedValue(redireccion("http://backend.local:3001/api/v1/archivos?clave=a&expira=1&firma=f"));
    fetchFalso.mockResolvedValue(pdf());

    const resultado = await servicio.abrirHojaDeVida(UUID);

    expect(resultado.tipo).toBe("pdf");
    expect(String(fetchFalso.mock.calls[0]?.[0])).toBe("http://backend.local:3001/api/v1/archivos?clave=a&expira=1&firma=f");
    // La dirección firmada no se sigue a otra redirección ni se guarda en caché.
    expect(fetchFalso.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });

  it("acepta una dirección https (un bucket real)", async () => {
    pedirAlBackend.mockResolvedValue(redireccion("https://bucket.ejemplo.com/hoja.pdf?firma=1"));
    fetchFalso.mockResolvedValue(pdf());

    expect((await servicio.abrirHojaDeVida(UUID)).tipo).toBe("pdf");
  });

  it("NO sigue una dirección http de otro servidor (nada de pedir a direcciones cualquiera)", async () => {
    pedirAlBackend.mockResolvedValue(redireccion("http://169.254.169.254/latest/meta-data"));

    expect((await servicio.abrirHojaDeVida(UUID)).tipo).toBe("fallo");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("solo entrega PDF: otro tipo de archivo no sale", async () => {
    pedirAlBackend.mockResolvedValue(redireccion("http://backend.local:3001/api/v1/archivos?x=1"));
    fetchFalso.mockResolvedValue(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));

    expect((await servicio.abrirHojaDeVida(UUID)).tipo).toBe("fallo");
  });

  it.each([
    [404, "sin_hoja"],
    [503, "no_disponible"],
    [401, "sin_sesion"],
    [500, "fallo"],
  ])("el backend responde %i → %s", async (estado, esperado) => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: estado }));

    expect((await servicio.abrirHojaDeVida(UUID)).tipo).toBe(esperado);
  });

  it("si la dirección firmada ya venció o falla, no hay hoja o hay un fallo, sin lanzar", async () => {
    pedirAlBackend.mockResolvedValue(redireccion("http://backend.local:3001/api/v1/archivos?x=1"));
    fetchFalso.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await servicio.abrirHojaDeVida(UUID)).tipo).toBe("sin_hoja");

    fetchFalso.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await servicio.abrirHojaDeVida(UUID)).tipo).toBe("fallo");
  });

  it("un id que no es UUID no consulta nada", async () => {
    expect((await servicio.abrirHojaDeVida("nada")).tipo).toBe("sin_hoja");
    expect(pedirAlBackend).not.toHaveBeenCalled();
  });
});
