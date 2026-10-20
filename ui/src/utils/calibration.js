/**
 * calibration.js — les règles d'affichage de la CALIBRATION DU MOIS (étape 20 du plan, 13/10/2026 ; bloc
 * « Calibration du mois » d'Historique moteur, CalibrationPanel). JavaScript pur, sans Vue ni navigateur : les
 * tests du serveur le rejouent (server/test/calibrationEcran.test.mjs) sur les vraies réponses de la route.
 *
 * Rien n'est calculé ici : le serveur a réglé les pronostics gelés, compté chaque tranche, et le juge de
 * l'étape 16 a rendu ses verdicts (GET /api/predictions/calibration, src/data/calibration.js). L'écran met en
 * forme, en langage simple, et dit ce qui manque au lieu d'un tiret : « trop peu de matchs », « aucun
 * pronostic dans cette tranche », « pas de cote de clôture gratuite pour ce marché ».
 *
 * Les couleurs : aucun vert (ce n'est pas une value) ; rouge pour un écart prouvé (le moteur promet trop, ou
 * pas assez) et pour une valeur de clôture prouvée négative ; ambre pour « trop peu de matchs » ; le reste
 * sans ton.
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MOINS = '−';
/** Un nombre signé, une décimale, le vrai signe moins ; zéro s'écrit « +0,0 ». */
const signe1 = (x) => {
  const r = Math.round(x * 10) / 10;
  return `${r < 0 ? MOINS : '+'}${fr(Math.abs(r), 1)}`;
};

export const NOMS_DES_MOIS = Object.freeze(['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']);

/** « 2026-10 » → « octobre 2026 ». */
export function moisDit(mois) {
  if (typeof mois !== 'string' || !/^\d{4}-\d{2}$/.test(mois)) return 'mois inconnu';
  return `${NOMS_DES_MOIS[Number(mois.slice(5, 7)) - 1] ?? mois} ${mois.slice(0, 4)}`;
}

/** Un compte : « 1 234 », 0 pour une valeur absente. */
export const nombreDit = (n) => (fini(n) ? fr(n) : '0');
/** « 1 pronostic », « 2 pronostics » (0 et 1 au singulier, comme en français). */
export const pluriel = (n, un, plusieurs) => `${nombreDit(n)} ${fini(n) && Math.abs(n) >= 2 ? plusieurs : un}`;
/** Une fraction (0,612) en pourcentage, une décimale : « 61,2 % » ; ce qui manque, dit. */
export const pourcentDit = (fraction, manque = 'pas mesuré') => (fini(fraction) ? `${fr(fraction * 100, 1)} %` : manque);
/** Un écart (fraction) en points : « +2,3 points », « −0,4 point » (pluriel à partir de 2). */
export function ecartDit(fraction, manque = 'pas mesuré') {
  if (!fini(fraction)) return manque;
  const points = Math.round(fraction * 1000) / 10;
  return `${signe1(points)} point${Math.abs(points) >= 2 ? 's' : ''}`;
}
/** Une valeur de clôture déjà en pourcentage (0,8) : « +0,8 % ». */
export const cloturePourcentDit = (pct, manque = 'pas mesurée') => (fini(pct) ? `${signe1(pct)} %` : manque);
/** Une perte log (quatre décimales). */
export const perteLogDite = (x, manque = 'pas mesurée') => (fini(x) ? fr(x, 4) : manque);

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
/** Un instant, jour et heure de Paris : « 01/11/2026 à 06 h 10 ». */
export function jourHeureDit(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'date inconnue';
  return `${FORMAT_JOUR.format(t)} à ${FORMAT_HEURE.format(t).replace(':', ' h ')}`;
}
/** Un jour « AAAA-MM-JJ » : « 01/11/2026 » (sans passer par Date : le fuseau décalerait). */
export const jourDit = (jour) => (typeof jour === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : 'jour inconnu');

// ------------------------------------------------------------ le juge

/** Les verdicts du juge pour une case de calibration (src/data/calibration.js, jugerLaCase). */
export const VERDICTS = Object.freeze({
  'trop-haut': Object.freeze({ texte: 'annonce trop haut', ton: 'is-danger', phrase: 'Le réalisé est sous l’annoncé, au-delà de ce que le hasard explique : le moteur promet trop.' }),
  'trop-bas': Object.freeze({ texte: 'annonce trop bas', ton: 'is-danger', phrase: 'Le réalisé est au-dessus de l’annoncé, au-delà de ce que le hasard explique : le moteur annonce moins que ce qui arrive.' }),
  'dans-le-hasard': Object.freeze({ texte: 'dans le hasard', ton: '', phrase: 'L’écart peut venir du hasard : rien à corriger d’après ce mois.' }),
  'trop-peu': Object.freeze({ texte: 'trop peu de matchs', ton: 'is-warning', phrase: 'Pas assez de matchs pour juger : l’écart affiché ne prouve rien.' })
});

