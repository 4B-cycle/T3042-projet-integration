"""
Démo 4 de la station : demo2.py (version ACCESSIBLE), mais le serveur est joint en HTTPS (port 3443).

Le principe : chaque information passe par au moins DEUX sens (la vue, l'ouïe, le toucher).
  - la voix annonce chaque étape          -> pour les personnes aveugles ou malvoyantes
  - un son différent pour chaque étape    -> buzzer passif
  - la LED a une couleur ET un rythme     -> pour les personnes daltoniennes
  - un flash blanc remplace le bip        -> pour les personnes sourdes
  - tout ce qui est dit est écrit, page par page, et c'est l'utilisateur qui tourne les pages
  - bouton tactile REPETER : relit la dernière réponse
  - potentiomètre : le volume du haut-parleur (on règle au toucher, sans écran)
  - LDR : les LED s'adaptent à la lumière de la pièce

Boutons :
  MARCHE    (GPIO 27) : allume / éteint la station
  PARLER    (GPIO 17) : 1er appui = le micro écoute, 2e appui = on envoie la question
  SUIVANT   (GPIO 6)  : page suivante de la réponse
  PRECEDENT (GPIO 13) : page précédente
  REPETER   (GPIO 26, module tactile) : relit la dernière réponse

LED RGB :
  VERT fixe            = prête
  BLEU fixe            = le micro écoute
  VIOLET clignote lent = je réfléchis
  ORANGE fixe          = je parle
  ROUGE clignote vite  = un problème
  ROUGE fixe           = station éteinte

Lancement (depuis le dossier station) :  python3 demo4.py
"""
import os
import queue
import subprocess
import threading
import time

# --- Serveur en HTTPS -----------------------------------------------------------------
# Ces lignes passent AVANT « import tuteur » : elles remplacent l'adresse de station.env.
ADRESSE_HTTPS = "https://100.79.170.11:3443"
VERIFIER_CERTIFICAT = False   # False : le serveur a un certificat auto-signé (on passe déjà par Tailscale)
os.environ["OPENWEBUI_URL"] = ADRESSE_HTTPS
os.environ["OPENWEBUI_VERIF_SSL"] = "1" if VERIFIER_CERTIFICAT else "0"
if not VERIFIER_CERTIFICAT:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)   # pas d'avertissement à chaque question

from gpiozero import Button, PWMLED, RGBLED, TonalBuzzer

import journal
import lcd
from haut_parleur import parler
from micro import ouvrir_micro, fermer_micro, amplifier
from tuteur import transcrire, talk_to_tuteur, nouvelle_conversation

# --- Réglages -----------------------------------------------------------------
GPIO_PARLER = 17          # broche physique 11
GPIO_MARCHE = 27          # broche physique 13
GPIO_LED = (22, 23, 24)   # broches 15, 16, 18 (rouge, vert, bleu)
GPIO_BUZZER = 5           # broche 29  (buzzer PASSIF)
GPIO_BLANCHE = 25         # broche 22  (LED blanche : le flash)
GPIO_REPETER = 26         # broche 37  (module tactile TTP223)
GPIO_SUIVANT = 6          # broche 31
GPIO_PRECEDENT = 13       # broche 33

NOM_AGENT = "Tuteur Electronique"   # 20 caractères max
FICHIER = "/tmp/question.wav"
DUREE_MAX = 60            # secondes : on laisse le temps de parler (point « ne pas presser »)
VOLUME = "60%"            # volume de départ (le potentiomètre le change ensuite)
VOLUME_MIN = 10           # en %, potentiomètre tout à gauche (jamais complètement muet)
VOLUME_MAX = 100          # en %, potentiomètre tout à droite

ADS_ADRESSE = 0x48        # ADS1115 : ADDR relié au GND
CANAL_POTAR = 0           # potentiomètre sur A0
CANAL_LDR = 1             # LDR sur A1

ROUGE = (1, 0, 0)
VERT = (0, 1, 0)
BLEU = (0, 0, 1)
VIOLET = (0.6, 0, 1)
ORANGE = (1, 0.25, 0)

VITESSES = [(0.8, "lente"), (1.0, "normale"), (1.2, "rapide")]

