"""
Démo de la station SANS MICRO : 2 boutons, LED RGB, écran LCD 20x4, enceinte Bluetooth.

Même démo que demo.py, mais la question n'est pas dite au micro : elle est tirée au hasard
dans le fichier questions.json, puis envoyée en TEXTE au tuteur.

  Bouton MARCHE (GPIO 27) : allume / éteint la station
  Bouton PARLER (GPIO 17) : tire une question au hasard et l'envoie au tuteur

  Couleurs de la LED :
    ROUGE  = station éteinte (on ne peut rien faire)
    VERT   = station allumée, prête
    BLEU   = une question est choisie (et lue à voix haute)
    JAUNE  = la station réfléchit (le tuteur prépare sa réponse)
    VIOLET = un problème (réseau, serveur...)

Lancement (depuis le dossier station) :  python3 demo_sans_micro.py
"""
import json
import os
import queue
import random
import threading
import time

from gpiozero import Button, RGBLED

import lcd
from haut_parleur import parler
from tuteur import talk_to_tuteur, nouvelle_conversation

# --- Réglages -----------------------------------------------------------------
GPIO_PARLER = 17          # broche 11
GPIO_MARCHE = 27          # broche 13
GPIO_LED = (22, 23, 24)   # broches 15, 16, 18 (rouge, vert, bleu)
FICHIER_QUESTIONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")
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

# --- Les questions ------------------------------------------------------------------
# Le fichier JSON contient : {"questions": ["question 1", "question 2", ...]}
with open(FICHIER_QUESTIONS, encoding="utf-8") as f:
    QUESTIONS = json.load(f)["questions"]

# --- État de la station ----------------------------------------------------------
etat = {
    "allumee": False,     # la station est-elle allumée ?
    "derniere": None,     # la dernière question posée (pour ne pas poser deux fois la même de suite)
}


# --- Les écrans de la station ------------------------------------------------------
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


def poser_question():
    """Remplace l'écoute au micro : on choisit une question, on l'affiche et on la lit."""
    question = choisir_question()
    led.color = BLEU
    lignes = lcd.decouper(question)
    lcd.afficher("Question :", *lignes[:3])
    print("Question :", question)
    parler(question)                     # comme si l'étudiant la disait à voix haute
    traiter_question(question)
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
def traiter_question(question):
    led.color = JAUNE
    lcd.afficher("Je reflechis...", *lcd.decouper(question)[:3])
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

        if evenement == "marche":
            if etat["allumee"]:
                eteindre()
            else:
                allumer()

        elif evenement == "parler" and etat["allumee"]:
            poser_question()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nArrêt de la démo.")
    finally:
        led.off()
        lcd.afficher("Station arretee")
