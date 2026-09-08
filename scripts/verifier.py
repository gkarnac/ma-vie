#!/usr/bin/env python3
"""
Vérifications avant déploiement — Ma Vie
=========================================

    python3 verifier.py                 # vérifie la version déployée
    python3 verifier.py index.html      # vérifie un fichier local

Contrôle quatre choses, celles qui ont réellement cassé des séances :

  1. Chaque MP3 référencé par la table existe dans le dépôt.
  2. Chaque durée déclarée correspond au fichier réel.
     (le Savasana coupé, les 11 min de physio perdues)
  3. Aucun bloc n'a de durée absente ou non numérique.
     (le NaN:NaN du timer)
  4. Les totaux matin + soir tiennent dans le budget de temps.

Sort en code 1 si une vérification échoue, pour bloquer un déploiement.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

RAW = "https://raw.githubusercontent.com/gkarnac/ma-vie/main/"
BUDGET_MIN = 80          # minutes, matin + soir, seuil d'alerte
TOLERANCE_S = 20         # écart admis entre durée déclarée et fichier réel

JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

ok_global = True


def echec(msg):
    global ok_global
    ok_global = False
    print("  ÉCHEC  " + msg)


def ok(msg):
    print("  ok     " + msg)


def charger_html(source):
    if source and os.path.exists(source):
        return open(source, encoding='utf-8').read()
    with urllib.request.urlopen(RAW + "index.html", timeout=60) as r:
        return r.read().decode('utf-8')


def extraire_table(html):
    """Évalue le bloc SEANCES avec node et le renvoie en JSON."""
    m = re.search(r'const COIFFE = \[[\s\S]*?\nfunction seanceDuJour[\s\S]*?\n}', html)
    if not m:
        print("Table SEANCES introuvable dans le fichier.")
        sys.exit(1)
    src = m.group(0)
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write(src + "\nconsole.log(JSON.stringify(SEANCES));")
        chemin = f.name
    r = subprocess.run(['node', chemin], capture_output=True, text=True)
    os.unlink(chemin)
    if r.returncode:
        print("La table ne s'évalue pas :", r.stderr.strip()[:300])
        sys.exit(1)
    return json.loads(r.stdout)


def duree_reelle(nom, cache={}):
    if nom in cache:
        return cache[nom]
    chemin = os.path.join(tempfile.gettempdir(), "mv_" + nom)
    if not os.path.exists(chemin):
        try:
            with urllib.request.urlopen(RAW + nom, timeout=90) as r:
                data = r.read()
            open(chemin, 'wb').write(data)
        except Exception:
            cache[nom] = None
            return None
    r = subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                        '-of', 'csv=p=0', chemin], capture_output=True, text=True)
    try:
        cache[nom] = float(r.stdout.strip())
    except ValueError:
        cache[nom] = None
    return cache[nom]


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else None
    html = charger_html(source)
    table = extraire_table(html)
    print(f"Table chargée : {len(table)} séances\n")

    print("1. Existence des MP3 et exactitude des durées")
    fichiers = {}
    for cle, blocs in table.items():
        for b in blocs:
            if b.get('mp3'):
                fichiers.setdefault(b['mp3'], []).append((cle, b.get('duree')))
    for nom, usages in sorted(fichiers.items()):
        reelle = duree_reelle(nom)
        if reelle is None:
            echec(f"{nom} introuvable dans le dépôt")
            continue
        for cle, declaree in usages:
            ecart = declaree - reelle
            if abs(ecart) > TOLERANCE_S:
                echec(f"{nom} dans {cle} : déclaré {declaree}s, réel {reelle:.0f}s "
                      f"({ecart:+.0f}s)")
                break
        else:
            ok(f"{nom} — {reelle:.0f}s, {len(usages)} usage(s)")

    print("\n2. Durées présentes et numériques")
    for cle, blocs in table.items():
        for i, b in enumerate(blocs):
            v = b.get('pause') if 'pause' in b else b.get('duree')
            if not isinstance(v, (int, float)) or v <= 0:
                echec(f"{cle} bloc {i} : durée invalide ({v!r})")
                break
        else:
            continue
        break
    else:
        ok("aucune durée absente ou non numérique")

    print("\n3. Budget de temps")
    for i, jour in enumerate(JOURS):
        matin = sum((b.get('pause') if 'pause' in b else b.get('duree', 0))
                    for b in table.get(f'{i}-matin', []))
        soir = sum((b.get('pause') if 'pause' in b else b.get('duree', 0))
                   for b in table.get(f'{i}-soir', []))
        # samedi et dimanche : une seule séance dupliquée matin/soir
        total = matin + soir if i < 4 else max(matin, soir)
        mn = total / 60
        ligne = f"{jour:10s} {matin//60:3.0f} + {soir//60:3.0f} = {mn:5.1f} min"
        if i < 4 and mn > BUDGET_MIN:
            echec(ligne + f"  (dépasse {BUDGET_MIN} min)")
        else:
            ok(ligne)

    print()
    if ok_global:
        print("Toutes les vérifications passent.")
    else:
        print("Des vérifications ont échoué — ne pas déployer.")
    sys.exit(0 if ok_global else 1)


if __name__ == "__main__":
    main()
