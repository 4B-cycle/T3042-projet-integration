"""
Test du buzzer avec gpiozero (comme dans demo.py).
Lancement :  python3 test_buzzer.py
"""
import time
from gpiozero import Buzzer

GPIO_BUZZER = 5

print("Essai 1 : buzzer normal (active_high=True) -> 3 bips")
b = Buzzer(GPIO_BUZZER)
b.beep(on_time=0.25, off_time=0.15, n=3, background=False)
b.close()
time.sleep(1)

print("Essai 2 : buzzer inversé (active_high=False) -> 3 bips")
b = Buzzer(GPIO_BUZZER, active_high=False)
b.beep(on_time=0.25, off_time=0.15, n=3, background=False)
b.close()

print("Fini. Lequel a bipé ? Essai 1 -> BUZZER_ACTIF_HAUT = True ; Essai 2 -> False")
