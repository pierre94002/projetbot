/**
 * predicteurs.js — les règles d'affichage du tableau « CE QUI PRÉDIT / CE QUI TROMPE » (étape 31 du plan,
 * 22/10/2026 ; ce que l'étape 18 mesure : bench/statValue.js, GET /api/bench/stat-value). JavaScript pur, sans Vue ni
 * navigateur : les tests du serveur le rejouent (server/test/fichesEcran.test.mjs) sur les vraies réponses de la route.
 *
 * Rien n'est calculé ici : le serveur a coupé les matchs de chaque équipe en deux moitiés pour mesurer la fiabilité,
 * cherché la demi-vie et la bonne fenêtre sur une période, puis jugé le pouvoir de prédiction sur des matchs jamais
 * utilisés pour le calcul. L'écran met en forme, en langage simple, et dit ce qui manque au lieu d'un tiret.
 *
 * Les couleurs (demande de Pierre, cahier de l'étape 18) : VERT pour une statistique qui compte (le vert « validé »,
 * comme « retenu » au banc d'essai : ce n'est pas une value), ROUGE pour celle qui trompe, ambre pour « trop peu de
 * matchs », sans ton pour « faible ».
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MOINS = '−';
const pourcent = (fraction, d = 1) => `${fr(fraction * 100, d).replace(/^-/, MOINS)} %`;

/**
 * Le catalogue des statistiques mesurées, dans l'ordre de lecture (STATISTIQUES_EQUIPE et STATISTIQUES_JOUEUR de
 * bench/statValue.js ; un test les compare) — de quoi garder tous les tableaux quand le calcul n'existe pas encore.
 * `sources` (équipes) : football-data n'a ni xG, ni grosses occasions, ni possession.
 */
const TOUTES = ['magasin', 'football-data'];
const MAGASIN = ['magasin'];
export const CATALOGUE_EQUIPE = Object.freeze(
  [
    ['buts_pour', 'Buts marqués', TOUTES],
    ['buts_contre', 'Buts encaissés', TOUTES],
    ['points', 'Points pris', TOUTES],
    ['diff_buts', 'Différence de buts', TOUTES],
    ['xg_pour', 'xG créés', MAGASIN],
    ['xg_contre', 'xG concédés', MAGASIN],
    ['diff_xg', 'Différence de xG', MAGASIN],
    ['finition_pour', 'Finition : buts marqués moins xG', MAGASIN],
    ['finition_contre', 'Buts encaissés moins xG concédés', MAGASIN],
    ['tirs_pour', 'Tirs', TOUTES],
    ['tirs_contre', 'Tirs concédés', TOUTES],
    ['diff_tirs', 'Différence de tirs', TOUTES],
    ['cadres_pour', 'Tirs cadrés', TOUTES],
    ['cadres_contre', 'Tirs cadrés concédés', TOUTES],
    ['diff_cadres', 'Différence de tirs cadrés', TOUTES],
    ['occasions_pour', 'Grosses occasions', MAGASIN],
    ['occasions_contre', 'Grosses occasions concédées', MAGASIN],
    ['possession', 'Possession', MAGASIN],
    ['corners_pour', 'Corners obtenus', TOUTES],
    ['corners_contre', 'Corners concédés', TOUTES],
    ['fautes_pour', 'Fautes commises', TOUTES],
    ['fautes_contre', 'Fautes subies', TOUTES],
    ['jaunes_pour', 'Cartons jaunes reçus', TOUTES],
    ['jaunes_contre', 'Cartons jaunes de l’adversaire', TOUTES],
    ['rouges_pour', 'Cartons rouges reçus', TOUTES],
    ['rouges_contre', 'Cartons rouges de l’adversaire', TOUTES]
  ].map(([id, libelle, sources]) => Object.freeze({ id, libelle, sources: Object.freeze(sources) }))
);
export const CATALOGUE_JOUEUR = Object.freeze(
  [
    ['buts', 'Buts (par 90 min)'],
    ['tirs', 'Tirs (par 90 min)'],
    ['cadres', 'Tirs cadrés (par 90 min)'],
    ['xg', 'xG (par 90 min)'],
    ['xgnp', 'xG hors penalty (par 90 min)'],
    ['xgot', 'xG des tirs cadrés (par 90 min)'],
    ['passes_d', 'Passes décisives (par 90 min)'],
    ['xa', 'xA, passes attendues (par 90 min)'],
    ['pc', 'Passes clés (par 90 min)'],
    ['recup', 'Récupérations (par 90 min)'],
    ['duels_g', 'Duels gagnés (par 90 min)'],
    ['duels_pct', 'Part de duels gagnés'],
    ['jaunes', 'Cartons jaunes (par 90 min)'],
    ['rouges', 'Cartons rouges (par 90 min)'],
    ['note', 'Note FotMob'],
    ['buts_evites', 'Buts évités (gardiens, par 90 min)']
  ].map(([id, libelle]) => Object.freeze({ id, libelle }))
);
/** Les trois fenêtres du moteur (corners, tirs, tirs cadrés) : mesurées dans les termes exacts du moteur. */
export const CATALOGUE_MOTEUR = Object.freeze(
  [
    ['moteur_corners', 'corners'],
    ['moteur_tirs', 'tirs'],
    ['moteur_cadres', 'tirs cadrés']
  ].map(([id, nom]) => Object.freeze({ id, libelle: `Les ${nom} du match`, nom }))
);

