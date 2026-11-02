"""
Station - version de base.

Déroulement d'un tour :
  1. l'utilisateur appuie sur Entrée, parle, puis appuie de nouveau sur Entrée  (micro.py)
  2. l'enregistrement est envoyé à Open WebUI qui le transforme en texte         (tuteur.py)
  3. le texte est envoyé au tuteur, qui répond                                   (tuteur.py)
  4. la réponse s'affiche

Plus tard : bouton à la place d'Entrée, LED, voix sur l'enceinte, écran LCD.

Lancement (depuis le dossier station) :  python3 station.py
"""
from micro import ouvrir_micro, fermer_micro
from tuteur import transcrire, talk_to_tuteur

FICHIER = "/tmp/question.wav"


def ecouter():
    """Enregistre l'utilisateur entre deux appuis sur Entrée et renvoie le fichier WAV."""
    input("\nAppuie sur Entrée pour parler...")
    processus = ouvrir_micro(FICHIER)
    input("J'écoute... Appuie sur Entrée quand tu as fini.")
    fermer_micro(processus)
    return FICHIER


def un_tour():
    """Un échange complet : écouter -> transcrire -> demander au tuteur -> afficher."""
    fichier = ecouter()

    print("Je transcris ta question...")
    question, code = transcrire(fichier)
    if code != 200:
        print("Problème de transcription (", code, ") :", question)
        return
    if not question.strip():
        print("Je n'ai rien entendu, recommence.")
        return
    print("Tu as dit :", question)

    print("Le tuteur réfléchit...")
    reponse, code = talk_to_tuteur(question)
    if code != 200:
        print("Problème avec le tuteur (", code, ") :", reponse)
        return
    print("\nTuteur :", reponse)


def main():
    print("Station prête. Ctrl+C pour quitter.")
    while True:
        un_tour()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAu revoir !")
