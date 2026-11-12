import { beforeEach, describe, expect, it, vi } from "vitest";
import { assurerEtudiant, trouverEtudiant } from "../src/lib/etudiants.js";
import {
  coursQuery, creerRappelBody, dateHeureSchema, difficulteBody,
  exercicesQuery, idParams, modifierRappelBody, rappelParams,
} from "../src/lib/schemas.js";
import { rappelVersJson } from "../src/lib/serialisation.js";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { utcDate } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

describe("lib/etudiants", () => {
  beforeEach(() => resetPrismaMock());

  it("trouverEtudiant cherche par openwebuiId sans rien créer", async () => {
    prismaMock.etudiant.findUnique.mockResolvedValue(null);
    expect(await trouverEtudiant("alice")).toBeNull();
    expect(prismaMock.etudiant.findUnique).toHaveBeenCalledWith({ where: { openwebuiId: "alice" } });
    expect(prismaMock.etudiant.upsert).not.toHaveBeenCalled();
  });

  it("assurerEtudiant crée l'étudiant s'il n'existe pas (upsert)", async () => {
    prismaMock.etudiant.upsert.mockResolvedValue({ id: 1, openwebuiId: "alice" });
    await assurerEtudiant("alice");
    expect(prismaMock.etudiant.upsert).toHaveBeenCalledWith({
      where: { openwebuiId: "alice" },
      update: {},
      create: { openwebuiId: "alice" },
    });
  });
});

describe("lib/serialisation", () => {
  it("rappelVersJson passe en snake_case et formate la date", () => {
    expect(
      rappelVersJson({
        id: 1, etudiantId: 2, titre: "TP", dateHeure: utcDate(2026, 1, 9, 7, 5),
        uidExterne: null, palierNotifie: 72,
      }),
    ).toEqual({ id: 1, titre: "TP", date_heure: "2026-01-09 07:05", uid_externe: null, palier_notifie: 72 });
  });
});

describe("lib/schemas", () => {
  it("dateHeureSchema convertit en Date ou signale une erreur", () => {
    expect(dateHeureSchema.parse("2026-11-05 14:00")).toEqual(utcDate(2026, 11, 5, 14, 0));
    const r = dateHeureSchema.safeParse("n'importe quoi");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toBe("Format attendu : AAAA-MM-JJ HH:MM");
  });

  it("idParams n'accepte que lettres, chiffres, _ et -", () => {
    expect(idParams.safeParse({ id: "3f2a-UUID_ok" }).success).toBe(true);
    expect(idParams.safeParse({ id: "../etc/passwd" }).success).toBe(false);
    expect(idParams.safeParse({ id: "" }).success).toBe(false);
    expect(idParams.safeParse({ id: "a".repeat(101) }).success).toBe(false);
  });

  it("rappelParams convertit idRappel en entier positif", () => {
    expect(rappelParams.parse({ id: "a", idRappel: "12" }).idRappel).toBe(12);
    expect(rappelParams.safeParse({ id: "a", idRappel: "0" }).success).toBe(false);
    expect(rappelParams.safeParse({ id: "a", idRappel: "1.5" }).success).toBe(false);
  });

  it("creerRappelBody : uid_externe peut être absent ou null", () => {
    const base = { titre: "x", date_heure: "2026-11-05 14:00" };
    expect(creerRappelBody.safeParse(base).success).toBe(true);
    expect(creerRappelBody.safeParse({ ...base, uid_externe: null }).success).toBe(true);
    expect(creerRappelBody.safeParse({ ...base, uid_externe: "" }).success).toBe(false);
  });

  it("modifierRappelBody : tous les champs sont facultatifs, palier peut être null", () => {
    expect(modifierRappelBody.parse({})).toEqual({});
    expect(modifierRappelBody.parse({ palier_notifie: null }).palier_notifie).toBeNull();
    expect(modifierRappelBody.safeParse({ palier_notifie: 1.5 }).success).toBe(false);
  });

  it("exercicesQuery, difficulteBody et coursQuery valident leurs bornes", () => {
    expect(exercicesQuery.parse({ matiere: " sql ", niveau: "3" })).toEqual({ matiere: "sql", niveau: 3 });
    expect(difficulteBody.safeParse({ matiere: "sql", notion: "JOIN" }).success).toBe(true);
    expect(coursQuery.parse({})).toEqual({});
    expect(coursQuery.safeParse({ matiere: "x".repeat(101) }).success).toBe(false);
  });
});
