import {
  env, AutoTokenizer, AutoModelForSequenceClassification,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

import { BM25, definirMotsVides } from './bm25.js';

env.allowLocalModels = true;   // faux par defaut dans un navigateur
env.allowRemoteModels = false;
env.localModelPath = './modeles/';

const $ = (id) => document.getElementById(id);

const ETIQUETTES = { contradiction: 'CONTRADICT', entailment: 'SUPPORT', neutral: 'NOINFO' };

const EXEMPLES = [
  'Aspirin reduces the risk of colorectal cancer.',
  'Vitamin D supplementation prevents respiratory infections.',
  'Obesity is unrelated to insulin resistance.',
];

const PIECES = [
  { cle: 'corpus', nom: 'Corpus, 5 183 articles', octets: 8_100_000 },
  { cle: 'selecteur', nom: 'Sélecteur de phrases', octets: 111_200_000 },
  { cle: 'classifieur', nom: 'Classifieur de verdict', octets: 82_800_000 },
];

const total = PIECES.reduce((s, p) => s + p.octets, 0);
const avancement = new Map(PIECES.map((p) => [p.cle, 0]));

const mo = (octets) => `${(octets / 1e6).toFixed(0)} Mo`;

function dessinerPieces() {
  $('pieces').innerHTML = PIECES.map((p) => `
    <div class="piece" id="piece-${p.cle}">
      <span class="nom">${p.nom}</span>
      <span class="poids" id="poids-${p.cle}">0 / ${mo(p.octets)}</span>
      <span class="rail"><i id="barre-${p.cle}"></i></span>
    </div>`).join('');
}

function avancer(cle, fraction) {
  const piece = PIECES.find((p) => p.cle === cle);
  const borne = Math.max(0, Math.min(1, fraction));
  avancement.set(cle, borne);

  $(`barre-${cle}`).style.width = `${borne * 100}%`;
  $(`poids-${cle}`).textContent = `${mo(borne * piece.octets)} / ${mo(piece.octets)}`;
  if (borne >= 1) $(`piece-${cle}`).dataset.fini = 'oui';

  let cumul = 0;
  for (const p of PIECES) cumul += avancement.get(p.cle) * p.octets;
  const part = cumul / total;

  const circonference = 2 * Math.PI * 58;
  $('trait').style.strokeDashoffset = String(circonference * (1 - part));
  $('pourcentage').textContent = `${Math.round(part * 100)} %`;
}

function suivre(cle) {
  return (etat) => {
    if (etat.status === 'progress' && etat.total) avancer(cle, etat.loaded / etat.total);
    if (etat.status === 'done') avancer(cle, 1);
  };
}

function signalerReseau() {
  const enLigne = navigator.onLine;
  $('etat-reseau').dataset.actif = enLigne ? 'oui' : 'non';
  $('texte-reseau').textContent = enLigne ? 'En ligne' : 'Hors connexion';
}

// ---------------------------------------------------------------- chargement

let corpus, reglages, index, selecteur, tokenizerSelecteur, classifieur, tokenizerClassifieur;
let versEtiquette;

async function preparer() {
  window.addEventListener('online', signalerReseau);
  window.addEventListener('offline', signalerReseau);
  signalerReseau();
  dessinerPieces();

  $('etat-modeles').dataset.actif = 'attente';
  $('texte-modeles').textContent = 'Chargement…';

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
    avancer('corpus', recus / 8_100_000);
  }
  const octets = new Uint8Array(recus);
  let place = 0;
  for (const morceau of morceaux) {
    octets.set(morceau, place);
    place += morceau.length;
  }
  corpus = JSON.parse(new TextDecoder().decode(octets));
  avancer('corpus', 1);

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

  index = new BM25(
    corpus.map((a) => `${a.titre} ${a.phrases.join(' ')}`),
    reglages.bm25.k1, reglages.bm25.b,
  );

  $('chargement').hidden = true;
  $('interface').hidden = false;
  $('etat-modeles').dataset.actif = 'oui';
  $('texte-modeles').textContent = 'Prêt, hors connexion';
  $('affirmation').focus();
}

// ------------------------------------------------------------------ décision

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
  const brut = logits.tolist();
  return brut.map((ligne) => repartir(ligne)[1]);
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
  const candidats = index.meilleurs(affirmation, reglages.nb_articles);
  const trouves = [];

  for (let rang = 0; rang < candidats.length; rang++) {
    const article = corpus[candidats[rang]];
    $('texte-travail').textContent =
      `Lecture de l'article ${rang + 1} sur ${candidats.length}…`;

    const notes = await noterPhrases(article.phrases, affirmation);
    const indices = choisirPhrases(notes);
    const texte = indices.map((i) => article.phrases[i]).join(' ');
    const { etiquette, confiance } = await trancher(texte, affirmation);
    if (etiquette !== 'NOINFO') {
      trouves.push({ article, indices, etiquette, confiance });
    }
  }
  return trouves;
}

// ------------------------------------------------------------------ affichage

const echapper = (t) => t.replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function afficher(trouves, affirmation) {
  if (trouves.length === 0) {
    $('resultats').innerHTML = `
      <div class="rien">
        <strong>Aucun article ne tranche cette affirmation</strong>
        Le corpus a été parcouru, mais rien n'y étaye ni ne contredit ce que tu as
        écrit. C'est une réponse, pas un échec : le système se tait plutôt que
        d'inventer une source.
      </div>`;
    return;
  }

  const mot = trouves.length === 1 ? 'article' : 'articles';
  const entete = `
    <div class="entete-resultats">
      <p class="eyebrow">${trouves.length} ${mot} ${trouves.length === 1 ? 'tranche' : 'tranchent'} la question</p>
      <p>Affirmation vérifiée : « ${echapper(affirmation)} »</p>
    </div>`;

  const cartes = trouves.map(({ article, indices, etiquette, confiance }) => `
    <article class="article">
      <div class="haut">
        <h3>${echapper(article.titre)}</h3>
        <span class="verdict" data-type="${etiquette}">
          ${etiquette === 'SUPPORT' ? 'Étayée' : 'Contredite'} · ${Math.round(confiance * 100)} %
        </span>
      </div>
      <div class="citations">
        ${indices.map((i) => `
          <div class="citation">
            <span class="rang">Phrase ${i + 1}</span>
            ${echapper(article.phrases[i].trim())}
          </div>`).join('')}
      </div>
    </article>`).join('');

  $('resultats').innerHTML = entete + cartes;
}

// -------------------------------------------------------------------- départ

$('exemples').innerHTML = EXEMPLES
  .map((e) => `<button type="button">${echapper(e)}</button>`).join('');

$('exemples').addEventListener('click', (evenement) => {
  if (evenement.target.tagName !== 'BUTTON') return;
  $('affirmation').value = evenement.target.textContent.trim();
  $('formulaire').requestSubmit();
});

$('formulaire').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const affirmation = $('affirmation').value.trim();
  if (!affirmation) return;

  $('lancer').disabled = true;
  $('resultats').innerHTML = '';
  $('travail').hidden = false;
  $('texte-travail').textContent = 'Recherche dans le corpus…';

  try {
    afficher(await verifier(affirmation), affirmation);
  } finally {
    $('travail').hidden = true;
    $('lancer').disabled = false;
  }
});

preparer().catch((erreur) => {
  console.error(erreur);
  $('chargement').innerHTML = `
    <h2>Le chargement a échoué</h2>
    <p>${echapper(String(erreur))}</p>`;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
