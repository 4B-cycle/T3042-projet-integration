"""Serveur MCP de l'AI Student Assistant.

Rôle de ce fichier
------------------
Open WebUI (l'orchestrateur) se connecte à ce serveur et propose ses outils
au LLM (Mistral). Quand le LLM décide d'utiliser un outil, Open WebUI appelle
la fonction Python correspondante ci-dessous.

Ce serveur ne touche JAMAIS directement la base de données : il appelle le
Backend API, qui lui seul parle à PostgreSQL.

    Open WebUI  ──MCP──▶  ce serveur  ──HTTP──▶  Backend API  ──▶  BD

Rappels automatiques (en plus des rappels créés à la main)
----------------------------------------------------------
Une boucle tourne en fond, même quand personne ne parle à l'assistant :

    toutes les AGENDA_SYNC_MINUTES minutes, pour chaque étudiant :
      1. lit son calendrier Moodle (URL du calendrier) -> crée / met à jour / supprime ses rappels
      2. pour chaque rappel, à chaque palier (ex. 72 h, 24 h, 2 h avant) -> un message sur son téléphone (ntfy)

L'étudiant obtient son URL sur https://moodle.ephec.be/calendar/export.php :
« Tous les événements » + « Les 60 prochains jours » -> bouton « URL du calendrier ».

Routes du Backend API utilisées (PROPOSITION à valider avec le backend)
------------------------------------------------------------------------
    GET    /etudiants/{id}/rappels                    -> liste de rappels
    POST   /etudiants/{id}/rappels                    <- {"titre", "date_heure", "uid_externe"?}
    PATCH  /etudiants/{id}/rappels/{id_rappel}        <- champs à modifier, ex. {"palier_notifie": 24}
    DELETE /etudiants/{id}/rappels/{id_rappel}
    GET    /etudiants/{id}/agenda                     -> agenda (404 si pas encore connecté)
    PUT    /etudiants/{id}/agenda                     <- {"url_ical", "sujet_ntfy"}
    GET    /agendas                                   -> agendas de TOUS les étudiants (pour la boucle)
    GET    /etudiants/{id}/exercices?matiere=&niveau= -> liste d'exercices
    GET    /etudiants/{id}/difficultes                -> liste de difficultés
    POST   /etudiants/{id}/difficultes                <- {"matiere", "notion"}
    GET    /cours?recherche=&matiere=                 -> liste de cours

Format JSON attendu en retour :
    rappel     : {"id": 1, "titre": "...", "date_heure": "2026-10-30 14:00",
                  "uid_externe": null, "palier_notifie": null}
                  (uid_externe = identifiant de l'événement Moodle, null si créé à la main)
                  (palier_notifie = dernier palier envoyé, en heures, null si aucun)
    agenda     : {"etudiant_id": "1", "url_ical": "https://moodle.ephec.be/calendar/export_execute.php?...", "sujet_ntfy": "aisa-..."}
    exercice   : {"id": 1, "matiere": "...", "niveau": 2, "enonce": "..."}
    difficulte : {"matiere": "...", "notion": "..."}
    cours      : {"id": 1, "titre": "...", "matiere": "...", "resume": "..."}

Configuration (variables d'environnement)
-----------------------------------------
    BACKEND_URL          adresse du Backend API   (défaut : http://localhost:8001)
    BACKEND_TOKEN        clé envoyée au backend   (défaut : aucune)
    ETUDIANT_PAR_DEFAUT  id utilisé si Open WebUI n'envoie pas l'utilisateur
                         (défaut : "1", pratique pour tester seul)
    MCP_PORT             port d'écoute de ce serveur (défaut : 8200)
    AGENDA_SYNC_MINUTES  intervalle de la boucle automatique (défaut : 15)
    RAPPEL_PALIERS_HEURES combien d'heures avant l'échéance on prévient (défaut : "72,24,2")
    NTFY_URL             serveur de notifications (défaut : https://ntfy.sh)
"""

# --- Imports -----------------------------------------------------------------

import asyncio  # lancer la boucle automatique en tâche de fond
import os  # lire les variables d'environnement (os.getenv)
import secrets  # générer un nom de sujet ntfy impossible à deviner
from contextlib import asynccontextmanager  # pour écrire le "lifespan" (démarrage / arrêt du serveur)
from datetime import date, datetime, timedelta  # vérifier et comparer les dates
from urllib.parse import urlparse  # découper une URL pour vérifier son adresse

