import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agruparPorCuidador } from "@/lib/agrupar-revision";
import type { ControlDelCuidador, DocumentoSubido, HojaDeVidaPorRevisar, MiPerfilDeCuidador, VerificacionParaRevisor } from "@/lib/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const guardarPerfilAccion = vi.fn();
const solicitarRevisionAccion = vi.fn();
const renovarControlAccion = vi.fn();
const decidirControlAccion = vi.fn();
const decidirHojaDeVidaAccion = vi.fn();
vi.mock("@/lib/acciones/postulacion", () => ({ guardarPerfilAccion, solicitarRevisionAccion, renovarControlAccion, decidirControlAccion, decidirHojaDeVidaAccion }));

const { SubirDocumento } = await import("@/components/postulacion/subir-documento");
const { SubirFoto } = await import("@/components/postulacion/subir-foto");
const { FormularioPerfil } = await import("@/components/postulacion/formulario-perfil");
const { EstadoDeControles } = await import("@/components/postulacion/estado-de-controles");
const { BotonDeRevision } = await import("@/components/postulacion/acciones-de-postulacion");
const { TarjetaDeVerificacion, TarjetaDeHojaDeVida } = await import("@/components/admin/tarjeta-de-verificacion");
const { ColaDeRevision } = await import("@/components/admin/cola-de-revision");

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const documento = (extra: Partial<DocumentoSubido> = {}): DocumentoSubido => ({
  id: "d1",
  tipo: "cedula",
  nombre: "cedula.pdf",
  estado: "pendiente",
  tamanoBytes: 2048,
  subidoEn: "2026-11-01T15:00:00.000Z",
  ...extra,
});
const control = (extra: Partial<ControlDelCuidador> = {}): ControlDelCuidador => ({ control: "antecedentes", estado: "sin_solicitar", motivoDeRechazo: null, vigenteHasta: null, puedeRenovar: false, ...extra });
const perfil = (extra: Partial<MiPerfilDeCuidador> = {}): MiPerfilDeCuidador => ({
  id: "c1",
  nombre: "Marta Gómez",
  fotoUrl: null,
  especialidad: "enfermeria",
  titulo: "Enfermera profesional",
  aniosExperiencia: 5,
  tarifaHora: 20_000,
  telefono: "+573001234567",
  zona: "Laureles",
  disponibilidad: ["manana", "tarde"],
  bio: "Me gusta cuidar.",
  aceptacionAutomatica: false,
  estado: "borrador",
  visible: false,
  controles: [],
  documentos: [],
  ...extra,
});
const archivo = (nombre: string, tipo: string, bytes = 100) => new File([new Uint8Array(bytes)], nombre, { type: tipo });

const fetchSimulado = vi.fn();
beforeEach(() => {
  for (const f of [refresh, guardarPerfilAccion, solicitarRevisionAccion, renovarControlAccion, decidirControlAccion, decidirHojaDeVidaAccion, fetchSimulado]) f.mockReset();
  vi.stubGlobal("fetch", fetchSimulado);
});