/** Ce que l'écran dit d'un juge : { texte, ton, detail }. Une case maigre : « trop peu de matchs (N sur 200) ». */
export function jugeDit(juge) {
  if (!juge) return { texte: 'pas jugé', ton: '', detail: 'Pas de verdict pour cette case.' };
  const v = VERDICTS[juge.verdict] ?? { texte: String(juge.verdict), ton: '', phrase: '' };
  if (juge.verdict === 'trop-peu') {
    return { texte: `trop peu de matchs (${nombreDit(juge.matchs)} sur ${nombreDit(juge.minimum)})`, ton: v.ton, detail: `${v.phrase} Le juge demande au moins ${nombreDit(juge.minimum)} matchs.` };
  }
  const f = Array.isArray(juge.fourchette) && juge.fourchette.every(fini) ? `[${signe1(juge.fourchette[0] * 100)} ; ${signe1(juge.fourchette[1] * 100)}] points` : null;
  const morceaux = [
    f ? `écart ${ecartDit(juge.ecart)}, fourchette ${f}` : null,
    pluriel(juge.matchs, 'match', 'matchs'),
    fini(juge.variantes) ? `${pluriel(juge.variantes, 'case jugée', 'cases jugées')} ensemble` : null
  ].filter(Boolean);
  return { texte: v.texte, ton: v.ton, detail: `${v.phrase} ${morceaux.join(', ').replace(/^./, (c) => c.toUpperCase())}.` };
}

/** Le verdict sur une valeur de clôture moyenne : jamais vert ; rouge seulement s'il est prouvé négatif. */
export function jugeDeClotureDit(juge) {
  if (!juge || juge.verdict === 'trop-peu') return { texte: `trop peu de matchs (${nombreDit(juge?.matchs ?? 0)} sur ${nombreDit(juge?.minimum ?? 200)})`, ton: 'is-warning' };
  if (juge.verdict === 'positive') return { texte: 'au-dessus de zéro, au-delà du hasard', ton: '' };
  if (juge.verdict === 'negative') return { texte: 'au-dessous de zéro, au-delà du hasard', ton: 'is-danger' };
  return { texte: 'dans le hasard', ton: '' };
}

// ------------------------------------------------------------ l'état du mois

/**
 * Pourquoi un mois n'a pas de bilan (étape 24 : la route ne calcule plus rien, elle dit pourquoi) :
 * `preparation.etat` vient de la route. Rien à dire sans raison connue.
 */
const SANS_BILAN = Object.freeze({
  absente: 'Pas encore mesuré : le bilan du mois en cours est préparé chaque nuit par l’actualisation (et à chaque clic sur « Actualiser »). Le prochain passage l’écrira, la page le lira sans rien calculer.',
  illisible: 'Le bilan préparé du mois en cours ne se lit pas pour l’instant (fichier illisible) : la prochaine actualisation le refera.',
  ancienne: 'Le bilan préparé date d’un autre mois ou d’une autre forme du calcul : la prochaine actualisation le refera.',
  'a-figer': 'Mois terminé, pas encore figé : il le sera à la prochaine actualisation (le 1er du mois suivant, à partir de 6 h). Rien n’est calculé ici en attendant.',
  'sans-pronostic': 'Aucun pronostic du moteur n’est gelé ce mois-là (le journal du gel n’existait pas encore) : rien à mesurer.'
});

/** La phrase qui explique l'absence de bilan, ou null (un bilan est là, ou la route n'a rien dit). */
export const raisonDeLAbsence = (preparation) => SANS_BILAN[preparation?.etat] ?? null;

/**
 * Ce que l'écran dit de l'état d'un bilan : figé (jamais recalculé), en cours (préparé par l'actualisation, figé
 * plus tard), fini mais pas encore figé, ou absent. Sans bilan : « pas encore mesuré » quand la route a répondu
 * (elle donne toujours le prochain gel — la raison est dite à côté, raisonDeLAbsence), « pas encore lu » quand
 * rien n'est arrivé. { titre, ton, phrase }.
 */
