import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorDeLaApp from "@/app/app/error";

describe("error.tsx de /app", () => {
  it("explica qué pasó en español y ofrece reintentar y volver al inicio", () => {
    render(<ErrorDeLaApp error={new Error("x")} retry={() => {}} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar esta información");
    expect(screen.getByText("Revisa tu conexión e inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/app");
  });

  it("Reintentar vuelve a pedir la información", async () => {
    const retry = vi.fn();
    render(<ErrorDeLaApp error={new Error("x")} retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("nunca muestra el mensaje del error: podría traer detalles internos", () => {
    render(
      <ErrorDeLaApp
        error={new Error("connect ECONNREFUSED 10.0.0.5:3001 password=abc")}
        retry={() => {}}
      />,
    );

    expect(document.body).not.toHaveTextContent("ECONNREFUSED");
    expect(document.body).not.toHaveTextContent("password");
  });

  it("muestra el código de soporte cuando el error trae `digest`", () => {
    render(
      <ErrorDeLaApp error={Object.assign(new Error("x"), { digest: "a1b2c3" })} retry={() => {}} />,
    );

    expect(screen.getByText("a1b2c3")).toBeInTheDocument();
    expect(screen.getByText(/Código de soporte/)).toBeInTheDocument();
  });

  it("sin `digest` no muestra código de soporte", () => {
    render(<ErrorDeLaApp error={new Error("x")} retry={() => {}} />);

    expect(screen.queryByText(/Código de soporte/)).not.toBeInTheDocument();
  });
});