describe("SubirDocumento", () => {
  const elegir = async (nombre: string, tipo: string, bytes?: number) => {
    const usuario = userEvent.setup({ applyAccept: false });
    await usuario.upload(document.getElementById("archivo-cedula") as HTMLInputElement, archivo(nombre, tipo, bytes));
  };

  it("sube el archivo como cuerpo de la petición, con su tipo y su nombre, y refresca la pantalla", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    render(<SubirDocumento tipo="cedula" titulo="Cédula" ayuda="Foto o PDF." subidos={[]} />);

    await elegir("mi cédula.pdf", "application/pdf");

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, opciones] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cuidador/documentos/cedula");
    expect(opciones.method).toBe("POST");
    expect(opciones.headers).toMatchObject({ "Content-Type": "application/pdf", "X-Nombre-De-Archivo": encodeURIComponent("mi cédula.pdf") });
    expect(opciones.body).toBeInstanceOf(File);
    expect(screen.getByText("Archivo subido.")).toBeInTheDocument();
  });

  it("descarta lo evidente sin llamar al servidor: tipo no permitido, vacío o de más de 5 MB", async () => {
    render(<SubirDocumento tipo="cedula" titulo="Cédula" ayuda="Foto o PDF." subidos={[]} />);

    await elegir("virus.exe", "application/x-msdownload");
    expect(screen.getByText("Debe ser un PDF, una foto JPEG o una imagen PNG.")).toBeInTheDocument();
    await elegir("vacio.pdf", "application/pdf", 0);
    expect(screen.getByText("El archivo está vacío.")).toBeInTheDocument();
    await elegir("grande.pdf", "application/pdf", 5 * 1024 * 1024 + 1);
    expect(screen.getByText(/pesa más de 5 MB/)).toBeInTheDocument();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("la hoja de vida solo admite PDF", async () => {
    render(<SubirDocumento tipo="hoja_de_vida" titulo="Hoja de vida" ayuda="Opcional." subidos={[]} soloPdf />);
    const usuario = userEvent.setup({ applyAccept: false });

    await usuario.upload(document.getElementById("archivo-hoja_de_vida") as HTMLInputElement, archivo("foto.png", "image/png"));

    expect(screen.getByText("Debe ser un PDF.")).toBeInTheDocument();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("si el servidor la rechaza, dice por qué; si no hay conexión, también", async () => {
    fetchSimulado.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, mensaje: "El archivo no es un PDF válido" }), { status: 400 }));
    render(<SubirDocumento tipo="cedula" titulo="Cédula" ayuda="Foto o PDF." subidos={[]} />);

    await elegir("falso.pdf", "application/pdf");
    expect(await screen.findByText("El archivo no es un PDF válido")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    fetchSimulado.mockRejectedValueOnce(new Error("red"));
    await elegir("otro.pdf", "application/pdf");
    expect(await screen.findByText(/No pudimos conectar/)).toBeInTheDocument();
  });

  it("muestra lo ya subido con su estado y deja subir uno nuevo", () => {
    render(<SubirDocumento tipo="cedula" titulo="Cédula" ayuda="Foto o PDF." subidos={[documento({ estado: "rechazado", nombre: "vieja.pdf" }), documento({ id: "d2", nombre: "nueva.pdf", subidoEn: "2026-11-02T15:00:00.000Z" })]} />);

    expect(screen.getByText(/Último archivo: nueva\.pdf \(2 KB\)/)).toBeInTheDocument();
    expect(screen.getByText("En revisión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir uno nuevo" })).toBeInTheDocument();
  });
});

describe("SubirFoto", () => {
  const elegir = async (nombre: string, tipo: string, bytes?: number) => {
    const usuario = userEvent.setup({ applyAccept: false });
    await usuario.upload(document.getElementById("foto-de-perfil") as HTMLInputElement, archivo(nombre, tipo, bytes));
  };

  it("sube la foto como cuerpo de la petición y refresca la pantalla", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<SubirFoto nombre="Marta Gómez" fotoUrl={null} />);

    await elegir("yo.jpg", "image/jpeg");

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, opciones] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cuidador/foto");
    expect(opciones.method).toBe("POST");
    expect(opciones.headers).toMatchObject({ "Content-Type": "image/jpeg" });
    expect(opciones.body).toBeInstanceOf(File);
  });

  it("descarta lo evidente sin llamar al servidor: tipo no permitido, vacía o de más de 3 MB", async () => {
    render(<SubirFoto nombre="Marta Gómez" fotoUrl={null} />);

    await elegir("hoja.pdf", "application/pdf");
    expect(screen.getByText("Debe ser una foto JPEG o una imagen PNG.")).toBeInTheDocument();
    await elegir("vacia.jpg", "image/jpeg", 0);
    expect(screen.getByText("El archivo está vacío.")).toBeInTheDocument();
    await elegir("grande.jpg", "image/jpeg", 3 * 1024 * 1024 + 1);
    expect(screen.getByText(/pesa más de 3 MB/)).toBeInTheDocument();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("cambia la etiqueta del botón cuando ya hay una foto", () => {
    render(<SubirFoto nombre="Marta Gómez" fotoUrl="http://localhost/foto.jpg" />);
    expect(screen.getByRole("button", { name: "Cambiar foto" })).toBeInTheDocument();
  });
});

