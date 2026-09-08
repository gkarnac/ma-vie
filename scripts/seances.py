#!/usr/bin/env python3
"""
Générateur des séances narrées — Ma Vie
=======================================

SOURCE DE VÉRITÉ. Toute modification d'une séance passe par ce fichier.
Ne jamais régénérer un MP3 de mémoire : éditer ici, relancer, redéployer.

    python3 seances.py              # génère tout dans ./out
    python3 seances.py fentes       # génère une seule séance
    python3 seances.py --check      # compare les durées au déploiement

Deux méthodes de génération coexistent :

  ASSEMBLAGE  — mots générés séparément puis collés avec une durée imposée.
                Tempo garanti. Utilisée pour push-pull, fentes, core-circuit.

  SSML        — un seul appel TTS avec des <break>. La parole s'AJOUTE à la
                pause, donc le tempo n'est pas garanti. Conservée uniquement
                pour pont et gainage, qui ont été validés tels quels.
                Ne pas utiliser pour de nouvelles séances.
"""

import base64
import json
import os
import subprocess
import sys
import urllib.request

API_KEY = os.environ.get("GOOGLE_TTS_KEY")
if not API_KEY:
    sys.exit("GOOGLE_TTS_KEY absente.\n"
             "  export GOOGLE_TTS_KEY='...'  puis relancer.\n"
             "  Ne jamais écrire la clé dans ce fichier : le dépôt est public.")
VOICE   = "fr-CA-Chirp3-HD-Aoede"
RATE    = "24000"      # Hz
BITRATE = "32k"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
TMP = os.path.join(OUT, ".tmp")

# Durées des fichiers actuellement déployés, pour --check
DEPLOYE = {
    "jeudi-push-pull.mp3": 762,
    "jeudi-fentes.mp3":    572,
    "jeudi-pont.mp3":      184,
    "jeudi-gainage.mp3":   152,
    "core-circuit.mp3":    525,
}

NUMS = ["Un", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit",
        "Neuf", "Dix", "Onze", "Douze", "Treize", "Quatorze", "Quinze"]


# ── primitives ──────────────────────────────────────────────────────────

def _run(args):
    subprocess.run(args, capture_output=True)


def tts(text, out, rate=0.95, ssml=False):
    """Un appel TTS. `text` est du SSML si ssml=True."""
    payload = json.dumps({
        "input": {"ssml": text} if ssml else {"text": text},
        "voice": {"languageCode": "fr-CA", "name": VOICE},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": rate},
    }).encode()
    req = urllib.request.Request(
        f"https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}",
        data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)
    brut = out + ".raw.mp3"
    with open(brut, "wb") as f:
        f.write(base64.b64decode(res["audioContent"]))
    if out.endswith(".wav"):
        _run(["ffmpeg", "-y", "-i", brut, "-ar", RATE, "-ac", "1",
              "-c:a", "pcm_s16le", out])
        os.remove(brut)
    else:
        os.replace(brut, out)
    return out


def pad(src, secs, out):
    """Impose une durée exacte. C'est ce qui garantit le tempo."""
    _run(["ffmpeg", "-y", "-i", src, "-af", f"apad=whole_dur={secs}",
          "-t", str(secs), "-ar", RATE, "-ac", "1", "-c:a", "pcm_s16le", out])
    return out


def cat(files, out):
    """Concatène en ré-encodant.

    -c copy corrompt le fichier quand les bitrates diffèrent : le MP3 se coupe
    à la lecture. Au-delà de 30 entrées ffmpeg perd des segments en silence,
    d'où le découpage récursif.
    """
    if len(files) > 30:
        m = len(files) // 2
        return cat([cat(files[:m], out + ".a.wav"),
                    cat(files[m:], out + ".b.wav")], out)
    ins = sum([["-i", f] for f in files], [])
    n = len(files)
    flt = "".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[o]"
    _run(["ffmpeg", "-y"] + ins + ["-filter_complex", flt, "-map", "[o]",
          "-ar", RATE, "-ac", "1", "-c:a", "pcm_s16le", out])
    return out


def encoder(src, out):
    """Encodage MP3 unique, à la toute fin. Assembler en MP3 ajoute du
    remplissage de trame à chaque jointure : ~0,05 s par segment, soit
    une dérive de 10 s sur une séance qui en compte 180."""
    _run(["ffmpeg", "-y", "-i", src, "-ar", RATE, "-ac", "1",
          "-b:a", BITRATE, out])
    return out