# --- Matériel -----------------------------------------------------------------
led = RGBLED(*GPIO_LED)                 # ajoute active_high=False si ta LED est à anode commune
blanche = PWMLED(GPIO_BLANCHE)
buzzer = TonalBuzzer(GPIO_BUZZER)       # notes possibles : de A3 (grave) à A5 (aigu)
bouton_parler = Button(GPIO_PARLER, bounce_time=0.05)
bouton_marche = Button(GPIO_MARCHE, bounce_time=0.05)
bouton_suivant = Button(GPIO_SUIVANT, bounce_time=0.05)
bouton_precedent = Button(GPIO_PRECEDENT, bounce_time=0.05)
# le module tactile envoie 1 quand on le touche : pas de résistance de tirage, actif à l'état haut
bouton_repeter = Button(GPIO_REPETER, pull_up=None, active_state=True, bounce_time=0.05)

# Les boutons déposent juste un « message » dans une file ; la boucle principale agit.
evenements = queue.Queue()
bouton_parler.when_pressed = lambda: evenements.put("parler")
bouton_marche.when_pressed = lambda: evenements.put("marche")
bouton_suivant.when_pressed = lambda: evenements.put("suivant")
bouton_precedent.when_pressed = lambda: evenements.put("precedent")
bouton_repeter.when_pressed = lambda: evenements.put("repeter")

# --- État de la station ----------------------------------------------------------
etat = {
    "allumee": False,
    "micro": None,          # le processus arecord pendant l'écoute
    "debut": 0,
    "accueil": False,       # écran d'accueil (horloge) affiché ?
    "parle": False,         # la réponse est-elle en train d'être lue ?
    "pages": [],            # la conversation découpée en pages de 3 lignes
    "page": 0,              # la page affichée
    "premiere_reponse": 0,  # numéro de la première page de la réponse
    "reponse": "",          # la dernière réponse (pour REPETER)
    "couleur": ROUGE,       # couleur fixe actuelle de la LED
    "rythme": None,         # None = fixe, sinon (allumé, éteint) en secondes
    "lumiere": 1.0,         # 0,25 (pièce sombre) à 1 (pièce claire)
    "vitesse": 1,           # indice dans VITESSES (voix normale)
    "bouton_avant": False,  # état du bouton PARLER à la lecture précédente (pendant l'écoute)
    "volume": None,         # volume actuel en %, réglé par le potentiomètre
}

JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]


# --- ADS1115 : lire le potentiomètre et la LDR ------------------------------------
ads = None


def ads_demarrer():
    """Ouvre le bus I2C pour l'ADS1115. S'il n'est pas branché, la démo marche quand même."""
    global ads
    try:
        import smbus
        ads = smbus.SMBus(1)
        ads_lire(CANAL_POTAR)
    except (OSError, ImportError) as erreur:
        print("[ADS1115] introuvable (" + str(erreur) + ") : volume fixe, LED au maximum")
        ads = None


def ads_lire(canal):
    """Renvoie la tension de l'entrée A0..A3, ramenée entre 0 (0 V) et 1 (3,3 V)."""
    # registre de configuration : une mesure, entrée canal / GND, ±4,096 V, 128 mesures/s
    config = 0x8000 | ((0x4 + canal) << 12) | 0x0200 | 0x0100 | 0x0080 | 0x0003
    ads.write_i2c_block_data(ADS_ADRESSE, 0x01, [config >> 8, config & 0xFF])
    time.sleep(0.01)                                  # la mesure prend ~8 ms
    haut, bas = ads.read_i2c_block_data(ADS_ADRESSE, 0x00, 2)
    valeur = (haut << 8) | bas
    if valeur > 0x7FFF:                               # nombre négatif (bruit autour de 0 V)
        valeur = 0
    return min(valeur / 26400, 1.0)                   # 3,3 V ≈ 26400 sur ±4,096 V


def lire_capteurs():
    """Met à jour la lumière (LDR) et le volume (potentiomètre)."""
    if ads is None:
        return
    try:
        lumiere = ads_lire(CANAL_LDR)
        potar = ads_lire(CANAL_POTAR)
    except OSError:
        return
    # LDR : plus il y a de lumière, plus la tension monte -> LED plus fortes
    nouvelle = round(0.25 + 0.75 * lumiere, 1)
    if nouvelle != etat["lumiere"]:
        etat["lumiere"] = nouvelle
        appliquer_led()
    # potentiomètre : le volume, par pas de 5 %
    volume = VOLUME_MIN + potar * (VOLUME_MAX - VOLUME_MIN)
    volume = int(round(volume / 5) * 5)
    if volume != etat["volume"]:
        premiere_fois = etat["volume"] is None
        etat["volume"] = volume
        subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", str(volume) + "%"])
        journal.etape("Volume : " + str(volume) + " %", journal.CYAN)
        if etat["accueil"]:
            lcd.ecrire("Volume : " + str(volume) + " %", 2)
        if not premiere_fois and not etat["parle"] and etat["micro"] is None:
            melodie([("A4", 0.08)])      # petit bip : on entend le nouveau volume


