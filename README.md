# citedai

Vérifie une affirmation scientifique contre 5 183 articles biomédicaux : trouve
les articles qui la tranchent, décide si elle est étayée ou contredite, et cite
les phrases exactes sur lesquelles il s'appuie. Tout tourne dans le navigateur,
sans réseau.

Le jeu de données est SciFact (AllenAI, 2020). Les scores sont calculés par le
script d'évaluation d'AllenAI, pas par le mien : les chiffres ci-dessous et
ceux des papiers sortent donc du même code. Ce travail prolonge un projet de
traitement du langage commencé en 2025...

## Résultats

Jeu de développement, 300 affirmations, F1 abstract avec étiquette et
justification.

| | |
|---|---|
| cette app, modèle embarqué | 37,7 |
| même chaîne, modèle serveur | 49,5 |
| VeriSci, Wadden et al. 2020 | 48,5 |
| MultiVerS, état de l'art | 72,5 |

Trois systèmes de référence ont été reproduits avant toute tentative
d'amélioration : BM25 à 0,6756 contre 0,665 publié, BGE-large à 0,7463 contre
0,7461, GTE-large à 0,8272 contre 0,8243. Deux voies testées ensuite n'ont rien
donné, et les deux sont rejetées par bootstrap apparié : fusionner BM25 avec un
modèle dense déjà fort, et reclasser par cross-encodeur.

Réduire le modèle pour qu'il tienne dans un navigateur coûte 11,8 points.

## Comment ça marche

BM25 ramène trois articles. Un premier modèle note chaque phrase pour dire si
elle justifie l'affirmation. Un second lit les phrases retenues et choisit entre
étayé, contredit et sans information.

Le sélecteur est un SciBERT, le classifieur un DistilRoBERTa parti de poids
d'inférence textuelle. Les deux tournent en ONNX quantifié, 197 Mo au total,
téléchargés une fois puis gardés par le navigateur.

## Lancer

```bash
cd app && python3 -m http.server 8000
```

`apercu.html` montre l'interface avec des résultats figés, sans charger les
modèles.

Les modèles et le corpus ne sont pas dans le dépôt, ils pèsent 221 Mo. Ils
vivent dans la release `v1` et `outils/recuperer-assets.sh` les récupère.

## Le dépôt

```
app/                l'application
notebooks/          recherche, vérification, export vers le navigateur
outils/             récupération des assets
```

Les réglages se font sur une part du jeu d'entraînement mise de côté, jamais
sur le jeu de développement qui sert à rapporter. Le jeu de test de SciFact a
ses étiquettes cachées, donc tous les chiffres cités, les miens comme ceux des
papiers, sont sur le développement.

## Sources

Wadden et al., *Fact or Fiction: Verifying Scientific Claims*, EMNLP 2020.
Wadden et al., *MultiVerS*, Findings of NAACL 2022.
Thakur et al., *BEIR*, NeurIPS 2021.
Code d'évaluation : github.com/allenai/scifact
