"""
Haut-parleur : faire lire un texte à voix haute.

Chemin du son :  texte -> espeak-ng -> fichier WAV -> pw-play -> PipeWire -> enceinte Bluetooth
(Plus tard, avec l'ampli I2S : remplacer pw-play par  aplay -D speaker)
"""
import re
import subprocess

FICHIER_VOIX = "/tmp/reponse.wav"
VITESSE = "150"        # mots par minute : plus bas = plus lent


def nettoyer(texte):
    """Retire ce qui se lit mal à voix haute : le markdown (* # ` _ $) et les sauts de ligne."""
    texte = re.sub(r"[*#`_$|>]", "", texte)
    texte = re.sub(r"\s+", " ", texte)
    return texte.strip()


def parler(texte):
    """Lit le texte sur l'enceinte. Attend la fin de la lecture avant de rendre la main."""
    texte = nettoyer(texte)
    if not texte:
        return
    # 1. le texte devient un fichier WAV
    subprocess.run(["espeak-ng", "-v", "fr", "-s", VITESSE, "-w", FICHIER_VOIX, texte])
    # 2. ajouter 0,4 s de silence au début : l'enceinte Bluetooth se réveille sans couper la phrase
    #    (si sox n'est pas installé, on joue le fichier tel quel)
    try:
        subprocess.run(["sox", FICHIER_VOIX, "/tmp/reponse_pad.wav", "pad", "0.4", "0"],
                       check=True, stderr=subprocess.DEVNULL)
        a_jouer = "/tmp/reponse_pad.wav"
    except (FileNotFoundError, subprocess.CalledProcessError):
        a_jouer = FICHIER_VOIX
    # 3. jouer le fichier sur la sortie par défaut (l'enceinte Bluetooth)
    subprocess.run(["pw-play", a_jouer])


if __name__ == "__main__":
    parler("Bonjour, je suis la station. La diode **Zener** fonctionne en polarisation inverse.")