# --- La LED : couleur + rythme, réglée selon la lumière ---------------------------
def regler(c):
    """Applique la luminosité de la pièce à une couleur."""
    return tuple(x * etat["lumiere"] for x in c)


def appliquer_led():
    if etat["rythme"] is None:
        led.color = regler(etat["couleur"])
    else:
        allume, eteint = etat["rythme"]
        led.blink(on_time=allume, off_time=eteint, on_color=regler(etat["couleur"]), background=True)


def lumiere_led(couleur, rythme=None):
    """rythme = None : fixe ; (0.8, 0.8) : clignote lent ; (0.2, 0.2) : clignote vite."""
    etat["couleur"] = couleur
    etat["rythme"] = rythme
    appliquer_led()


def flash(fois=2):
    """Le flash blanc (pour les personnes sourdes), dans un fil à part pour ne rien bloquer."""
    def clignoter():
        for _ in range(fois):
            blanche.value = etat["lumiere"]
            time.sleep(0.15)
            blanche.off()
            time.sleep(0.15)
    threading.Thread(target=clignoter, daemon=True).start()


# --- Le buzzer passif : une petite mélodie par situation ---------------------------
def melodie(notes):
    """notes : liste de (note, durée). Exemple : [("C4", 0.15), ("G4", 0.25)]"""
    try:
        for note, duree in notes:
            buzzer.play(note)
            time.sleep(duree)
            buzzer.stop()
            time.sleep(0.04)
    except Exception as erreur:       # une note hors limites ne doit pas planter la démo
        buzzer.stop()
        print("[Buzzer]", erreur)


SON_PRETE = [("C4", 0.15), ("G4", 0.25)]           # monte : tout va bien
SON_MICRO_OUVERT = [("E5", 0.15)]                  # aigu court
SON_MICRO_FERME = [("A4", 0.12), ("A4", 0.12)]     # deux notes plus graves
SON_ERREUR = [("G4", 0.3), ("C4", 0.5)]            # descend : problème
SON_PAGE = [("C5", 0.04)]                          # petit « tic » quand on tourne la page


# --- Parler ----------------------------------------------------------------------
def dire(texte):
    """Annonce courte (bloquante), à la vitesse choisie avec le potentiomètre."""
    parler(texte, VITESSES[etat["vitesse"]][0])


def lire_reponse_en_fond(texte):
    """Lit la réponse dans un fil à part : pendant ce temps, on peut tourner les pages."""
    etat["parle"] = True
    lumiere_led(ORANGE)

    def lire():
        try:
            parler(texte, VITESSES[etat["vitesse"]][0])
        finally:
            evenements.put("fin_lecture")   # toujours, même si la lecture plante (sinon PARLER resterait bloqué)

    threading.Thread(target=lire, daemon=True).start()


# --- L'écran -----------------------------------------------------------------------
def date_heure():
    maintenant = time.localtime()
    return JOURS[maintenant.tm_wday] + time.strftime(" %d/%m   %H:%M:%S", maintenant)


def ecran_pret():
    lumiere_led(VERT)
    lcd.afficher(NOM_AGENT, date_heure(), "Volume : " + str(etat["volume"] or VOLUME.strip("%")) + " %", "PARLER = question")
    etat["accueil"] = True


def preparer_pages(question, reponse):
    """Toute la conversation, découpée en pages de 3 lignes (la 4e ligne sert à se repérer)."""
    lignes = ["Tu as dit :"] + lcd.decouper(question)
    etat["premiere_reponse"] = len(lignes) // 3 + (1 if len(lignes) % 3 else 0)
    lignes += [""] * (etat["premiere_reponse"] * 3 - len(lignes))    # la réponse commence en haut d'une page
    lignes += ["Reponse :"] + lcd.decouper(reponse)
    etat["pages"] = [lignes[i:i + 3] for i in range(0, len(lignes), 3)]
    etat["page"] = etat["premiere_reponse"]