export function etatDuBilan(bilan, { prochainGel = null, version = null } = {}) {
  if (!bilan) {
    return prochainGel
      ? { titre: 'Pas encore mesuré', ton: 'is-warning', phrase: 'Pas de bilan pour ce mois pour l’instant : la raison est juste en dessous. Rien n’est calculé à l’ouverture de la page.' }
      : { titre: 'Pas encore lu', ton: 'is-warning', phrase: 'Le bilan n’a pas encore été lu.' };
  }
  if (bilan.fige) {
    const autre = fini(version) && fini(bilan.version) && bilan.version !== version ? ` Calculé avec la version ${bilan.version} du calcul (l’appli est à la ${version}) : à comparer avec prudence.` : '';
    return { titre: 'Figé', ton: '', phrase: `Figé le ${jourHeureDit(bilan.figeLe)} : ce bilan ne sera jamais recalculé.${autre}` };
  }
  const calcule = `préparé par l’actualisation le ${jourHeureDit(bilan.calculeLe)}, matchs jusqu’au ${jourDit(bilan.jusquAu)}`;
  if (bilan.enCours) {
    const gel = prochainGel?.le ? ` Il sera figé le ${jourDit(prochainGel.le)} à partir de ${prochainGel.heure ?? 6} h, à la première actualisation.` : '';
    return { titre: 'En cours', ton: 'is-info', phrase: `Mois en cours, ${calcule} : il bouge encore.${gel}` };
  }
  return { titre: 'Pas encore figé', ton: 'is-warning', phrase: `Mois terminé, ${calcule}. Il sera figé à la prochaine actualisation (le 1er du mois suivant, à partir de 6 h).` };
}

/** Les mois du sélecteur : « octobre 2026 · en cours », « septembre 2026 · figé le 01/10 ». */
export function optionsDesMois(disponibles = []) {
  const etat = (d) => (d.etat === 'fige' ? `figé${d.figeLe ? ` le ${jourHeureDit(d.figeLe).slice(0, 5)}` : ''}` : d.etat === 'en-cours' ? 'en cours' : 'pas encore figé');
  return disponibles.map((d) => ({ value: d.mois, label: `${moisDit(d.mois)} · ${etat(d)}` }));
}

// ------------------------------------------------------------ les marchés et la courbe

/** Les marchés du sélecteur de la courbe : « Tous les marchés », puis chacun avec son nombre de pronostics réglés. */
export function optionsDesMarches(vue) {
  const g = vue?.global;
  return [
    { value: 'tous', label: `Tous les marchés (${pluriel(g?.pronostics ?? 0, 'pronostic', 'pronostics')})` },
    ...(vue?.parMarche ?? []).map((m) => ({ value: m.marche, label: `${m.libelle} (${pluriel(m.pronostics, 'pronostic', 'pronostics')})` }))
  ];
}

/** La case d'un marché (« tous » : la case de tous les marchés), ou null. */
export function casDuMarche(vue, marche = 'tous') {
  if (!vue) return null;
  if (marche === 'tous') return vue.global ?? null;
  return (vue.parMarche ?? []).find((m) => m.marche === marche) ?? null;
}

/** Les points de CalibrationChart (le composant du banc d'essai) : une tranche qui a des pronostics, son nombre de matchs. */
export function pointsDeLaCourbe(cas) {
  return (cas?.tranches ?? []).filter((t) => t.pronostics > 0 && fini(t.annonce) && fini(t.realise)).map((t) => ({ de: t.de, annonce: t.annonce, realise: t.realise, n: t.matchs }));
}

/** « 60 – 70 % ». */
export const trancheDite = (t) => `${fr(t.de * 100)} – ${fr(Math.min(1, t.a) * 100)} %`;

/** Les dix tranches fixes (les dixièmes de bench/metrics.js, comparées à celles du serveur par un test) : la structure reste sans bilan. */
export const DIX_TRANCHES = Object.freeze(Array.from({ length: 10 }, (_, i) => Object.freeze({ de: i / 10, a: i === 9 ? 1.01 : (i + 1) / 10 })));

/** Les DIX tranches, toujours les dix : une tranche vide le dit (« aucun pronostic »), jamais un tiret — même sans bilan (mois pas encore mesuré, serveur muet). */
export function lignesDesTranches(cas) {
  const tranches = cas?.tranches ?? DIX_TRANCHES.map((t) => ({ de: t.de, a: t.a, pronostics: 0, matchs: 0 }));
  return tranches.map((t) => ({
    cle: String(t.de),
    tranche: trancheDite(t),
    vide: !t.pronostics,
    pronostics: nombreDit(t.pronostics),
    matchs: nombreDit(t.matchs),
    annonce: t.pronostics ? pourcentDit(t.annonce) : 'aucun pronostic',
    realise: t.pronostics ? pourcentDit(t.realise) : '',
    ecart: t.pronostics ? ecartDit(t.ecart) : '',
    juge: jugeDit(t.juge)
  }));
}

