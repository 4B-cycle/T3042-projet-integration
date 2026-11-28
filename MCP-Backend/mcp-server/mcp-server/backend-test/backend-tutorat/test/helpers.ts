import { buildApp } from "../src/app.js";
import { signerJwt } from "../src/lib/jwt.js";

// Mêmes valeurs que dans vitest.config.ts (variables d'environnement factices des tests).
export const TOKEN_ETUDIANT = "jeton-de-test-0123456789";
export const TOKEN_SERVICE = "jeton-service-test-0123456789";
export const SECRET_JWT = "secret-jwt-test-0123456789abcdef";

/**
 * En-têtes d'un appel fait au nom d'un étudiant : BACKEND_TOKEN + JWT d'identité signé comme le
 * ferait Open WebUI. dureeSecondes négative = JWT déjà expiré.
 */
export function authEtudiant(id = "alice", dureeSecondes = 3600) {
  return {
    authorization: `Bearer ${TOKEN_ETUDIANT}`,
    "x-openwebui-user-jwt": signerJwt({ sub: id }, SECRET_JWT, dureeSecondes),
  };
}

/** Étudiant "alice" : c'est l'identité utilisée par la plupart des tests (/etudiants/alice/...). */
export const AUTH = authEtudiant("alice");

/** Jeton de la boucle automatique du MCP : /agendas et rappels seulement. */
export const AUTH_SERVICE = { authorization: `Bearer ${TOKEN_SERVICE}` };

export type App = Awaited<ReturnType<typeof buildApp>>;

/** Construit l'app Fastify sans ouvrir de port (app.inject simule les requêtes HTTP). */
export async function creerApp(): Promise<App> {
  return buildApp();
}

/** Date "murale" telle que stockée en base (UTC) : utcDate(2026, 11, 5, 14, 0) => 2026-11-05 14:00 */
export const utcDate = (a: number, mo: number, j: number, h = 0, mi = 0) =>
  new Date(Date.UTC(a, mo - 1, j, h, mi));