def duree(f):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries",
                        "format=duration", "-of", "csv=p=0", f],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


_bips = {}

def bip(n):
    """n secondes, un bip discret par seconde. 880 Hz, 80 ms, volume 0.25."""
    if n in _bips:
        return _bips[n]
    unit = os.path.join(TMP, "_bipunit.wav")
    if not os.path.exists(unit):
        b, s = os.path.join(TMP, "_b.wav"), os.path.join(TMP, "_s.wav")
        _run(["ffmpeg", "-y", "-f", "lavfi",
              "-i", f"sine=frequency=880:sample_rate={RATE}:duration=0.08",
              "-af", "volume=0.25", "-ar", RATE, "-ac", "1", "-c:a", "pcm_s16le", b])
        _run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r={RATE}:cl=mono",
              "-t", "0.92", "-ar", RATE, "-ac", "1", "-c:a", "pcm_s16le", s])
        cat([b, s], unit)
    _bips[n] = pad(cat([unit] * n, os.path.join(TMP, f"_bipraw{n}.wav")),
                   float(n), os.path.join(TMP, f"_bip{n}.wav"))
    return _bips[n]


def voix(cle, texte, rate=0.95):
    """Génère un segment parlé une seule fois et le met en cache."""
    f = os.path.join(TMP, f"v_{cle}.wav")
    if not os.path.exists(f):
        tts(texte, f, rate)
    return f


# ══════════════════════════════════════════════════════════════════════
#  PUSH-PULL — Punching Strength (livre Body Weight MA)
#  4 rounds : pompes explosives 6 reps + tirages rapides 12 reps
#  Repos 45 s. Finisher : AMRAP 90 s sur chaque mouvement.
#  Sert au JEUDI (explosif) et au LUNDI.
# ══════════════════════════════════════════════════════════════════════

PP = {
    "intro":   "Punching Strength. Circuit pompes et tirages. Quatre rounds.",
    "d_pomp":  "Pompes explosives — descends lentement en deux secondes — "
               "pousse de façon explosive — atterris avec contrôle.",
    "d_tir":   "Tirages rapides, prise basse — tire vite vers la barre — "
               "redescends avec contrôle en deux secondes.",
    "r1": "Round un.",
    "r2": "Round deux.",
    "r3": "Round trois.",
    "r4": "Round quatre. Dernier round. Tout ce que t'as.",
    "pompes":  "Pompes explosives. Six répétitions. Pars.",
    "tirages": "Tirages rapides. Douze répétitions. Pars.",
    "trans":   "Transition. Tirages.",
    "repos":   "Repos. Quarante-cinq secondes.",
    "encore":  "Encore vingt secondes.",
    "fin_p":   "Finisher. Pompes AMRAP. Quatre-vingt-dix secondes. Pars.",
    "fin_t":   "Tirages AMRAP. Quatre-vingt-dix secondes. Pars.",
    "stop":    "Stop.",
    "bravo":   "C'est fait. Beau travail.",
}

PP_REPS_POMPES  = 6    # bip 4 s / rep — explosif
PP_REPS_TIRAGES = 12   # bip 3 s / rep — rapide
PP_ROUNDS       = 4


def gen_push_pull():
    v = {k: voix(f"pp_{k}", t) for k, t in PP.items()}
    n = {i: voix(f"pp_n{i}", NUMS[i - 1] + ".") for i in range(1, 13)}

    def round_(cle, repos=True):
        p = [v[cle], v["pompes"]]
        for i in range(1, PP_REPS_POMPES + 1):
            p += [n[i], bip(4)]
        p += [v["trans"], bip(5), v["tirages"]]
        for i in range(1, PP_REPS_TIRAGES + 1):
            p += [n[i], bip(3)]
        if repos:
            p += [v["repos"], bip(25), v["encore"], bip(20)]
        return p

    parts = [v["intro"], v["d_pomp"], v["d_tir"]]
    for i in range(1, PP_ROUNDS + 1):
        parts += round_(f"r{i}", repos=(i < PP_ROUNDS))
    parts += [v["fin_p"], bip(90), v["stop"], bip(10),
              v["fin_t"], bip(90), v["stop"], v["bravo"]]
    brut = cat(parts, os.path.join(TMP, "jeudi-push-pull.wav"))
    return encoder(brut, os.path.join(OUT, "jeudi-push-pull.mp3"))


