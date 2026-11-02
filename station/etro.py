from gpiozero import Button, RGBLED
from signal import pause

button = Button(17, bounce_time=0.05)
led = RGBLED(22, 23, 24)          # ajoute active_high=False si anode commune


def red():
    led.color = (1, 0, 0)

def green():
    led.color = (0, 1, 0)

def blue():
    led.color = (0, 0, 1)


blue()                            # bleu au démarrage

button.when_pressed = red         # appuyé  → rouge
button.when_released = green      # relâché → vert

pause()                           # garde le programme en vie, en attente des événements