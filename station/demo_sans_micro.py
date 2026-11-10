"""
Démo de la station SANS MICRO : 2 boutons, LED RGB, écran LCD 20x4, enceinte Bluetooth.

Même démo que demo.py, mais la question n'est pas dite au micro : elle est tirée au hasard
dans le fichier questions.json, puis envoyée en TEXTE au tuteur.

  Bouton MARCHE (GPIO 27) : allume / éteint la station
  Bouton PARLER (GPIO 17) : 1er appui = « le micro écoute » (simulé)
                            2e appui = une question est tirée au hasard et envoyée au tuteur

  Couleurs de la LED :
    ROUGE            = station éteinte (on ne peut rien faire)
    VERT             = station allumée, prête
    BLEU             = le micro est ouvert (un bip au début, deux bips à la fin)
    VIOLET           = la station réfléchit (le tuteur prépare sa réponse)
    ORANGE           = le haut-parleur lit la réponse
    ROUGE CLIGNOTANT = un problème (réseau, serveur...)

Lancement (depuis le dossier station) :  python3 demo_sans_micro.py
"""
import json
import os
import queue
import random
import threading
import time

from gpiozero import Button, Buzzer, RGBLED

import lcd
from haut_parleur import parler
from tuteur import talk_to_tuteur, nouvelle_conversation

# --- Réglages -----------------------------------------------------------------
GPIO_PARLER = 17          # broche physique 11
GPIO_MARCHE = 27          # broche physique 13
GPIO_LED = (22, 23, 24)   # broches 15, 16, 18 (rouge, vert, bleu)
GPIO_BUZZER = 5           # broche 29
FICHIER_QUESTIONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")
PAUSE_LIGNE = 1.5         # secondes entre deux lignes quand la réponse défile

ROUGE = (1, 0, 0)
VERT = (0, 1, 0)
BLEU = (0, 0, 1)
VIOLET = (0.6, 0, 1)
ORANGE = (1, 0.25, 0)

# --- Matériel -----------------------------------------------------------------
led = RGBLED(*GPIO_LED)                      # ajoute active_high=False si ta LED est à anode commune
buzzer = Buzzer(GPIO_BUZZER)
bouton_parler = Button(GPIO_PARLER, bounce_time=0.05)
bouton_marche = Button(GPIO_MARCHE, bounce_time=0.05)

# Les boutons ne font rien eux-mêmes : ils déposent juste un « message » dans une file d'attente.
# C'est la boucle principale qui lit ces messages et agit, une chose à la fois.
evenements = queue.Queue()
bouton_parler.when_pressed = lambda: evenements.put("parler")
bouton_marche.when_pressed = lambda: evenements.put("marche")

# --- Les questions ------------------------------------------------------------------
# Le fichier JSON contient : {"questions": ["question 1", "question 2", ...]}
with open(FICHIER_QUESTIONS, encoding="utf-8") as f:
    QUESTIONS = json.load(f)["questions"]

# --- État de la station ----------------------------------------------------------
etat = {
    "allumee": False,     # la station est-elle allumée ?
    "ecoute": False,      # le micro « écoute »-t-il ? (simulé)
    "derniere": None,     # la dernière question posée (pour ne pas poser deux fois la même de suite)
}


# --- Les écrans de la station ------------------------------------------------------
def bip(nombre=1):
    """Fait biper le buzzer : 1 bip = le micro s'ouvre, 2 bips = le micro se ferme."""
    buzzer.beep(on_time=0.12, off_time=0.1, n=nombre, background=False)


def ecran_pret():
    led.color = VERT
    lcd.afficher("Station prete !", "", "Appuie sur PARLER", "pour une question")


def allumer():
    etat["allumee"] = True
    nouvelle_conversation()
    ecran_pret()
    parler("La station est prête.")
    vider_evenements()


def eteindre():
    etat["allumee"] = False
    etat["ecoute"] = False
    led.color = ROUGE
    lcd.afficher("Station eteinte", "", "Appuie sur MARCHE", "pour l'allumer")
    parler("À bientôt.")
    vider_evenements()


def choisir_question():
    """Tire une question au hasard, différente de la précédente."""
    possibles = [q for q in QUESTIONS if q != etat["derniere"]] or QUESTIONS
    question = random.choice(possibles)
    etat["derniere"] = question
    return question


def commencer_ecoute():
    """1er appui : comme la vraie démo, sauf que le micro n'est pas ouvert."""
    etat["ecoute"] = True
    led.color = BLEU
    lcd.afficher("Je t'ecoute...", "Parle maintenant", "", "PARLER = j'ai fini")
    bip(1)                               # un bip : le micro est ouvert
    vider_evenements()


def finir_ecoute():
    """2e appui : à la place de ce que l'étudiant a dit, on tire une question au hasard."""
    etat["ecoute"] = False
    bip(2)                               # deux bips : le micro est fermé
    question = choisir_question()
    print("Question :", question)
    lcd.afficher("Tu as dit :", *lcd.decouper(question)[:3])
    time.sleep(2)                        # laisser le temps de lire la question
    traiter_question(question)
    vider_evenements()   # on ignore les appuis faits pendant que la station réfléchissait


def probleme(message):
    """Affiche un problème (LED rouge clignotante), le dit, puis revient à l'écran « prêt »."""
    print("Problème :", message)
    led.blink(on_time=0.3, off_time=0.3, on_color=ROUGE, background=True)   # rouge clignotant
    lcd.afficher("Oups...", message[:20], "", "Reessaie dans un instant")
    parler("Désolé, il y a un problème. Réessaie dans un instant.")
    time.sleep(2)
    ecran_pret()


# --- Le cœur : question -> réponse ------------------------------------------------------
def traiter_question(question):
    led.color = VIOLET
    lcd.afficher("Je reflechis...", *lcd.decouper(question)[:3])
    reponse, code = talk_to_tuteur(question)
    if code != 200:
        print("Détail de l'erreur (code", code, ") :", reponse)
        probleme("Tuteur injoignable")
        return
    print("Tuteur :", reponse)
    repondre(reponse)
    ecran_pret()


def repondre(texte):
    """Lit la réponse sur l'enceinte ET la fait défiler sur l'écran, en même temps."""
    led.color = ORANGE
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

        if evenement == "marche":
            if etat["allumee"]:
                eteindre()
            else:
                allumer()

        elif evenement == "parler" and etat["allumee"]:
            if not etat["ecoute"]:
                commencer_ecoute()
            else:
                finir_ecoute()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nArrêt de la démo.")
    finally:
        led.off()
        buzzer.off()
        lcd.afficher("Station arretee")