# ══════════════════════════════════════════════════════════════════════
#  FENTES — Kicking Strength
#  3 rounds, 15 reps par jambe, tempo 2-1-2 = 5 s la rep.
#  Comptes seuls : les cues « descends / maintiens / remonte » ont été
#  retirées à la demande, elles rendaient la séance stressante.
# ══════════════════════════════════════════════════════════════════════

FE = {
    "intro":  "Fentes stationnaires. Kicking Strength. Trois rounds. "
              "Alternance gauche droite.",
    "desc":   "Descends en deux secondes. Maintiens une seconde. "
              "Remonte en deux secondes.",
    "r1":     "Round un. Jambe gauche devant. Quinze répétitions. Pars.",
    "r2":     "Round deux. Jambe gauche. Pars.",
    "r3":     "Round trois. Dernier round. Jambe gauche. Pars.",
    "droite": "Jambe droite. Pars.",
    "droite_last": "Jambe droite. Dernier effort. Pars.",
    "repos":  "Repos. Trente secondes.",
    "fin":    "Terminé. Beau travail.",
}

FE_REPS  = 15
FE_TEMPO = 5.0    # secondes par rep
FE_REPOS = 30


def gen_fentes():
    v = {k: voix(f"fe_{k}", t) for k, t in FE.items()}
    reps = []
    for i in range(1, FE_REPS + 1):
        brut = voix(f"fe_n{i}", NUMS[i - 1] + ".", rate=1.25)
        reps.append(pad(brut, FE_TEMPO, os.path.join(TMP, f"fe_r{i}.wav")))
    jambe = cat(reps, os.path.join(TMP, "fe_jambe.wav"))

    def round_(cle, droite, repos=True):
        p = [v[cle], jambe, bip(5), v[droite], jambe]
        if repos:
            p += [v["repos"], bip(FE_REPOS)]
        return p

    parts = [v["intro"], v["desc"]]
    parts += round_("r1", "droite", True)
    parts += round_("r2", "droite", True)
    parts += round_("r3", "droite_last", False)
    parts += [v["fin"]]
    brut = cat(parts, os.path.join(TMP, "jeudi-fentes.wav"))
    return encoder(brut, os.path.join(OUT, "jeudi-fentes.mp3"))


# ══════════════════════════════════════════════════════════════════════
#  CIRCUIT GAINAGE — mardi
#  3 rounds : hollow body 20 s, levées de jambes 15 reps, dead bug 50 s.
#  Le dead bug ne fait QUE 2 séries : la physio prescrit 2 x 50 s, et il est
#  compté en TEMPS, pas en répétitions. Le round 3 s'arrête après les levées.
# ══════════════════════════════════════════════════════════════════════

CO = {
    "intro":   "Circuit gainage. Trois rounds. Hollow body hold, "
               "levées de jambes, dead bug.",
    "desc":    "Le bas du dos reste collé au sol du début à la fin.",
    "r1":      "Round un.",
    "r2":      "Round deux.",
    "r3":      "Round trois. Dernier round.",
    "hollow":  "Hollow body hold. Vingt secondes.",
    "leves":   "Levées de jambes. Quinze répétitions.",
    "deadbug": "Dead bug. Cinquante secondes. Bras et jambe opposés, "
               "sans décoller le bas du dos.",
    "trans":   "Transition.",
    "repos":   "Repos. Quarante-cinq secondes.",
    "reprise": "On repart.",
    "fin":     "Circuit terminé. Beau travail.",
}

CO_HOLLOW  = 20     # s isométrique
CO_LEVES   = 15     # reps, 1.1 s de voix + 3 bips = 4.1 s
CO_DEADBUG = 50     # s — prescription physio, en temps


