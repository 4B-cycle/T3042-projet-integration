import type { OpenAPIV3 } from "openapi-types";

/**
 * Documentation OpenAPI 3.0 des routes, affichée par Swagger UI sur /docs.
 *
 * Ce document est écrit À LA MAIN : il ne se met pas à jour tout seul. Quand tu modifies une
 * route (champ ajouté, code de réponse changé...), pense à modifier ce fichier aussi.
 * Il doit rester cohérent avec les schémas Zod de src/lib/schemas.ts.
 */

// ---------- Morceaux réutilisés ----------

const jsonErreur = {
  "application/json": { schema: { $ref: "#/components/schemas/Erreur" } },
};

const ref = (nom: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${nom}`,
});
const paramRef = (nom: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/parameters/${nom}`,
});
const repRef = (nom: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/responses/${nom}`,
});

// ---------- Document ----------

export const openapiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "API Backend – Agent IA de tutorat",
    version: "0.1.0",
    description: [
      "Backend du projet d'agent IA de tutorat (EPIC 13 et 17).",
      "",
      "Ces routes sont appelées par le **serveur MCP**, pas directement par les étudiants.",
      "",
      "**Authentification** : toutes les routes (sauf `/health`) exigent l'en-tête",
      "`Authorization: Bearer <BACKEND_TOKEN>`. Dans Swagger UI, clique sur **Authorize** et colle le jeton.",
      "",
      "**Identifiant étudiant** : `{id}` est l'identifiant Open WebUI de l'utilisateur.",
      "",
      "**Dates** : format `AAAA-MM-JJ HH:MM`, heure locale, **sans fuseau horaire**.",
    ].join("\n"),
  },
  servers: [{ url: "/", description: "Serveur courant" }],
  tags: [
    { name: "Système", description: "Vérification du serveur" },
    {
      name: "Rappels",
      description: "Rappels manuels et événements Moodle importés",
    },
    {
      name: "Agenda",
      description: "Connexion du calendrier Moodle et du canal ntfy",
    },
    { name: "Exercices", description: "Banque d'exercices" },
    {
      name: "Difficultés",
      description: "Notions mal maîtrisées par l'étudiant",
    },
    { name: "Cours", description: "Recherche dans les cours" },
    { name: "Examens", description: "Gestion des examens" },
  ],
  security: [{ bearerAuth: [] }],

  paths: {
    // ----- Système -----
    "/health": {
      get: {
        tags: ["Système"],
        summary: "Vérifier que le serveur tourne",
        description:
          "Route publique (sans jeton), utile pour Docker ou la supervision.",
        security: [],
        responses: {
          "200": {
            description: "Le serveur répond",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },

    // ----- Rappels -----
    "/etudiants/{id}/rappels": {
      parameters: [paramRef("EtudiantId")],
      get: {
        tags: ["Rappels"],
        summary: "Lister les rappels d'un étudiant",
        description:
          "Renvoie les rappels triés par date croissante. Un étudiant inconnu donne une liste vide (rien n'est créé).",
        responses: {
          "200": {
            description: "Liste des rappels",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Rappel") },
              },
            },
          },
          "401": repRef("NonAutorise"),
          "400": repRef("Invalide"),
        },
      },
      post: {
        tags: ["Rappels"],
        summary: "Créer un rappel",
        description:
          "Crée un rappel. L'étudiant est créé automatiquement s'il n'existe pas encore. " +
          "Si `uid_externe` est fourni et déjà importé pour cet étudiant, la réponse est 409.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("RappelCreation") } },
        },
        responses: {
          "201": {
            description: "Rappel créé",
            content: { "application/json": { schema: ref("Rappel") } },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
          "409": {
            description:
              "Un rappel avec ce `uid_externe` existe déjà pour cet étudiant",
            content: jsonErreur,
          },
        },
      },
    },

    "/etudiants/{id}/rappels/{idRappel}": {
      parameters: [paramRef("EtudiantId"), paramRef("RappelId")],
      patch: {
        tags: ["Rappels"],
        summary: "Modifier un rappel (partiellement)",
        description:
          "Seuls les champs envoyés sont modifiés. `palier_notifie: null` remet le palier à zéro. " +
          "Un rappel qui n'appartient pas à cet étudiant donne un 404.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: ref("RappelModification") },
          },
        },
        responses: {
          "200": {
            description: "Rappel modifié",
            content: { "application/json": { schema: ref("Rappel") } },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
          "404": repRef("Introuvable"),
        },
      },
      delete: {
        tags: ["Rappels"],
        summary: "Supprimer un rappel",
        description:
          "Un rappel qui n'appartient pas à cet étudiant donne un 404.",
        responses: {
          "204": { description: "Rappel supprimé (pas de contenu)" },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
          "404": repRef("Introuvable"),
        },
      },
    },

    // ----- Agenda -----
    "/etudiants/{id}/agenda": {
      parameters: [paramRef("EtudiantId")],
      get: {
        tags: ["Agenda"],
        summary: "Lire l'agenda connecté d'un étudiant",
        description:
          "Renvoie 404 si l'étudiant n'a pas encore connecté Moodle : le MCP s'appuie sur ce code.\n\n" +
          "⚠️ La réponse contient des secrets (jeton Moodle dans l'URL, sujet ntfy).",
        responses: {
          "200": {
            description: "Agenda connecté",
            content: { "application/json": { schema: ref("Agenda") } },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
          "404": repRef("Introuvable"),
        },
      },
      put: {
        tags: ["Agenda"],
        summary: "Connecter ou remplacer l'agenda",
        description:
          "Crée l'agenda ou remplace celui qui existe. L'URL doit être en `https` sur l'hôte autorisé " +
          "(`moodle.ephec.be` par défaut), sinon 400.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AgendaEcriture") } },
        },
        responses: {
          "200": {
            description: "Agenda enregistré",
            content: { "application/json": { schema: ref("Agenda") } },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
        },
      },
    },

    "/agendas": {
      get: {
        tags: ["Agenda"],
        summary: "Lister les agendas de tous les étudiants",
        description:
          "Utilisé par la boucle de synchronisation du MCP.\n\n" +
          "⚠️ Expose les secrets de **tous** les étudiants : ne jamais rendre cette route accessible hors du réseau interne.",
        responses: {
          "200": {
            description: "Liste des agendas",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Agenda") },
              },
            },
          },
          "401": repRef("NonAutorise"),
        },
      },
    },

    // ----- Exercices -----
    "/etudiants/{id}/exercices": {
      parameters: [paramRef("EtudiantId")],
      get: {
        tags: ["Exercices"],
        summary: "Lister des exercices d'une matière",
        description:
          "`matiere` est obligatoire (insensible à la casse). Sans `niveau`, tri du plus facile au plus difficile. " +
          "Maximum 20 résultats. La personnalisation selon les difficultés de l'étudiant n'est pas encore implémentée.",
        parameters: [
          {
            name: "matiere",
            in: "query",
            required: true,
            description: "Matière recherchée",
            schema: { type: "string", minLength: 1, maxLength: 100 },
            example: "réseau",
          },
          {
            name: "niveau",
            in: "query",
            required: false,
            description: "Niveau de difficulté (1 = facile, 3 = difficile)",
            schema: { type: "integer", minimum: 1, maximum: 3 },
          },
        ],
        responses: {
          "200": {
            description: "Liste d'exercices (éventuellement vide)",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Exercice") },
              },
            },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
        },
      },
    },

    // ----- Examens -----
    "/examens": {
      get: {
        tags: ["Examens"],
        summary: "Lister tous les examens",
        responses: {
          "200": {
            description: "Liste des examens",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Examen") },
              },
            },
          },
          "401": repRef("NonAutorise"),
        },
      },
    },
    "/examens/{idExamen}": {
      parameters: [paramRef("ExamenId")],
      get: {
        tags: ["Examens"],
        summary: "Détail d'un examen et de ses exercices",
        responses: {
          "200": {
            description: "Détail de l'examen",
            content: { "application/json": { schema: ref("ExamenDetail") } },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
          "404": repRef("Introuvable"),
        },
      },
    },

    // ----- Difficultés -----
    "/etudiants/{id}/difficultes": {
      parameters: [paramRef("EtudiantId")],
      get: {
        tags: ["Difficultés"],
        summary: "Lister les difficultés d'un étudiant",
        description: "Un étudiant inconnu donne une liste vide.",
        responses: {
          "200": {
            description: "Liste des difficultés",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Difficulte") },
              },
            },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
        },
      },
      post: {
        tags: ["Difficultés"],
        summary: "Enregistrer une difficulté",
        description:
          "Sans doublon : si la même difficulté (matière + notion) existe déjà, elle n'est pas recréée " +
          "et la réponse est la même. L'étudiant est créé automatiquement s'il n'existe pas.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("Difficulte") } },
        },
        responses: {
          "201": {
            description: "Difficulté enregistrée",
            content: { "application/json": { schema: ref("Difficulte") } },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
        },
      },
    },

    // ----- Cours -----
    "/cours": {
      get: {
        tags: ["Cours"],
        summary: "Rechercher des cours",
        description:
          "Chaque mot de `recherche` doit apparaître dans le titre ou le résumé (insensible à la casse). " +
          "Les deux paramètres sont facultatifs. Maximum 20 résultats.",
        parameters: [
          {
            name: "recherche",
            in: "query",
            required: false,
            description: "Mots à chercher dans le titre ou le résumé",
            schema: { type: "string", maxLength: 200 },
            example: "modèle OSI",
          },
          {
            name: "matiere",
            in: "query",
            required: false,
            description: "Filtrer sur une matière",
            schema: { type: "string", maxLength: 100 },
            example: "réseau",
          },
        ],
        responses: {
          "200": {
            description: "Liste de cours (éventuellement vide)",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Cours") },
              },
            },
          },
          "400": repRef("Invalide"),
          "401": repRef("NonAutorise"),
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Jeton partagé avec le MCP (variable BACKEND_TOKEN).",
      },
    },

    parameters: {
      EtudiantId: {
        name: "id",
        in: "path",
        required: true,
        description:
          "Identifiant Open WebUI de l'étudiant (lettres, chiffres, _ et - uniquement)",
        schema: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        example: "1",
      },
      RappelId: {
        name: "idRappel",
        in: "path",
        required: true,
        description: "Identifiant du rappel",
        schema: { type: "integer", minimum: 1 },
        example: 12,
      },
      ExamenId: {
        name: "idExamen",
        in: "path",
        required: true,
        description: "Identifiant de l'examen",
        schema: { type: "integer", minimum: 1 },
        example: 1,
      },
    },

    responses: {
      NonAutorise: {
        description: "Jeton absent ou incorrect",
        content: {
          "application/json": {
            schema: ref("Erreur"),
            example: { error: "Non autorisé" },
          },
        },
      },
      Invalide: {
        description:
          "Données invalides (format, longueur, valeur hors plage...)",
        content: { "application/json": { schema: ref("ErreurValidation") } },
      },
      Introuvable: {
        description: "Élément introuvable (ou appartenant à un autre étudiant)",
        content: {
          "application/json": {
            schema: ref("Erreur"),
            example: { error: "Rappel introuvable" },
          },
        },
      },
    },

    schemas: {
      Erreur: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
      ErreurValidation: {
        type: "object",
        required: ["error", "details"],
        properties: {
          error: { type: "string", example: "Données invalides" },
          details: {
            type: "array",
            description: "Liste des problèmes détectés par Zod",
            items: { type: "object", additionalProperties: true },
          },
        },
      },

      Rappel: {
        type: "object",
        required: [
          "id",
          "titre",
          "date_heure",
          "uid_externe",
          "palier_notifie",
        ],
        properties: {
          id: { type: "integer", example: 12 },
          titre: { type: "string", example: "Examen de réseau" },
          date_heure: {
            type: "string",
            description: "Heure locale sans fuseau, format AAAA-MM-JJ HH:MM",
            pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$",
            example: "2026-11-05 14:00",
          },
          uid_externe: {
            type: "string",
            nullable: true,
            description:
              "Identifiant de l'événement Moodle ; null pour un rappel manuel",
          },
          palier_notifie: {
            type: "integer",
            nullable: true,
            description:
              "Dernier palier de notification envoyé, en heures (72, 24, 2) ; null si aucun",
            example: 24,
          },
        },
      },
      RappelCreation: {
        type: "object",
        required: ["titre", "date_heure"],
        properties: {
          titre: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            example: "Réviser le chapitre 3",
          },
          date_heure: {
            type: "string",
            description:
              "AAAA-MM-JJ HH:MM (le format ISO avec T est accepté ; pas de fuseau ni de Z)",
            example: "2026-11-05 14:00",
          },
          uid_externe: {
            type: "string",
            nullable: true,
            minLength: 1,
            maxLength: 500,
          },
        },
      },
      RappelModification: {
        type: "object",
        description: "Tous les champs sont facultatifs",
        properties: {
          titre: { type: "string", minLength: 1, maxLength: 200 },
          date_heure: { type: "string", example: "2026-11-06 09:30" },
          palier_notifie: { type: "integer", nullable: true, minimum: 0 },
        },
      },

      Agenda: {
        type: "object",
        required: ["etudiant_id", "url_ical", "sujet_ntfy"],
        properties: {
          etudiant_id: { type: "string", example: "1" },
          url_ical: {
            type: "string",
            format: "uri",
            description: "Contient un jeton Moodle personnel (secret)",
          },
          sujet_ntfy: { type: "string", description: "Sujet ntfy (secret)" },
        },
      },
      AgendaEcriture: {
        type: "object",
        required: ["url_ical", "sujet_ntfy"],
        properties: {
          url_ical: {
            type: "string",
            format: "uri",
            maxLength: 2000,
            description:
              "https uniquement, sur l'hôte autorisé (AGENDA_HOTE_AUTORISE)",
            example:
              "https://moodle.ephec.be/calendar/export_execute.php?userid=0&authtoken=xxxx",
          },
          sujet_ntfy: {
            type: "string",
            minLength: 8,
            maxLength: 100,
            pattern: "^[A-Za-z0-9_-]+$",
            example: "tutorat-a1b2c3d4",
          },
        },
      },

      Exercice: {
        type: "object",
        required: ["id", "matiere", "niveau", "enonce"],
        properties: {
          id: { type: "integer", example: 3 },
          matiere: { type: "string", example: "réseau" },
          niveau: { type: "integer", minimum: 1, maximum: 3, example: 2 },
          enonce: {
            type: "string",
            example:
              "Calcule le masque correspondant à /26 et le nombre d'hôtes utilisables.",
          },
        },
      },

      Examen: {
        type: "object",
        required: ["id", "titre", "matiere", "date_prevue"],
        properties: {
          id: { type: "integer", example: 1 },
          titre: { type: "string", example: "Examen de Réseaux" },
          matiere: { type: "string", example: "Réseaux" },
          date_prevue: { type: "string", nullable: true, format: "date-time" },
        },
      },
      ExamenDetail: {
        type: "object",
        required: ["id", "titre", "matiere", "date_prevue", "exercices"],
        properties: {
          id: { type: "integer", example: 1 },
          titre: { type: "string", example: "Examen de Réseaux" },
          matiere: { type: "string", example: "Réseaux" },
          date_prevue: { type: "string", nullable: true, format: "date-time" },
          exercices: { type: "array", items: ref("Exercice") },
        },
      },

      Difficulte: {
        type: "object",
        required: ["matiere", "notion"],
        properties: {
          matiere: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            example: "réseau",
          },
          notion: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            example: "calcul de masques de sous-réseau",
          },
        },
      },

      Cours: {
        type: "object",
        required: ["id", "titre", "matiere", "resume"],
        properties: {
          id: { type: "integer", example: 1 },
          titre: { type: "string", example: "Le modèle OSI" },
          matiere: { type: "string", example: "réseau" },
          resume: {
            type: "string",
            example: "Les 7 couches du modèle OSI et le rôle de chacune.",
          },
        },
      },
    },
  },
};
