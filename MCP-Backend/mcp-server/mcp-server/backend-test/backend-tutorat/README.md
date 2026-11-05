# Backend – Agent IA de tutorat (EPIC 13 + 17)

Backend HTTP en TypeScript : Fastify + Zod + Prisma + PostgreSQL.
Il remplace `faux_backend.py` du serveur MCP et respecte le contrat décrit dans le docstring de `server.py`.

## Démarrage

```bash
npm install
cp .env.example .env            # puis modifie BACKEND_TOKEN
docker compose up -d            # PostgreSQL
npx prisma migrate dev --name init   # crée les tables
npm run db:seed                 # cours et exercices de test
npm run dev                     # http://localhost:8001
```

## Brancher le MCP

Dans le terminal qui lance `server.py` :

```
BACKEND_URL=http://localhost:8001
BACKEND_TOKEN=<la même valeur que dans .env>
```

## Les 11 routes (toutes protégées par `Authorization: Bearer <jeton>`)

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

Plus `GET /health` (sans jeton).

## Commandes utiles

`npm test` · `npm run typecheck` · `npm run build` puis `npm start` · `npx prisma studio` (voir la base)

## Décisions de prototype (à valider en équipe)

- L'identifiant `{id}` est celui d'Open WebUI ; l'étudiant est créé à sa première écriture.
- Les dates sont des heures « murales » sans fuseau (contrat du MCP) ; voir `src/lib/dates.ts`.
- `GET /exercices` sans `niveau` : tri du plus facile au plus difficile (TODO : tenir compte des difficultés).
- `url_ical` est stockée en clair (elle contient un jeton Moodle) : chiffrement à prévoir.
