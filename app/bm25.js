// BM25 Okapi, même implémentation que côté Python : réglages d'Anserini,
// racinisation Porter, liste d'arrêt de Lucene. Les deux doivent classer
// pareil, sinon l'application ne montre pas ce que les chiffres annoncent.

import { raciniser } from './porter.js';

let motsVides = new Set();
const cache = new Map();

export function definirMotsVides(liste) {
  motsVides = new Set(liste);
}

export function decouper(texte) {
  const mots = [];
  for (const brut of texte.toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (motsVides.has(brut)) continue;
    let racine = cache.get(brut);
    if (racine === undefined) {
      racine = raciniser(brut);
      cache.set(brut, racine);
    }
    mots.push(racine);
  }
  return mots;
}

export class BM25 {
  constructor(textes, k1 = 0.9, b = 0.4) {
    this.k1 = k1;
    this.b = b;
    this.nbDocuments = textes.length;
    this.longueurs = new Float32Array(this.nbDocuments);
    this.index = new Map();

    const brut = new Map();
    for (let i = 0; i < textes.length; i++) {
      const mots = decouper(textes[i]);
      this.longueurs[i] = mots.length;
      const frequences = new Map();
      for (const mot of mots) frequences.set(mot, (frequences.get(mot) || 0) + 1);
      for (const [mot, combien] of frequences) {
        if (!brut.has(mot)) brut.set(mot, []);
        brut.get(mot).push(i, combien);
      }
    }

    let somme = 0;
    for (const l of this.longueurs) somme += l;
    this.longueurMoyenne = somme / this.nbDocuments;

    for (const [mot, plat] of brut) {
      const combien = plat.length / 2;
      const ou = new Int32Array(combien);
      const frequences = new Float32Array(combien);
      for (let j = 0; j < combien; j++) {
        ou[j] = plat[2 * j];
        frequences[j] = plat[2 * j + 1];
      }
      const rarete = Math.log(1 + (this.nbDocuments - combien + 0.5) / (combien + 0.5));
      this.index.set(mot, { ou, frequences, rarete });
    }
  }

  noter(question) {
    const notes = new Float32Array(this.nbDocuments);
    for (const mot of decouper(question)) {
      const entree = this.index.get(mot);
      if (!entree) continue;
      const { ou, frequences, rarete } = entree;
      for (let j = 0; j < ou.length; j++) {
        const i = ou[j];
        const longueur = 1 - this.b + this.b * this.longueurs[i] / this.longueurMoyenne;
        const f = frequences[j];
        notes[i] += rarete * f * (this.k1 + 1) / (f + this.k1 * longueur);
      }
    }
    return notes;
  }

  meilleurs(question, combien) {
    const notes = this.noter(question);
    const rangs = Array.from(notes.keys());
    rangs.sort((a, b) => notes[b] - notes[a]);
    return rangs.slice(0, combien).filter((i) => notes[i] > 0);
  }
}
