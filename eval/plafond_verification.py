"""Plafond impose par la recuperation a la tache de verification.

Une affirmation dont l'abstract de preuve n'est pas retrouve est perdue quoi
que fasse l'etage de verification. Ce script mesure, pour chaque profondeur k,
la part des abstracts de preuve effectivement retrouves, et le F1 au niveau
abstract qu'un verificateur parfait atteindrait dans ces conditions.
"""

import json
import sys
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "src"))
from lexical import BM25

D = RACINE / "data"


def charger():
    corpus = [json.loads(l) for l in (D / "scifact" / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    claims = [json.loads(l) for l in (D / "data" / "claims_dev.jsonl").read_text(encoding="utf-8").splitlines()]
    return corpus, claims


def main():
    corpus, claims = charger()
    ids = [d["_id"] for d in corpus]
    textes = [f"{d['title']} {d['text']}".strip() for d in corpus]
    moteur = BM25(textes)

    avec_preuve = [c for c in claims if c.get("evidence")]
    print(f"{len(claims)} affirmations, dont {len(avec_preuve)} avec preuve")
    print(f"{sum(len(c['evidence']) for c in avec_preuve)} abstracts de preuve au total\n")

    classements = {}
    for c in claims:
        s = moteur.scores(c["claim"])
        top = np.argpartition(-s, 100)[:100]
        classements[c["id"]] = [ids[i] for i in top[np.argsort(-s[top])]]

    print(f"{'k':>4}{'abstracts de preuve retrouvés':>32}{'F1 abstract d’un':>20}")
    print(f"{'':>4}{'':>32}{'vérificateur parfait':>20}")
    print("-" * 56)
    for k in (1, 3, 5, 10, 20, 50, 100):
        vrais_positifs = attendus = predits = 0
        for c in avec_preuve:
            or_ = set(c["evidence"])
            trouves = set(classements[c["id"]][:k])
            vrais_positifs += len(or_ & trouves)
            attendus += len(or_)
        # un verificateur parfait n'etiquette que les abstracts de preuve qu'il
        # a sous la main : precision 1, rappel limite par la recuperation
        rappel = vrais_positifs / attendus
        f1 = 2 * rappel / (1 + rappel)          # precision = 1
        print(f"{k:>4}{f'{vrais_positifs}/{attendus}  ({100*rappel:.1f} %)':>32}{100*f1:>19.1f}")

    print("\nrepères du papier, dev, régime ouvert :")
    print("  VeriSci                      48,5")
    print("  VeriSci, abstracts fournis   72,5")
    print("  justifications fournies      83,0")


if __name__ == "__main__":
    main()
