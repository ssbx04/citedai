# citedai

Ce dépôt contient un système qui vérifie des affirmations scientifiques. On lui
donne une phrase du genre "l'insuline régule la glycémie", il cherche dans un
corpus de 5183 articles biomédicaux, et il répond si l'affirmation est étayée ou
contredite, en citant les phrases exactes sur lesquelles il s'appuie. Le jeu de
données est SciFact, publié par AllenAI en 2020, et l'évaluation utilise leur
propre code pour que les chiffres soient comparables aux leurs.

Ce travail prolonge un projet de traitement du langage que j'avais commencé en
2025 sur la classification de textes.

## Où j'en suis

Sur la partie recherche documentaire, le système atteint 0,83 de nDCG@10. Le
point important n'est pas ce chiffre mais le fait que j'ai d'abord reproduit
trois systèmes publiés pour vérifier que ma chaîne de mesure était juste : BM25
à 0,6756 contre 0,665 annoncé, BGE-large à 0,7463 contre 0,7461, et
GTE-large-en-v1.5 à 0,8272 contre 0,8243. Sans ces trois contrôles, une erreur
d'implémentation aurait pu passer inaperçue et fausser tout le reste.

J'ai ensuite essayé deux façons d'améliorer la recherche, et aucune des deux n'a
marché. Fusionner BM25 avec le modèle dense ne donne rien quand ce dernier est
déjà bon, et le reclassement par cross-encodeur dégrade même le résultat. J'ai
testé les deux avec un bootstrap apparié plutôt que de me fier à la moyenne.

Sur la vérification, le système obtient 49,2 de F1 au niveau abstract. VeriSci,
le système du papier original, obtient 48,5. L'intervalle de confiance à 95 %
va de 46,2 à 56,6, donc les deux se valent statistiquement. Avec seulement 300
affirmations dans le jeu de développement, on ne peut pas conclure mieux.

Le détail est plus parlant que le total. Sur l'étiquetage seul je fais 53,6
contre 51,0 pour eux, sur la sélection des phrases justificatives je fais 40,1
contre 42,6. Autrement dit je trouve mieux les bons articles et je cite moins
bien les bonnes phrases.

## Comment c'est construit

La recherche se fait en deux temps. BM25, que j'ai réécrit en NumPy avec les
réglages d'Anserini, ramène les documents contenant les termes exacts. Un modèle
d'embeddings ramène ceux qui parlent de la même chose avec d'autres mots. Les
deux listes sont fusionnées par rang réciproque.

La vérification reprend l'architecture du papier : un premier modèle note chaque
phrase des articles retrouvés pour dire si elle justifie l'affirmation, un
second lit les phrases retenues et décide entre étayé, contredit et sans
information. Le second part de poids déjà entraînés sur de l'inférence textuelle,
dont les trois sorties correspondent exactement aux trois étiquettes de SciFact.

Pour le sélecteur de phrases j'ai comparé SciBERT et DeBERTa-v3-base. SciBERT
gagne, ce qui confirme ce que dit le papier : sur du texte scientifique un
modèle de domaine de 2019 bat un modèle généraliste plus récent.

## Deux erreurs que j'ai faites

Je les note parce qu'elles ont été trouvées par les contrôles intermédiaires, pas
par le résultat final, et que c'est exactement pour ça que je les avais mis.

La première : mon classifieur d'étiquette recevait, pour les articles sans
preuve, les trois premières phrases du résumé. Il a donc appris que trois
premières phrases voulait dire "sans information", ce qui lui donnait 94,4 %
d'exactitude en isolé alors que le papier annonce 75,7. Ce chiffre ne mesurait
rien, et la chaîne complète ne donnait que 48,0.

La deuxième : en corrigeant, j'ai écarté les articles où le sélecteur ne
proposait aucune phrase. Il ne restait plus que 4 exemples "sans information" sur
477, donc le classifieur ne pouvait plus apprendre à filtrer. La solution a été
de garder la phrase la mieux notée quand aucune ne passe le seuil, et de laisser
le classifieur décider.

## Méthode

Le jeu de développement ne sert qu'à rapporter les résultats. Tous les réglages,
seuils et choix de modèle, se font sur 15 % du jeu d'entraînement mis de côté.
Le papier règle son seuil sur le jeu de développement, ce qu'il indique en
annexe, donc la comparaison m'est un peu défavorable.

Le jeu de test de SciFact a ses étiquettes cachées, il faut passer par leur
classement en ligne pour l'utiliser. Tous les chiffres cités, les miens comme
ceux du papier, sont donc sur le jeu de développement.

Avant de construire quoi que ce soit, j'ai mesuré ce que la recherche permet au
mieux. Les trois premiers articles retrouvés contiennent la bonne preuve dans
81,3 % des cas, ce qui plafonne le F1 à 89,7. Le papier perdait 24 points entre
son régime normal et un régime où on lui fournissait les bons articles, parce que
leur recherche était en TF-IDF. Ce coût a disparu, et tout se joue désormais dans
la vérification.

## Les notebooks

`notebooks/recherche.ipynb` fait la partie recherche documentaire, de BM25
jusqu'au reclassement.

`notebooks/verification.ipynb` fait la partie vérification, de l'entraînement
des deux modèles jusqu'aux chiffres finaux.

Les deux téléchargent leurs données tout seuls et tournent sur un GPU Colab.

## Sources

Wadden et al., Fact or Fiction: Verifying Scientific Claims, EMNLP 2020.

Thakur et al., BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of
Information Retrieval Models, NeurIPS 2021.

Code d'évaluation : github.com/allenai/scifact