import httpx2  # client HTTP (déjà installé avec la librairie mcp) pour appeler le backend
from icalendar import Calendar  # lire le format iCal (.ics) du calendrier Moodle
from mcp.server.mcpserver import Context, MCPServer  # MCPServer = le serveur, Context = infos sur la requête en cours

# --- Configuration -----------------------------------------------------------

# Adresse du Backend API. On la lit dans l'environnement pour pouvoir changer
# de machine (PC local, serveur de l'école…) sans modifier le code.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")

# Clé partagée avec le backend, pour qu'il sache que c'est bien nous qui appelons.
# Vide par défaut tant que le backend ne demande pas d'authentification.
BACKEND_TOKEN = os.getenv("BACKEND_TOKEN", "")

# Étudiant utilisé quand on ne sait pas qui parle (tests en local).
ETUDIANT_PAR_DEFAUT = os.getenv("ETUDIANT_PAR_DEFAUT", "1")

# Port d'écoute. Configurable car Windows réserve parfois des plages de ports
# (Hyper-V, WSL, Docker) : voir "netsh interface ipv4 show excludedportrange protocol=tcp".
# int(...) : os.getenv renvoie toujours du texte, or le port doit être un nombre.
MCP_PORT = int(os.getenv("MCP_PORT", "8200"))  # 8000 est dans une plage réservée par Windows sur ce PC

# En-tête HTTP qu'Open WebUI peut ajouter pour dire quel utilisateur est connecté.
# Il faut activer ENABLE_FORWARD_USER_INFO_HEADERS côté Open WebUI (à vérifier).
ENTETE_UTILISATEUR = "x-openwebui-user-id"

# Rappels automatiques (voir l'explication en haut du fichier).
AGENDA_SYNC_MINUTES = int(os.getenv("AGENDA_SYNC_MINUTES", "15"))
# Paliers de notification, du plus grand au plus petit : [72, 24, 2].
# split(",") découpe le texte "72,24,2" en morceaux, int() les transforme en nombres.
RAPPEL_PALIERS_HEURES = sorted((int(h) for h in os.getenv("RAPPEL_PALIERS_HEURES", "72,24,2").split(",")), reverse=True)
NTFY_URL = os.getenv("NTFY_URL", "https://ntfy.sh")

# On n'importe que les événements des N prochains jours : inutile de remplir
# la base avec des rendez-vous de l'année prochaine.
AGENDA_JOURS = 60

# Seule adresse d'agenda acceptée. Sans cette vérification, n'importe qui
# pourrait faire télécharger à NOTRE serveur une adresse interne du réseau
# (ex. http://192.168.1.1/admin) : c'est une faille appelée SSRF.
AGENDA_HOTE_AUTORISE = "moodle.ephec.be"

# Heure donnée aux événements « toute la journée » (ils n'ont pas d'heure).
HEURE_JOURNEE_ENTIERE = 8

# --- Fonctions utilitaires (ce ne sont PAS des outils : pas de @mcp.tool) -----


def etudiant_courant(ctx: Context) -> str:
    """Renvoie l'id de l'étudiant qui parle à l'assistant.

    On ne demande pas l'id au LLM : un étudiant pourrait lui dire « je suis
    l'étudiant n°2 » et lire les données d'un autre. L'id vient donc
    d'Open WebUI (l'utilisateur connecté), pas de la conversation.
    """
    requete_http = ctx.request_context.request  # la requête HTTP reçue (None si le transport n'est pas HTTP)
    if requete_http is not None:  # on est bien en HTTP : on peut lire les en-têtes
        id_utilisateur = requete_http.headers.get(ENTETE_UTILISATEUR)  # None si Open WebUI ne l'envoie pas
        if id_utilisateur:  # l'en-tête est présent et non vide
            return id_utilisateur  # c'est l'utilisateur connecté à Open WebUI
    return ETUDIANT_PAR_DEFAUT  # sinon, on se rabat sur l'étudiant de test


