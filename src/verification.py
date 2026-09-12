"""Verification d'affirmations scientifiques par inference textuelle.

Pour chaque affirmation, on confronte chaque phrase des abstracts retrouves a
l'affirmation avec un modele d'inference textuelle. Les trois sorties du modele
correspondent directement aux etiquettes de SciFact :

    entailment     -> SUPPORT
    contradiction  -> CONTRADICT
    neutral        -> aucune preuve

Les phrases retenues SONT la citation : chaque decision renvoie aux phrases
exactes qui la fondent, dans l'abstract d'origine. C'est l'ancrage verifiable,
au sens litteral.

Aucun entrainement ici : le modele est pre-entraine sur MNLI, FEVER et ANLI.
"""

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Reglages:
    # Seuil au-dessus duquel une phrase est retenue comme justification.
    seuil_phrase: float = 0.5
    # Marge minimale entre la classe dominante et 'neutre' pour etiqueter.
    marge_etiquette: float = 0.0
    # Le code d'evaluation officiel plafonne a 3 phrases par abstract.
    max_phrases: int = 3
    # Nombre d'abstracts examines par affirmation.
    k_abstracts: int = 3


@dataclass
class Decision:
    abstract: str
    etiquette: str                    # SUPPORT ou CONTRADICT
    phrases: list[int] = field(default_factory=list)
    confiance: float = 0.0

    def citation(self, corpus: dict) -> list[str]:
        """Les phrases exactes qui fondent la decision."""
        doc = corpus[self.abstract]
        return [doc["abstract"][i] for i in self.phrases if i < len(doc["abstract"])]


def decider(probas: np.ndarray, reglages: Reglages) -> Decision | None:
    """Agrege les probabilites phrase par phrase en une decision d'abstract.

    `probas` a la forme (n_phrases, 3), colonnes [contradiction, neutre,
    entailment]. On retient la classe non neutre la plus forte, puis les
    phrases qui la portent.

    Rendre None signifie : cet abstract n'etaye rien. L'evaluateur officiel
    n'accepte pas de prediction NOINFO — on n'emet simplement rien.
    """
    if len(probas) == 0:
        return None

    contre, neutre, pour = probas[:, 0], probas[:, 1], probas[:, 2]
    score_pour, score_contre = float(pour.max()), float(contre.max())

    if max(score_pour, score_contre) < reglages.seuil_phrase:
        return None

    if score_pour >= score_contre:
        etiquette, scores = "SUPPORT", pour
    else:
        etiquette, scores = "CONTRADICT", contre

    if scores.max() - neutre[int(scores.argmax())] < reglages.marge_etiquette:
        return None

    retenues = np.where(scores >= reglages.seuil_phrase)[0]
    if len(retenues) == 0:
        retenues = np.array([int(scores.argmax())])
    # les plus convaincantes d'abord, puis remises dans l'ordre du texte
    retenues = retenues[np.argsort(-scores[retenues])][: reglages.max_phrases]

    return Decision(abstract="", etiquette=etiquette,
                    phrases=sorted(int(i) for i in retenues),
                    confiance=float(scores.max()))


def format_officiel(decisions: dict[int, dict[str, Decision]]) -> list[dict]:
    """Met les decisions au format attendu par verisci/evaluate/pipeline.py."""
    sortie = []
    for id_affirmation, par_abstract in decisions.items():
        preuve = {}
        for doc, d in par_abstract.items():
            if d is None:
                continue
            preuve[str(doc)] = {"label": d.etiquette, "sentences": d.phrases}
        sortie.append({"id": id_affirmation, "evidence": preuve})
    return sortie