def afficher_page():
    total = len(etat["pages"])
    numero = etat["page"] + 1
    if etat["parle"]:
        bas = "Lecture...  " + str(numero) + "/" + str(total)
    else:
        bas = "<  Page " + str(numero) + "/" + str(total) + "  >"
    lcd.afficher(*etat["pages"][etat["page"]], bas)


def tourner_page(sens):
    if not etat["pages"]:
        return
    nouvelle = etat["page"] + sens
    if 0 <= nouvelle < len(etat["pages"]):
        etat["page"] = nouvelle
        afficher_page()
        melodie(SON_PAGE)
    else:
        melodie([("A3", 0.1)])        # son grave : on est déjà au bout


def mettre_a_jour_ecran():
    if etat["micro"] is not None:
        secondes = int(time.time() - etat["debut"])
        lcd.ecrire("Temps : " + str(secondes) + " s / " + str(DUREE_MAX) + " s", 1)
    elif etat["accueil"]:
        lcd.ecrire(date_heure(), 1)


# --- Allumer, éteindre, écouter ----------------------------------------------------------
def allumer():
    etat["allumee"] = True
    etat["pages"] = []
    etat["reponse"] = ""
    lcd.afficher(NOM_AGENT, "", "Demarrage...")
    journal.etape("● Station allumée", journal.VERT)
    nouvelle_conversation()
    ecran_pret()
    melodie(SON_PRETE)
    flash(1)
    dire("La station est prête. Appuie sur le bouton Parler pour poser ta question.")
    vider_evenements()


def eteindre():
    if etat["micro"] is not None:
        fermer_micro(etat["micro"])
        etat["micro"] = None
    etat["allumee"] = False
    etat["accueil"] = False
    journal.etape("● Station éteinte", journal.ROUGE)
    journal.separateur()
    lumiere_led(ROUGE)
    lcd.afficher("Station eteinte", "", "Appuie sur MARCHE", "pour l'allumer")
    dire("À bientôt.")
    vider_evenements()


def commencer_ecoute():
    etat["accueil"] = False
    lumiere_led(BLEU)
    lcd.afficher("Je t'ecoute...", "Temps : 0 s", "Prends ton temps.", "PARLER = j'ai fini")
    dire("Je t'écoute.")
    melodie(SON_MICRO_OUVERT)
    flash(2)
    etat["micro"] = ouvrir_micro(FICHIER)
    etat["debut"] = time.time()
    etat["bouton_avant"] = True      # il faut d'abord relâcher le bouton avant qu'un appui compte
    journal.etape("Micro ouvert : l'étudiant parle...", journal.BLEU)


def finir_ecoute():
    duree = int(time.time() - etat["debut"])
    fermer_micro(etat["micro"])
    etat["micro"] = None
    journal.etape("Micro fermé (" + str(duree) + " s)", journal.BLEU)
    melodie(SON_MICRO_FERME)
    flash(1)
    traiter_question()
    vider_evenements()


def probleme(message_ecran, message_voix):
    """Un problème : ROUGE qui clignote vite + son qui descend + message écrit + message dit."""
    lumiere_led(ROUGE, (0.2, 0.2))
    lcd.afficher("Probleme :", message_ecran[:20], "", "Reessaie dans 1 min")
    melodie(SON_ERREUR)
    flash(3)
    dire(message_voix)
    time.sleep(3)              # on laisse le temps de lire
    ecran_pret()


# --- Le cœur : question -> réponse ------------------------------------------------------
def traiter_question():
    etat["accueil"] = False
    lumiere_led(VIOLET, (0.8, 0.8))          # violet qui clignote lentement = je réfléchis
    lcd.afficher("Je reflechis...", "", "Je transcris", "ta question")
    dire("Je réfléchis.")
    journal.etape("Transcription...", journal.VIOLET)

    question, code = transcrire(amplifier(FICHIER))
    if code != 200:
        journal.erreur("Transcription impossible (code " + str(code) + ")", question)
        probleme("transcription", "Je n'ai pas pu comprendre l'enregistrement. Réessaie dans une minute.")
        return
    if not question.strip():
        journal.etape("Rien entendu", journal.JAUNE)
        lcd.afficher("Je n'ai rien entendu", "", "Reappuie sur PARLER", "et parle plus fort")
        melodie(SON_ERREUR)
        dire("Je n'ai rien entendu. Appuie sur Parler et parle un peu plus fort.")
        ecran_pret()
        return
    journal.etudiant(question)

    lignes = lcd.decouper(question)
    lcd.afficher("Tu as dit :", *lignes[:3])
    journal.etape("Le tuteur réfléchit...", journal.VIOLET)
    depart = time.time()
    reponse, code = talk_to_tuteur(question)
    if code != 200:
        journal.erreur("Tuteur injoignable (code " + str(code) + ")", reponse)
        probleme("serveur muet", "Le serveur ne répond pas. Réessaie dans une minute.")
        return
    journal.tuteur(reponse, time.time() - depart)

    etat["reponse"] = reponse
    preparer_pages(question, reponse)
    flash(2)                                 # la réponse arrive
    lire_reponse_en_fond(reponse)
    afficher_page()