/**
 * Les quatre tableaux, dans l'ordre. `sources` du moteur : les deux (sa fenêtre est mesurée sur FotMob et sur
 * football-data).
 */
export const SECTIONS = Object.freeze([
  Object.freeze({ cle: 'equipes-fotmob', genre: 'statistique', echelle: 'equipe', source: 'magasin', titre: 'Les équipes · FotMob (magasin)' }),
  Object.freeze({ cle: 'equipes-fd', genre: 'statistique', echelle: 'equipe', source: 'football-data', titre: 'Les équipes · football-data.co.uk' }),
  Object.freeze({ cle: 'joueurs-fotmob', genre: 'statistique', echelle: 'joueur', source: 'magasin', titre: 'Les joueurs · FotMob (magasin)' }),
  Object.freeze({ cle: 'fenetre-moteur', genre: 'moteur', echelle: 'equipe', source: null, titre: 'La fenêtre du moteur · corners, tirs, tirs cadrés' })
]);

// ------------------------------------------------------------ les verdicts

export const VERDICTS = Object.freeze({
  compte: Object.freeze({ texte: 'compte', ton: 'is-accent', icone: 'check', phrase: 'Ses valeurs passées annoncent sa cible au-delà du hasard, avec au moins 1 % d’erreur en moins que la seule moyenne du championnat (jugé sur des matchs qui n’ont pas servi au calcul).' }),
  faible: Object.freeze({ texte: 'faible', ton: '', icone: 'minus', phrase: 'Elle annonce un peu sa cible, mais le gain prouvé reste sous 1 % de l’erreur.' }),
  trompe: Object.freeze({ texte: 'trompe', ton: 'is-danger', icone: 'x', phrase: 'Ses valeurs passées n’annoncent pas sa cible au-delà du hasard : la lire comme une tendance trompe.' }),
  'pas-assez': Object.freeze({ texte: 'trop peu de matchs', ton: 'is-warning', icone: 'clock', phrase: 'Trop peu de matchs pour juger.' })
});
export const VERDICTS_FENETRE = Object.freeze({
  confirmee: Object.freeze({ texte: 'confirmée', ton: '', icone: 'check', phrase: 'Les 10 derniers matchs restent la fenêtre (la meilleure du calcul, ou l’autre n’a pas fait mieux au-delà du hasard).' }),
  proposee: Object.freeze({ texte: 'autre fenêtre proposée', ton: 'is-info', icone: 'info', phrase: 'Une autre fenêtre fait mieux que 10 au-delà du hasard : proposée, jamais branchée avant le banc d’essai et l’accord de Pierre.' }),
  'pas-assez': Object.freeze({ texte: 'trop peu de matchs', ton: 'is-warning', icone: 'clock', phrase: 'Trop peu de matchs pour juger la fenêtre.' })
});

// ------------------------------------------------------------ l'état

const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;

/**
 * L'état du bloc — il reste TOUJOURS affiché :
 *   chargement · erreur · pas-a-jour-serveur · jamais (aucun calcul fini : il se lance à la main) · pret (`enCours` :
 *   un nouveau calcul tourne, le dernier reste lu).
 */
