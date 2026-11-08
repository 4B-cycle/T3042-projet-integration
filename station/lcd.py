"""
Écran LCD I2C (puce HD44780 + module PCF8574) : fonctions réutilisables pour la station.

Même principe que test_lcd.py, avec en plus :
  - afficher(...)  : remplit tout l'écran en une fois (une chaîne par ligne)
  - decouper(...)  : coupe un long texte en lignes de la largeur de l'écran
  - les accents sont retirés automatiquement (l'écran ne sait pas les afficher)
  - si l'écran n'est pas branché, le texte s'affiche dans le terminal (pratique pour tester)
"""
import textwrap
import time
import unicodedata

ADRESSE = 0x27      # trouvée avec  i2cdetect -y 1  (0x27 ou 0x3F)
COLONNES = 20       # écran 20x4
LIGNES = 4

LUMIERE = 0x08
E = 0x04
RS = 0x01
DEBUT_LIGNE = [0x00, 0x40, 0x14, 0x54]

bus = None          # le bus I2C ; reste à None si l'écran n'est pas trouvé (mode terminal)


# --- envoi bas niveau (identique à test_lcd.py) ---------------------------------
def envoyer_4bits(valeur):
    bus.write_byte(ADRESSE, valeur | LUMIERE)
    bus.write_byte(ADRESSE, valeur | E | LUMIERE)
    time.sleep(0.0005)
    bus.write_byte(ADRESSE, valeur | LUMIERE)
    time.sleep(0.0001)


def envoyer_octet(octet, mode):
    envoyer_4bits(mode | (octet & 0xF0))
    envoyer_4bits(mode | ((octet << 4) & 0xF0))


def commande(code):
    envoyer_octet(code, 0)


# --- fonctions utiles pour la station --------------------------------------------
def initialiser():
    """Démarre l'écran. S'il ne répond pas, on passe en mode terminal au lieu de planter."""
    global bus
    try:
        import smbus
        bus = smbus.SMBus(1)
        time.sleep(0.05)
        envoyer_4bits(0x30)
        time.sleep(0.005)
        envoyer_4bits(0x30)
        time.sleep(0.001)
        envoyer_4bits(0x30)
        envoyer_4bits(0x20)
        commande(0x28)
        commande(0x0C)
        commande(0x06)
        effacer()
    except (OSError, ImportError) as erreur:
        print("[LCD] écran introuvable (" + str(erreur) + ") : affichage dans le terminal")
        bus = None


def effacer():
    if bus is not None:
        commande(0x01)
        time.sleep(0.002)


def sans_accents(texte):
    """« Électronique à 5 V » -> « Electronique a 5 V »"""
    return unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode("ascii")


def ecrire(texte, ligne):
    """Écrit le texte sur une ligne (0 à 3), coupé ou complété à la largeur de l'écran."""
    texte = sans_accents(texte)[:COLONNES].ljust(COLONNES)
    if bus is None:
        return
    commande(0x80 | DEBUT_LIGNE[ligne])
    for lettre in texte:
        envoyer_octet(ord(lettre), RS)


def afficher(*lignes):
    """Remplit tout l'écran : afficher("ligne 1", "ligne 2"). Les lignes non données sont vidées."""
    lignes = list(lignes)[:LIGNES]
    lignes += [""] * (LIGNES - len(lignes))
    if bus is None:   # mode terminal : on dessine un petit cadre
        print("+" + "-" * COLONNES + "+")
        print("\n".join("|" + sans_accents(l)[:COLONNES].ljust(COLONNES) + "|" for l in lignes))
        print("+" + "-" * COLONNES + "+")
        return
    numero = 0
    while numero < LIGNES:
        ecrire(lignes[numero], numero)
        numero += 1


def decouper(texte):
    """Coupe un texte en lignes de COLONNES caractères, sans couper les mots."""
    return textwrap.wrap(sans_accents(texte), COLONNES) or [""]


if __name__ == "__main__":
    initialiser()
    afficher("Station tuteur", "Ecran 20x4 : OK", "Accents : éèàç", "Ligne 4")