/** Le tableau des marchés : une ligne par marché réglé, puis le total (Σ pronostics ; les matchs comptés une fois). */
export function tableauDesMarches(vue) {
  const ligne = (m, libelle) => ({
    cle: m.marche ?? 'total',
    libelle,
    pronostics: nombreDit(m.pronostics),
    matchs: nombreDit(m.matchs),
    annonce: pourcentDit(m.annonce),
    realise: pourcentDit(m.realise),
    ecart: ecartDit(m.ecart),
    perteLog: perteLogDite(m.perteLog),
    juge: jugeDit(m.juge)
  });
  return { lignes: (vue?.parMarche ?? []).map((m) => ligne(m, m.libelle)), total: vue?.global ? ligne(vue.global, 'Σ Tous les marchés') : null };
}

/**
 * Le tableau des championnats : une ligne par championnat (`ordonner` : les favoris d'abord, cf. favoritesStore),
 * le total (Σ des pronostics et des matchs ; annoncé, réalisé et écart de tous les pronostics — jamais une
 * somme de pourcentages) et la moyenne par championnat (⌀).
 */
export function tableauDesChampionnats(vue, { ordonner = (x) => x } = {}) {
  const ligues = ordonner([...(vue?.parChampionnat ?? [])]);
  const ligne = (l) => ({
    cle: l.league,
    league: l.league,
    pronostics: nombreDit(l.pronostics),
    matchs: nombreDit(l.matchs),
    annonce: pourcentDit(l.annonce),
    realise: pourcentDit(l.realise),
    ecart: ecartDit(l.ecart),
    juge: jugeDit(l.juge)
  });
  const n = ligues.length;
  const somme = (cle) => ligues.reduce((t, l) => t + (fini(l[cle]) ? l[cle] : 0), 0);
  const moyenne = (cle) => {
    const xs = ligues.map((l) => l[cle]).filter(fini);
    return xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null;
  };
  const g = vue?.global ?? {};
  return {
    lignes: ligues.map(ligne),
    total: { pronostics: nombreDit(somme('pronostics')), matchs: nombreDit(somme('matchs')), annonce: pourcentDit(g.annonce), realise: pourcentDit(g.realise), ecart: ecartDit(g.ecart), juge: jugeDit(g.juge) },
    moyenne: n
      ? { pronostics: fr(somme('pronostics') / n, 1), matchs: fr(somme('matchs') / n, 1), annonce: pourcentDit(moyenne('annonce')), realise: pourcentDit(moyenne('realise')), ecart: ecartDit(moyenne('ecart')) }
      : { pronostics: '0', matchs: '0', annonce: 'pas mesuré', realise: 'pas mesuré', ecart: 'pas mesuré' },
    championnats: n
  };
}

// ------------------------------------------------------------ la valeur de clôture

/** La phrase obligatoire (correction 4 du cahier) : seuls trois marchés ont des cotes de clôture gratuites. */
export const SEULS_TROIS_MARCHES =
  'Seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » ont des cotes de clôture gratuites : les autres pronostics (buts d’une équipe, résultat + total buts, corners, tirs) n’ont pas de valeur de clôture.';

/** La valeur de clôture des pronostics d'une lecture. */
export function clotureDesPronosticsDite(c) {
  if (!c) return null;
  return {
    valeur: cloturePourcentDit(c.moyenne),
    sur: c.mesures ? `sur ${pluriel(c.mesures, 'pronostic mesuré', 'pronostics mesurés')} (${nombreDit(c.positifs)} au-dessus de zéro)` : 'aucun pronostic mesuré',
    eligibles: `${pluriel(c.eligibles, 'pronostic', 'pronostics')} des trois marchés cotés, ${nombreDit(c.mesures)} mesurés`,
    sansCote: c.sansCoteGratuite ? `${pluriel(c.sansCoteGratuite, 'pronostic', 'pronostics')} sans cote de clôture gratuite (buts d’une équipe, résultat + total buts, corners, tirs).` : null,
    approx: c.approx ? `${pluriel(c.approx, 'mesure', 'mesures')} au prix d’ouverture (pas de relevé avant le gel).` : null,
    parMarche: (c.parMarche ?? []).map((m) => ({ cle: m.marche, libelle: m.libelle, valeur: cloturePourcentDit(m.moyenne), mesures: nombreDit(m.mesures), positifs: nombreDit(m.positifs) })),
    raisons: (c.raisons ?? []).map((r) => ({ cle: r.raison, texte: `${r.libelle} : ${nombreDit(r.n)}` })),
    juge: jugeDeClotureDit(c.juge)
  };
}

