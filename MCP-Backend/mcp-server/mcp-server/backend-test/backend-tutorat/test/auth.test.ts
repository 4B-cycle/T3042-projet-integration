import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

// Ces tests ne touchent pas la base : l'authentification refuse la requête avant.
describe("authentification par jeton", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it("laisse /health ouvert", async () => {
    const reponse = await app.inject({ method: "GET", url: "/health" });
    expect(reponse.statusCode).toBe(200);
  });

  it("refuse une requête sans jeton", async () => {
    const reponse = await app.inject({ method: "GET", url: "/cours" });
    expect(reponse.statusCode).toBe(401);
  });

  it("refuse un mauvais jeton", async () => {
    const reponse = await app.inject({
      method: "GET",
      url: "/agendas",
      headers: { authorization: "Bearer mauvais-jeton" },
    });
    expect(reponse.statusCode).toBe(401);
  });
});
