import { defineConfig } from "vitest/config";

// Variables d'environnement factices pour les tests (aucune vraie base n'est utilisée).
export default defineConfig({
  test: {
    env: {
      BACKEND_TOKEN: "jeton-de-test-0123456789",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      LOG_LEVEL: "silent", // pas de logs Fastify dans la sortie des tests
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // On mesure le code applicatif. prisma/seed.ts et scripts/ sont des utilitaires
      // ponctuels ; server.ts et db.ts ne font que démarrer le serveur / ouvrir la connexion.
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/db.ts"],
    },
  },
});

