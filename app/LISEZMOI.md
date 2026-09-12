# L'application

Site statique. Aucun serveur applicatif, aucune dépendance à installer : il
suffit de servir ce dossier.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

Au premier chargement, 197 Mo de modèles et de corpus descendent une seule fois
et restent dans le cache du navigateur. Ensuite l'application fonctionne sans
réseau, y compris la recherche et les deux modèles.

## Le dossier

`index.html` la page, `styles.css` le système visuel, `app.js` la chaîne
complète, `bm25.js` et `porter.js` la recherche, `sw.js` le cache hors ligne.

`apercu.html` affiche l'interface avec des résultats figés, sans charger les
modèles. C'est la page à ouvrir pour travailler le visuel.

`modeles/` et `donnees/` ne sont pas versionnés, ils pèsent 197 Mo. Le notebook
`notebooks/export_navigateur.ipynb` les régénère.

## Le système visuel

Repris d'Abdusalam Academy, gamme or remplacée par une gamme bleue. Plus Jakarta
Sans en display, Inter en corps, fond `#f1f1ef`, encre `#08121b`, accent
`#1d6ae5`. Rayons, ombres et boutons identiques.
