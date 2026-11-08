"""
Démo de la station : 2 boutons, LED RGB, écran LCD 20x4, micro, enceinte Bluetooth.

  Bouton MARCHE (GPIO 13) : allume / éteint la station
  Bouton PARLER (GPIO 11) : 1er appui = le micro écoute, 2e appui = on envoie la question

  Couleurs de la LED :
    ROUGE  = station éteinte (on ne peut rien faire)
    VERT   = station allumée, prête
    BLEU   = le micro enregistre
    JAUNE  = la station réfléchit (transcription + tuteur)
    VIOLET = un problème (réseau, serveur...)

Lancement (depuis le dossier station) :  python3 demo.py
"""
import queue
import threading
import time

from gpiozero import Button, RGBLED

import lcd
from haut_parleur import parler
from micro import ouvrir_micro, fermer_micro, amplifier
from tuteur import transcrire, talk_to_tuteur, nouvelle_conversation

# --- Réglages -----------------------------------------------------------------
GPIO_PARLER = 11          # GPIO 11 = broche physique 23
GPIO_MARCHE = 13          # GPIO 13 = broche physique 33
GPIO_LED = (22, 23, 24)   # broches 15, 16, 18 (rouge, vert, bleu)
FICHIER = "/tmp/question.wav"
DUREE_MAX = 30            # secondes : le micro s'arrête tout seul après ce temps
PAUSE_LIGNE = 1.5         # secondes entre deux lignes quand la réponse défile

ROUGE = (1, 0, 0)
VERT = (0, 1, 0)
BLEU = (0, 0, 1)
JAUNE = (1, 0.4, 0)
VIOLET = (1, 0, 1)

# --- Matériel -----------------------------------------------------------------
led = RGBLED(*GPIO_LED)                      # ajoute active_high=False si ta LED est à anode commune
bouton_parler = Button(GPIO_PARLER, bounce_time=0.05)
bouton_marche = Button(GPIO_MARCHE, bounce_time=0.05)

# Les boutons ne font rien eux-mêmes : ils déposent juste un « message » dans une file d'attente.
# C'est la boucle principale qui lit ces messages et agit, une chose à la fois.
evenements = queue.Queue()
bouton_parler.when_pressed = lambda: evenements.put("parler")
bouton_marche.when_pressed = lambda: evenements.put("marche")

# --- État de la station ----------------------------------------------------------
etat = {
    "allumee": False,     # la station est-elle allumée ?
    "micro": None,        # le processus arecord quand le micro enregistre, sinon None
    "debut": 0,           # l'heure à laquelle l'enregistrement a commencé
}


# --- Les écrans de la station ------------------------------------------------------
def ecran_pret():
    led.color = VERT
    lcd.afficher("Station prete !", "", "Appuie sur PARLER", "pour poser ta question")


def allumer():
    etat["allumee"] = True
    nouvelle_conversation()
    ecran_pret()
    parler("La station est prête.")
    vider_evenements()


def eteindre():
    if etat["micro"] is not None:        # si on éteint pendant l'écoute : on coupe le micro
        fermer_micro(etat["micro"])
        etat["micro"] = None
    etat["allumee"] = False
    led.color = ROUGE
    lcd.afficher("Station eteinte", "", "Appuie sur MARCHE", "pour l'allumer")
    parler("À bientôt.")
    vider_evenements()


def commencer_ecoute():
    etat["micro"] = ouvrir_micro(FICHIER)
    etat["debut"] = time.time()
    led.color = BLEU
    lcd.afficher("Je t'ecoute...", "Parle maintenant", "", "PARLER = j'ai fini")


def finir_ecoute():
    fermer_micro(etat["micro"])
    etat["micro"] = None
    traiter_question()
    vider_evenements()   # on ignore les appuis faits pendant que la station réfléchissait


def probleme(message):
    """Affiche un problème en violet, le dit, puis revient à l'écran « prêt »."""
    print("Problème :", message)
    led.color = VIOLET
    lcd.afficher("Oups...", message[:20], "", "Reessaie dans un instant")
    parler("Désolé, il y a un problème. Réessaie dans un instant.")
    time.sleep(2)
    ecran_pret()


# --- Le cœur : question -> réponse ------------------------------------------------------
def traiter_question():
    led.color = JAUNE
    lcd.afficher("Je reflechis...", "", "Transcription", "de ta question")

    question, code = transcrire(amplifier(FICHIER))
    if code != 200:
        probleme("Transcription")
        return
    if not question.strip():
        lcd.afficher("Je n'ai rien entendu", "", "Reappuie sur PARLER", "et parle plus fort")
        parler("Je n'ai rien entendu. Recommence.")
        ecran_pret()
        return
    print("Question :", question)

    lignes = lcd.decouper(question)
    lcd.afficher("Ta question :", *lignes[:3])
    reponse, code = talk_to_tuteur(question)
    if code != 200:
        probleme("Tuteur injoignable")
        return
    print("Tuteur :", reponse)
    repondre(reponse)
    ecran_pret()


def repondre(texte):
    """Lit la réponse sur l'enceinte ET la fait défiler sur l'écran, en même temps."""
    led.color = VERT
    voix = threading.Thread(target=parler, args=(texte,))   # la voix tourne « à côté »
    voix.start()

    lignes = lcd.decouper(texte)
    premiere = 0                     # numéro de la ligne affichée tout en haut
    derniere_possible = max(0, len(lignes) - lcd.LIGNES)
    # on fait défiler tant que la voix parle OU qu'il reste du texte à montrer
    while voix.is_alive() or premiere < derniere_possible:
        lcd.afficher(*lignes[premiere:premiere + lcd.LIGNES])
        time.sleep(PAUSE_LIGNE)
        if premiere < derniere_possible:
            premiere += 1
    voix.join()
    time.sleep(3)                    # laisser lire la fin
    vider_evenements()


def vider_evenements():
    while not evenements.empty():
        evenements.get_nowait()


# --- La boucle principale ---------------------------------------------------------------
def main():
    lcd.initialiser()
    lcd.afficher("Station tuteur", "Demarrage...")
    allumer()

    while True:
        try:
            evenement = evenements.get(timeout=0.5)   # attend un appui (max 0,5 s)
        except queue.Empty:
            evenement = None

        # sécurité : on n'écoute pas indéfiniment
        if etat["micro"] is not None and time.time() - etat["debut"] > DUREE_MAX:
            evenement = "parler"

        if evenement == "marche":
            if etat["allumee"]:
                eteindre()
            else:
                allumer()

        elif evenement == "parler" and etat["allumee"]:
            if etat["micro"] is None:
                commencer_ecoute()
            else:
                finir_ecoute()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nArrêt de la démo.")
    finally:
        if etat["micro"] is not None:
            fermer_micro(etat["micro"])
        led.off()
        lcd.afficher("Station arretee")
