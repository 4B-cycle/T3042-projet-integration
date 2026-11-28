// Fabrique un JWT d'étudiant valable 1 heure, SIGNÉ comme le ferait Open WebUI.
// Sert à tester le backend avec curl, sans passer par Open WebUI :
//
//   npm run jwt -- alice
//   curl -H "Authorization: Bearer <BACKEND_TOKEN>" -H "X-OpenWebUI-User-Jwt: <jeton affiché>" \
//        http://localhost:8001/etudiants/alice/rappels
import { signerJwt } from "../src/lib/jwt.js";

const secret = process.env.OPENWEBUI_JWT_SECRET;
const etudiant = process.argv[2];
if (!secret || !etudiant) {
  console.error("Usage : npm run jwt -- <id_etudiant>   (OPENWEBUI_JWT_SECRET doit être dans .env)");
  process.exit(1);
}
console.log(signerJwt({ sub: etudiant, role: "user" }, secret, 3600));