def repeter():
    if not etat["reponse"]:
        dire("Il n'y a pas encore de réponse à répéter.")
        return
    journal.etape("Répéter la dernière réponse", journal.CYAN)
    etat["page"] = etat["premiere_reponse"]
    etat["accueil"] = False
    flash(1)
    lire_reponse_en_fond(etat["reponse"])
    afficher_page()


def vider_evenements():
    """Oublie les appuis faits pendant que la station était occupée (sauf la fin de lecture)."""
    garder = []
    while not evenements.empty():
        e = evenements.get_nowait()
        if e == "fin_lecture":
            garder.append(e)
    for e in garder:
        evenements.put(e)


# --- La boucle principale ---------------------------------------------------------------
def main():
    journal.titre("STATION TUTEUR ACCESSIBLE (HTTPS) - " + NOM_AGENT)
    journal.etape("Serveur : " + ADRESSE_HTTPS)
    # régler le volume du haut-parleur (la sortie par défaut de PipeWire)
    subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", VOLUME])
    lcd.initialiser()
    ads_demarrer()
    lire_capteurs()
    allumer()

    dernier_capteur = 0
    while True:
        # pendant l'écoute, on regarde plus souvent (20 fois par seconde) pour réagir vite au bouton
        attente = 0.05 if etat["micro"] is not None else 0.5
        try:
            evenement = evenements.get(timeout=attente)
        except queue.Empty:
            evenement = None

        # Pendant l'écoute, on lit AUSSI le bouton PARLER directement (sans attendre son « message ») :
        # si le message de l'appui se perd, le micro s'arrête quand même.
        if etat["micro"] is not None:
            appuye = bouton_parler.is_pressed
            if appuye and not etat["bouton_avant"] and time.time() - etat["debut"] > 0.5:
                evenement = "parler"
            etat["bouton_avant"] = appuye

        if etat["micro"] is not None and time.time() - etat["debut"] > DUREE_MAX:
            evenement = "parler"

        if evenement is not None and evenement != "fin_lecture":
            # pour vérifier que les boutons arrivent bien jusqu'au code
            journal.etape("Bouton : " + evenement + "  (micro " + ("ouvert" if etat["micro"] else "fermé")
                          + ", lecture " + ("en cours" if etat["parle"] else "finie") + ")")

        mettre_a_jour_ecran()
        if time.time() - dernier_capteur > 1:          # capteurs : une fois par seconde
            lire_capteurs()
            dernier_capteur = time.time()

        if evenement == "fin_lecture":
            etat["parle"] = False
            if etat["allumee"]:
                lumiere_led(VERT)
                afficher_page()                    # la page reste affichée : on lit à son rythme
            journal.etape("Réponse lue")
            journal.separateur()

        elif evenement == "marche" and not etat["parle"]:
            if etat["allumee"]:
                eteindre()
            else:
                allumer()

        elif not etat["allumee"]:
            continue

        elif evenement == "suivant":
            tourner_page(+1)

        elif evenement == "precedent":
            tourner_page(-1)

        elif evenement == "repeter" and not etat["parle"] and etat["micro"] is None:
            repeter()

        elif evenement == "parler" and not etat["parle"]:
            if etat["micro"] is None:
                commencer_ecoute()
            else:
                finir_ecoute()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        journal.etape("Arrêt de la démo", journal.ROUGE)
    finally:
        if etat["micro"] is not None:
            fermer_micro(etat["micro"])
        led.off()
        blanche.off()
        buzzer.stop()
        lcd.afficher("Station arretee")
