import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signerJwt, verifierJwt } from "../src/lib/jwt.js";

const SECRET = "secret-de-test-0123456789abcdef";
const b64 = (x: unknown) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
const signer = (entete: object, contenu: object, secret = SECRET, algo = "sha256") => {
  const e = b64(entete), c = b64(contenu);
  return `${e}.${c}.${createHmac(algo, secret).update(`${e}.${c}`).digest("base64url")}`;
};

describe("lib/jwt : vérification de l'identité envoyée par Open WebUI", () => {
  const t0 = Date.now();

  it("accepte un jeton authentique et rend l'identifiant de l'étudiant", () => {
    const jeton = signerJwt({ sub: "alice", email: "a@b.c", role: "user" }, SECRET, 300, t0);
    expect(verifierJwt(jeton, SECRET, t0)).toMatchObject({ sub: "alice", email: "a@b.c", role: "user" });
  });

  it("accepte un UUID (identifiant réel d'Open WebUI)", () => {
    const id = "3f2a9c1e-8d4b-4c7a-9e2f-1a5b6c7d8e9f";
    expect(verifierJwt(signerJwt({ sub: id }, SECRET, 300, t0), SECRET, t0)?.sub).toBe(id);
  });

  it("refuse un jeton expiré (valable 300 s)", () => {
    const jeton = signerJwt({ sub: "alice" }, SECRET, 300, t0);
    expect(verifierJwt(jeton, SECRET, t0 + 299_000)).not.toBeNull();
    expect(verifierJwt(jeton, SECRET, t0 + 300_000)).toBeNull();
  });

  it("refuse un jeton signé avec un autre secret", () => {
    expect(verifierJwt(signerJwt({ sub: "alice" }, "un-autre-secret-0123456789abcd", 300, t0), SECRET, t0)).toBeNull();
  });

  it("refuse un contenu falsifié (sub changé, signature conservée)", () => {
    const [e, c, s] = signerJwt({ sub: "alice" }, SECRET, 300, t0).split(".") as [string, string, string];
    const contenu = { ...JSON.parse(Buffer.from(c, "base64url").toString()), sub: "bob" };
    expect(verifierJwt(`${e}.${b64(contenu)}.${s}`, SECRET, t0)).toBeNull();
  });

  it("refuse l'algorithme 'none' et tout algorithme autre que HS256", () => {
    const exp = Math.floor(t0 / 1000) + 60;
    expect(verifierJwt(`${b64({ alg: "none" })}.${b64({ sub: "alice", exp })}.`, SECRET, t0)).toBeNull();
    expect(verifierJwt(signer({ alg: "HS512" }, { sub: "alice", exp }, SECRET, "sha512"), SECRET, t0)).toBeNull();
  });

  it("refuse un jeton sans date d'expiration", () => {
    expect(verifierJwt(signer({ alg: "HS256" }, { sub: "alice" }), SECRET, t0)).toBeNull();
  });

  it("refuse un sub qui n'est pas un identifiant valide", () => {
    const exp = Math.floor(t0 / 1000) + 60;
    for (const sub of ["../etc/passwd", "", "a b", 42, null]) {
      expect(verifierJwt(signer({ alg: "HS256" }, { sub, exp }), SECRET, t0)).toBeNull();
    }
  });

  it.each(["", "a.b", "a.b.c.d", "....", "é.é.é", "pas-un-jwt"])("renvoie null sans planter pour %j", (texte) => {
    expect(verifierJwt(texte, SECRET, t0)).toBeNull();
  });
});
