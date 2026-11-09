import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, creerApp } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

describe("app : gestion d'erreurs et authentification", () => {
  beforeEach(() => resetPrismaMock());
  afterEach(() => vi.unstubAllEnvs());

  it("renvoie 400 pour un JSON mal formé (erreur Fastify < 500)", async () => {
    const app = await creerApp();
    const r = await app.inject({
      method: "POST",
      url: "/etudiants/alice/rappels",
      headers: { ...AUTH, "content-type": "application/json" },
      payload: "{pas du json",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toHaveProperty("error");
    await app.close();
  });

  it("renvoie 500 générique pour une erreur inattendue (détail non exposé)", async () => {
    prismaMock.agenda.findMany.mockRejectedValue(new Error("mot de passe DB: secret"));
    const app = await creerApp();
    const r = await app.inject({ method: "GET", url: "/agendas", headers: AUTH });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: "Erreur interne" });
    expect(r.body).not.toContain("secret");
    await app.close();
  });

  it("renvoie 404 pour une route inconnue (avec jeton)", async () => {
    const app = await creerApp();
    const r = await app.inject({ method: "GET", url: "/inconnue", headers: AUTH });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  describe("vérification du jeton", () => {
    it.each([
      ["en-tête absent", undefined],
      ["schéma Basic", "Basic jeton-de-test-0123456789"],
      ["Bearer sans jeton", "Bearer"],
      ["jeton de longueur différente", "Bearer court"],
      ["bearer en minuscules", "bearer jeton-de-test-0123456789"],
    ])("401 : %s", async (_nom, valeur) => {
      const app = await creerApp();
      const r = await app.inject({
        method: "GET",
        url: "/agendas",
        headers: valeur ? { authorization: valeur } : {},
      });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ error: "Non autorisé" });
      await app.close();
    });

    it("accepte le bon jeton", async () => {
      prismaMock.agenda.findMany.mockResolvedValue([]);
      const app = await creerApp();
      const r = await app.inject({ method: "GET", url: "/agendas", headers: AUTH });
      expect(r.statusCode).toBe(200);
      await app.close();
    });
  });

  describe("option ENABLE_DOCS", () => {
    it("n'expose pas /docs quand ENABLE_DOCS=false", async () => {
      vi.stubEnv("ENABLE_DOCS", "false");
      vi.resetModules(); // force config.ts à relire les variables d'environnement
      const { buildApp } = await import("../src/app.js");
      const app = await buildApp();
      const r = await app.inject({ method: "GET", url: "/docs/json" });
      // /docs/json est hors du bloc protégé : sans le plugin Swagger, la route n'existe pas -> 404
      expect(r.statusCode).toBe(404);
      await app.close();
    });
  });
});