describe("EstadoDeControles", () => {
  it("dice cómo va cada control; un rechazado muestra el motivo y permite pedir de nuevo", () => {
    render(
      <EstadoDeControles
        controles={[
          control({ control: "antecedentes", estado: "aprobada", vigenteHasta: "2027-05-10" }),
          control({ control: "titulos", estado: "rechazada", motivoDeRechazo: "La foto no se lee.", puedeRenovar: true }),
          control({ control: "psicotecnica", estado: "pendiente" }),
        ]}
      />,
    );

    expect(screen.getByText(/Vigente hasta el/)).toHaveTextContent("10 de mayo de 2027");
    expect(screen.getByText("La foto no se lee.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Un revisor lo está mirando.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Pedir revisión de/ })).toHaveLength(1);
  });

  it("un control vencido avisa que mientras no se renueve no aparece en la búsqueda", () => {
    render(<EstadoDeControles controles={[control({ estado: "vencida", puedeRenovar: true })]} />);

    expect(screen.getByText(/no apareces en la búsqueda/)).toBeInTheDocument();
  });
});

describe("BotonDeRevision", () => {
  it("si falta algo, muestra lo que dice el servidor", async () => {
    solicitarRevisionAccion.mockResolvedValue({ mensaje: "Faltan documentos: sube la cédula." });
    const usuario = userEvent.setup();
    render(<BotonDeRevision />);

    await usuario.click(screen.getByRole("button", { name: "Enviar mi perfil a revisión" }));

    expect(await screen.findByText("Faltan documentos: sube la cédula.")).toBeInTheDocument();
  });
});

describe("FormularioPerfil", () => {
  it("un perfil nuevo pide todo; uno existente llega con sus datos", () => {
    const { unmount } = render(<FormularioPerfil perfil={null} />);
    expect(screen.getByRole("button", { name: "Guardar mi perfil" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Aceptar automáticamente/)).not.toBeInTheDocument();
    unmount();

    render(<FormularioPerfil perfil={perfil()} />);
    expect(screen.getByLabelText("Título o formación")).toHaveValue("Enfermera profesional");
    expect(screen.getByLabelText("Mañana")).toBeChecked();
    expect(screen.getByLabelText("Noche")).not.toBeChecked();
    expect(screen.getByLabelText(/Aceptar automáticamente/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
  });

  it("un perfil activo no deja cambiar la especialidad ni el título", () => {
    render(<FormularioPerfil perfil={perfil({ estado: "activo" })} />);

    expect(screen.queryByLabelText("Título o formación")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tu especialidad")).not.toBeInTheDocument();
    expect(screen.getByText(/ya no se pueden cambiar/)).toBeInTheDocument();
  });

  it("muestra los errores de cada campo y conserva lo escrito", async () => {
    guardarPerfilAccion.mockResolvedValue({ errores: { zona: "Escribe la zona donde atiendes." }, valores: { titulo: "Lo que escribí", zona: "" } });
    const usuario = userEvent.setup();
    render(<FormularioPerfil perfil={null} />);

    await usuario.click(screen.getByRole("button", { name: "Guardar mi perfil" }));

    expect(await screen.findByText("Escribe la zona donde atiendes.")).toBeInTheDocument();
    expect(screen.getByLabelText("Zona donde atiendes")).toBeInvalid();
    expect(screen.getByLabelText("Título o formación")).toHaveValue("Lo que escribí");
  });

  it("al guardar dice que quedó guardado", async () => {
    guardarPerfilAccion.mockResolvedValue({ listo: true });
    const usuario = userEvent.setup();
    render(<FormularioPerfil perfil={perfil()} />);

    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });
});

describe("panel de revisores", () => {
  const verificacion = (extra: Partial<VerificacionParaRevisor> = {}): VerificacionParaRevisor => ({
    id: UUID,
    control: "antecedentes",
    estado: "pendiente",
    solicitadaEn: "2026-11-01T15:00:00.000Z",
    cuidador: { id: "c1", nombre: "Marta Gómez", especialidad: "enfermeria", zona: "Laureles" },
    documentos: [documento({ id: "d-cedula", tipo: "cedula" }), documento({ id: "d-ant", tipo: "antecedentes", nombre: "ant.pdf" })],
    ...extra,
  });

  it("los documentos se abren por nuestro servidor, en otra pestaña y sin que el navegador vea la dirección del backend", () => {
    render(<ul><TarjetaDeVerificacion verificacion={verificacion()} /></ul>);

    const enlace = screen.getByRole("link", { name: /Antecedentes/ });
    expect(enlace).toHaveAttribute("href", "/api/admin/documentos/d-ant");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("link", { name: /Cédula/ })).toHaveAttribute("href", "/api/admin/documentos/d-cedula");
  });

  it("aprobar manda la vigencia; rechazar, el motivo; los errores salen junto a su campo", async () => {
    decidirControlAccion.mockResolvedValueOnce({ errores: { vigenteHasta: "La vigencia debe ser una fecha futura." }, valores: { vigenteHasta: "2020-01-01" } });
    const usuario = userEvent.setup();
    render(<ul><TarjetaDeVerificacion verificacion={verificacion()} /></ul>);

    await usuario.type(screen.getByLabelText("Vigente hasta"), "2020-01-01");
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }));

    expect(await screen.findByText("La vigencia debe ser una fecha futura.")).toBeInTheDocument();
    const [id, , datos] = decidirControlAccion.mock.calls[0] as [string, unknown, FormData];
    expect(id).toBe(UUID);
    expect(datos.get("decision")).toBe("aprobar");
    expect(datos.get("vigenteHasta")).toBe("2020-01-01");

    decidirControlAccion.mockResolvedValueOnce({ errores: { motivo: "Explica por qué se rechaza: el cuidador lo verá." } });
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(await screen.findByText(/Explica por qué se rechaza/)).toBeInTheDocument();
    expect((decidirControlAccion.mock.calls[1] as [string, unknown, FormData])[2].get("decision")).toBe("rechazar");
  });

  it("una verificación ya decidida se ve, pero no se puede decidir otra vez", () => {
    render(<ul><TarjetaDeVerificacion verificacion={verificacion({ estado: "aprobada" })} /></ul>);

    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
  });

  it("la hoja de vida se abre, y se aprueba o se rechaza", async () => {
    decidirHojaDeVidaAccion.mockResolvedValue({ listo: true });
    const hoja: HojaDeVidaPorRevisar = { documento: documento({ id: "d-hoja", tipo: "hoja_de_vida", nombre: "hv.pdf" }), cuidador: { id: "c1", nombre: "Marta Gómez" } };
    const usuario = userEvent.setup();
    render(<ul><TarjetaDeHojaDeVida hoja={hoja} /></ul>);

    expect(screen.getByRole("link", { name: /Hoja de vida/ })).toHaveAttribute("href", "/api/admin/documentos/d-hoja");
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(decidirHojaDeVidaAccion).toHaveBeenCalledWith("d-hoja", "rechazar", expect.anything(), expect.anything()));
  });

  it("agrupa a un cuidador con sus tres controles en una sola tarjeta: su nombre sale una vez", () => {
    const grupos = agruparPorCuidador(
      [
        verificacion({ id: "v1", control: "antecedentes" }),
        verificacion({ id: "v2", control: "titulos" }),
        verificacion({ id: "v3", control: "psicotecnica" }),
      ],
      [],
    );
    render(<ColaDeRevision grupos={grupos} vacioTitulo="No hay nada" />);

    expect(screen.getAllByText("Marta Gómez")).toHaveLength(1);
    expect(screen.getByText("3 solicitudes")).toBeInTheDocument();
  });

  it("el buscador filtra por nombre, sin tildes ni mayúsculas", async () => {
    const grupos = agruparPorCuidador(
      [
        verificacion({ cuidador: { id: "c1", nombre: "Andrés Pérez", especialidad: "enfermeria", zona: "Laureles" } }),
        verificacion({ id: "v2", cuidador: { id: "c2", nombre: "Ana Ríos", especialidad: "fisioterapia", zona: "Envigado" } }),
      ],
      [],
    );
    const usuario = userEvent.setup();
    render(<ColaDeRevision grupos={grupos} vacioTitulo="No hay nada" />);

    await usuario.type(screen.getByLabelText("Buscar cuidador por nombre"), "andres");

    expect(screen.getByText("Andrés Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Ana Ríos")).not.toBeInTheDocument();
  });

  it("sin resultados de la búsqueda lo dice, y con la cola vacía muestra el estado vacío que se le pase", async () => {
    const grupos = agruparPorCuidador([verificacion()], []);
    const usuario = userEvent.setup();
    const { rerender } = render(<ColaDeRevision grupos={grupos} vacioTitulo="No hay nada" />);

    await usuario.type(screen.getByLabelText("Buscar cuidador por nombre"), "nadie así");
    expect(screen.getByText("No encontramos a nadie con ese nombre")).toBeInTheDocument();

    rerender(<ColaDeRevision grupos={[]} vacioTitulo="No hay nada por revisar" vacioDescripcion="Vuelve más tarde." />);
    expect(screen.getByText("No hay nada por revisar")).toBeInTheDocument();
    expect(screen.getByText("Vuelve más tarde.")).toBeInTheDocument();
  });
});
