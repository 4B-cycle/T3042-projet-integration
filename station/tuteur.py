from dotenv import load_dotenv
import os
import re
import requests

load_dotenv(os.path.expanduser("~/station/station.env"))

URL = os.environ["OPENWEBUI_URL"]
CLE = os.environ["OPENWEBUI_CLE"]
MODELE = os.environ["MODELE"]

# Consigne pour la station : les réponses sont LUES à voix haute et affichées sur un petit écran.
CONSIGNE = ("Tes réponses sont lues à voix haute par une petite station et affichées sur un écran "
            "de 4 lignes. Réponds en 2 à 4 phrases courtes, sans markdown, sans listes, sans "
            "formules ; écris les unités en toutes lettres (volts, ohms...). "
            "La question vient d'une transcription vocale automatique : elle peut contenir des mots "
            "mal reconnus. Devine le terme d'électronique voulu (par exemple « zénaire » = Zener, "
            "« loi d'homme » = loi d'Ohm) et réponds à la vraie question.")

# --- Corriger les mots d'électronique que la transcription reconnaît mal ----------------
# À gauche : ce que la transcription écrit (expression régulière, majuscules ignorées).
# À droite : le bon mot. Ajoute une ligne chaque fois que tu vois une nouvelle erreur.
CORRECTIONS = [
    (r"\bz[ée]+ ?n[aeè]+i?re?s?\b|\bz[ée]n[ée]r\b|\bzainer\b|\bz ?n ?r\b", "Zener"),
    (r"\bd'homme\b", "d'Ohm"),
    (r"\bk[iy]r?ch? ?h?off?\b|\bkirsch ?of\b", "Kirchhoff"),
    (r"\bth[ée] ?venin\b|\bt[ée]venin\b", "Thévenin"),
    (r"\bmo[sz]+e? ?f[eèê]te?\b", "MOSFET"),
    (r"\bjonction (pain|p n|péenne|pé enne)\b", "jonction PN"),
]

# Liste des mots du cours, envoyée avec l'audio : certains serveurs de transcription s'en servent
# pour mieux reconnaître ces mots (sinon elle est simplement ignorée).
VOCABULAIRE = ("Électronique : diode Zener, loi d'Ohm, lois de Kirchhoff, Thévenin, Norton, "
               "transistor bipolaire, MOSFET, jonction PN, redresseur, condensateur, résistance.")


def corriger(texte):
    """Remplace les mots mal reconnus par le bon terme d'électronique."""
    for erreur, bon in CORRECTIONS:
        texte = re.sub(erreur, bon, texte, flags=re.IGNORECASE)
    return texte

# Mémoire de la conversation : elle est HORS de la fonction pour survivre entre deux questions.
historique = [{"role": "system", "content": CONSIGNE}]


def nouvelle_conversation():
    """Efface la mémoire (on garde seulement la consigne). Appelée quand on éteint la station."""
    del historique[1:]


def talk_to_tuteur(question):
    """Envoie la question au tuteur et renvoie (texte, code_http)."""
    historique.append({"role": "user", "content": question})
    donnees = {"model": MODELE, "messages": historique}
    entetes = {"Authorization": "Bearer " + CLE}

    try:
        reponse = requests.post(URL + "/api/chat/completions",
                                json=donnees, headers=entetes, timeout=180)
    except requests.exceptions.RequestException as erreur:
        historique.pop()                     # la question n'a pas eu de réponse : on l'oublie
        return "Serveur injoignable : " + str(erreur), 0

    if reponse.status_code == 200:
        texte = reponse.json()["choices"][0]["message"]["content"]
        historique.append({"role": "assistant", "content": texte})
        return texte, 200
    historique.pop()
    return reponse.text, reponse.status_code


def transcrire(chemin_wav):
    """Envoie un fichier WAV à Open WebUI et renvoie (texte, code_http)."""
    entetes = {"Authorization": "Bearer " + CLE}
    try:
        with open(chemin_wav, "rb") as f:
            fichiers = {"file": ("question.wav", f, "audio/wav")}
            reponse = requests.post(URL + "/api/v1/audio/transcriptions",
                                    headers=entetes, files=fichiers,
                                    data={"language": "fr",     # on parle français
                                          "prompt": VOCABULAIRE},  # les mots du cours
                                    timeout=120)
    except requests.exceptions.RequestException as erreur:
        return "Serveur injoignable : " + str(erreur), 0

    if reponse.status_code == 200:
        return corriger(reponse.json()["text"]), 200
    return reponse.text, reponse.status_code


# --- 4. Tests : seulement si on lance CE fichier directement ----------------
if __name__ == "__main__":
    texte, code = transcrire("/tmp/question.wav")
    print(f"Transcription ({code}) : {texte}")

    reponse, code = talk_to_tuteur("Explique-moi la diode Zener en deux phrases.")
    print(f"Code: {code}\nRéponse: {reponse}")