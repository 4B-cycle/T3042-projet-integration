"""
Test de l'écran LCD I2C (16x2 ou 20x4, avec module PCF8574 au dos).

Avant de lancer :
  1. I2C activé  (dtparam=i2c_arm=on dans /boot/firmware/config.txt, ou sudo raspi-config)
  2. sudo apt install -y python3-smbus i2c-tools
  3. i2cdetect -y 1   -> note l'adresse affichée (souvent 27 ou 3f) et mets-la dans ADRESSE

Lancement :  python3 test_lcd.py
"""
import time
import smbus

ADRESSE = 0x27      # adresse de l'écran trouvée avec i2cdetect (0x27 ou 0x3F le plus souvent)
COLONNES = 16       # 16 pour un écran 16x2, 20 pour un 20x4

# Les 3 bits de commande que le module PCF8574 ajoute aux 4 bits de données
LUMIERE = 0x08      # rétroéclairage allumé
E = 0x04            # « Enable » : l'impulsion qui dit à l'écran « lis maintenant »
RS = 0x01           # 0 = commande, 1 = caractère

# Adresse du début de chaque ligne dans la mémoire de l'écran
DEBUT_LIGNE = [0x00, 0x40, 0x14, 0x54]

bus = smbus.SMBus(1)  # le bus I2C n°1 (broches 3 et 5)


def envoyer_4bits(valeur):
    """Envoie une moitié d'octet, puis une impulsion sur E pour que l'écran la lise."""
    bus.write_byte(ADRESSE, valeur | LUMIERE)
    bus.write_byte(ADRESSE, valeur | E | LUMIERE)    # E à 1...
    time.sleep(0.0005)
    bus.write_byte(ADRESSE, valeur | LUMIERE)        # ...puis E à 0 : l'écran lit
    time.sleep(0.0001)


def envoyer_octet(octet, mode):
    """Un octet = deux moitiés de 4 bits : d'abord la moitié haute, puis la moitié basse."""
    envoyer_4bits(mode | (octet & 0xF0))
    envoyer_4bits(mode | ((octet << 4) & 0xF0))


def commande(code):
    envoyer_octet(code, 0)        # RS = 0 : c'est une commande


def caractere(lettre):
    envoyer_octet(ord(lettre), RS)  # RS = 1 : c'est un caractère (ord donne son code)


def initialiser():
    """La séquence de démarrage imposée par la puce HD44780 pour passer en mode 4 bits."""
    time.sleep(0.05)
    envoyer_4bits(0x30)
    time.sleep(0.005)
    envoyer_4bits(0x30)
    time.sleep(0.001)
    envoyer_4bits(0x30)
    envoyer_4bits(0x20)   # passage en mode 4 bits
    commande(0x28)        # 4 bits, 2 lignes (ou plus), police 5x8
    commande(0x0C)        # écran allumé, sans curseur
    commande(0x06)        # le curseur avance vers la droite après chaque lettre
    effacer()


def effacer():
    commande(0x01)
    time.sleep(0.002)     # l'effacement est lent : on attend 2 ms


def ecrire(texte, ligne=0):
    """Écrit le texte au début de la ligne (0 = première ligne). Coupé à la largeur de l'écran."""
    commande(0x80 | DEBUT_LIGNE[ligne])   # placer le curseur au début de la ligne
    for lettre in texte[:COLONNES].ljust(COLONNES):
        caractere(lettre)


if __name__ == "__main__":
    initialiser()
    ecrire("Bonjour Jeremie", 0)
    ecrire("Ecran LCD : OK!", 1)
    time.sleep(3)

    # petit compteur pour vérifier que l'écran se met à jour
    for n in range(5, 0, -1):
        ecrire("Test dans " + str(n) + " s", 1)
        time.sleep(1)

    effacer()
    ecrire("Test termine :)", 0)