async def appeler_backend(methode: str, chemin: str, **options) -> dict | list | str:
    """Envoie une requête au Backend API et renvoie sa réponse JSON.

    En cas de problème, renvoie un message d'erreur (str) au lieu de planter :
    le LLM pourra le lire et l'expliquer à l'étudiant.

    Args:
        methode: "GET", "POST" ou "DELETE".
        chemin: la route, ex. "/etudiants/1/rappels".
        **options: passées telles quelles à httpx2 (json=..., params=...).
    """
    # Si on a une clé, on l'envoie dans l'en-tête standard "Authorization".
    entetes = {"Authorization": f"Bearer {BACKEND_TOKEN}"} if BACKEND_TOKEN else {}
    try:
        # "async with" ouvre le client puis le ferme proprement à la fin du bloc.
        # timeout=10 : on n'attend pas plus de 10 s un backend qui ne répond pas.
        async with httpx2.AsyncClient(base_url=BACKEND_URL, headers=entetes, timeout=10) as client:
            reponse = await client.request(methode, chemin, **options)  # envoie la requête et attend la réponse
    except httpx2.HTTPError:  # backend éteint, mauvaise adresse, délai dépassé…
        return "Le serveur de données est injoignable pour le moment."
    if reponse.status_code == 404:  # la ressource demandée n'existe pas
        return "Élément introuvable."
    if reponse.status_code >= 400:  # toute autre erreur (400 données invalides, 500 bug backend…)
        return f"Le serveur de données a refusé la demande (code {reponse.status_code})."
    if not reponse.content:  # ex. un DELETE qui répond 204 sans contenu
        return {}
    return reponse.json()  # transforme le texte JSON en dict / list Python


# --- Rappels automatiques : calendrier Moodle + notifications ------------------


def lire_agenda_ical(contenu: bytes) -> list[dict]:
    """Transforme un fichier iCal (.ics) en liste d'événements à venir.

    Renvoie : [{"uid": "...", "titre": "...", "date_heure": "2026-11-05 14:00"}, ...]
    """
    maintenant = datetime.now()  # heure locale de la machine
    limite = maintenant + timedelta(days=AGENDA_JOURS)  # on ignore ce qui est plus loin
    evenements = []
    for ev in Calendar.from_ical(contenu).walk("VEVENT"):  # VEVENT = un événement dans le format iCal
        if ev.get("RRULE"):  # événement répété (cours chaque lundi…) : ce n'est pas une échéance, on l'ignore
            continue
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":  # événement annulé
            continue
        debut = ev.decoded("DTSTART")  # date (journée entière) ou datetime (avec heure)
        if isinstance(debut, datetime):  # attention : datetime est AUSSI une date, on le teste en premier
            if debut.tzinfo is not None:  # heure avec fuseau (UTC chez Moodle)
                debut = debut.astimezone().replace(tzinfo=None)  # -> heure locale, sans fuseau, comme le backend
        elif isinstance(debut, date):  # journée entière : on choisit une heure fixe
            debut = datetime.combine(debut, datetime.min.time()).replace(hour=HEURE_JOURNEE_ENTIERE)
        if not maintenant <= debut <= limite:  # déjà passé ou trop loin
            continue
        evenements.append({
            "uid": str(ev.get("UID")),  # identifiant unique Moodle : permet de reconnaître l'événement à la prochaine lecture
            "titre": str(ev.get("SUMMARY", "Sans titre")),
            "date_heure": debut.isoformat(" ", "minutes"),  # même format que les rappels manuels
        })
    return evenements


