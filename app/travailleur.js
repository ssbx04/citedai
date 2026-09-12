// Tout le calcul se fait ici : corpus, recherche, et les deux modeles. Le fil
// principal ne garde que l'affichage, sinon la page se fige pendant chaque
// inference — une quarantaine de passages par affirmation.

import { env, AutoTokenizer, AutoModelForSequenceClassification } from './biblio/transformers.js';
import { BM25, definirMotsVides } from './bm25.js';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = './modeles/';
// URL absolue : un chemin relatif serait resolu depuis transformers.js, qui
// est deja dans biblio/, et donnerait biblio/biblio/.
env.backends.onnx.wasm.wasmPaths = new URL('./biblio/', self.location.href).href;

const ETIQUETTES = { contradiction: 'CONTRADICT', entailment: 'SUPPORT', neutral: 'NOINFO' };

let corpus, reglages, index;
let selecteur, tokenizerSelecteur, classifieur, tokenizerClassifieur, versEtiquette;

const dire = (message) => self.postMessage(message);

function suivre(piece) {
  return (etat) => {
    if (etat.status === 'progress' && etat.total) {
      dire({ type: 'progression', piece, part: etat.loaded / etat.total });
    } else if (etat.status === 'done') {
      dire({ type: 'progression', piece, part: 1 });
    }
  };
}

async function preparer() {
  reglages = await (await fetch('donnees/reglages.json')).json();
  definirMotsVides(reglages.mots_vides);

  const reponse = await fetch('donnees/corpus.json');
  const lecteur = reponse.body.getReader();
  const morceaux = [];
  let recus = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    morceaux.push(value);
    recus += value.length;
    dire({ type: 'progression', piece: 'corpus', part: recus / 8_100_000 });
  }
  const octets = new Uint8Array(recus);
  let place = 0;
  for (const morceau of morceaux) {
    octets.set(morceau, place);
    place += morceau.length;
  }
  corpus = JSON.parse(new TextDecoder().decode(octets));
  dire({ type: 'progression', piece: 'corpus', part: 1 });

  [tokenizerSelecteur, selecteur] = await Promise.all([
    AutoTokenizer.from_pretrained('selecteur'),
    AutoModelForSequenceClassification.from_pretrained('selecteur', {
      dtype: 'q8', progress_callback: suivre('selecteur'),
    }),
  ]);

  [tokenizerClassifieur, classifieur] = await Promise.all([
    AutoTokenizer.from_pretrained('classifieur'),
    AutoModelForSequenceClassification.from_pretrained('classifieur', {
      dtype: 'q8', progress_callback: suivre('classifieur'),
    }),
  ]);

  versEtiquette = {};
  for (const [rang, nom] of Object.entries(classifieur.config.id2label)) {
    versEtiquette[Number(rang)] = ETIQUETTES[nom.toLowerCase()] ?? nom;
  }

  dire({ type: 'etape', texte: 'Construction de l\'index de recherche…' });
  index = new BM25(
    corpus.map((a) => `${a.titre} ${a.phrases.join(' ')}`),
    reglages.bm25.k1, reglages.bm25.b,
  );

  dire({ type: 'pret' });
}

function repartir(logits) {
  const valeurs = Array.from(logits);
  const haut = Math.max(...valeurs);
  const exposants = valeurs.map((v) => Math.exp(v - haut));
  const somme = exposants.reduce((a, b) => a + b, 0);
  return exposants.map((e) => e / somme);
}

async function noterPhrases(phrases, affirmation) {
  const entrees = tokenizerSelecteur(phrases, {
    text_pair: phrases.map(() => affirmation),
    padding: true, truncation: true, max_length: 256,
  });
  const { logits } = await selecteur(entrees);
  return logits.tolist().map((ligne) => repartir(ligne)[1]);
}

async function trancher(texte, affirmation) {
  const entrees = tokenizerClassifieur([texte], {
    text_pair: [affirmation], padding: true, truncation: true, max_length: 320,
  });
  const { logits } = await classifieur(entrees);
  const probabilites = repartir(logits.tolist()[0]);
  let meilleur = 0;
  for (let i = 1; i < probabilites.length; i++) {
    if (probabilites[i] > probabilites[meilleur]) meilleur = i;
  }
  return { etiquette: versEtiquette[meilleur], confiance: probabilites[meilleur] };
}

function choisirPhrases(notes) {
  let retenues = notes.map((n, i) => [n, i]).filter(([n]) => n >= reglages.seuil_phrases);
  if (retenues.length === 0) {
    const meilleure = notes.indexOf(Math.max(...notes));
    retenues = [[notes[meilleure], meilleure]];
  }
  retenues.sort((a, b) => b[0] - a[0]);
  return retenues.slice(0, reglages.nb_phrases_max).map(([, i]) => i).sort((a, b) => a - b);
}

async function verifier(affirmation) {
  dire({ type: 'etape', texte: 'Recherche dans les 5 183 articles…' });
  const candidats = index.meilleurs(affirmation, reglages.nb_articles);
  const trouves = [];

  for (let rang = 0; rang < candidats.length; rang++) {
    const article = corpus[candidats[rang]];
    dire({
      type: 'etape',
      texte: `Lecture de l'article ${rang + 1} sur ${candidats.length} : ${article.titre.slice(0, 60)}…`,
    });

    const notes = await noterPhrases(article.phrases, affirmation);
    const indices = choisirPhrases(notes);
    const texte = indices.map((i) => article.phrases[i]).join(' ');
    const { etiquette, confiance } = await trancher(texte, affirmation);

    if (etiquette !== 'NOINFO') {
      trouves.push({
        titre: article.titre,
        phrases: indices.map((i) => ({ rang: i + 1, texte: article.phrases[i].trim() })),
        etiquette,
        confiance,
      });
    }
  }
  dire({ type: 'resultat', trouves, affirmation });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'preparer') await preparer();
    else if (data.type === 'verifier') await verifier(data.affirmation);
  } catch (erreur) {
    dire({ type: 'erreur', message: String(erreur) });
  }
};
