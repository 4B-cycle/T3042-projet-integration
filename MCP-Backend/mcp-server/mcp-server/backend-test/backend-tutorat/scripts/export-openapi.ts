// Exporte la documentation dans docs/openapi.json :  npm run docs:export
// Utile pour l'importer dans Postman, Swagger Editor, ou la partager avec l'équipe MCP.
import { mkdirSync, writeFileSync } from "node:fs";
import { openapiDocument } from "../src/docs/openapi.js";

mkdirSync("docs", { recursive: true });
writeFileSync("docs/openapi.json", JSON.stringify(openapiDocument, null, 2) + "\n");
console.log("Écrit : docs/openapi.json");