async def synchroniser_agenda(etudiant_id: str, url_ical: str) -> str:
    """Recopie le calendrier Moodle de l'étudiant dans ses rappels.

    - événement nouveau   -> rappel créé
    - événement déplacé   -> rappel mis à jour (et il sera de nouveau notifié)
    - événement supprimé  -> rappel supprimé
    Les rappels créés à la main (uid_externe = null) ne sont jamais touchés.
    """
    try:
        async with httpx2.AsyncClient(timeout=20, follow_redirects=True) as client:
            reponse = await client.get(url_ical)
        reponse.raise_for_status()  # transforme une erreur HTTP (404, 403…) en exception
        evenements = lire_agenda_ical(reponse.content)
    except Exception:  # réseau, adresse révoquée, fichier illisible… : on ne fait planter ni l'outil ni la boucle
        return "Impossible de lire le calendrier Moodle (URL incorrecte ou expirée ?)."

    chemin = f"/etudiants/{etudiant_id}/rappels"
    rappels = await appeler_backend("GET", chemin)
    if isinstance(rappels, str):  # erreur backend
        return rappels
    # Dictionnaire uid -> rappel : retrouver un rappel à partir de l'événement Moodle en une seule étape.
    deja_importes = {r["uid_externe"]: r for r in rappels if r.get("uid_externe")}

    crees = modifies = supprimes = 0  # compteurs pour le message final
    for ev in evenements:
        rappel = deja_importes.pop(ev["uid"], None)  # pop : on le retire, ce qui reste à la fin = événements disparus
        if rappel is None:  # jamais vu : on le crée
            await appeler_backend("POST", chemin, json={
                "titre": ev["titre"], "date_heure": ev["date_heure"], "uid_externe": ev["uid"],
            })
            crees += 1
        elif (rappel["titre"], rappel["date_heure"]) != (ev["titre"], ev["date_heure"]):  # modifié dans Moodle
            await appeler_backend("PATCH", f"{chemin}/{rappel['id']}", json={
                "titre": ev["titre"], "date_heure": ev["date_heure"], "palier_notifie": None,  # nouvelle date = on recommence les paliers
            })
            modifies += 1

    for rappel in deja_importes.values():  # importés avant, mais absents de l'agenda maintenant
        if datetime.fromisoformat(rappel["date_heure"]) > datetime.now():  # on garde l'historique des rappels passés
            await appeler_backend("DELETE", f"{chemin}/{rappel['id']}")
            supprimes += 1

    return f"Agenda synchronisé : {crees} ajouté(s), {modifies} modifié(s), {supprimes} supprimé(s)."


async def envoyer_notification(sujet_ntfy: str, titre: str, message: str) -> bool:
    """Envoie un message sur le téléphone de l'étudiant via ntfy.

    ntfy = service de notifications gratuit : l'étudiant installe l'app « ntfy »
    et s'abonne à son sujet. Envoyer un message = un simple POST HTTP.
    Le nom du sujet est secret (généré au hasard) : qui le connaît peut lire les messages.
    """
    try:
        async with httpx2.AsyncClient(timeout=10) as client:
            # Envoi en JSON (et pas en en-têtes HTTP) pour que les accents du titre passent correctement.
            reponse = await client.post(NTFY_URL, json={"topic": sujet_ntfy, "title": titre, "message": message})
        return reponse.status_code < 400
    except httpx2.HTTPError:
        return False


async def notifier_rappels_proches(etudiant_id: str, sujet_ntfy: str) -> None:
    """Prévient l'étudiant tâche par tâche, à chaque palier (ex. 72 h, 24 h, 2 h avant).

    Concerne TOUS ses rappels : ceux de Moodle et ceux créés à la main.
    Chaque palier n'est envoyé qu'une fois grâce au champ palier_notifie.
    """
    chemin = f"/etudiants/{etudiant_id}/rappels"
    rappels = await appeler_backend("GET", chemin)
    if isinstance(rappels, str):  # erreur backend : on réessaiera au prochain tour
        return
    maintenant = datetime.now()
    for rappel in rappels:
        echeance = datetime.fromisoformat(rappel["date_heure"])
        heures_restantes = (echeance - maintenant).total_seconds() / 3600
        if heures_restantes < 0:  # échéance passée
            continue
        atteints = [p for p in RAPPEL_PALIERS_HEURES if heures_restantes <= p]  # ex. reste 20 h -> [72, 24]
        if not atteints:  # encore trop loin
            continue
        palier = min(atteints)  # le plus proche de l'échéance : 24. Si on a raté 72 (serveur éteint), on n'envoie que 24.
        deja = rappel.get("palier_notifie")
        if deja is not None and palier >= deja:  # ce palier (ou un plus proche) est déjà envoyé : pas de spam
            continue
        if heures_restantes >= 48:  # texte lisible : "dans 3 jours", "dans 5 h"…
            delai = f"dans {round(heures_restantes / 24)} jours"
        elif heures_restantes >= 1:
            delai = f"dans {round(heures_restantes)} h"
        else:
            delai = "dans moins d'une heure"
        envoye = await envoyer_notification(
            sujet_ntfy, f"⏰ {rappel['titre']}", f"{delai.capitalize()} : le {echeance:%d/%m à %H:%M}."
        )
        if envoye:  # on ne retient le palier que si le message est vraiment parti
            await appeler_backend("PATCH", f"{chemin}/{rappel['id']}", json={"palier_notifie": palier})


