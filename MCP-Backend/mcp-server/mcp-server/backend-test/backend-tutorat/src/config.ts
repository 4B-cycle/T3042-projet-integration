import { z } from "zod";

// Toute la configuration vient de variables d'environnement, validées au démarrage :
// si une valeur manque, le serveur refuse de démarrer avec un message clair.
const schema = z.object({
  PORT: z.coerce.number().int().default(8001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  // Jeton partagé avec le MCP. Obligatoire et assez long, pour qu'on ne puisse pas oublier l'authentification.
  BACKEND_TOKEN: z.string().min(16, "BACKEND_TOKEN doit faire au moins 16 caractères"),
  DATABASE_URL: z.string().min(1),
  AGENDA_HOTE_AUTORISE: z.string().default("moodle.ephec.be"),
});

const resultat = schema.safeParse(process.env);
if (!resultat.success) {
  console.error("Configuration invalide :");
  for (const probleme of resultat.error.issues) {
    console.error(`  - ${probleme.path.join(".")} : ${probleme.message}`);
  }
  process.exit(1);
}

export const config = resultat.data;
