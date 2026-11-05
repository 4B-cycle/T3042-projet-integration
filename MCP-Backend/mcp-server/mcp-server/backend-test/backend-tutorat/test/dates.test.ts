import { describe, expect, it } from "vitest";
import { formaterDateHeure, parseDateHeure } from "../src/lib/dates.js";

describe("dates du contrat MCP", () => {
  it("relit exactement la chaîne reçue (aller-retour)", () => {
    const date = parseDateHeure("2026-11-05 14:00");
    expect(date).not.toBeNull();
    expect(formaterDateHeure(date!)).toBe("2026-11-05 14:00");
  });

  it("accepte le format ISO avec T et des secondes", () => {
    expect(formaterDateHeure(parseDateHeure("2026-11-05T08:30:00")!)).toBe("2026-11-05 08:30");
  });

  it("refuse les dates impossibles ou mal écrites", () => {
    expect(parseDateHeure("2026-02-30 10:00")).toBeNull();
    expect(parseDateHeure("2026-11-05 25:00")).toBeNull();
    expect(parseDateHeure("vendredi 14h")).toBeNull();
    expect(parseDateHeure("2026-11-05T14:00Z")).toBeNull(); // fuseau non accepté
  });
});