async def boucle_automatique() -> None:
    """Tourne en fond tant que le serveur est allumé : synchro puis notifications."""
    while True:
        agendas = await appeler_backend("GET", "/agendas")
        if isinstance(agendas, list):  # sinon : backend injoignable, on réessaiera au prochain tour
            for agenda in agendas:
                try:  # un agenda en erreur ne doit pas bloquer les autres étudiants
                    await synchroniser_agenda(agenda["etudiant_id"], agenda["url_ical"])
                    await notifier_rappels_proches(agenda["etudiant_id"], agenda["sujet_ntfy"])
                except Exception as erreur:
                    print(f"[boucle] étudiant {agenda.get('etudiant_id')} : {erreur!r}")  # visible dans le terminal
        await asyncio.sleep(AGENDA_SYNC_MINUTES * 60)  # attend sans bloquer les outils pendant ce temps


@asynccontextmanager
async def demarrage_et_arret(serveur: MCPServer):
    """« Lifespan » : ce qui est avant yield s'exécute au démarrage, ce qui est après à l'arrêt.

    Le serveur HTTP l'exécute une seule fois : la boucle n'est donc pas lancée en double.
    """
    tache = asyncio.create_task(boucle_automatique())  # lance la boucle en parallèle des outils
    try:
        yield {}  # le serveur tourne ici
    finally:
        tache.cancel()  # arrêt propre (Ctrl+C)


# --- Création du serveur -----------------------------------------------------

mcp = MCPServer(
    name="ai-student-assistant",  # nom affiché dans Open WebUI
    # Consignes générales envoyées au LLM en plus des descriptions d'outils.
    instructions=(
        "Outils de l'assistant d'étude : rappels, calendrier Moodle, exercices, difficultés et cours. "
        "Les dates s'écrivent toujours au format AAAA-MM-JJ HH:MM."
    ),
    lifespan=demarrage_et_arret,  # démarre la boucle des rappels automatiques
)


# --- Outils : rappels --------------------------------------------------------
# @mcp.tool() enregistre la fonction comme outil. Le LLM voit :
#   - le NOM de la fonction,
#   - la DOCSTRING (quand et comment utiliser l'outil),
#   - les TYPES des paramètres (str, int…).
# Le paramètre "ctx: Context" est rempli automatiquement et caché au LLM.


@mcp.tool()
async def creer_rappel(titre: str, date_heure: str, ctx: Context) -> str:
    """Crée un rappel pour l'étudiant (examen, devoir, révision…).

    Args:
        titre: ce dont il faut se souvenir, ex. "Examen de réseau".
        date_heure: date et heure au format AAAA-MM-JJ HH:MM, ex. "2026-10-25 14:00".
    """
    try:
        moment = datetime.fromisoformat(date_heure)  # vérifie que la date est lisible
    except ValueError:  # ex. le LLM a écrit "vendredi 14h"
        return "Date invalide : utilise le format AAAA-MM-JJ HH:MM."  # le LLM pourra réessayer
    maintenant = datetime.now()  # la vraie date, celle de la machine (le LLM, lui, ne la connaît pas)
    if moment < maintenant:  # date passée : le LLM a sans doute deviné une mauvaise année
        # On lui donne la date du jour dans le message pour qu'il recalcule et réessaie tout seul.
        return f"Cette date est déjà passée : nous sommes le {maintenant:%Y-%m-%d %H:%M}. Recalcule la date et réessaie."
    resultat = await appeler_backend(
        "POST",  # POST = créer une nouvelle ressource
        f"/etudiants/{etudiant_courant(ctx)}/rappels",  # les rappels de CET étudiant
        json={"titre": titre, "date_heure": moment.isoformat(" ", "minutes")},  # corps envoyé, date normalisée
    )
    if isinstance(resultat, str):  # appeler_backend renvoie une str seulement en cas d'erreur
        return resultat
    return f"Rappel n°{resultat['id']} créé : « {titre} » le {moment:%d/%m/%Y à %H:%M}."


