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
});
