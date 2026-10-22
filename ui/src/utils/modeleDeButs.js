/**
 * modeleDeButs.js — les mots d'écran du MODÈLE DE BUTS UNIQUE (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * Pur : ni Vue, ni navigateur — rejoué tel quel par server/test/modeleDeButsEcran.test.mjs.
 *
 * Tout est LU dans ce que le serveur a calculé : l'analyse d'un match (`result.modeleDeButs`, que le moteur pose
 * SEULEMENT quand la clé `modeleDeButs` est dans les réglages en service) et la ligne du Repérage
 * (`butsProvenance`, même règle). Sans elles, chaque fonction rend null : pendant l'essai à blanc de la candidate,
 * la clé est absente de la config en service et AUCUN écran de match ne change.
 *
 * Les mots des régimes (`court`, `phrase`) viennent du serveur (PROVENANCES de server/src/core/engine/motsDuModeleDeButs.js, hors empreinte) ;
 * ici, on dit le VRAI fournisseur de chaque morceau (règle de Pierre du 03/10/2026, « le vrai endroit des données ») :
 * les bookmakers de la cote 1N2, la source du plus/moins 2,5 et l'heure de son relevé, le magasin FotMob pour les
 * xG et les buts. Une cote absente est DITE, jamais un tiret. Pas de jargon : « calé sur la cote », jamais
 * « ancrage ». Les nombres à la française (virgule, vrai signe moins).
 * -----------------------------------------------------------------------
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const virgule = (x, d = 1) => Number(x).toFixed(d).replace('.', ',');
const majuscule = (t) => (t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}` : t);
const nombreFr = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** « A », « A et B », « A, B et C ». */
export function listeFr(liste) {
  const l = (liste ?? []).filter(Boolean).map(String);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} et ${l.at(-1)}`;
}

/** Les régimes du modèle qui ont des cotes, et ceux qui lisent des xG. */
const avecCotes = (code) => typeof code === 'string' && code.startsWith('cotes-');
const avecXg = (code) => code === 'xg-seuls' || (typeof code === 'string' && code.endsWith('-xg'));

/**
 * La cote 1N2 qui cale le modèle, par ses bookmakers : « cote 1N2 Pinnacle » (les bookmakers de référence) ; sans eux,
 * la moyenne des cotes relevées, nommées (« cote 1N2 moyenne de Bet365 et Unibet », au plus trois noms) ; sinon leur
 * nombre.
 */
function coteDuResultat({ livres, titres, bookmakers }) {
  if (Array.isArray(livres) && livres.length) return `cote 1N2 ${listeFr(livres)}`;
  const noms = Array.isArray(titres) ? titres.filter(Boolean) : [];
  if (noms.length === 1) return `cote 1N2 ${noms[0]}`;
  if (noms.length > 1) {
    const montres = noms.length > 3 ? [...noms.slice(0, 3), `${noms.length - 3} autre${noms.length - 3 > 1 ? 's' : ''}`] : noms;
    return `cote 1N2 moyenne de ${listeFr(montres)}`;
  }
  if (fini(bookmakers) && bookmakers > 1) return `cote 1N2 moyenne de ${bookmakers} bookmakers relevés`;
  if (fini(bookmakers) && bookmakers === 1) return 'cote 1N2 d’un bookmaker relevé';
  return 'cote 1N2 des bookmakers relevés';
}

/**
 * La PROVENANCE des pourcentages de buts d'un match, à partir de son régime : `p` = { code, court, phrase,
 * plusMoins: { source, releveAt } | null, livres (les bookmakers de référence du 1N2) | null, titres (les cotes
 * relevées, quand aucun bookmaker de référence ne cote le match), bookmakers (leur nombre), calculeLe (l'heure du
 * calcul), ligueSource (« défaut » : les moyennes par défaut du moteur) }. Rend null sans régime ; sinon ce que dit la pastille de provenance
 * (ProvenanceChip) : { code, court, phrase, source, releveLe, action, vieuxApresHeures, manque, detail }.
 *   - source : « Moteur CôteMaster · cote 1N2 Pinnacle + plus/moins 2,5 football-data (moyenne du marché) + xG FotMob » ;
 *   - releveLe / action : l'heure du relevé du plus/moins (ambre au-delà de 24 h), sinon l'heure du calcul ;
 *   - manque : la cote absente, dite (« aucune cote plus/moins relevée pour ce match »), ou null.
 */
export function provenanceDuRegime(p) {
  const code = p?.code;
  if (typeof code !== 'string' || !code) return null;
  const cotes = avecCotes(code);
  const plusMoins = cotes && p.plusMoins ? p.plusMoins : null;
  // Des moyennes de championnat que le magasin ne connaît pas assez : les valeurs par défaut du moteur, dites telles quelles.
  const parDefaut = p.ligueSource === 'défaut';
  const statistique =
    code === 'moyennes-seules' ? (parDefaut ? 'moyennes par défaut du moteur (championnat inconnu du magasin)' : 'moyennes du championnat (magasin FotMob)') : avecXg(code) ? 'xG FotMob' : 'buts FotMob';
  const morceaux = [];
  if (cotes) morceaux.push(coteDuResultat(p));
  if (plusMoins) morceaux.push(`plus/moins 2,5 ${plusMoins.source ?? 'source non indiquée'}`);
  if (parDefaut && code !== 'moyennes-seules') morceaux.push('moyennes par défaut du moteur');
  morceaux.push(statistique);
  let manque = null;
  if (!cotes) manque = code === 'moyennes-seules' ? 'aucune cote, clubs inconnus du magasin · 1N2 : ancien modèle statistique' : 'aucune cote pour ce match · 1N2 : ancien modèle statistique';
  else if (!plusMoins) manque = 'aucune cote plus/moins relevée pour ce match';
  const phrase = typeof p.phrase === 'string' && p.phrase ? p.phrase : null;
  return {
    code,
    court: p.court ?? code,
    phrase,
    source: `Moteur CôteMaster · ${morceaux.join(' + ')}`,
    releveLe: plusMoins ? (plusMoins.releveAt ?? null) : (p.calculeLe ?? null),
    action: plusMoins ? 'plus/moins relevé' : 'calculé',
    vieuxApresHeures: plusMoins ? 24 : null,
    manque,
    detail: phrase ? `${majuscule(phrase)}.` : null
  };
}

/** La provenance des pourcentages de buts d'une ANALYSE (GET /api/analysis/match/:id) ; null sans le modèle de buts. */
export function provenanceDesButs(result) {
  const m = result?.modeleDeButs;
  if (!m?.provenance?.code) return null;
  const surCotes = result?.prediction?.source === 'cotes';
  return provenanceDuRegime({
    ...m.provenance,
    plusMoins: m.plusMoins ?? null,
    poids: m.poids ?? null,
    livres: surCotes ? (result.prediction.referenceBooks ?? null) : null,
    titres: surCotes ? (result?.market?.byBookmaker ?? []).map((b) => b?.title ?? b?.key ?? null).filter(Boolean) : null,
    bookmakers: result?.market?.bookmakersCount ?? null,
    calculeLe: result?.comparateur?.calculeLe ?? null,
    ligueSource: m.statistiques?.ligue?.source ?? null
  });
}

/**
 * La bulle de la colonne 2,5 du Repérage (plus ou moins de 2,5 buts), selon le régime du match : quand le moteur part
 * de la cote plus/moins, un petit écart avec le marché est attendu ; sur la cote 1N2 seule, l'écart est une vraie
 * information. null sans régime, ou sans cote (pas d'écart à lire).
 */
export function bulleDuDeuxCinq(p) {
  const code = p?.code;
  if (!avecCotes(code)) return null;
  const stats = avecXg(code) ? 'xG' : 'buts';
  // La part des statistiques dans le total, telle que le moteur l'a appliquée à CE match (`poids.wT` du mélange).
  const part = fini(p.poids?.wT) ? Math.round(p.poids.wT * 100) : null;
  if (p.plusMoins) {
    return {
      titre: 'Écart sur le 2,5',
      texte: `Le moteur part ici de la cote plus/moins 2,5 relevée chez ${p.plusMoins.source ?? 'une source non indiquée'} ; les ${stats} des deux équipes ne comptent ${part !== null ? `que pour ${part} %` : 'que pour une petite part'} dans le total de buts. Un petit écart avec la colonne Marché est donc attendu : il ne dit presque rien.`
    };
  }
  return {
    titre: 'Écart sur le 2,5',
    texte: `Aucune cote plus/moins relevée pour ce match : le moteur part de la cote 1N2 et le total de buts vient ${part !== null ? `pour ${part} %` : 'en partie'} des ${stats} des deux équipes. L’écart avec la colonne Marché est ici une vraie information.`
  };
}

/** « +18 % », « −9 % », « 0 % » : l'écart d'une force à la moyenne du championnat (1 = moyenne). */
export function ecartALaMoyenne(x) {
  if (!fini(x)) return 'non calculé';
  const p = Math.round((x - 1) * 100);
  return p > 0 ? `+${p} %` : p < 0 ? `−${-p} %` : '0 %';
}

function phraseDeForce(x, { verbe, aussi }) {
  if (!fini(x)) return 'non calculé';
  const p = Math.round((x - 1) * 100);
  if (p === 0) return `${verbe} ${aussi}`;
  return `${verbe} ${Math.abs(p)} % de ${p > 0 ? 'plus' : 'moins'} qu’une équipe moyenne de son championnat`;
}

/**
 * Le bloc « Ce que disent les xG » de la carte du score : par équipe, son attaque et sa défense face à une équipe
 * moyenne de son championnat, et le nombre de ses matchs connus. Titre « Ce que disent les buts » quand le
 * modèle est passé aux buts (trop peu d'xG connus pour l'un des deux clubs, décidé club par club) ; une équipe inconnue
 * du magasin le dit. null sans le modèle de buts.
 */
export function forcesDites(result) {
  const m = result?.modeleDeButs;
  const st = m?.statistiques;
  if (!m?.provenance?.code || !st) return null;
  const code = m.provenance.code;
  const xg = avecXg(code);
  const verbeAttaque = xg ? 'crée' : 'marque';
  // Le championnat lui-même inconnu du magasin : les moyennes par défaut du moteur, dites telles quelles.
  const parDefaut = st.ligue?.source === 'défaut';
  const equipe = (cote) => {
    const f = st.forces?.[cote] ?? null;
    if (!f || !fini(f.matchs) || f.matchs <= 0) {
      const detail = parDefaut ? 'club inconnu du magasin : les moyennes par défaut du moteur' : 'club inconnu du magasin : la moyenne de son championnat';
      return {
        cle: cote,
        connue: false,
        attaque: { valeur: 'moyenne', detail },
        defense: { valeur: 'moyenne', detail },
        resume: parDefaut ? 'moyennes par défaut' : 'moyenne du championnat',
        matchs: 'aucun match connu',
        titre: `${majuscule(detail)}.`
      };
    }
    const avecXgCompte = xg && fini(f.matchsXg) && f.matchsXg < f.matchs ? `, dont ${nombreFr(f.matchsXg)} avec xG` : '';
    const attaque = { valeur: ecartALaMoyenne(f.attaque), detail: phraseDeForce(f.attaque, { verbe: verbeAttaque, aussi: 'autant qu’une équipe moyenne de son championnat' }) };
    const defense = { valeur: ecartALaMoyenne(f.defense), detail: phraseDeForce(f.defense, { verbe: 'concède', aussi: 'autant qu’une équipe moyenne de son championnat' }) };
    const matchs = `${nombreFr(f.matchs)} match${f.matchs > 1 ? 's' : ''} connu${f.matchs > 1 ? 's' : ''}${avecXgCompte}`;
    return {
      cle: cote,
      connue: true,
      attaque,
      defense,
      // À l'écran : « crée +18 % · concède −9 % » ; au survol, les deux phrases entières.
      resume: `${verbeAttaque} ${attaque.valeur === '0 %' ? 'autant' : attaque.valeur} · concède ${defense.valeur === '0 %' ? 'autant' : defense.valeur}`,
      matchs,
      titre: `${majuscule(attaque.detail)} ; ${defense.detail} ; ${matchs}.`
    };
  };
  const d = st.demarrage ?? null;
  const partLigue = d && fini(d.part) && d.part < 1 ? Math.round((1 - d.part) * 100) : 0;
  const titre = code === 'moyennes-seules' ? 'Ce que dit le championnat' : xg ? 'Ce que disent les xG' : 'Ce que disent les buts';
  return {
    titre,
    equipes: { home: equipe('home'), away: equipe('away') },
    note:
      code === 'moyennes-seules'
        ? parDefaut
          ? 'Aucun match de ces clubs ni de leur championnat au magasin FotMob : les moyennes par défaut du moteur.'
          : 'Aucun match de ces clubs au magasin FotMob : la moyenne de leur championnat.'
        : `Face à une équipe moyenne de son championnat, d’après ${xg ? 'les xG et les buts' : 'surtout les buts marqués et encaissés'} de ses matchs passés (magasin FotMob) : les plus récents comptent davantage.${xg ? '' : ' Trop peu d’xG connus pour l’une des deux équipes (moins de la moitié de ses matchs) : les buts comptent à leur place.'}`,
    demarrage:
      partLigue <= 0
        ? null
        : d.nMin === 0
          ? 'Aucun match connu pour l’une des deux équipes : côté statistiques, le total de buts suit encore entièrement la moyenne du championnat.'
          : `Peu de matchs connus pour l’une des deux équipes (${nombreFr(d.nMin)}) : côté statistiques, le total de buts s’appuie encore pour ${partLigue} % sur la moyenne du championnat.`
  };
}

/** « autre score : 1,2 % » — la part des scores hors de la grille affichée (une équipe à 9 buts ou plus), dite dès 0,5 %. */
export function autreScoreDit(score) {
  const x = score?.autreScore;
  if (!fini(x) || x < 0.005) return null;
  return `autre score : ${virgule(x * 100)} %`;
}

/**
 * La fiabilité du score du modèle de buts, mesurée au banc (2019-2023) ; « pas encore mesurée » sans mesure. `code` : le
 * régime du match — la mesure « avec cotes » ne compte que des matchs AVEC une cote plus/moins 2,5 : elle ne vaut pas
 * pour un match calé sur la cote 1N2 seule (le banc n'en avait que 2), qui est dit « pas encore mesuré ».
 */
export function fiabiliteDuModele(score, code = null) {
  const r = score?.reliability;
  if (!r) return { mesuree: false, texte: 'Fiabilité du score : pas encore mesurée.' };
  if (typeof code === 'string' && code.startsWith('cotes-1n2')) {
    return { mesuree: false, texte: 'Fiabilité du score : pas encore mesurée pour un match sans cote plus/moins relevée (le banc 2019-2023 n’en comptait que 2 sur 30 158).' };
  }
  const debut = String(r.since ?? '').slice(0, 4);
  const fin = String(r.until ?? '').slice(0, 4);
  const periode = debut && fin ? `${debut}-${fin}` : 'les matchs passés';
  const lieu = r.perimetre ? `, ${r.perimetre}${typeof code === 'string' && code.startsWith('cotes-plusmoins') ? ', matchs avec une cote plus/moins 2,5' : ''}` : '';
  const phrases = [
    `Mesurée sur ${periode}${lieu}, sans xG : sur ${nombreFr(r.matches)} matchs, le score annoncé a été le bon ${virgule(r.exact)} % du temps, et l’un des trois premiers ${virgule(r.top3)} % du temps.`
  ];
  if (fini(r.alwaysOneOne)) phrases.push(`Annoncer 1-1 à chaque match donnait ${virgule(r.alwaysOneOne)} %.`);
  if (r.band) phrases.push(`Quand le score favori est annoncé entre ${r.band.range[0]} et ${r.band.range[1] > 100 ? 100 : r.band.range[1]} %, il est tombé ${virgule(r.band.realized)} % du temps.`);
  return { mesuree: true, texte: phrases.join(' ') };
}

/** Le poids de la forme, avec le modèle de buts : la forme est un contexte, elle n'entre pas dans le calcul. */
export const NOTE_DE_LA_FORME =
  'Le score sort de la même grille que les marchés de buts, calée sur les cotes : la forme des cinq derniers matchs est montrée pour le contexte, elle n’entre pas dans le calcul.';

/** Sur le plus/moins 2,5 calé sur la cote du marché : d'où vient une value (page du match, verdict par marché). */
export const PHRASE_DE_LA_VALUE_DU_DEUX_CINQ =
  'Le moteur part ici de la cote plus/moins 2,5 relevée gratuitement : une value sur cette ligne ne vient que d’un écart entre votre bookmaker et ce marché.';

/** La ligne 2,5 du plus/moins est-elle calée sur une cote relevée pour ce match ? */
export const deuxCinqCale = (result) => Boolean(result?.modeleDeButs?.plusMoins);

/** Le modèle de buts unique dans les réglages en service, en mots (carte « Paramètres du moteur » de Réglages). */
export function etatDuModeleDansLesReglages(config) {
  if (config?.modeleDeButs) {
    return { actif: true, texte: 'Modèle de buts unique : activé — calé sur les cotes, ajusté par les xG (étape 27).' };
  }
  return { actif: false, texte: 'Modèle de buts unique : absent — ancien modèle de buts (son essai éventuel se lit dans la carte « Versions du moteur »).' };
}

/**
 * Le texte de la confirmation de « Réinitialiser les valeurs par défaut » quand le modèle de buts unique est en
 * service (les valeurs par défaut ne l'ont pas : la remise à zéro le retire) ; null sinon — la remise à zéro reste
 * alors celle d'avant, sans question.
 */
export function avertissementDeLaRemiseAZero(config) {
  if (!config?.modeleDeButs) return null;
  return (
    'Réinitialiser les valeurs par défaut ?\n\n' +
    'Cela retire le modèle de buts unique (étape 27) : les pourcentages de buts et le score reviendront à l’ancien modèle, qui fait moins bien sur les matchs passés.\n\n' +
    'Pour revenir en arrière ensuite : Réglages › Versions du moteur.'
  );
}
