import { vi } from "vitest";

// Faux client Prisma : chaque méthode est une fonction espionne dont on contrôle
// la valeur de retour dans chaque test (mockResolvedValue / mockRejectedValue).
// Aucune vraie base de données n'est utilisée.
export const prismaMock = {
  etudiant: { findUnique: vi.fn(), upsert: vi.fn() },
  rappel: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  agenda: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  exercice: { findMany: vi.fn() },
  difficulte: { findMany: vi.fn(), upsert: vi.fn() },
  cours: { findMany: vi.fn() },
  examen: { findMany: vi.fn(), findUnique: vi.fn() },
};

/** Remet tous les espions à zéro (à appeler dans beforeEach). */
export function resetPrismaMock() {
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table)) fn.mockReset();
  }
}
