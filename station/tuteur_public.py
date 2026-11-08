"""
Tuteur de secours : une API PUBLIQUE à la place de notre agent Open WebUI.

Sert à tester la station quand on n'a pas accès à Open WebUI.
Par défaut : l'API de Mistral (offre gratuite « Experiment »), le même modèle de base que
notre agent (Mistral Small). Mais n'importe quelle API compatible OpenAI marche :
il suffit de changer les 3 réglages dans ~/station/station.env :

    PUBLIC_URL=https://api.mistral.ai/v1
    PUBLIC_CLE=ta-cle-mistral
    PUBLIC_MODELE=mistral-small-latest

Différence avec notre agent : cette IA n'a PAS le cours d'Électronique 1 (pas de Knowledge,
pas de MCP). Elle répond avec ses connaissances générales.

Les fonctions ont EXACTEMENT les mêmes noms que dans tuteur.py : on peut passer de l'un à
l'autre en changeant une seule ligne d'import.
"""
from dotenv import load_dotenv
import os
import requests

load_dotenv(os.path.expanduser("~/station/station.env"))

URL = os.environ.get("PUBLIC_URL", "https://api.mistral.ai/v1")
CLE = os.environ.get("PUBLIC_CLE", "")
MODELE = os.environ.get("PUBLIC_MODELE", "mistral-small-latest")

CONSIGNE = ("Tu es un tuteur du cours Électronique 1 (électronique analogique) pour des étudiants "
            "de bachelier. Tes réponses sont lues à voix haute par une petite station et affichées "
            "sur un écran de 4 lignes. Réponds en français, en 2 à 4 phrases courtes, sans markdown, "
            "sans listes, sans formules ; écris les unités en toutes lettres (volts, ohms...).")

historique = [{"role": "system", "content": CONSIGNE}]


def nouvelle_conversation():
    """Efface la mémoire (on garde seulement la consigne)."""
    del historique[1:]


def talk_to_tuteur(question):
    """Envoie la question à l'API publique et renvoie (texte, code_http)."""
    if not CLE:
        return "Pas de cle PUBLIC_CLE dans station.env", 0

    historique.append({"role": "user", "content": question})
    donnees = {"model": MODELE, "messages": historique}
    entetes = {"Authorization": "Bearer " + CLE}

    try:
        reponse = requests.post(URL + "/chat/completions",
                                json=donnees, headers=entetes, timeout=60)
    except requests.exceptions.RequestException as erreur:
        historique.pop()
        return "Serveur injoignable : " + str(erreur), 0

    if reponse.status_code == 200:
        texte = reponse.json()["choices"][0]["message"]["content"]
        historique.append({"role": "assistant", "content": texte})
        return texte, 200
    historique.pop()
    return reponse.text, reponse.status_code


if __name__ == "__main__":
    texte, code = talk_to_tuteur("C'est quoi une diode Zener ?")
    print("Code :", code)
    print("Réponse :", texte)
