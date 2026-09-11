"""BM25 Okapi, en numpy, sans dependance externe.

Les reglages par defaut sont ceux d'Anserini (k1=0.9, b=0.4), utilise par le
papier BEIR, et non les k1=1.2-2.0 / b=0.75 de la litterature classique. Le but
est de reproduire 0.665 nDCG@10 sur SciFact : sans ce point de controle, une
erreur d'implementation passerait inapercue.
"""

import re
from collections import Counter

import numpy as np
from nltk.stem.porter import PorterStemmer

# Liste d'arret d'Anserini / Lucene pour l'anglais.
ARRET = set("""
a an and are as at be but by for if in into is it no not of on or such that the
their then there these they this to was will with
""".split())

_racine = PorterStemmer()
_cache: dict[str, str] = {}


def normaliser(texte: str) -> list[str]:
    mots = re.findall(r"[a-z0-9]+", texte.lower())
    sortie = []
    for m in mots:
        if m in ARRET:
            continue
        r = _cache.get(m)
        if r is None:
            r = _racine.stem(m)
            _cache[m] = r
        sortie.append(r)
    return sortie


class BM25:
    def __init__(self, documents: list[str], k1: float = 0.9, b: float = 0.4):
        self.k1, self.b = k1, b
        jetons = [normaliser(d) for d in documents]
        self.n = len(jetons)
        self.longueurs = np.array([len(d) for d in jetons], dtype=np.float32)
        self.moyenne = float(self.longueurs.mean()) if self.n else 1.0

        brut: dict[str, list[tuple[int, int]]] = {}
        for i, doc in enumerate(jetons):
            for terme, freq in Counter(doc).items():
                brut.setdefault(terme, []).append((i, freq))

        self.index: dict[str, tuple[np.ndarray, np.ndarray, float]] = {}
        for terme, postings in brut.items():
            idx = np.fromiter((p[0] for p in postings), dtype=np.int32, count=len(postings))
            frq = np.fromiter((p[1] for p in postings), dtype=np.float32, count=len(postings))
            df = len(postings)
            idf = np.log(1 + (self.n - df + 0.5) / (df + 0.5))
            self.index[terme] = (idx, frq, float(idf))

    def scores(self, requete: str) -> np.ndarray:
        s = np.zeros(self.n, dtype=np.float32)
        for terme in normaliser(requete):     # les repetitions comptent, comme Lucene
            entree = self.index.get(terme)
            if entree is None:
                continue
            idx, frq, idf = entree
            norme = 1 - self.b + self.b * self.longueurs[idx] / self.moyenne
            s[idx] += idf * (frq * (self.k1 + 1)) / (frq + self.k1 * norme)
        return s

    @property
    def vocabulaire(self) -> int:
        return len(self.index)
