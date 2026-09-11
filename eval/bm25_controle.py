"""Point de controle : reproduire le BM25 du papier BEIR sur SciFact.

Repere publie : nDCG@10 = 0.665 (Thakur et al., NeurIPS 2021, table 2).
Si ce script ne s'en approche pas, l'implementation est fausse et tout ce qui
sera construit par-dessus le sera aussi.
"""

import csv
import json
import sys
import time
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "src"))
sys.path.insert(0, str(RACINE / "eval"))
from lexical import BM25
from metriques import evaluer

DONNEES = RACINE / "data" / "scifact"
REPERE_PAPIER = 0.665


def charger():
    corpus = [json.loads(l) for l in (DONNEES / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    requetes = {json.loads(l)["_id"]: json.loads(l)["text"]
                for l in (DONNEES / "queries.jsonl").read_text(encoding="utf-8").splitlines()}
    qrels: dict[str, dict[str, int]] = {}
    with (DONNEES / "qrels" / "test.tsv").open() as f:
        r = csv.reader(f, delimiter="\t")
        next(r)
        for qid, did, score in r:
            qrels.setdefault(qid, {})[did] = int(score)
    return corpus, requetes, qrels


def main(k1=0.9, b=0.4):
    corpus, requetes, qrels = charger()
    ids = [d["_id"] for d in corpus]
    # BEIR indexe le titre suivi du texte.
    textes = [f"{d['title']} {d['text']}".strip() for d in corpus]
    print(f"corpus   : {len(textes)} documents")
    print(f"test     : {len(qrels)} requêtes")
    print(f"réglages : k1={k1}, b={b}, racinisation Porter, arrêt Lucene\n")

    t0 = time.time()
    moteur = BM25(textes, k1=k1, b=b)
    print(f"index    : {moteur.vocabulaire} termes, construit en {time.time()-t0:.1f} s")

    t0 = time.time()
    resultats = {}
    for qid in qrels:
        s = moteur.scores(requetes[qid])
        top = np.argpartition(-s, 100)[:100]
        top = top[np.argsort(-s[top])]
        resultats[qid] = [ids[i] for i in top]
    ms = 1000 * (time.time() - t0) / len(qrels)
    print(f"recherche: {ms:.1f} ms par requête\n")

    m = evaluer(resultats, qrels, ks=(10,))
    ecart = m["nDCG@10"] - REPERE_PAPIER
    print(f"  nDCG@10     {m['nDCG@10']:.4f}")
    print(f"  Recall@100  {m['Recall@100']:.4f}")
    print(f"\n  repère BEIR {REPERE_PAPIER:.4f}   écart {ecart:+.4f}")
    verdict = ("implémentation validée" if abs(ecart) <= 0.02 else
               "écart notable — à comprendre avant d'aller plus loin")
    print(f"  → {verdict}")
    return m


if __name__ == "__main__":
    a = sys.argv[1:]
    main(float(a[0]) if a else 0.9, float(a[1]) if len(a) > 1 else 0.4)
