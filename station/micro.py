import signal
import subprocess

MICRO = "plughw:CARD=sndrpigooglevoi,DEV=0"


def ouvrir_micro(fichier="/tmp/question.wav"):
    """Démarre l'enregistrement et renvoie le processus arecord (sans attendre)."""
    commande = ["arecord", "-D", MICRO, "-f", "S16_LE", "-r", "16000", "-c", "1", "-q", fichier]
    return subprocess.Popen(commande)


def fermer_micro(processus):
    """Arrête proprement l'enregistrement."""
    processus.send_signal(signal.SIGINT)   # comme un Ctrl+C : arecord termine bien le fichier
    processus.wait()                        # on attend qu'il ait vraiment fini


if __name__ == "__main__":
    input("Appuie sur Entrée pour PARLER...")
    p = ouvrir_micro()
    input("Parle, puis appuie sur Entrée pour ARRÊTER...")
    fermer_micro(p)
    print("Enregistré dans /tmp/question.wav")









