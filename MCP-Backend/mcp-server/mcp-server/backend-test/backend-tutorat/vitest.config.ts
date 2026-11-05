import { defineConfig } from "vitest/config";

// Variables d'environnement factices pour les tests (aucune vraie base n'est utilisée).
export default defineConfig({
  test: {
    env: {
      BACKEND_TOKEN: "jeton-de-test-0123456789",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
