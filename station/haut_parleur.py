"""
Haut-parleur : faire lire un texte à voix haute.

Chemin du son :  texte -> Piper (voix humaine) -> fichier WAV -> pw-play -> PipeWire -> haut-parleur USB
Si Piper n'est pas installé, on revient à l'ancienne voix (espeak-ng).

Piper tourne sur le Pi, sans Internet. Il est installé avec pip, sans venv
(pip install --break-system-packages piper-tts), et la voix est un fichier .onnx dans ~/piper-voix.
"""
import importlib.util
import os
import re
import subprocess
import sys

FICHIER_VOIX = "/tmp/reponse.wav"
VITESSE = "150"        # espeak-ng seulement : mots par minute

VOIX = os.path.expanduser("~/piper-voix/fr_FR-siwis-medium.onnx")


def nettoyer(texte):
    """Retire ce qui se lit mal à voix haute : le markdown (* # ` _ $) et les sauts de ligne."""
    texte = re.sub(r"[*#`_$|>]", "", texte)
    texte = re.sub(r"\s+", " ", texte)
    return texte.strip()


def fabriquer_wav(texte):
    """Transforme le texte en fichier WAV. Piper si possible, sinon espeak-ng."""
    if importlib.util.find_spec("piper") and os.path.exists(VOIX):
        resultat = subprocess.run(
            [sys.executable, "-m", "piper", "-m", VOIX, "-f", FICHIER_VOIX, "--", texte],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if resultat.returncode == 0:
            return
    # roue de secours : l'ancienne voix
    subprocess.run(["espeak-ng", "-v", "fr", "-s", VITESSE, "-w", FICHIER_VOIX, texte])


def parler(texte):
    """Lit le texte sur le haut-parleur. Attend la fin de la lecture avant de rendre la main."""
    texte = nettoyer(texte)
    if not texte:
        return
    # 1. le texte devient un fichier WAV
    fabriquer_wav(texte)
    # 2. ajouter 0,4 s de silence au début : le haut-parleur se réveille sans couper la phrase
    #    (si sox n'est pas installé, on joue le fichier tel quel)
    try:
        subprocess.run(["sox", FICHIER_VOIX, "/tmp/reponse_pad.wav", "pad", "0.4", "0"],
                       check=True, stderr=subprocess.DEVNULL)
        a_jouer = "/tmp/reponse_pad.wav"
    except (FileNotFoundError, subprocess.CalledProcessError):
        a_jouer = FICHIER_VOIX
    # 3. jouer le fichier sur la sortie par défaut (le haut-parleur USB)
    subprocess.run(["pw-play", a_jouer])


if __name__ == "__main__":
    parler("Bonjour, je suis la station. La diode Zener fonctionne en polarisation inverse.")
