import { createHmac, timingSafeEqual } from "node:crypto";

// Vérification du JWT d'identité envoyé par Open WebUI (en-tête X-OpenWebUI-User-Jwt).
//
// Open WebUI le signe en HS256 avec FORWARD_USER_INFO_HEADER_JWT_SECRET. Le champ "sub"
// contient l'identifiant de l'utilisateur Open WebUI (le même que "openwebuiId" en base),
// et "exp" sa date d'expiration (300 secondes par défaut).
//
// On le vérifie à la main avec node:crypto (aucune dépendance en plus) :
//   1. le jeton a 3 morceaux  en-tête.contenu.signature
//   2. l'en-tête annonce bien HS256 (refuse "none" et tout autre algorithme)
//   3. la signature recalculée avec notre secret est identique (comparaison à temps constant)
//   4. "exp" est présent et pas dépassé
//   5. "sub" est un identifiant valide (mêmes caractères que {id} dans les URL)

export type ClaimsEtudiant = {
  sub: string;
  email?: string;
  name?: string;
  role?: string;
  exp: number;
  iat?: number;
};

const ID_VALIDE = /^[A-Za-z0-9_-]{1,100}$/;

const base64url = (donnees: Buffer | string) => Buffer.from(donnees).toString("base64url");

/** Crée un jeton signé. Sert aux tests et au script `npm run jwt` : Open WebUI fait la même chose. */
export function signerJwt(
  claims: { sub: string; email?: string; name?: string; role?: string },
  secret: string,
  dureeSecondes = 300,
  maintenantMs = Date.now(),
): string {
  const iat = Math.floor(maintenantMs / 1000);
  const entete = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const contenu = base64url(JSON.stringify({ ...claims, iss: "open-webui", iat, exp: iat + dureeSecondes }));
  const signature = createHmac("sha256", secret).update(`${entete}.${contenu}`).digest("base64url");
  return `${entete}.${contenu}.${signature}`;
}

/** Renvoie les claims si le jeton est authentique et non expiré, sinon null (jamais d'exception). */
export function verifierJwt(jeton: string, secret: string, maintenantMs = Date.now()): ClaimsEtudiant | null {
  const morceaux = jeton.split(".");
  if (morceaux.length !== 3) return null;
  const [entete, contenu, signature] = morceaux as [string, string, string];

  try {
    const enteteJson = JSON.parse(Buffer.from(entete, "base64url").toString("utf8")) as { alg?: unknown };
    if (enteteJson.alg !== "HS256") return null; // refuse "none", RS256, etc.

    const attendue = createHmac("sha256", secret).update(`${entete}.${contenu}`).digest();
    const recue = Buffer.from(signature, "base64url");
    if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return null;

    const claims = JSON.parse(Buffer.from(contenu, "base64url").toString("utf8")) as Partial<ClaimsEtudiant>;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= maintenantMs) return null; // expiré ou sans date
    if (typeof claims.sub !== "string" || !ID_VALIDE.test(claims.sub)) return null;
    return claims as ClaimsEtudiant;
  } catch {
    return null; // JSON illisible, base64 invalide...
  }
}
