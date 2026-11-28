import { z } from "zod";

// Toute la configuration vient de variables d'environnement, validées au démarrage :
// si une valeur manque, le serveur refuse de démarrer avec un message clair.
const schema = z.object({
  PORT: z.coerce.number().int().default(8001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  // Jeton "étudiant" : le MCP l'envoie dans les appels faits AU NOM d'un étudiant (outils du chat).
  // Il ne suffit pas : il doit être accompagné du JWT d'identité signé par Open WebUI.
  BACKEND_TOKEN: z.string().min(16, "BACKEND_TOKEN doit faire au moins 16 caractères"),
  // Jeton "service" : réservé à la boucle automatique du MCP (synchro Moodle + notifications).
  // Il n'ouvre que /agendas et les rappels, jamais les difficultés ni la progression.
  BACKEND_SERVICE_TOKEN: z.string().min(16, "BACKEND_SERVICE_TOKEN doit faire au moins 16 caractères"),
  // Même valeur que FORWARD_USER_INFO_HEADER_JWT_SECRET dans Open WebUI : sert à vérifier la
  // signature du JWT qui prouve l'identité de l'étudiant.
  OPENWEBUI_JWT_SECRET: z.string().min(16, "OPENWEBUI_JWT_SECRET doit faire au moins 16 caractères"),
  // Nom de l'en-tête qui porte ce JWT (FORWARD_USER_INFO_HEADER_JWT dans Open WebUI).
  OPENWEBUI_JWT_HEADER: z.string().default("X-OpenWebUI-User-Jwt").transform((nom) => nom.toLowerCase()),
  DATABASE_URL: z.string().min(1),
  AGENDA_HOTE_AUTORISE: z.string().default("moodle.ephec.be"),
  // Swagger UI sur /docs. Mettre "false" en production pour ne pas exposer la documentation.
  ENABLE_DOCS: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});

// Les trois secrets doivent être différents : sinon un seul fuite donnerait accès à tout.
const schemaFinal = schema.superRefine((c, ctx) => {
  const secrets = [c.BACKEND_TOKEN, c.BACKEND_SERVICE_TOKEN, c.OPENWEBUI_JWT_SECRET];
  if (new Set(secrets).size !== secrets.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BACKEND_TOKEN"],
      message: "BACKEND_TOKEN, BACKEND_SERVICE_TOKEN et OPENWEBUI_JWT_SECRET doivent être trois valeurs différentes",
    });
  }
});

const resultat = schemaFinal.safeParse(process.env);
if (!resultat.success) {
  console.error("Configuration invalide :");
  for (const probleme of resultat.error.issues) {
    console.error(`  - ${probleme.path.join(".")} : ${probleme.message}`);
  }
  process.exit(1);
}

export const config = resultat.data;
