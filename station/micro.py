import signal
import subprocess

MICRO = "plughw:CARD=sndrpigooglevoi,DEV=0"


def ouvrir_micro(fichier="/tmp/question.wav"):
    """Démarre l'enregistrement et renvoie le processus arecord (sans attendre)."""
    commande = ["arecord", "-D", MICRO, "-f", "S16_LE", "-r", "16000", "-c", "1", "-q", fichier]
    # stderr=DEVNULL : cache le message « Interrupted system call » qu'arecord
    # affiche quand on l'arrête avec SIGINT (c'est normal, ce n'est pas une erreur)
    return subprocess.Popen(commande, stderr=subprocess.DEVNULL)


def fermer_micro(processus):
    """Arrête proprement l'enregistrement."""
    processus.send_signal(signal.SIGINT)   # comme un Ctrl+C : arecord termine bien le fichier
    processus.wait()                        # on attend qu'il ait vraiment fini


def amplifier(fichier="/tmp/question.wav"):
    """Monte le volume de l'enregistrement au maximum sans saturer (l'INMP441 enregistre bas).
    Renvoie le fichier amplifié, ou le fichier d'origine si sox n'est pas installé."""
    sortie = fichier.replace(".wav", "_fort.wav")
    try:
        subprocess.run(["sox", fichier, sortie, "gain", "-n", "-1"],
                       check=True, stderr=subprocess.DEVNULL)
        return sortie
    except (FileNotFoundError, subprocess.CalledProcessError):
        return fichier                      # pas de sox : on envoie le fichier tel quel


if __name__ == "__main__":
    input("Appuie sur Entrée pour PARLER...")
    p = ouvrir_micro()
    input("Parle, puis appuie sur Entrée pour ARRÊTER...")
    fermer_micro(p)
    print("Enregistré dans /tmp/question.wav")









