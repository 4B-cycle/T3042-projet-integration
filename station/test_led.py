"""
Test de la LED RGB, une broche à la fois : pour savoir quelle patte est branchée où.
Lancement :  python3 test_led.py
"""
import time
from gpiozero import LED

BROCHES = {22: "ROUGE", 23: "VERT", 24: "BLEU"}   # ce que le code attend sur chaque GPIO

for gpio, couleur in BROCHES.items():
    led = LED(gpio)
    print("GPIO", gpio, ": le code attend du", couleur, "-> quelle couleur vois-tu ?")
    led.on()
    time.sleep(3)
    led.off()
    led.close()
    time.sleep(1)
print("Fini.")
