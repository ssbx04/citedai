# Preuve

Vérification d'affirmations scientifiques sur **SciFact** : retrouver la preuve
dans la littérature, décider si l'affirmation est étayée ou contredite, et
**citer les phrases exactes** qui fondent la décision.

Deux parties. La **récupération**, mesurée contre le banc BEIR. La
**vérification**, mesurée contre le papier SciFact avec son code d'évaluation
officiel.

## Vérification — le système complet

| Système | phrase | abstract |
|---|---|---|
| Zéro-shot (FEVER), 2020 | 28,4 | 38,4 |
| ce système, zéro-shot | 26,6 | 35,3 |
| **ce système, affiné** | **40,1** | **49,2** |
| VeriSci (Wadden et al. 2020) | 42,6 | 48,5 |
| plafond de la récupération | — | 89,7 |

**Égalité statistique avec VeriSci** : 49,2 contre 48,5, intervalle de confiance
à 95 % [46,2 ; 56,6]. Le système **dépasse** VeriSci sur l'étiquetage seul
(53,6 contre 51,0) et reste en dessous sur la sélection de phrases (40,1 contre
42,6).

Détail et méthode : [`docs/rapport.md`](docs/rapport.md) · chiffres :
[`resultats/verification.json`](resultats/verification.json)

## Récupération

| Système | Publié | Mesuré | Écart |
|---|---|---|---|
| BM25 (BEIR 2021) | 0,6650 | 0,6756 | +0,0106 |
| BGE-large-en-v1.5 | 0,7461 | 0,7463 | **+0,0002** |
| GTE-large-en-v1.5 | 0,8243 | 0,8272 | +0,0029 |
| hybride BM25 + GTE | — | 0,8304 | non significatif (p = 0,31) |
| plafond du premier étage | — | 0,9987 | — |

nDCG@10, 300 requêtes de test, définition `trec_eval`.

**Ce que ça démontre** : un harnais validé par trois reproductions
indépendantes, dont un modèle de pointe à trois millièmes de son score publié.

**Ce que ça ne démontre pas** : aucun gain sur l'état de l'art en récupération.
La fusion lexicale et le reclassement par cross-encodeur échouent tous deux, et
le rapport explique pourquoi.

Chiffres bruts : [`resultats/scifact.json`](resultats/scifact.json)

## Ce qu'on apprend des deux échecs

**La fusion lexicale ne sert que si le dense est faible.** Avec BGE (0,7463),
fusionner BM25 apporte +0,012. Avec GTE (0,8272), elle n'apporte plus rien
— l'hybride gagne sur 17 requêtes, GTE seul sur 22. Le signal lexical est déjà
capté par le modèle fort.

**Un reclasseur n'aide que s'il classe mieux que le premier étage.**
`bge-reranker-v2-m3` classe autour de 0,73 sur cette tâche. Il fait donc gagner
+0,055 à BM25 (0,6756) et perdre 0,092 à l'hybride (0,8304), puisqu'il
réordonne intégralement et détruit l'ordre entrant. Le fusionner au lieu de le
substituer ne récupère rien : p = 0,995.

**La récupération est résolue, le classement ne l'est pas.** Un reclassement
parfait des 100 premiers atteindrait 0,9987. Les 17 points manquants existent ;
le reclasseur essayé ici ne les capte pas.

## Structure

```
src/lexical.py              BM25 Okapi en NumPy, réglages Anserini
src/verification.py         décision et citation à partir des passages retrouvés
eval/metriques.py           nDCG@k et Recall@k, définition trec_eval
eval/bm25_controle.py       point de contrôle : reproduit 0,665 ± 0,02
eval/plafond_verification.py  plafond imposé par la récupération, par profondeur
eval/significativite.py     bootstrap apparié
colab/scifact.ipynb         récupération : hybride et reclassement, sur GPU
colab/verification.ipynb    vérification en zéro-shot
colab/affinage_v2.ipynb     vérification affinée — les chiffres du rapport
resultats/scifact.json      mesures de récupération
resultats/verification.json mesures de vérification
docs/rapport.md             rapport complet
```

## Installation

```bash
python3 -m venv .venv
.venv/bin/pip install numpy nltk
```

## Usage

```bash
# données : distribution officielle BEIR
mkdir -p data && cd data
curl -LO https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/scifact.zip
unzip scifact.zip && cd ..

# point de contrôle — doit sortir 0,6756
.venv/bin/python eval/bm25_controle.py
```

La partie dense et le reclassement demandent un GPU : `colab/scifact.ipynb`
reproduit l'ensemble. Il épingle `transformers<5`, car `gte-large-en-v1.5`
charge un `modeling.py` maison incompatible avec transformers 5.

## Méthode

**Tout chiffre publié est reproduit avant d'être dépassé.** Trois points de
contrôle indépendants encadrent la chaîne. Sans eux, une erreur d'implémentation
se propage silencieusement — le harnais mesurerait alors sa propre erreur.

**Tout écart est testé.** Bootstrap apparié, 10 000 tirages, p bilatéral, plus
le décompte des requêtes gagnées et perdues, souvent plus parlant que le p.

**Les limites sont écrites.** Les paramètres de fusion sont réglés sur le jeu de
test, faute de jeu de développement dans SciFact ; les écarts étant non
significatifs, ce choix ne change aucune conclusion. Le rapport le dit.

## Sources

- Thakur et al., *BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of
  Information Retrieval Models*, NeurIPS 2021.
- `Alibaba-NLP/gte-large-en-v1.5`, `BAAI/bge-large-en-v1.5`,
  `BAAI/bge-reranker-v2-m3`.
- SciFact : Wadden et al., *Fact or Fiction: Verifying Scientific Claims*,
  EMNLP 2020. Licence CC BY-NC 2.0.
