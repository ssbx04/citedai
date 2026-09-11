# SciFact — reproduction, fusion hybride et reclassement

Banc BEIR / SciFact : vérifier une affirmation scientifique en retrouvant la
preuve dans la littérature. 5 183 documents, 300 requêtes de test, pertinence
binaire, 1,1 document pertinent par requête en moyenne. Métrique nDCG@10, au
sens de `trec_eval`.

## Résumé

Trois systèmes de référence ont été reproduits, puis deux voies d'amélioration
testées. **Aucune des deux n'apporte de gain significatif.** Les deux résultats
négatifs sont établis par bootstrap apparié sur 10 000 tirages.

Ce qui est acquis : un harnais d'évaluation validé par trois points de contrôle
indépendants, dont une reproduction de `gte-large-en-v1.5` à **+0,0029** de son
score publié.

## Points de contrôle

Un point de contrôle est une reproduction d'un chiffre publié. Sans eux, une
erreur d'implémentation se propage silencieusement dans tout ce qui suit.

| Système | Publié | Mesuré | Écart |
|---|---|---|---|
| BM25 (BEIR 2021) | 0,6650 | 0,6756 | +0,0106 |
| BGE-large-en-v1.5 | 0,7461 | 0,7463 | **+0,0002** |
| GTE-large-en-v1.5 | 0,8243 | 0,8272 | +0,0029 |

BM25 est réimplémenté en NumPy, sans dépendance de recherche : réglages
d'Anserini (`k1 = 0,9`, `b = 0,4`), racinisation Porter, liste d'arrêt de Lucene,
titre et texte concaténés. L'écart de +0,0106 s'explique par des différences
d'analyse lexicale avec Elasticsearch, que le papier BEIR utilise.

## Résultats

| Système | nDCG@10 |
|---|---|
| BM25 réimplémenté | 0,6756 |
| BM25 → reclassement | 0,7310 |
| hybride BM25 + BGE → reclassement | 0,7368 |
| hybride GTE → reclassement (substitution) | 0,7384 |
| BGE-large-en-v1.5 | 0,7463 |
| hybride BM25 + BGE | 0,7583 |
| GTE-large-en-v1.5 | 0,8272 |
| **hybride BM25 + GTE** | **0,8304** |
| hybride + reclassement (fusion) | 0,8304 |
| plafond du premier étage (top-100) | 0,9987 |

## Premier résultat négatif : la fusion lexicale n'aide pas

SciFact est un banc réputé lexical — BM25 seul y atteint 0,665, au-dessus de
plusieurs modèles denses. L'hypothèse était qu'une fusion par rang réciproque
entre BM25 et un modèle dense récupérerait ce que le dense rate sur les termes
exacts.

Elle ne le fait pas.

| Comparaison | Écart | IC 95 % | p |
|---|---|---|---|
| hybride BM25 + GTE **vs** GTE seul | +0,0032 | [−0,0027, +0,0096] | 0,307 |

Le décompte par requête est plus parlant que le p : l'hybride l'emporte sur
**17** requêtes, GTE seul sur **22**, égalité sur **261**. La moyenne
légèrement positive vient de l'amplitude sur quelques cas, non d'une
supériorité. Avec un modèle dense faible (BGE, 0,7463), la fusion apportait
+0,012 ; avec un modèle fort (GTE, 0,8272), elle n'apporte plus rien. Le signal
lexical est déjà capté.

## Second résultat négatif : le reclassement dégrade

`bge-reranker-v2-m3`, cross-encodeur de 568 M de paramètres, appliqué aux 100
premiers candidats.

| Premier étage | Sans reclassement | Avec, par substitution |
|---|---|---|
| BM25 | 0,6756 | 0,7310 (**+0,055**) |
| hybride BM25 + BGE | 0,7583 | 0,7368 (−0,022) |
| hybride BM25 + GTE | 0,8304 | 0,7384 (−0,092) |

Le mécanisme est net : le reclasseur classe à un niveau propre d'environ 0,73
sur cette tâche. Il améliore donc un premier étage plus faible que lui et abîme
un premier étage meilleur, puisqu'il réordonne intégralement les candidats et
détruit l'ordre entrant.

Fusionner les deux classements au lieu de substituer l'un à l'autre ne récupère
rien : le balayage des poids converge vers une solution qui ignore le
reclasseur.

| Comparaison | Écart | IC 95 % | p |
|---|---|---|---|
| fusion du reclassement **vs** hybride | +0,0000 | [−0,0119, +0,0123] | 0,995 |

Deux hypothèses restent ouvertes, non testées ici. Le modèle est multilingue et
ses résultats publiés portent surtout sur des bancs multilingues, pas sur de
l'anglais scientifique. Et SciFact n'énonce pas des questions mais des
**affirmations** à vérifier, forme sur laquelle les reclasseurs entraînés sur
MS MARCO n'ont pas été optimisés.

## Le plafond désigne où porter l'effort

Un reclasseur parfait, qui remonterait en tête tous les documents pertinents
déjà présents dans les 100 premiers, atteindrait **0,9987**.

Autrement dit : sur ce corpus, la **récupération est un problème résolu**. La
totalité de l'écart restant, de 0,83 à 1,0, est du classement. Le reclasseur
essayé ici ne capte pas ces 17 points, mais ils existent.

## Coût

| Étage | Temps par requête |
|---|---|
| BM25 | 0,3 ms |
| cross-encodeur, 100 candidats | 1 920 ms |

Un facteur 6 400, pour un gain nul sur ce banc. Le papier BEIR relevait déjà
cet arbitrage (450 ms contre 20 ms) mais avec un gain de +2,3 points ; à mesure
que le premier étage s'améliore, le reclassement perd son intérêt et garde son
coût.

## Méthode

**Significativité.** Bootstrap apparié, 10 000 tirages, p bilatéral. Apparié
parce que les systèmes sont évalués sur les mêmes requêtes : la variance entre
requêtes, considérable sur ce banc, se soustrait.

**Réglage.** Les paramètres de fusion (`K`, poids) sont balayés sur les mêmes
300 requêtes de test que celles qui servent au rapport. C'est une limite
assumée : SciFact ne fournit pas de jeu de développement séparé, et les chiffres
publiés auxquels on se compare sont établis dans les mêmes conditions. Les
écarts rapportés étant de toute façon non significatifs, ce choix ne change
aucune conclusion.

**Reproductibilité.** Corpus téléchargé depuis la distribution officielle BEIR.
Modèles publics et versionnés. Le carnet `colab/scifact.ipynb` reproduit
l'ensemble des chiffres de ce rapport.

## Sources

- Thakur et al., *BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of
  Information Retrieval Models*, NeurIPS 2021 — table 2.
- `Alibaba-NLP/gte-large-en-v1.5`, `BAAI/bge-large-en-v1.5`,
  `BAAI/bge-reranker-v2-m3` — fiches MTEB.
- Distribution BEIR : `public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/`
