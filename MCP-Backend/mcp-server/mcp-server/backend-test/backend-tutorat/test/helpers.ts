import { buildApp } from "../src/app.js";

// Même valeur que BACKEND_TOKEN dans vitest.config.ts
export const AUTH = { authorization: "Bearer jeton-de-test-0123456789" };

export type App = Awaited<ReturnType<typeof buildApp>>;

/** Construit l'app Fastify sans ouvrir de port (app.inject simule les requêtes HTTP). */
export async function creerApp(): Promise<App> {
  return buildApp();
}

/** Date "murale" telle que stockée en base (UTC) : utcDate(2026, 11, 5, 14, 0) => 2026-11-05 14:00 */
export const utcDate = (a: number, mo: number, j: number, h = 0, mi = 0) =>
  new Date(Date.UTC(a, mo - 1, j, h, mi));
