/**
 * avantDeParier.js — LES MOTS DE L'ENCADRÉ « AVANT DE PARIER — À BLANC » (étape 38 du plan, lot 1b, 04/11/2026 ; conception §7).
 * Règle PURE de l'écran : aucun import, ni Vue, ni réseau, ni horloge.
 * -----------------------------------------------------------------------
 * Le serveur joint à l'analyse d'un match le bloc `combinaison` (server/src/data/combinaison/combinaisonRead.js) : la ligne
 * du pronostic du résultat rangée la nuit (ce qui manque, son origine, son heure — JAMAIS son étiquette), l'ancre de la cote
 * juste et les cotes de vos bookmakers sur CETTE analyse, ce que dit la note du banc, et les mots scellés. Ici, l'encadré :
 *   « Ce qui manque à ce pronostic : la cote juste ne vient ni de Pinnacle ni du palier 2 · cotes relevées il y a 26 h. »
 *     — ou « Rien ne manque à ce pronostic. La confiance du moteur n'est pas encore mesurée. » ;
 *   « Calculé sur les données telles qu'elles étaient le 04/11 à 00 h 31 (pronostic de la nuit). » ;
 *   « Sur ce marché, rien ne s'ajoute aux cotes (mesuré sur 30 158 matchs, 2019-2023). » ;
 *   « Seuil de value de 2 % : mesuré pour une cote juste Pinnacle (555 paris, 2019-2023). Pour ce match (palier 3) : jamais
 *     mesuré. » ;
 *   « Chez Unibet : jamais mesuré chez ce bookmaker (marge 11 à 15 %). » (vos bookmakers, décision de Pierre du 03/11) — sauf
 *     celui que la mise conseillée de l'étape 39 nomme déjà (jamais deux fois la même mention) ; « Aucune cote de vos
 *     bookmakers relevée pour ce match. » quand c'est le cas ;
 *   au pied : « À blanc : rien de tout cela ne change le pourcentage ni le conseil. »
 * Jamais « sûr », jamais une jauge, jamais une value sans mesure, jamais un seuil « conseillé », jamais la mise (elle est dite
 * au-dessus, par l'étape 39, et n'est ni répétée ni contredite ici).
 * -----------------------------------------------------------------------
 */

/** Les mots fixes de secours (les mêmes que le serveur : reglagesCombinaison.MOTS ; un test compare). */
export const MOTS_DE_L_ENCADRE = Object.freeze({
  titre: 'Avant de parier — à blanc',
  sousTitre: 'Pour le pronostic du résultat (1 / N / 2)',
  rienNeManque: 'Rien ne manque à ce pronostic. La confiance du moteur n’est pas encore mesurée.',
  pied: 'À blanc : rien de tout cela ne change le pourcentage ni le conseil.',
  seuilPinnacle: 'Seuil de value de 2 % : mesuré pour une cote juste Pinnacle (555 paris, 2019-2023).',
  seuilJamais: 'jamais mesuré',
  livreJamais: 'jamais mesuré chez ce bookmaker (marge 11 à 15 %)',
  rienNeSAjoute: 'Sur ce marché, rien ne s’ajoute aux cotes'
});

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const majuscule = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const finDePhrase = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);

/** « le 04/11 à 00 h 31 » (heure de Paris), ou null. */
export function heureDite(iso) {
  const t = Date.parse(String(iso ?? ''));
  if (!fini(t)) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }).formatToParts(new Date(t)).map((p) => [p.type, p.value])
  );
  return `le ${parts.day}/${parts.month} à ${parts.hour} h ${parts.minute}`;
}

/** L'origine du pronostic gelé, en mots. */
export const ORIGINES = Object.freeze({ nuit: 'pronostic de la nuit', avance: 'analyse du jour', 'coup-d-envoi': 'analyse au coup d’envoi', inconnue: 'pronostic gelé' });

/**
 * Ce que l'encadré dit de l'ancre de la cote juste de CETTE analyse, après la phrase du seuil. Pinnacle : la même cote juste
 * que la mesure — rien de plus (le bookmaker du pari compte aussi : la mise conseillée dit « jamais mesuré chez ce bookmaker »
 * pour un bookmaker français ; l'encadré ne dit jamais l'inverse).
 */
export const ANCRES = Object.freeze({
  pinnacle: 'Pour ce match (cote juste Pinnacle) : la même cote juste que la mesure.',
  palier2: 'Pour ce match (palier 2) : jamais mesuré.',
  palier3: 'Pour ce match (palier 3) : jamais mesuré.',
  repli: 'Pour ce match (moyenne de repli, sans bookmaker de référence) : aucune value n’est lue.',
  'sans-cote': 'Pour ce match (aucune cote) : aucune value n’est lue.'
});

/** La ligne « ce qui manque » d'un pronostic rangé : les manques (degré ≥ 1) d'abord, puis les explications (la fraîcheur). */
export function phraseDesManques(manques, mots = MOTS_DE_L_ENCADRE) {
  const liste = Array.isArray(manques) ? manques.filter((m) => m && typeof m.phrase === 'string' && m.phrase) : [];
  const vrais = liste.filter((m) => !m.explication).map((m) => m.phrase);
  const explications = liste.filter((m) => m.explication).map((m) => m.phrase);
  if (vrais.length) return `Ce qui manque à ce pronostic : ${[...vrais, ...explications].join(' · ')}.`;
  return explications.length ? `${mots.rienNeManque} ${finDePhrase(majuscule(explications.join(' · ')))}` : mots.rienNeManque;
}