/** La valeur de clôture de VOS paris du mois (simples, à la cote prise). */
export function clotureDesParisDite(c) {
  if (!c) return null;
  if (c.indisponible) return { valeur: 'pas mesurée', sur: c.indisponible, raisons: [], combines: null, aVenir: null, juge: jugeDeClotureDit(c.juge), indisponible: true };
  return {
    valeur: cloturePourcentDit(c.moyenne),
    sur: c.mesures ? `sur ${pluriel(c.mesures, 'pari simple mesuré', 'paris simples mesurés')} (${nombreDit(c.positifs)} au-dessus de zéro), ${pluriel(c.paris, 'pari simple', 'paris simples')} ce mois-là` : c.paris ? `aucun pari mesuré sur ${pluriel(c.paris, 'pari simple', 'paris simples')} ce mois-là` : 'aucun pari simple ce mois-là',
    combines: c.combines ? `${pluriel(c.combines, 'combiné', 'combinés')} non mesuré${c.combines >= 2 ? 's' : ''} : un combiné n’a pas de valeur de clôture d’ensemble.` : null,
    aVenir: c.aVenir ? `${pluriel(c.aVenir, 'pari', 'paris')} sur un match à venir : sa clôture n’est pas encore connue.` : null,
    raisons: (c.raisons ?? []).map((r) => ({ cle: r.raison, texte: `${r.libelle} : ${nombreDit(r.n)}` })),
    juge: jugeDeClotureDit(c.juge),
    indisponible: false
  };
}

// ------------------------------------------------------------ ce qui n'entre pas

/** Les pronostics gelés qui n'entrent pas dans une lecture, raison par raison, et ceux à venir. */
export function ecarteesDites(vue, pronostics) {
  const lignes = (vue?.ecartees ?? []).map((e) => ({ cle: e.raison, texte: e.libelle, n: nombreDit(e.n) }));
  const total = (vue?.ecartees ?? []).reduce((t, e) => t + e.n, 0);
  const aVenir = pronostics?.aVenir?.pronostics ?? 0;
  return {
    lignes,
    phrase: `${pluriel(pronostics?.geles ?? 0, 'pronostic gelé', 'pronostics gelés')} ce mois-là : ${pluriel(vue?.reglees ?? 0, 'réglé', 'réglés')}, ${pluriel(total, 'écarté', 'écartés')} (raisons ci-dessous), ${pluriel(aVenir, 'match à venir', 'matchs à venir')} pour ${nombreDit(pronostics?.aVenir?.matchs ?? 0)} rencontre${(pronostics?.aVenir?.matchs ?? 0) >= 2 ? 's' : ''}.`
  };
}

/** Les versions du moteur des pronostics du mois (étape 25) : « sans version : 6 132 ; n° 1 : 2 000 ». */
export function versionsDuMoteurDites(pronostics) {
  const v = pronostics?.versionsDuMoteur ?? [];
  if (!v.length) return 'aucun pronostic joué';
  return v.map((x) => `${x.version === null || x.version === undefined ? 'sans version' : `n° ${x.version}`} : ${nombreDit(x.pronostics)}`).join(' ; ');
}

// ------------------------------------------------------------ les mois précédents

/** Les mois figés, pour voir l'évolution : leurs chiffres clés, tels que figés. */
export function lignesDesMoisFiges(figes = []) {
  return figes.map((m) => ({
    cle: m.mois,
    mois: moisDit(m.mois),
    figeLe: jourHeureDit(m.figeLe),
    pronostics: nombreDit(m.pronostics),
    matchs: nombreDit(m.matchs),
    annonce: pourcentDit(m.annonce),
    realise: pourcentDit(m.realise),
    ecart: ecartDit(m.ecart),
    // Le résumé garde le verdict seul (sa fourchette est dans le bilan du mois) : le mot et son ton.
    juge: m.verdict ? { texte: VERDICTS[m.verdict]?.texte ?? String(m.verdict), ton: VERDICTS[m.verdict]?.ton ?? '' } : { texte: 'pas jugé', ton: '' },
    cloturePronostics: m.cloturePronostics?.mesures ? `${cloturePourcentDit(m.cloturePronostics.moyenne)} (${nombreDit(m.cloturePronostics.mesures)})` : 'aucun mesuré',
    clotureParis: m.clotureParis?.mesures ? `${cloturePourcentDit(m.clotureParis.moyenne)} (${nombreDit(m.clotureParis.mesures)})` : 'aucun mesuré',
    version: m.version
  }));
}
