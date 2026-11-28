# Backend – Agent IA de tutorat (EPIC 13 + 17)

Backend HTTP en TypeScript : Fastify + Zod + Prisma + PostgreSQL.
Il remplace `faux_backend.py` du serveur MCP et respecte le contrat décrit dans le docstring de `server.py`.

## Démarrage

```bash
npm install
cp .env.example .env            # puis remplace les 3 secrets (voir « Authentification »)
docker compose up -d            # PostgreSQL
npx prisma migrate dev --name init   # crée les tables (puis, après un ajout au schéma : --name resultats)
npm run db:seed                 # cours et exercices de test
npm run dev                     # http://localhost:8001
```

## Brancher le MCP

Dans le terminal qui lance `server.py` :

```
BACKEND_URL=http://localhost:8001
BACKEND_TOKEN=<la même valeur que BACKEND_TOKEN dans .env>
BACKEND_SERVICE_TOKEN=<la même valeur que BACKEND_SERVICE_TOKEN dans .env>
```

## Authentification : qui est l'étudiant ?

```
Étudiant → Open WebUI ──► MCP ──(jeton + JWT d'identité)──► Backend ──► PostgreSQL
```

Open WebUI signe l'identité de l'utilisateur connecté dans un **JWT** (HS256, valable 5 min) et l'envoie au
MCP dans l'en-tête `X-OpenWebUI-User-Jwt`. Le MCP le transmet tel quel ; **le backend vérifie la signature**
(`src/lib/jwt.ts`) et en déduit l'étudiant. L'`{id}` d'une URL n'est donc plus cru sur parole.

| Appelant | Envoie | Accès |
|---|---|---|
| Étudiant (outils du chat) | `BACKEND_TOKEN` + JWT d'identité | uniquement `/etudiants/<son id>/…`, `/cours`, `/examens` ; autre `{id}` → **403** ; `/agendas` → **403** |
| Service (boucle automatique du MCP) | `BACKEND_SERVICE_TOKEN` | uniquement `/agendas` et `/etudiants/{id}/rappels…` ; le reste → **403** |

- **401** : jeton incorrect, ou JWT absent / falsifié / expiré. **403** : identité connue mais accès interdit.
- Trois secrets **différents** dans `.env` : `BACKEND_TOKEN`, `BACKEND_SERVICE_TOKEN`, `OPENWEBUI_JWT_SECRET`
  (ce dernier = `FORWARD_USER_INFO_HEADER_JWT_SECRET` d'Open WebUI). Le backend refuse de démarrer si l'un
  manque, est trop court ou est identique à un autre.
- Côté Open WebUI (variables d'environnement) : `ENABLE_FORWARD_USER_INFO_HEADERS=true` et
  `FORWARD_USER_INFO_HEADER_JWT_SECRET=<OPENWEBUI_JWT_SECRET>`, puis redémarrer Open WebUI.
- Tester sans Open WebUI : `npm run jwt -- alice` fabrique un JWT valable 1 h, à mettre dans l'en-tête
  `X-OpenWebUI-User-Jwt` avec `Authorization: Bearer <BACKEND_TOKEN>`.

## Les 13 routes (toutes protégées, voir ci-dessus)

| # | Route | Fichier |
|---|---|---|
| 1 | GET `/etudiants/{id}/rappels` | routes/rappels.ts |
| 2 | POST `/etudiants/{id}/rappels` | routes/rappels.ts |
| 3 | PATCH `/etudiants/{id}/rappels/{idRappel}` | routes/rappels.ts |
| 4 | DELETE `/etudiants/{id}/rappels/{idRappel}` | routes/rappels.ts |
| 5 | GET `/etudiants/{id}/agenda` | routes/agenda.ts |
| 6 | PUT `/etudiants/{id}/agenda` | routes/agenda.ts |
| 7 | GET `/agendas` | routes/agenda.ts |
| 8 | GET `/etudiants/{id}/exercices` | routes/tutorat.ts |
| 9 | GET `/etudiants/{id}/difficultes` | routes/tutorat.ts |
| 10 | POST `/etudiants/{id}/difficultes` | routes/tutorat.ts |
| 11 | GET `/cours` | routes/tutorat.ts |
| 12 | POST `/etudiants/{id}/resultats` | routes/resultats.ts |
| 13 | GET `/etudiants/{id}/progression` | routes/resultats.ts |

Plus `GET /health` (sans jeton) et les 2 routes `/examens` (pas encore documentées dans Swagger).

## Commandes utiles

`npm test` · `npm run typecheck` · `npm run build` puis `npm start` · `npx prisma studio` (voir la base)

## Décisions de prototype (à valider en équipe)

- L'identifiant `{id}` est celui d'Open WebUI ; l'étudiant est créé à sa première écriture.
- Les dates sont des heures « murales » sans fuseau (contrat du MCP) ; voir `src/lib/dates.ts`.
- `GET /exercices` sans `niveau` : tri du plus facile au plus difficile (TODO : tenir compte des difficultés).
- `url_ical` est stockée en clair (elle contient un jeton Moodle) : chiffrement à prévoir.

## Documentation Swagger

Une fois `npm run dev` lancé : **http://localhost:8001/docs**

1. Clique sur **Authorize** (cadenas) : colle `BACKEND_TOKEN` dans `bearerAuth` et un JWT (`npm run jwt -- <id>`) dans `openWebUiJwt`.
2. Ouvre une route, clique sur **Try it out**, remplis les champs, puis **Execute**.

- Document brut : `http://localhost:8001/docs/json`
- Export dans un fichier : `npm run docs:export` (crée `docs/openapi.json`, importable dans Postman)
- Le document est écrit à la main dans `src/docs/openapi.ts` : le mettre à jour quand une route change.
- En production : `ENABLE_DOCS=false`.