/** La phrase du banc sur ce marché (la note) : « rien ne s'ajoute aux cotes » seulement après un verdict. */
export function phraseDuBanc(banc, mots = MOTS_DE_L_ENCADRE) {
  if (!banc || !banc.verdict) return 'Ce que les statistiques ajoutent aux cotes sur ce marché : pas encore mesuré.';
  const sur = fini(banc.lignes) ? ` (mesuré sur ${banc.lignes.toLocaleString('fr-FR')} matchs${banc.periode ? `, ${banc.periode}` : ''})` : '';
  if (banc.verdict === 'pas-prouve' || banc.verdict === 'moins-bon') return `${mots.rienNeSAjoute}${sur}.`;
  if (banc.verdict === 'retenu') return `Sur ce marché, les statistiques ajoutent quelque chose aux cotes au banc${sur} : mesuré, pas dans le pourcentage.`;
  if (banc.verdict === 'non-jugeable-ici') return 'Ce que les statistiques ajoutent aux cotes sur ce marché : non jugeable ici.';
  return 'Ce que les statistiques ajoutent aux cotes sur ce marché : pas encore mesuré.';
}

/**
 * Les bookmakers de Pierre déjà nommés par la mise conseillée de l'étape 39 (sa raison « chez … : jamais mesuré chez ce
 * bookmaker ») : leurs clés, pour ne jamais redire la même mention.
 */
export function livresDejaDits(result, livres) {
  const raisons = Array.isArray(result?.mise?.raisons) ? result.mise.raisons : [];
  const francaise = raisons.filter((r) => r?.code === 'livre-francais');
  if (!francaise.length) return new Set();
  const dits = new Set();
  const cleDuConseil = result?.staking?.bookmaker ?? null;
  for (const l of livres ?? []) {
    if (l.cle && l.cle === cleDuConseil) dits.add(l.cle);
    for (const r of francaise) if (typeof r.texte === 'string' && r.texte.toLowerCase().startsWith(`chez ${String(l.titre ?? '').toLowerCase()}`)) dits.add(l.cle);
  }
  return dits;
}

/**
 * L'ENCADRÉ : { titre, sousTitre, etat, lignes: [{ cle, texte }], pied }. `combinaison` : le bloc du serveur (ou null :
 * l'analyse n'en porte pas) ; `result` : l'analyse (pour ne pas redire la mention de la mise conseillée).
 */
export function encadreAvantDeParier({ combinaison = null, result = null } = {}) {
  const mots = { ...MOTS_DE_L_ENCADRE, ...(combinaison?.mots ?? {}) };
  const lignes = [];
  const etat = combinaison?.etat ?? 'illisible';
  // 1. Ce qui manque à ce pronostic (la ligne rangée la nuit).
  if (etat === 'pret' && combinaison.pronostic) {
    const p = combinaison.pronostic;
    lignes.push({ cle: 'manque', texte: phraseDesManques(p.manques, mots) });
    const quand = heureDite(p.recordedAt);
    const origine = ORIGINES[p.origine] ?? ORIGINES.inconnue;
    lignes.push({ cle: 'quand', texte: `Calculé sur les données telles qu’elles étaient ${quand ?? 'à une heure inconnue'} (${origine}${p.calculeApres ? ', rangé la nuit suivante' : ''}).` });
  } else if (etat === 'pas-encore-calcule') {
    const texte =
      combinaison?.raison === 'nuit-en-cours'
        ? 'Ce qui manque à ce pronostic : en cours de calcul cette nuit, revenez après la passe.'
        : combinaison?.raison === 'match-pas-encore-range'
          ? 'Ce qui manque à ce pronostic : pas encore calculé pour ce match, la prochaine passe de nuit le fera.'
          : 'Ce qui manque à ce pronostic : pas encore calculé, la première passe de nuit le fera.';
    lignes.push({ cle: 'manque', texte });
  } else if (etat === 'clubs-inconnus') {
    lignes.push({ cle: 'manque', texte: 'Ce qui manque à ce pronostic : ce match n’a pas ses deux identifiants FotMob, rien n’est gardé à blanc pour lui.' });
  } else {
    lignes.push({ cle: 'manque', texte: 'Ce qui manque à ce pronostic : lecture impossible pour l’instant (l’analyse n’en dépend pas).' });
  }
  if (combinaison) {
    // 2. Ce que dit le banc sur ce marché.
    lignes.push({ cle: 'banc', texte: phraseDuBanc(combinaison.banc, mots) });
    // 3. Le seuil de value, pour CETTE analyse.
    const ancre = combinaison.seuil?.ancre;
    lignes.push({ cle: 'seuil', texte: ANCRES[ancre] ? `${mots.seuilPinnacle} ${ANCRES[ancre]}` : mots.seuilPinnacle });
    // 4. Vos bookmakers : la mention de Pierre (sauf celle déjà dite sous la mise conseillée) ; aucune cote relevée.
    const dePierre = Array.isArray(combinaison.livres?.dePierre) ? combinaison.livres.dePierre : [];
    const dits = livresDejaDits(result, dePierre);
    for (const l of dePierre) if (!dits.has(l.cle)) lignes.push({ cle: `livre-${l.cle}`, texte: `Chez ${l.titre} : ${mots.livreJamais}.` });
    if (combinaison.livres?.relevees === 0) lignes.push({ cle: 'aucune-cote', texte: 'Aucune cote de vos bookmakers relevée pour ce match.' });
  }
  return { titre: mots.titre, sousTitre: mots.sousTitre ?? MOTS_DE_L_ENCADRE.sousTitre, etat, lignes, pied: mots.pied };
}