def gen_core():
    v = {k: voix(f"co_{k}", t) for k, t in CO.items()}
    n = {i: pad(voix(f"co_n{i}", NUMS[i - 1] + ".", rate=1.5), 1.1,
                os.path.join(TMP, f"co_p{i}.wav")) for i in range(1, 16)}

    def round_(cle, deadbug=True, repos=True):
        p  = [v[cle], v["hollow"], bip(CO_HOLLOW)]
        p += [v["trans"], bip(5), v["leves"]]
        for i in range(1, CO_LEVES + 1):
            p += [n[i], bip(3)]
        if deadbug:
            p += [v["trans"], bip(5), v["deadbug"], bip(CO_DEADBUG)]
        if repos:
            p += [v["repos"], bip(40), v["reprise"], bip(5)]
        return p

    parts  = [v["intro"], v["desc"]]
    parts += round_("r1", deadbug=True,  repos=True)
    parts += round_("r2", deadbug=True,  repos=True)
    parts += round_("r3", deadbug=False, repos=False)
    parts += [v["fin"]]
    brut = cat(parts, os.path.join(TMP, "core-circuit.wav"))
    return encoder(brut, os.path.join(OUT, "core-circuit.mp3"))


# ══════════════════════════════════════════════════════════════════════
#  PONT FESSIER et GAINAGE LATÉRAL — méthode SSML héritée
#  Validés tels quels, conservés à l'identique. Ne pas convertir en
#  assemblage sans revalider : le tempo changerait.
# ══════════════════════════════════════════════════════════════════════

PONT_SSML = """<speak>
Pont fessier unilatéral. Trois séries de douze répétitions.
<break time="2s"/>
Sur le dos. Genoux pliés, pieds à plat. Lève une jambe, tendue vers le plafond.
Monte le bassin, serre le fessier en haut. Descends sans toucher le sol.
<break time="3s"/>
Série un. Jambe droite levée.
Un. <break time="2s"/> Deux. <break time="2s"/> Trois. <break time="2s"/> Quatre. <break time="2s"/> Cinq. <break time="2s"/> Six. <break time="2s"/> Sept. <break time="2s"/> Huit. <break time="2s"/> Neuf. <break time="2s"/> Dix. <break time="2s"/> Onze. <break time="2s"/> Douze.
<break time="20s"/>
Série deux. Jambe gauche levée.
Un. <break time="2s"/> Deux. <break time="2s"/> Trois. <break time="2s"/> Quatre. <break time="2s"/> Cinq. <break time="2s"/> Six. <break time="2s"/> Sept. <break time="2s"/> Huit. <break time="2s"/> Neuf. <break time="2s"/> Dix. <break time="2s"/> Onze. <break time="2s"/> Douze.
<break time="20s"/>
Série trois. Dernière série. Jambe droite.
Un. <break time="2s"/> Deux. <break time="2s"/> Trois. <break time="2s"/> Quatre. <break time="2s"/> Cinq. <break time="2s"/> Six. <break time="2s"/> Sept. <break time="2s"/> Huit. <break time="2s"/> Neuf. <break time="2s"/> Dix. <break time="2s"/> Onze. <break time="2s"/> Douze.
<break time="5s"/>
Terminé.
</speak>"""

GAINAGE_SSML = """<speak>
Gainage latéral. Deux sets. Gauche puis droite, cinq secondes de transition.
<break time="2s"/>
Set un. Côté gauche. Appui sur l'avant-bras gauche. Hanche décollée. Corps aligné des pieds à la tête.
Vingt secondes.
<break time="20s"/>
Transition.
<break time="5s"/>
Côté droit. Même chose.
Vingt secondes.
<break time="20s"/>
Repos.
<break time="20s"/>
Set deux. Côté gauche.
<break time="20s"/>
Transition.
<break time="5s"/>
Côté droit. Dernier effort.
<break time="20s"/>
Terminé. Beau travail.
</speak>"""


def gen_pont():
    return tts(PONT_SSML, os.path.join(OUT, "jeudi-pont.mp3"), 0.95, ssml=True)


def gen_gainage():
    return tts(GAINAGE_SSML, os.path.join(OUT, "jeudi-gainage.mp3"), 0.95, ssml=True)



# ══════════════════════════════════════════════════════════════════════
#  CIRCUIT CERVICAL — mercredi soir
#  Chin tuck 3 x 45 s, entrelacé avec la mobilité thoracique qui, elle,
#  ne se fait qu'UNE fois chacune (prescription physio : rotation 60 s,
#  extension 45 s, 1 série). L'entrelacement laisse le cou récupérer
#  entre les séries sans gonfler le volume de mobilité.
#  Bloc de récupération : ton calme, pas d'encouragements.
# ══════════════════════════════════════════════════════════════════════

