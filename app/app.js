// Interface seulement. Tout le calcul se passe dans travailleur.js.

const $ = (id) => document.getElementById(id);

// De vraies affirmations du jeu de developpement, avec leur preuve dans le
// corpus. Des affirmations inventees ne trouvent rien, et c'est normal : le
// corpus ne contient que ces 5 183 articles.
const EXEMPLES = [
  'ADAR1 binds to Dicer to cleave pre-miRNA.',
  '1/2000 in UK have abnormal PrP positivity.',
  'A total of 1,000 people in the UK are asymptomatic carriers of vCJD infection.',
];

const PIECES = [
  { cle: 'corpus', nom: 'Corpus, 5 183 articles', octets: 8_100_000 },
  { cle: 'selecteur', nom: 'Sélecteur de phrases', octets: 111_200_000 },
  { cle: 'classifieur', nom: 'Classifieur de verdict', octets: 82_800_000 },
];

const total = PIECES.reduce((somme, piece) => somme + piece.octets, 0);
const avancement = new Map(PIECES.map((piece) => [piece.cle, 0]));

const mo = (octets) => `${(octets / 1e6).toFixed(0)} Mo`;

const echapper = (texte) => texte.replace(/[&<>"]/g, (caractere) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[caractere]));

function dessinerPieces() {
  $('pieces').innerHTML = PIECES.map((piece) => `
    <div class="piece" id="piece-${piece.cle}">
      <span class="nom">${piece.nom}</span>
      <span class="poids" id="poids-${piece.cle}">0 / ${mo(piece.octets)}</span>
      <span class="rail"><i id="barre-${piece.cle}"></i></span>
    </div>`).join('');
}

function avancer(cle, part) {
  const piece = PIECES.find((p) => p.cle === cle);
  const borne = Math.max(0, Math.min(1, part));
  avancement.set(cle, borne);

  $(`barre-${cle}`).style.width = `${borne * 100}%`;
  $(`poids-${cle}`).textContent = `${mo(borne * piece.octets)} / ${mo(piece.octets)}`;
  if (borne >= 1) $(`piece-${cle}`).dataset.fini = 'oui';

  let cumul = 0;
  for (const p of PIECES) cumul += avancement.get(p.cle) * p.octets;
  const fraction = cumul / total;

  const circonference = 2 * Math.PI * 58;
  $('trait').style.strokeDashoffset = String(circonference * (1 - fraction));
  $('pourcentage').textContent = `${Math.round(fraction * 100)} %`;
}

function signalerReseau() {
  const enLigne = navigator.onLine;
  $('etat-reseau').dataset.actif = enLigne ? 'oui' : 'non';
  $('texte-reseau').textContent = enLigne ? 'En ligne' : 'Hors connexion';
}

function afficher(trouves, affirmation) {
  if (trouves.length === 0) {
    $('resultats').innerHTML =
      `<div class="rien">Rien dans le corpus ne tranche cette affirmation.</div>`;
    return;
  }

  const entete = `
    <p class="eyebrow">${trouves.length} article${trouves.length > 1 ? 's' : ''}</p>`;

  const cartes = trouves.map((trouve) => `
    <article class="article">
      <div class="haut">
        <h3>${echapper(trouve.titre)}</h3>
        <span class="verdict" data-type="${trouve.etiquette}">
          ${trouve.etiquette === 'SUPPORT' ? 'Étayée' : 'Contredite'} · ${Math.round(trouve.confiance * 100)} %
        </span>
      </div>
      <div class="citations">
        ${trouve.phrases.map((phrase) => `
          <div class="citation">
            <span class="rang">Phrase ${phrase.rang}</span>
            ${echapper(phrase.texte)}
          </div>`).join('')}
      </div>
    </article>`).join('');

  $('resultats').innerHTML = entete + cartes;
}

// ---------------------------------------------------------------- travailleur

const travailleur = new Worker('travailleur.js', { type: 'module' });
let affirmationEnCours = '';

travailleur.onmessage = ({ data }) => {
  if (data.type === 'progression') {
    avancer(data.piece, data.part);
  } else if (data.type === 'etape') {
    $('texte-travail').textContent = data.texte;
  } else if (data.type === 'pret') {
    $('chargement').hidden = true;
    $('interface').hidden = false;
    $('etat-modeles').dataset.actif = 'oui';
    $('texte-modeles').textContent = 'Prêt, hors connexion';
    $('affirmation').focus();
  } else if (data.type === 'resultat') {
    afficher(data.trouves, data.affirmation);
    $('travail').hidden = true;
    $('lancer').disabled = false;
  } else if (data.type === 'erreur') {
    $('travail').hidden = true;
    $('lancer').disabled = false;
    $('chargement').innerHTML =
      `<h2>Quelque chose a échoué</h2><p>${echapper(data.message)}</p>`;
    $('chargement').hidden = false;
  }
};

// -------------------------------------------------------------------- départ

window.addEventListener('online', signalerReseau);
window.addEventListener('offline', signalerReseau);
signalerReseau();
dessinerPieces();

$('etat-modeles').dataset.actif = 'attente';
$('texte-modeles').textContent = 'Chargement…';
travailleur.postMessage({ type: 'preparer' });

$('exemples').innerHTML = EXEMPLES
  .map((exemple) => `<button type="button">${echapper(exemple)}</button>`).join('');

$('exemples').addEventListener('click', (evenement) => {
  if (evenement.target.tagName !== 'BUTTON') return;
  $('affirmation').value = evenement.target.textContent.trim();
  $('formulaire').requestSubmit();
});

$('formulaire').addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  affirmationEnCours = $('affirmation').value.trim();
  if (!affirmationEnCours) return;

  $('lancer').disabled = true;
  $('resultats').innerHTML = '';
  $('travail').hidden = false;
  $('texte-travail').textContent = 'Recherche dans le corpus…';
  travailleur.postMessage({ type: 'verifier', affirmation: affirmationEnCours });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
