"""Bootstrap apparie sur les nDCG par requete.

Apparie parce que les systemes compares sont evalues sur LES MEMES requetes :
la variance entre requetes, considerable sur un banc de recherche, se
soustrait. Un test non apparie serait beaucoup trop conservateur et ferait
rejeter des ecarts reels.
"""

import numpy as np


def par_requete(resultats, qrels, ndcg, k=10) -> np.ndarray:
    return np.array([ndcg(resultats[q], qrels[q], k) for q in qrels])


def bootstrap_apparie(a: np.ndarray, b: np.ndarray, n: int = 10_000, graine: int = 0):
    """Rend (ecart moyen, intervalle de confiance a 95 %, p bilateral)."""
    d = a - b
    rng = np.random.default_rng(graine)
    tirages = rng.choice(len(d), size=(n, len(d)), replace=True)
    moyennes = d[tirages].mean(axis=1)
    p = 2 * min((moyennes <= 0).mean(), (moyennes >= 0).mean())
    return float(d.mean()), np.percentile(moyennes, [2.5, 97.5]), min(float(p), 1.0)


def comparer(scores: dict[str, np.ndarray], paires: list[tuple[str, str]]) -> None:
    print(f"{'comparaison':<48}{'écart':>9}{'IC 95 %':>22}{'p':>8}")
    print("-" * 87)
    for x, y in paires:
        ecart, ic, p = bootstrap_apparie(scores[x], scores[y])
        verdict = "significatif" if p < 0.05 else "non significatif"
        print(f"{x + '  vs  ' + y:<48}{ecart:>+9.4f}"
              f"{f'[{ic[0]:+.4f}, {ic[1]:+.4f}]':>22}{p:>8.3f}   {verdict}")


def decompte(a: np.ndarray, b: np.ndarray, nom_a: str, nom_b: str) -> None:
    """Sur combien de requetes chaque systeme l'emporte.

    Souvent plus parlant que le p : une moyenne peut pencher d'un cote alors
    que l'autre systeme gagne sur davantage de requetes.
    """
    print(f"  {nom_a} meilleur sur {(a > b).sum():>4} requêtes")
    print(f"  {nom_b} meilleur sur {(a < b).sum():>4} requêtes")
    print(f"  égalité sur {(a == b).sum():>16} requêtes")