export function etatDuBloc({ chargement = false, erreur = null, reponse = null } = {}) {
  if (chargement && !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de la valeur des statistiques…' };
  if (erreur) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Mesure illisible', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.` };
  }
  if (!reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de la valeur des statistiques…' };
  if (!reponse.dernier) {
    return {
      cle: 'jamais',
      ton: 'is-info',
      titre: 'Pas encore mesuré',
      texte: 'La valeur des statistiques n’a pas encore été calculée : ce calcul se lance à la main (il dure quelques minutes), jamais chaque nuit — une demi-vie ou une fenêtre qui changerait toute seule changerait les chiffres des modèles. Les tableaux ci-dessous restent affichés, sans valeurs.'
    };
  }
  return { cle: 'pret', ton: '', titre: null, texte: null, enCours: Boolean(reponse.enCours) };
}

// ------------------------------------------------------------ les cases

/** La fiabilité d'une fenêtre de 10 matchs (celle d'aujourd'hui) : « 51 % », la fourchette au survol. */
export function fiabiliteDite(ligne) {
  const f = ligne?.fiabilite;
  if (!f || !fini(f.fiabilite10)) return { texte: 'pas mesurée', titre: 'Fiabilité non mesurée pour cette statistique.', valeur: null };
  const b = f.fiabilite10Fourchette;
  const fourchette = Array.isArray(b) && b.every(fini) ? ` Fourchette à 95 % : de ${pourcent(b[0], 0)} à ${pourcent(b[1], 0)}.` : '';
  return {
    texte: pourcent(f.fiabilite10, 0),
    valeur: f.fiabilite10,
    titre: `Si l’on coupe les matchs en deux moitiés, elles racontent la même chose à ${pourcent(f.fiabilite10, 0)} sur une fenêtre de 10 ${f.unite === 'matchs' ? 'matchs' : 'matchs de 90 minutes'}.${fourchette}`
  };
}

/** Le nombre de matchs à partir duquel la statistique est plus signal que bruit. */
export function stabilisationDite(ligne) {
  const f = ligne?.fiabilite;
  if (!f) return { texte: 'pas mesurée', titre: 'Pas mesurée pour cette statistique.', valeur: null };
  const unite = f.unite === 'matchs' ? 'matchs' : 'matchs de 90 min';
  if (f.stabilisationSansFin || !fini(f.stabilisation)) {
    return { texte: 'jamais', titre: 'Même avec beaucoup de matchs, elle reste plus bruit que signal.', valeur: null };
  }
  const b = f.stabilisationFourchette;
  const fourchette = Array.isArray(b) && b.every(fini) ? ` Fourchette à 95 % : de ${fr(b[0], 0)} à ${f.stabilisationHautSansFin ? 'plus' : fr(b[1], 0)}.` : '';
  return { texte: `${fr(f.stabilisation, 0)} ${unite}`, valeur: f.stabilisation, titre: `À partir de ${fr(f.stabilisation, 0)} ${unite}, la moyenne de la statistique est plus signal que bruit.${fourchette}` };
}

/** Le pouvoir de prédiction : l'erreur en moins face à la seule moyenne du championnat, sur des matchs qui n'ont pas servi au calcul. */
export function pouvoirDit(ligne) {
  const p = ligne?.comparaisons?.pouvoir;
  if (!p || !fini(p.gainRelatif)) {
    const n = ligne?.pouvoir?.n;
    return { texte: 'trop peu de matchs', detail: fini(n) ? `${fr(n)} cas, pas assez pour juger` : 'pas mesuré', titre: 'Trop peu de matchs pour juger si elle annonce sa cible.', valeur: null };
  }
  const sens = p.gainRelatif < 0 ? 'en plus' : 'en moins';
  const b = p.fourchetteRelative;
  const f = Array.isArray(b) && b.every(fini) ? `[${pourcent(b[0]).replace(/^-/, MOINS)} ; ${pourcent(b[1]).replace(/^-/, MOINS)}]` : '';
  const matchs = p.n?.matchs ?? p.n?.lignes ?? null;
  return {
    texte: `${pourcent(Math.abs(p.gainRelatif))} d’erreur ${sens}`,
    detail: `${f}${f && fini(matchs) ? ' · ' : ''}${fini(matchs) ? `${fr(matchs)} matchs jugés` : ''}`.trim(),
    titre: `Pour prévoir ${ligne.libelleCible ?? 'sa cible'}, l’erreur de prévision est ${pourcent(Math.abs(p.gainRelatif))} ${sens === 'en moins' ? 'plus petite' : 'plus grande'} qu’avec la seule moyenne du championnat, sur des matchs qui n’avaient pas servi au calcul (${fini(matchs) ? fr(matchs) : '?'} matchs). Fourchette à 95 % : ${f || 'non donnée'}.`,
    valeur: p.gainRelatif
  };
}

/** La demi-vie : de combien un match perd de son poids à chaque match de plus. */
export function demiVieDite(ligne) {
  const d = ligne?.demiVie;
  if (!d) return { texte: 'non mesurée', titre: 'Pas de demi-vie mesurée pour cette statistique.', valeur: null };
  if (d.sansFin) return { texte: 'tous les matchs comptent autant', titre: 'Le calcul n’a trouvé aucune raison d’oublier les vieux matchs.', valeur: null };
  const b = Array.isArray(d.fourchette) ? d.fourchette : [];
  const f = b.length === 2 && b.every(fini) ? ` Fourchette : de ${fr(b[0], 0)} à ${fr(b[1], 0)} matchs.` : '';
  return { texte: `${fr(d.valeur, 0)} matchs`, titre: `Un match d’il y a ${fr(d.valeur, 0)} matchs compte moitié moins que le dernier.${f}`, valeur: d.valeur };
}

/** La bonne fenêtre : confirmée (10), proposée (une autre, jamais branchée), ou trop peu de matchs. */
export function fenetreDite(ligne) {
  const f = ligne?.fenetre;
  if (!f) return { texte: 'non mesurée', ton: '', icone: 'info', verdict: null, titre: 'Pas de fenêtre mesurée.' };
  const v = VERDICTS_FENETRE[f.verdict] ?? { texte: String(f.verdict), ton: '', icone: 'info', phrase: '' };
  const indicatif = f.indicatif ? ' · indicatif' : '';
  if (f.verdict === 'proposee') {
    return { texte: `${fr(f.conseillee)} matchs`, detail: `au lieu de ${fr(f.actuelle)}${indicatif}`, ton: v.ton, icone: v.icone, verdict: v.texte, titre: `${v.phrase}${f.indicatif ? ' Indicatif : des matchs jugés ont déjà été regardés pour régler la fenêtre actuelle.' : ''}` };
  }
  if (f.verdict === 'confirmee') {
    return { texte: `${fr(f.actuelle)} matchs`, detail: `confirmée${indicatif}`, ton: v.ton, icone: v.icone, verdict: v.texte, titre: v.phrase };
  }
  return { texte: 'trop peu de matchs', detail: null, ton: v.ton, icone: v.icone, verdict: v.texte, titre: v.phrase };
}

/** Le verdict d'une ligne (compte / faible / trompe / trop peu), ou « pas mesuré ». */
export function verdictDe(ligne) {
  const v = VERDICTS[ligne?.verdict];
  if (!v) return { cle: null, texte: 'pas mesuré', ton: '', icone: 'info', phrase: 'Pas encore mesuré.' };
  return { cle: ligne.verdict, texte: v.texte, ton: v.ton, icone: v.icone, phrase: ligne.raison ?? v.phrase };
}

// ------------------------------------------------------------ les tableaux

const parCle = (lignes) => new Map((lignes ?? []).map((l) => [`${l.echelle}|${l.source}|${l.statistique}`, l]));

/**
 * Les lignes d'un tableau de statistiques, dans l'ordre du catalogue (toujours TOUTES, mesurées ou non) : la ligne du
 * serveur quand elle existe, sinon une ligne « pas encore mesuré ». `lignes` : la liste de la route.
 */
export function lignesDeLaSection(section, lignes, { mesure = true } = {}) {
  const lues = parCle(lignes);
  if (section.genre === 'moteur') {
    const sources = ['magasin', 'football-data'];
    return sources.flatMap((source) =>
      CATALOGUE_MOTEUR.map((c) => {
        const l = lues.get(`equipe|${source}|${c.id}`) ?? null;
        return { id: `${source}|${c.id}`, libelle: c.libelle, source, ligne: l, mesuree: Boolean(l), fenetre: l ? fenetreDite(l) : null, raison: l?.raison ?? null };
      })
    );
  }
  const catalogue = section.echelle === 'equipe' ? CATALOGUE_EQUIPE.filter((c) => c.sources.includes(section.source)) : CATALOGUE_JOUEUR;
  return catalogue.map((c) => {
    const l = lues.get(`${section.echelle}|${section.source}|${c.id}`) ?? null;
    return {
      id: c.id,
      libelle: l?.libelle ?? c.libelle,
      cible: l?.libelleCible ?? null,
      ligne: l,
      mesuree: Boolean(l) && mesure,
      fiabilite: fiabiliteDite(l),
      stabilisation: stabilisationDite(l),
      pouvoir: pouvoirDit(l),
      demiVie: demiVieDite(l),
      fenetre: fenetreDite(l),
      verdict: verdictDe(l)
    };
  });
}

const moyenne = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

/**
 * Le pied d'un tableau de statistiques : Σ = les statistiques comptées, par verdict ; ⌀ = la moyenne de chaque
 * colonne chiffrée (fiabilité, matchs nécessaires, erreur en moins, demi-vie) — une moyenne de pourcentages est une
 * moyenne, jamais une somme.
 */
export function piedDeLaSection(lignes) {
  const mesurees = lignes.filter((l) => l.mesuree);
  const compte = (cle) => mesurees.filter((l) => l.verdict.cle === cle).length;
  const n = { total: lignes.length, mesurees: mesurees.length, compte: compte('compte'), faible: compte('faible'), trompe: compte('trompe'), pasAssez: compte('pas-assez') };
  const fen = (v) => mesurees.filter((l) => l.ligne?.fenetre?.verdict === v).length;
  const moy = {
    fiabilite: moyenne(mesurees.map((l) => l.fiabilite.valeur).filter(fini)),
    stabilisation: moyenne(mesurees.map((l) => l.stabilisation.valeur).filter(fini)),
    pouvoir: moyenne(mesurees.map((l) => l.pouvoir.valeur).filter(fini)),
    demiVie: moyenne(mesurees.map((l) => l.demiVie.valeur).filter(fini))
  };
  return {
    n,
    fenetres: { confirmees: fen('confirmee'), proposees: fen('proposee'), pasAssez: fen('pas-assez') },
    moyenne: moy,
    texte: {
      sigma: `${fr(n.mesurees)} mesurée${n.mesurees > 1 ? 's' : ''} sur ${fr(n.total)}`,
      verdicts: n.mesurees ? `${fr(n.compte)} comptent · ${fr(n.faible)} faible${n.faible > 1 ? 's' : ''} · ${fr(n.trompe)} trompent · ${fr(n.pasAssez)} trop peu de matchs` : 'aucune statistique mesurée',
      fenetres: n.mesurees ? `${fr(n.mesurees ? mesurees.filter((l) => l.ligne?.fenetre).length : 0)} fenêtres jugées · ${fr(fen('confirmee'))} confirmée${fen('confirmee') > 1 ? 's' : ''} · ${fr(fen('proposee'))} autre${fen('proposee') > 1 ? 's' : ''} proposée${fen('proposee') > 1 ? 's' : ''}` : 'aucune fenêtre jugée',
      fiabilite: moy.fiabilite === null ? 'pas de moyenne' : pourcent(moy.fiabilite, 0),
      stabilisation: moy.stabilisation === null ? 'pas de moyenne' : `${fr(moy.stabilisation, 0)} matchs`,
      pouvoir: moy.pouvoir === null ? 'pas de moyenne' : `${moy.pouvoir < 0 ? MOINS : ''}${pourcent(Math.abs(moy.pouvoir))} d’erreur ${moy.pouvoir < 0 ? 'en plus' : 'en moins'}`,
      demiVie: moy.demiVie === null ? 'pas de moyenne' : `${fr(moy.demiVie, 0)} matchs`
    }
  };
}

/** Le pied du tableau de la fenêtre du moteur : Σ = fenêtres jugées par verdict ; ⌀ = la meilleure fenêtre moyenne. */
export function piedDuMoteur(lignes) {
  const mesurees = lignes.filter((l) => l.mesuree);
  const par = (v) => mesurees.filter((l) => l.ligne.fenetre?.verdict === v).length;
  const meilleures = mesurees.map((l) => l.ligne.fenetre?.conseillee).filter(fini);
  const m = moyenne(meilleures);
  return {
    n: { total: lignes.length, mesurees: mesurees.length, confirmees: par('confirmee'), proposees: par('proposee'), pasAssez: par('pas-assez') },
    moyenne: m,
    texte: {
      sigma: `${fr(mesurees.length)} mesurée${mesurees.length > 1 ? 's' : ''} sur ${fr(lignes.length)}`,
      verdicts: mesurees.length ? `${fr(par('confirmee'))} confirmée${par('confirmee') > 1 ? 's' : ''} · ${fr(par('proposee'))} autre${par('proposee') > 1 ? 's' : ''} proposée${par('proposee') > 1 ? 's' : ''} · ${fr(par('pas-assez'))} trop peu de matchs` : 'aucune fenêtre jugée',
      meilleure: m === null ? 'pas de moyenne' : `${fr(m, 0)} matchs`
    }
  };
}

const jourDit = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

/**
 * La phrase d'un tableau : sur quelle période le calcul a été fait et sur quels matchs il a été jugé (des matchs qui
 * n'ont pas servi au calcul). Lue dans les lignes du calcul — jamais écrite en dur — ; une phrase générale sans calcul.
 */
export function phraseDeLaSection(section, lignes) {
  const l = (lignes ?? []).find((x) => x.echelle === section.echelle && (section.genre === 'moteur' ? x.statistique?.startsWith('moteur_') : x.source === section.source && !x.statistique?.startsWith('moteur_')) && x.calcul && x.jugement);
  const generique = {
    statistique: 'La statistique est calculée sur une période, puis jugée sur des matchs d’après, qui n’ont pas servi au calcul.',
    moteur: 'La même question dans les termes exacts du moteur (son attendu, sa loi) : combien de matchs faut-il regarder ?'
  }[section.genre];
  if (!l) return generique;
  const de = jourDit(l.calcul.de);
  const a = jourDit(l.calcul.a);
  const jde = jourDit(l.jugement.de);
  const ja = jourDit(l.jugement.a);
  const calcul = de && a ? `Calculé du ${de} au ${a}` : 'Calculé sur une période';
  const jugement = jde ? (ja ? `jugé sur les matchs du ${jde} au ${ja}` : `jugé sur les matchs depuis le ${jde}`) : 'jugé sur les matchs d’après';
  const extra = section.genre === 'moteur' ? ' La même question dans les termes exacts du moteur (son attendu, sa loi).' : section.echelle === 'joueur' ? ' Tout est ramené à 90 minutes, avec un minimum de minutes.' : '';
  return `${calcul}, ${jugement} : des matchs qui n’ont pas servi au calcul.${extra}`;
}

// ------------------------------------------------------------ les chiffres clés

/** Les chiffres clés du bloc : combien de statistiques mesurées, combien comptent, combien trompent, le calcul. */
export function chiffresCles(reponse) {
  const lignes = (reponse?.lignes ?? []).filter((l) => l.verdict);
  const n = (v) => lignes.filter((l) => l.verdict === v).length;
  const dernier = reponse?.dernier ?? null;
  return {
    mesurees: { valeur: dernier ? fr(lignes.length) : 'non lu', detail: dernier ? 'statistiques d’équipe et de joueur jugées' : 'pas encore mesuré' },
    comptent: { valeur: dernier ? fr(n('compte')) : 'non lu', detail: dernier ? `dont ${fr(n('faible'))} faible${n('faible') > 1 ? 's' : ''} (gain prouvé mais sous 1 %)` : 'pas encore mesuré' },
    trompent: { valeur: dernier ? fr(n('trompe')) : 'non lu', detail: dernier ? `et ${fr(n('pas-assez'))} avec trop peu de matchs pour juger` : 'pas encore mesuré' },
    calcul: dernier
      ? { valeur: `n° ${fr(dernier.id)}`, detail: dernier.ou === 'serveur' ? 'lancé à la main dans le serveur' : dernier.ou === 'bac' ? 'lancé dans le bac à sable' : 'calcul d’essai' }
      : { valeur: 'aucun', detail: 'se lance à la main' }
  };
}

/** La provenance du bloc, pour ProvenanceChip : le vrai fournisseur, l'heure de la fin du calcul. */
export function provenanceDuBloc(reponse) {
  const dernier = reponse?.dernier ?? null;
  return {
    source: 'FotMob (magasin) · football-data.co.uk',
    releveLe: dernier?.finiLe ?? null,
    action: 'calculé',
    fichier: 'table stat_value de la base SQLite du magasin, sur ce PC',
    detail: dernier
      ? `Calcul n° ${dernier.id} (${dernier.ou === 'serveur' ? 'lancé à la main dans le serveur' : dernier.ou === 'bac' ? 'lancé dans le bac à sable' : 'calcul d’essai'}). Magasin SQLite (FotMob), par sa table du jour J : ce que l’appli savait la veille de chaque match ; football-data.co.uk : fichiers CSV gardés sur ce PC.`
      : 'Aucun calcul fini : la valeur des statistiques se calcule à la main.'
  };
}
