import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openapiDocument } from "../src/docs/openapi.js";

describe("documentation Swagger", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it("sert le document OpenAPI sans jeton", async () => {
    const reponse = await app.inject({ method: "GET", url: "/docs/json" });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().openapi).toBe("3.0.3");
  });

  it("documente les 11 routes métier + /health", () => {
    const methodes = ["get", "post", "put", "patch", "delete"] as const;
    let total = 0;
    for (const chemin of Object.values(openapiDocument.paths)) {
      for (const m of methodes) if (chemin?.[m]) total++;
    }
    // Si tu ajoutes une route, mets à jour openapi.ts ET ce nombre.
    expect(total).toBe(12);
  });
});
