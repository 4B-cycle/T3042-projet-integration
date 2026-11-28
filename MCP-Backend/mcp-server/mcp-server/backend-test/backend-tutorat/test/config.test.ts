import { afterEach, describe, expect, it, vi } from "vitest";

describe("config (validation des variables d'environnement)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("applique les valeurs par défaut", async () => {
    vi.resetModules();
    const { config } = await import("../src/config.js");
    expect(config.PORT).toBe(8001);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.AGENDA_HOTE_AUTORISE).toBe("moodle.ephec.be");
    expect(config.ENABLE_DOCS).toBe(true);
  });

  it("convertit PORT en nombre et ENABLE_DOCS en booléen", async () => {
    vi.stubEnv("PORT", "9000");
    vi.stubEnv("ENABLE_DOCS", "false");
    vi.resetModules();
    const { config } = await import("../src/config.js");
    expect(config.PORT).toBe(9000);
    expect(config.ENABLE_DOCS).toBe(false);
  });

  it("arrête le processus si BACKEND_TOKEN est trop court", async () => {
    vi.stubEnv("BACKEND_TOKEN", "trop-court");
    vi.resetModules();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit appelé");
    }) as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../src/config.js")).rejects.toThrow("process.exit appelé");
    expect(exit).toHaveBeenCalledWith(1);
    expect(erreur).toHaveBeenCalledWith("Configuration invalide :");
    expect(erreur.mock.calls.flat().join(" ")).toContain("BACKEND_TOKEN");
  });

  it("arrête le processus si BACKEND_SERVICE_TOKEN est absent ou trop court", async () => {
    vi.stubEnv("BACKEND_SERVICE_TOKEN", "");
    vi.resetModules();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit appelé");
    }) as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../src/config.js")).rejects.toThrow("process.exit appelé");
    expect(exit).toHaveBeenCalledWith(1);
    expect(erreur.mock.calls.flat().join(" ")).toContain("BACKEND_SERVICE_TOKEN");
  });

  it("arrête le processus si OPENWEBUI_JWT_SECRET est trop court", async () => {
    vi.stubEnv("OPENWEBUI_JWT_SECRET", "court");
    vi.resetModules();
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit appelé");
    }) as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../src/config.js")).rejects.toThrow("process.exit appelé");
    expect(erreur.mock.calls.flat().join(" ")).toContain("OPENWEBUI_JWT_SECRET");
  });

  it("refuse deux secrets identiques (un seul qui fuite ne doit pas tout ouvrir)", async () => {
    vi.stubEnv("BACKEND_SERVICE_TOKEN", "jeton-de-test-0123456789"); // = BACKEND_TOKEN
    vi.resetModules();
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit appelé");
    }) as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../src/config.js")).rejects.toThrow("process.exit appelé");
    expect(erreur.mock.calls.flat().join(" ")).toContain("trois valeurs différentes");
  });

  it("met le nom de l'en-tête JWT en minuscules (Node lit les en-têtes en minuscules)", async () => {
    vi.resetModules();
    const { config: parDefaut } = await import("../src/config.js");
    expect(parDefaut.OPENWEBUI_JWT_HEADER).toBe("x-openwebui-user-jwt");

    vi.stubEnv("OPENWEBUI_JWT_HEADER", "X-Mon-En-Tete");
    vi.resetModules();
    const { config } = await import("../src/config.js");
    expect(config.OPENWEBUI_JWT_HEADER).toBe("x-mon-en-tete");
  });
});
