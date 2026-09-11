"""nDCG@k et Recall@k, definis comme dans trec_eval, que BEIR utilise.

nDCG@10 est la metrique de reference du banc. Avec une pertinence binaire :
  DCG@k  = somme des rel_i / log2(i + 1) sur les k premiers rangs
  IDCG@k = meme somme, documents pertinents places en tete
  nDCG@k = DCG@k / IDCG@k
"""

import numpy as np


def ndcg(classement: list[str], pertinents: dict[str, int], k: int = 10) -> float:
    gains = np.array([pertinents.get(d, 0) for d in classement[:k]], dtype=np.float64)
    escompte = 1.0 / np.log2(np.arange(2, len(gains) + 2))
    dcg = float((gains * escompte).sum())

    ideal = np.array(sorted(pertinents.values(), reverse=True)[:k], dtype=np.float64)
    if ideal.size == 0:
        return 0.0
    idcg = float((ideal * (1.0 / np.log2(np.arange(2, ideal.size + 2)))).sum())
    return dcg / idcg if idcg > 0 else 0.0


def rappel(classement: list[str], pertinents: dict[str, int], k: int = 100) -> float:
    total = sum(1 for v in pertinents.values() if v > 0)
    if not total:
        return 0.0
    trouves = sum(1 for d in classement[:k] if pertinents.get(d, 0) > 0)
    return trouves / total


def evaluer(resultats: dict[str, list[str]], qrels: dict[str, dict[str, int]],
            ks=(10,), k_rappel=100) -> dict[str, float]:
    """Moyenne sur les requetes ayant au moins un document pertinent."""
    scores: dict[str, list[float]] = {f"nDCG@{k}": [] for k in ks}
    scores[f"Recall@{k_rappel}"] = []
    for qid, pertinents in qrels.items():
        if not any(v > 0 for v in pertinents.values()):
            continue
        classement = resultats.get(qid, [])
        for k in ks:
            scores[f"nDCG@{k}"].append(ndcg(classement, pertinents, k))
        scores[f"Recall@{k_rappel}"].append(rappel(classement, pertinents, k_rappel))
    return {m: float(np.mean(v)) if v else 0.0 for m, v in scores.items()}