@mcp.tool()
async def lister_rappels(ctx: Context) -> str:
    """Liste les rappels de l'étudiant, du plus proche au plus lointain."""
    rappels = await appeler_backend("GET", f"/etudiants/{etudiant_courant(ctx)}/rappels")  # GET = lire
    if isinstance(rappels, str):  # erreur
        return rappels
    if not rappels:  # liste vide
        return "Aucun rappel enregistré."
    rappels.sort(key=lambda r: r["date_heure"])  # format AAAA-MM-JJ : l'ordre alphabétique = l'ordre chronologique
    # Une ligne par rappel : court et facile à relire pour le LLM.
    # On indique l'origine : un rappel venu de Moodle reviendra s'il est supprimé ici mais pas dans Moodle.
    return "\n".join(
        f"n°{r['id']} – {r['date_heure']} – {r['titre']}" + (" (Moodle)" if r.get("uid_externe") else "")
        for r in rappels
    )


@mcp.tool()
async def supprimer_rappel(id_rappel: int, ctx: Context) -> str:
    """Supprime un rappel à partir de son numéro (visible avec lister_rappels)."""
    resultat = await appeler_backend("DELETE", f"/etudiants/{etudiant_courant(ctx)}/rappels/{id_rappel}")
    if isinstance(resultat, str):  # erreur (dont "Élément introuvable." si le numéro n'existe pas)
        return resultat
    return f"Rappel n°{id_rappel} supprimé."


# --- Outils : calendrier Moodle ----------------------------------------------


@mcp.tool()
async def connecter_moodle(url_ical: str, ctx: Context) -> str:
    """Connecte le calendrier Moodle de l'étudiant : ses échéances deviennent des rappels
    automatiquement, et il reçoit un message sur son téléphone avant chaque échéance.

    L'étudiant obtient l'URL sur https://moodle.ephec.be/calendar/export.php :
    « Tous les événements » + « Les 60 prochains jours » > bouton « URL du calendrier ».

    Args:
        url_ical: l'URL du calendrier, commence par https://moodle.ephec.be/calendar/export_execute.php
    """
    adresse = urlparse(url_ical)  # découpe l'URL : schéma, hôte, chemin…
    if adresse.scheme != "https" or adresse.hostname != AGENDA_HOTE_AUTORISE:  # protection SSRF (voir en haut)
        return "Adresse refusée : il faut l'« URL du calendrier » de Moodle EPHEC (https://moodle.ephec.be/...)."
    etudiant_id = etudiant_courant(ctx)
    chemin = f"/etudiants/{etudiant_id}/agenda"

    # Si l'étudiant avait déjà connecté un agenda, on garde son sujet ntfy :
    # il n'a pas à se réabonner dans l'application.
    ancien = await appeler_backend("GET", chemin)
    sujet_ntfy = ancien["sujet_ntfy"] if isinstance(ancien, dict) and ancien.get("sujet_ntfy") else (
        "aisa-" + secrets.token_urlsafe(12)  # ~16 caractères aléatoires : impossible à deviner
    )

    resultat = await appeler_backend("PUT", chemin, json={"url_ical": url_ical, "sujet_ntfy": sujet_ntfy})
    if isinstance(resultat, str):  # erreur
        return resultat
    bilan = await synchroniser_agenda(etudiant_id, url_ical)  # première synchro tout de suite, sans attendre la boucle
    return (
        f"Agenda connecté. {bilan}\n"
        f"Pour recevoir les rappels sur ton téléphone : installe l'application « ntfy » "
        f"et abonne-toi au sujet « {sujet_ntfy} » (garde-le secret). "
        f"Tu seras prévenu(e) {', '.join(f'{h} h' for h in RAPPEL_PALIERS_HEURES)} avant chaque échéance."
    )


@mcp.tool()
async def synchroniser_agenda_maintenant(ctx: Context) -> str:
    """Relit tout de suite le calendrier Moodle de l'étudiant (sinon c'est fait
    automatiquement toutes les quelques minutes). À utiliser s'il vient d'ajouter un événement."""
    etudiant_id = etudiant_courant(ctx)
    agenda = await appeler_backend("GET", f"/etudiants/{etudiant_id}/agenda")
    if not isinstance(agenda, dict) or not agenda.get("url_ical"):  # 404 ou erreur
        return "Aucun calendrier Moodle connecté. Utilise d'abord connecter_moodle."
    return await synchroniser_agenda(etudiant_id, agenda["url_ical"])


