import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signerJwt } from "../src/lib/jwt.js";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, AUTH_SERVICE, SECRET_JWT, TOKEN_ETUDIANT, authEtudiant, creerApp, type App } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

// Ces tests vérifient LA règle centrale du projet : un étudiant n'accède jamais aux données d'un autre.
describe("contrôle d'accès : identité et isolation des étudiants", () => {
  let app: App;
  beforeAll(async () => { app = await creerApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => resetPrismaMock());

  // ---------- Authentification : qui es-tu ? (401) ----------
  describe("identité de l'étudiant (401)", () => {
    const url = "/etudiants/alice/rappels";

    it("refuse BACKEND_TOKEN seul, sans JWT d'identité", async () => {
      const r = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${TOKEN_ETUDIANT}` } });
      expect(r.statusCode).toBe(401);
      expect(r.json().error).toContain("Identité");
    });

    it("refuse un JWT expiré", async () => {
      const r = await app.inject({ method: "GET", url, headers: authEtudiant("alice", -10) });
      expect(r.statusCode).toBe(401);
    });

    it("refuse un JWT signé avec un autre secret (identité forgée)", async () => {
      const faux = signerJwt({ sub: "alice" }, "un-autre-secret-0123456789abcd");
      const r = await app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${TOKEN_ETUDIANT}`, "x-openwebui-user-jwt": faux },
      });
      expect(r.statusCode).toBe(401);
    });

    it("refuse un JWT valide sans BACKEND_TOKEN", async () => {
      const r = await app.inject({
        method: "GET",
        url,
        headers: { "x-openwebui-user-jwt": signerJwt({ sub: "alice" }, SECRET_JWT) },
      });
      expect(r.statusCode).toBe(401);
    });

    it("refuse un JWT valide avec un mauvais BACKEND_TOKEN", async () => {
      const r = await app.inject({
        method: "GET",
        url,
        headers: { authorization: "Bearer mauvais-jeton-0123456789", "x-openwebui-user-jwt": signerJwt({ sub: "alice" }, SECRET_JWT) },
      });
      expect(r.statusCode).toBe(401);
    });

    it("l'en-tête x-openwebui-user-id en clair ne prouve rien (non signé)", async () => {
      const r = await app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${TOKEN_ETUDIANT}`, "x-openwebui-user-id": "alice" },
      });
      expect(r.statusCode).toBe(401);
    });
  });

  // ---------- Autorisation : as-tu le droit ? (403) ----------
  describe("un étudiant ne peut pas ouvrir les données d'un autre (403)", () => {
    // alice est connectée (AUTH) et essaie d'atteindre les données de bob.
    it.each([
      ["GET", "/etudiants/bob/rappels", undefined],
      ["POST", "/etudiants/bob/rappels", { titre: "x", date_heure: "2026-11-05 14:00" }],
      ["PATCH", "/etudiants/bob/rappels/1", { titre: "x" }],
      ["DELETE", "/etudiants/bob/rappels/1", undefined],
      ["GET", "/etudiants/bob/agenda", undefined],
      ["PUT", "/etudiants/bob/agenda", { url_ical: "https://moodle.ephec.be/x", sujet_ntfy: "sujet-secret-123" }],
      ["GET", "/etudiants/bob/difficultes", undefined],
      ["POST", "/etudiants/bob/difficultes", { matiere: "réseau", notion: "CIDR" }],
      ["GET", "/etudiants/bob/exercices?matiere=sql", undefined],
      ["POST", "/etudiants/bob/resultats", { exercice_id: 1, reussi: true }],
      ["GET", "/etudiants/bob/progression", undefined],
    ] as const)("%s %s", async (methode, url, payload) => {
      const r = await app.inject({ method: methode, url, headers: AUTH, payload });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toEqual({ error: "Accès refusé" });
      // Aucune requête n'a atteint la base : ni lecture, ni écriture, ni création de l'étudiant.
      expect(prismaMock.etudiant.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.etudiant.upsert).not.toHaveBeenCalled();
      expect(prismaMock.resultat.findMany).not.toHaveBeenCalled();
      expect(prismaMock.resultat.create).not.toHaveBeenCalled();
    });

    it("la casse compte : 'Alice' n'est pas 'alice'", async () => {
      const r = await app.inject({ method: "GET", url: "/etudiants/Alice/rappels", headers: AUTH });
      expect(r.statusCode).toBe(403);
    });

    it("un étudiant ne peut pas lister les agendas de tous (GET /agendas)", async () => {
      const r = await app.inject({ method: "GET", url: "/agendas", headers: AUTH });
      expect(r.statusCode).toBe(403);
      expect(prismaMock.agenda.findMany).not.toHaveBeenCalled();
    });

    it("chaque étudiant accède bien à SES données (bob avec son propre JWT)", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "GET", url: "/etudiants/bob/progression", headers: authEtudiant("bob") });
      expect(r.statusCode).toBe(200);
      expect(prismaMock.etudiant.findUnique).toHaveBeenCalledWith({ where: { openwebuiId: "bob" } });
    });

    it("les routes sans {id} (cours, examens) restent ouvertes à tout étudiant identifié", async () => {
      prismaMock.cours.findMany.mockResolvedValue([]);
      prismaMock.examen.findMany.mockResolvedValue([]);
      expect((await app.inject({ method: "GET", url: "/cours", headers: AUTH })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/examens", headers: AUTH })).statusCode).toBe(200);
    });
  });

  // ---------- Jeton service : la boucle automatique du MCP ----------
  describe("jeton service : limité à /agendas et aux rappels", () => {
    it("peut lister tous les agendas", async () => {
      prismaMock.agenda.findMany.mockResolvedValue([]);
      const r = await app.inject({ method: "GET", url: "/agendas", headers: AUTH_SERVICE });
      expect(r.statusCode).toBe(200);
    });

    it("peut lire et modifier les rappels de n'importe quel étudiant (synchro + notifications)", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue({ id: 2, openwebuiId: "bob" });
      prismaMock.rappel.findMany.mockResolvedValue([]);
      const r = await app.inject({ method: "GET", url: "/etudiants/bob/rappels", headers: AUTH_SERVICE });
      expect(r.statusCode).toBe(200);
    });

    it.each([
      ["GET", "/etudiants/bob/progression", undefined],
      ["POST", "/etudiants/bob/resultats", { exercice_id: 1, reussi: true }],
      ["GET", "/etudiants/bob/difficultes", undefined],
      ["POST", "/etudiants/bob/difficultes", { matiere: "réseau", notion: "CIDR" }],
      ["GET", "/etudiants/bob/agenda", undefined],
      ["PUT", "/etudiants/bob/agenda", { url_ical: "https://moodle.ephec.be/x", sujet_ntfy: "sujet-secret-123" }],
      ["GET", "/etudiants/bob/exercices?matiere=sql", undefined],
      ["GET", "/cours", undefined],
      ["GET", "/examens", undefined],
    ] as const)("ne peut PAS appeler %s %s (403)", async (methode, url, payload) => {
      const r = await app.inject({ method: methode, url, headers: AUTH_SERVICE, payload });
      expect(r.statusCode).toBe(403);
      expect(prismaMock.resultat.findMany).not.toHaveBeenCalled();
      expect(prismaMock.difficulte.findMany).not.toHaveBeenCalled();
    });
  });
});
