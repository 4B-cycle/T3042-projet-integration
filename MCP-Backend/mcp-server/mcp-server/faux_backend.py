"""Faux Backend API, UNIQUEMENT pour tester server.py sans le vrai backend.

Les données sont gardées en mémoire : tout est effacé quand on l'arrête.
Lancement :  .venv\\Scripts\\python faux_backend.py
Puis lancer server.py avec BACKEND_URL=http://localhost:9001
"""

from starlette.applications import Starlette  # mini-framework web (déjà installé avec mcp)
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
import uvicorn  # le serveur HTTP qui fait tourner l'application

RAPPELS = {}  # id étudiant -> liste de rappels
DIFFICULTES = {}  # id étudiant -> liste de difficultés
AGENDAS = {}  # id étudiant -> {"etudiant_id", "url_ical", "sujet_ntfy"}
compteur = 0  # pour donner un id unique à chaque rappel (même après une suppression)


async def rappels(req):
    global compteur
    e = req.path_params["e"]
    RAPPELS.setdefault(e, [])
    if req.method == "POST":
        compteur += 1
        # Valeurs par défaut, puis celles envoyées par server.py par-dessus.
        rappel = {"id": compteur, "uid_externe": None, "palier_notifie": None, **await req.json()}
        RAPPELS[e].append(rappel)
        print("[faux backend] rappel créé :", rappel)  # pour voir ce qui se passe dans le terminal
        return JSONResponse(rappel, 201)
    return JSONResponse(RAPPELS[e])


async def un_rappel(req):
    e, i = req.path_params["e"], int(req.path_params["i"])
    rappel = next((r for r in RAPPELS.get(e, []) if r["id"] == i), None)  # cherche le rappel n°i
    if rappel is None:
        return Response(status_code=404)
    if req.method == "PATCH":  # modifier seulement les champs envoyés
        rappel.update(await req.json())
        print("[faux backend] rappel modifié :", rappel)
        return JSONResponse(rappel)
    RAPPELS[e].remove(rappel)  # DELETE
    print("[faux backend] rappel supprimé :", rappel)
    return Response(status_code=204)


async def agenda(req):
    e = req.path_params["e"]
    if req.method == "PUT":
        AGENDAS[e] = {"etudiant_id": e, **await req.json()}
        return JSONResponse(AGENDAS[e])
    return JSONResponse(AGENDAS[e]) if e in AGENDAS else Response(status_code=404)


async def tous_les_agendas(req):
    return JSONResponse(list(AGENDAS.values()))


async def exercices(req):
    return JSONResponse([{"id": 7, "matiere": req.query_params["matiere"],
                          "niveau": int(req.query_params.get("niveau", 1)), "enonce": "Calcule le masque /26."}])


async def difficultes(req):
    e = req.path_params["e"]
    DIFFICULTES.setdefault(e, [])
    if req.method == "POST":
        DIFFICULTES[e].append(await req.json())
        return JSONResponse({}, 201)
    return JSONResponse(DIFFICULTES[e])


async def cours(req):
    return JSONResponse([{"id": 1, "titre": "Le modèle OSI", "matiere": "réseau", "resume": "7 couches."}])


app = Starlette(routes=[
    Route("/etudiants/{e}/rappels", rappels, methods=["GET", "POST"]),
    Route("/etudiants/{e}/rappels/{i}", un_rappel, methods=["PATCH", "DELETE"]),
    Route("/etudiants/{e}/agenda", agenda, methods=["GET", "PUT"]),
    Route("/agendas", tous_les_agendas),
    Route("/etudiants/{e}/exercices", exercices),
    Route("/etudiants/{e}/difficultes", difficultes, methods=["GET", "POST"]),
    Route("/cours", cours),
])

if __name__ == "__main__":
    uvicorn.run(app, port=9001, log_level="warning")