# --- Outils : tutorat --------------------------------------------------------


@mcp.tool()
async def proposer_exercice(matiere: str, ctx: Context, niveau: int | None = None) -> str:
    """Propose un exercice à l'étudiant dans une matière.

    À utiliser quand l'étudiant veut s'entraîner. En mode tutorat, ne donne
    pas la solution tout de suite : laisse-le d'abord essayer.

    Args:
        matiere: ex. "réseau", "base de données", "Python".
        niveau: difficulté de 1 (facile) à 3 (difficile). Si absent, le backend
            choisit selon les difficultés déjà enregistrées de l'étudiant.
    """
    parametres = {"matiere": matiere}  # paramètres ajoutés à l'URL : ?matiere=...
    if niveau is not None:  # on n'envoie le niveau que s'il a été donné
        parametres["niveau"] = niveau
    exercices = await appeler_backend(
        "GET", f"/etudiants/{etudiant_courant(ctx)}/exercices", params=parametres
    )
    if isinstance(exercices, str):  # erreur
        return exercices
    if not exercices:  # aucun exercice dans cette matière
        return f"Aucun exercice disponible en {matiere}."
    exercice = exercices[0]  # on en propose un seul à la fois, c'est plus pédagogique
    return f"Exercice n°{exercice['id']} ({exercice['matiere']}, niveau {exercice['niveau']}) :\n{exercice['enonce']}"


@mcp.tool()
async def enregistrer_difficulte(matiere: str, notion: str, ctx: Context) -> str:
    """Mémorise une notion que l'étudiant a du mal à comprendre.

    À utiliser quand l'étudiant dit ne pas comprendre quelque chose ou se
    trompe plusieurs fois sur le même sujet.

    Args:
        matiere: ex. "réseau".
        notion: la notion précise, ex. "masques de sous-réseau".
    """
    resultat = await appeler_backend(
        "POST", f"/etudiants/{etudiant_courant(ctx)}/difficultes", json={"matiere": matiere, "notion": notion}
    )
    if isinstance(resultat, str):  # erreur
        return resultat
    return f"Difficulté enregistrée : {notion} ({matiere})."


@mcp.tool()
async def lister_difficultes(ctx: Context) -> str:
    """Liste les notions où l'étudiant a des difficultés, pour orienter les révisions."""
    difficultes = await appeler_backend("GET", f"/etudiants/{etudiant_courant(ctx)}/difficultes")
    if isinstance(difficultes, str):  # erreur
        return difficultes
    if not difficultes:  # liste vide
        return "Aucune difficulté enregistrée."
    return "\n".join(f"- {d['matiere']} : {d['notion']}" for d in difficultes)  # une ligne par difficulté


# --- Outils : cours ----------------------------------------------------------


@mcp.tool()
async def chercher_cours(recherche: str, matiere: str | None = None) -> str:
    """Cherche dans les cours de l'étudiant (PDF importés) par mot-clé.

    Args:
        recherche: mots-clés, ex. "modèle OSI".
        matiere: pour limiter la recherche à une matière (facultatif).
    """
    # Pas de ctx ici : on suppose que les cours sont communs à tous les étudiants.
    parametres = {"recherche": recherche}  # ?recherche=...
    if matiere:  # on ajoute le filtre seulement s'il est donné
        parametres["matiere"] = matiere
    cours = await appeler_backend("GET", "/cours", params=parametres)
    if isinstance(cours, str):  # erreur
        return cours
    if not cours:  # rien trouvé
        return f"Aucun cours trouvé pour « {recherche} »."
    return "\n".join(f"- [{c['matiere']}] {c['titre']} : {c['resume']}" for c in cours[:5])  # 5 max pour rester court


# --- Lancement ---------------------------------------------------------------

if __name__ == "__main__":  # vrai seulement si on lance "python server.py" (pas si on importe le fichier)
    # "streamable-http" : le serveur est accessible par HTTP sur /mcp,
    # pour pouvoir tourner sur une autre machine que l'orchestrateur.
    # host="0.0.0.0" : écoute sur toutes les interfaces (Docker, Tailscale…).
    mcp.run(transport="streamable-http", host="0.0.0.0", port=MCP_PORT)