CV = {
    "intro":   "Circuit cervical. Chin tuck et mobilité thoracique. "
               "Assis bien droit sur une chaise.",
    "tempo":   "Pour le chin tuck : ramène le menton vers l'arrière, "
               "maintiens trois secondes, relâche. Sans forcer.",
    "chin":    "Chin tuck. Quarante-cinq secondes.",
    "rot":     "Mobilité thoracique en rotation. Mains derrière la tête, "
               "pivote lentement à gauche puis à droite, amplitude maximale, "
               "bassin fixe. Soixante secondes.",
    "ext":     "Extension thoracique. Mains derrière la tête, ouvre la poitrine "
               "vers le haut. Quarante-cinq secondes.",
    "trans":   "Transition.",
    "fin":     "Circuit terminé.",
}

CV_CHIN = 45     # s, 3 séries — prescription physio 2, portée à 3 pour l'endurance
CV_ROT  = 60     # s, 1 série
CV_EXT  = 45     # s, 1 série


def gen_cervical():
    v = {k: voix(f"cv_{k}", t) for k, t in CV.items()}
    t5 = [v["trans"], bip(5)]
    parts = ([v["intro"], v["tempo"]]
             + [v["chin"], bip(CV_CHIN)] + t5
             + [v["rot"],  bip(CV_ROT)]  + t5
             + [v["chin"], bip(CV_CHIN)] + t5
             + [v["ext"],  bip(CV_EXT)]  + t5
             + [v["chin"], bip(CV_CHIN)]
             + [v["fin"]])
    brut = cat(parts, os.path.join(TMP, "cervical-circuit.wav"))
    return encoder(brut, os.path.join(OUT, "cervical-circuit.mp3"))


# ── pilote ──────────────────────────────────────────────────────────────

SEANCES = {
    "push-pull": gen_push_pull,
    "fentes":    gen_fentes,
    "core":      gen_core,
    "pont":      gen_pont,
    "gainage":   gen_gainage,
    "cervical":  gen_cervical,
}

FICHIERS = {
    "push-pull": "jeudi-push-pull.mp3",
    "fentes":    "jeudi-fentes.mp3",
    "core":      "core-circuit.mp3",
    "pont":      "jeudi-pont.mp3",
    "gainage":   "jeudi-gainage.mp3",
    "cervical":  "cervical-circuit.mp3",
}


def main():
    os.makedirs(TMP, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    check = "--check" in sys.argv
    cibles = args or list(SEANCES)

    manifeste = {}
    print(f"{'séance':12s} {'généré':>8s} {'déployé':>8s}   écart")
    for c in cibles:
        if c not in SEANCES:
            print(f"  séance inconnue : {c}")
            continue
        f = SEANCES[c]()
        d = int(round(duree(f)))
        manifeste[FICHIERS[c]] = d
        ref = DEPLOYE.get(FICHIERS[c])
        if ref:
            ecart = d - ref
            flag = "  écart normal" if abs(ecart) <= 20 else "  VÉRIFIER"
            print(f"{c:12s} {d:8d} {ref:8d} {ecart:+7d}{flag}")
        else:
            print(f"{c:12s} {d:8d}        —")

    with open(os.path.join(OUT, "durees.json"), "w") as fh:
        json.dump(manifeste, fh, indent=2, ensure_ascii=False)

    print(f"\nfichiers dans {OUT}")
    print("\nÀ REPORTER DANS index.html — champ duration du bloc correspondant :")
    for nom, d in sorted(manifeste.items()):
        ref = DEPLOYE.get(nom)
        if ref is not None and d != ref:
            print(f"  {nom:24s} duration:{ref}  ->  duration:{d}")
        else:
            print(f"  {nom:24s} duration:{d}  (inchangé)")
    print("\nLa voix Chirp3-HD n'est pas déterministe : la durée totale varie de")
    print("quelques secondes d'une génération à l'autre. Le tempo, lui, est exact —")
    print("il vient des bips et du padding, pas de la parole. Mettre à jour DEPLOYE")
    print("ci-dessus après chaque déploiement.")


if __name__ == "__main__":
    main()
