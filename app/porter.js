// Racinisation de Porter, algorithme de 1980, celui qu'utilise NLTK côté
// Python. Traduction directe : le découpage doit être identique des deux
// côtés, sinon les index ne correspondent plus.

const voyelles = 'aeiou';

const estConsonne = (mot, i) => {
  const c = mot[i];
  if (voyelles.includes(c)) return false;
  if (c !== 'y') return true;
  return i === 0 ? true : !estConsonne(mot, i - 1);
};

const mesure = (tige) => {
  let n = 0;
  let i = 0;
  while (i < tige.length && estConsonne(tige, i)) i++;
  while (i < tige.length) {
    while (i < tige.length && !estConsonne(tige, i)) i++;
    if (i >= tige.length) break;
    n++;
    while (i < tige.length && estConsonne(tige, i)) i++;
  }
  return n;
};

const contientVoyelle = (tige) => {
  for (let i = 0; i < tige.length; i++) if (!estConsonne(tige, i)) return true;
  return false;
};

const doubleConsonneFinale = (mot) =>
  mot.length >= 2 && mot[mot.length - 1] === mot[mot.length - 2] &&
  estConsonne(mot, mot.length - 1);

const consonneVoyelleConsonne = (mot) => {
  if (mot.length < 3) return false;
  const i = mot.length - 1;
  if (!estConsonne(mot, i) || estConsonne(mot, i - 1) || !estConsonne(mot, i - 2)) return false;
  return !'wxy'.includes(mot[i]);
};

const remplace = (mot, fin, par, condition) => {
  if (!mot.endsWith(fin)) return null;
  const tige = mot.slice(0, mot.length - fin.length);
  if (condition && !condition(tige)) return null;
  return tige + par;
};

export function raciniser(mot) {
  if (mot.length <= 2) return mot;
  let m = mot;

  // étape 1a
  if (m.endsWith('sses')) m = m.slice(0, -2);
  else if (m.endsWith('ies')) m = m.slice(0, -2);
  else if (m.endsWith('ss')) { /* inchangé */ }
  else if (m.endsWith('s')) m = m.slice(0, -1);

  // étape 1b
  let suiteNecessaire = false;
  if (m.endsWith('eed')) {
    const tige = m.slice(0, -3);
    if (mesure(tige) > 0) m = tige + 'ee';
  } else if (m.endsWith('ed') && contientVoyelle(m.slice(0, -2))) {
    m = m.slice(0, -2);
    suiteNecessaire = true;
  } else if (m.endsWith('ing') && contientVoyelle(m.slice(0, -3))) {
    m = m.slice(0, -3);
    suiteNecessaire = true;
  }
  if (suiteNecessaire) {
    if (m.endsWith('at') || m.endsWith('bl') || m.endsWith('iz')) m += 'e';
    else if (doubleConsonneFinale(m) && !'lsz'.includes(m[m.length - 1])) m = m.slice(0, -1);
    else if (mesure(m) === 1 && consonneVoyelleConsonne(m)) m += 'e';
  }

  // étape 1c
  if (m.endsWith('y') && contientVoyelle(m.slice(0, -1))) m = m.slice(0, -1) + 'i';

  const paliers = [
    [['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
     ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'],
     ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'],
     ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
     ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble']],
    [['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
     ['ical', 'ic'], ['ful', ''], ['ness', '']],
  ];
  for (const palier of paliers) {
    for (const [fin, par] of palier) {
      const essai = remplace(m, fin, par, (tige) => mesure(tige) > 0);
      if (essai !== null) { m = essai; break; }
    }
  }

  // étape 4
  const suffixes = ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant',
                    'ement', 'ment', 'ent', 'ou', 'ism', 'ate', 'iti', 'ous',
                    'ive', 'ize'];
  for (const fin of suffixes) {
    if (!m.endsWith(fin)) continue;
    const tige = m.slice(0, m.length - fin.length);
    if (mesure(tige) > 1) { m = tige; }
    break;
  }
  if (m.endsWith('ion')) {
    const tige = m.slice(0, -3);
    if (mesure(tige) > 1 && (tige.endsWith('s') || tige.endsWith('t'))) m = tige;
  }

  // étape 5
  if (m.endsWith('e')) {
    const tige = m.slice(0, -1);
    const n = mesure(tige);
    if (n > 1 || (n === 1 && !consonneVoyelleConsonne(tige))) m = tige;
  }
  if (mesure(m) > 1 && doubleConsonneFinale(m) && m.endsWith('l')) m = m.slice(0, -1);

  return m;
}
