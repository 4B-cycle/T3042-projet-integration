from dotenv import load_dotenv
import os
import requests

load_dotenv(os.path.expanduser("~/station/station.env"))

URL = os.environ["OPENWEBUI_URL"]
CLE = os.environ["OPENWEBUI_CLE"]
MODELE = os.environ["MODELE"]


def talk_to_tuteur(question):
    """Envoie la question au tuteur et renvoie (texte, code_http)."""
    donnees = {
        "model": MODELE,
        "messages": [
            {"role": "user", "content": question}
        ]
    }
    entetes = {"Authorization": "Bearer " + CLE}

    try:
        reponse = requests.post(URL + "/api/chat/completions",
                                json=donnees, headers=entetes, timeout=180)
    except requests.exceptions.RequestException as erreur:
        return "Serveur injoignable : " + str(erreur), 0

    if reponse.status_code == 200:
        return reponse.json()["choices"][0]["message"]["content"], 200
    return reponse.text, reponse.status_code


def transcrire(chemin_wav):
    """Envoie un fichier WAV à Open WebUI et renvoie (texte, code_http)."""
    entetes = {"Authorization": "Bearer " + CLE}
    try:
        with open(chemin_wav, "rb") as f:
            fichiers = {"file": ("question.wav", f, "audio/wav")}
            reponse = requests.post(URL + "/api/v1/audio/transcriptions",
                                    headers=entetes, files=fichiers,
                                    data={"language": "fr"},   # on parle français
                                    timeout=120)
    except requests.exceptions.RequestException as erreur:
        return "Serveur injoignable : " + str(erreur), 0

    if reponse.status_code == 200:
        return reponse.json()["text"], 200
    return reponse.text, reponse.status_code


# --- 4. Tests : seulement si on lance CE fichier directement ----------------
if __name__ == "__main__":
    texte, code = transcrire("/tmp/question.wav")
    print(f"Transcription ({code}) : {texte}")

    reponse, code = talk_to_tuteur("Explique-moi la diode Zener en deux phrases.")
    print(f"Code: {code}\nRéponse: {reponse}")