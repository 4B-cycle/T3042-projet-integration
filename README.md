# Projet D'integration 
#  AI Student Assistant


##  Documentation

| | |
|---|---|
|  Wiki | [Accueil](../../wiki) |
|  Backlog vivant | [GitHub Project](https://github.com/users/4B-cycle/projects/1) · [vue d'ensemble](../../wiki/Backlog) |
|  Architecture | [Architecture](../../wiki/Architecture) · [Choix techniques](../../wiki/Choix-techniques) |
|  Installer | [Installation et utilisation](../../wiki/Installation-et-utilisation) |

## Architecture en bref

```text
Étudiant ─▶ Open WebUI (orchestrateur + RAG) ─▶ LLM Mistral Small (Azure)
                    │ MCP
                    ▼
            Serveur MCP Python ─▶ Backend API + PostgreSQL
                    ├─▶ Moodle (calendrier iCal)
                    └─▶ ntfy ─▶ 📱 notifications
Robot Raspberry Pi ─(Wi-Fi)─▶ serveur
```

## Structure proposée du dépôt

```text
mcp-server/   outils MCP (rappels, Moodle, exercices…)
backend/      API FastAPI + PostgreSQL
station/        scripts du Raspberry Pi
docs/         schémas, maquettes
```
