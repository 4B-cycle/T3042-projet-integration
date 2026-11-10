"""
Journal : un affichage propre et lisible dans le terminal, pour suivre ce que fait la station.

  12:45:03  ● Station allumée
  12:45:10  Micro ouvert : l'étudiant parle...

    ÉTUDIANT
      C'est quoi une diode Zener ?

    TUTEUR  (répondu en 3.2 s)
      La diode Zener est ...

Les couleurs utilisent les codes ANSI (compris par tous les terminaux Linux).
"""
import shutil
import textwrap
import time

# Codes couleur du terminal
GRIS = "\033[90m"
ROUGE = "\033[91m"
VERT = "\033[92m"
JAUNE = "\033[93m"
BLEU = "\033[94m"
VIOLET = "\033[95m"
CYAN = "\033[96m"
GRAS = "\033[1m"
FIN = "\033[0m"       # revenir à la couleur normale

LARGEUR = min(80, shutil.get_terminal_size((80, 20)).columns)


def heure():
    return time.strftime("%H:%M:%S")


def titre(texte):
    """Le grand bandeau affiché au démarrage."""
    print()
    print(CYAN + "═" * LARGEUR + FIN)
    print(GRAS + CYAN + texte.center(LARGEUR) + FIN)
    print(GRIS + time.strftime("%d/%m/%Y").center(LARGEUR) + FIN)
    print(CYAN + "═" * LARGEUR + FIN)


def etape(texte, couleur=GRIS):
    """Une ligne d'événement, précédée de l'heure : « 12:45:10  Micro ouvert »."""
    print(GRIS + heure() + FIN + "  " + couleur + texte + FIN)


def bulle(qui, texte, couleur, info=""):
    """Un message dans une « bulle » : le nom de qui parle, puis le texte coupé proprement."""
    print()
    print("  " + GRAS + couleur + qui + FIN + ("  " + GRIS + info + FIN if info else ""))
    print(textwrap.indent(textwrap.fill(texte, LARGEUR - 6), "    "))
    print()


def etudiant(texte):
    bulle("ÉTUDIANT", texte, BLEU)


def tuteur(texte, duree):
    bulle("TUTEUR", texte, VERT, "(répondu en " + format(duree, ".1f") + " s)")


def erreur(texte, detail=""):
    etape("✖ " + texte, ROUGE)
    if detail:
        print(GRIS + textwrap.indent(textwrap.fill(str(detail)[:400], LARGEUR - 12), " " * 10) + FIN)


def separateur():
    print(GRIS + "─" * LARGEUR + FIN)


if __name__ == "__main__":     # aperçu du rendu
    titre("STATION TUTEUR - Tuteur Electronique")
    etape("● Station allumée", VERT)
    etape("Micro ouvert : l'étudiant parle...", BLEU)
    etape("Micro fermé (4 s)", BLEU)
    etape("Transcription...", VIOLET)
    etudiant("C'est quoi une diode Zener ?")
    etape("Le tuteur réfléchit...", VIOLET)
    tuteur("La diode Zener est une diode conçue pour conduire en inverse à partir d'une tension "
           "précise. On l'utilise pour stabiliser une tension ou protéger un circuit.", 3.24)
    etape("Réponse lue sur l'enceinte", GRIS)
    separateur()
    erreur("Tuteur injoignable (code 0)", "Serveur injoignable : HTTPConnectionPool(host='100.79...')")
