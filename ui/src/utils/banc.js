/**
 * banc.js — les règles d'affichage du BANC D'ESSAI (étape 19 du plan, 13/10/2026 ; onglet « Banc d'essai »
 * d'Historique moteur). JavaScript pur, sans Vue ni navigateur : les tests du serveur le rejouent
 * (server/test/bancEcran.test.mjs).
 *
 * Rien n'est calculé ici : le serveur a rejoué le moteur, compté, et le juge de l'étape 16 a rendu ses
 * verdicts (GET /api/bench). L'écran met en forme, en langage simple, et dit ce qui manque au lieu d'un
 * tiret : « pas de marché historique », « aucun rejeu encore », « pas assez de matchs ».
 */

import { morceauxGain, libelleVerdict, nombreSigne } from './preuve.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const entier = (n) => (fini(n) ? fr(n) : '0');

/**
 * Le gain et sa fourchette (morceauxGain de preuve.js, une décimale) ; DEUX décimales quand tout tient sous
 * 0,1 % — l’écart de Pinnacle à la moyenne (+0,01 % [−0,04 ; +0,05]) ne se lirait sinon que « +0,0 % [−0,0 ; +0,1] ».
 */
function morceauxDuGain(enPourcent) {
  const m = morceauxGain(enPourcent);
  if (!m) return null;
  const f = Array.isArray(enPourcent.fourchette) && enPourcent.fourchette.length === 2 && enPourcent.fourchette.every(fini) ? enPourcent.fourchette : null;
  const petit = Math.max(Math.abs(enPourcent.gain), ...(f ?? []).map(Math.abs)) < 0.1;
  if (!petit) return m;
  const signe2 = (x) => (x === 0 ? 0 : x).toLocaleString('fr-FR', { signDisplay: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[-−]/, '−');
  return { ...m, gain: `${signe2(enPourcent.gain)} %`, fourchette: f ? `[${signe2(f[0])} ; ${signe2(f[1])}]` : null };
}

/** Les tranches de période, dans l'ordre, avec leur nom pour Pierre. */
export const TRANCHES = Object.freeze([
  Object.freeze({ id: 'P1', titre: 'P1 · conception', detail: '2005 → 06/2019, jamais vue' }),
  Object.freeze({ id: 'P2', titre: 'P2 · preuve ancienne', detail: '07/2019 → 06/2023, jamais vue' }),
  Object.freeze({ id: 'P3', titre: 'P3 · magasin neuf', detail: '2023 → 06/2024' }),
  Object.freeze({ id: 'P4a', titre: 'P4a · déjà vu', detail: '2024-25, apprentissage' }),
  Object.freeze({ id: 'P4b', titre: 'P4b · déjà vu', detail: '2025-26, vérification du 23/09' }),
  Object.freeze({ id: 'P5', titre: 'P5 · depuis le lancement', detail: 'depuis le 24/09/2026' })
]);

/** Les lignes de marché dans l'ordre de la page. */
const ORDRE = ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals:home', 'teamGoals:away', 'resultAndTotal', 'scoreExact', 'totalCorners', 'teamCorners:home', 'teamCorners:away', 'totalShots', 'teamShots:home', 'teamShots:away', 'totalShotsOnTarget', 'teamShotsOnTarget:home', 'teamShotsOnTarget:away'];
const NOMS = Object.freeze({
  result: '1N2 (résultat)',
  totalGoals: 'Total buts',
  bothTeamsScore: 'Les 2 équipes marquent',
  'teamGoals:home': 'Buts de l’équipe à domicile',
  'teamGoals:away': 'Buts de l’équipe à l’extérieur',
  resultAndTotal: 'Résultat + total buts',
  scoreExact: 'Score exact',
  totalCorners: 'Corners du match',
  'teamCorners:home': 'Corners à domicile',
  'teamCorners:away': 'Corners à l’extérieur',
  totalShots: 'Tirs du match',
  'teamShots:home': 'Tirs à domicile',
  'teamShots:away': 'Tirs à l’extérieur',
  totalShotsOnTarget: 'Tirs cadrés du match',
  'teamShotsOnTarget:home': 'Tirs cadrés à domicile',
  'teamShotsOnTarget:away': 'Tirs cadrés à l’extérieur'
});

/** « Total buts 2,5 », « 1N2 (résultat) ». */
export function libelleDuMarche(marketKey, ligne = null) {
  const nom = NOMS[marketKey] ?? marketKey;
  return fini(ligne) ? `${nom} ${fr(ligne, 1)}` : nom;
}

/** Une perte log lisible (quatre décimales), ou ce qui manque. */
export const perteDite = (x, manque = 'pas mesurée') => (fini(x) ? fr(x, 4) : manque);
/** Un pourcentage (une décimale). */
export const pourcentDit = (x, manque = 'pas mesuré') => (fini(x) ? `${fr(x, 1)} %` : manque);

/**
 * L'écart du juge en morceaux : « +0,4 % [−0,1 ; +0,9] » (moteur face au marché ou au repère, perte log en
 * moins), la pastille du verdict (les dessins de la feuille de route : vert seulement « retenu », rouge
 * « moins bon »), la raison. null sans jugement.
 */
export function ecartDuJuge(juge) {
  if (!juge) return null;
  const m = morceauxDuGain(juge.enPourcent);
  return {
    texte: m ? [m.gain, m.fourchette].filter(Boolean).join(' ') : 'pas de gain calculé',
    pastille: libelleVerdict(juge.verdict),
    raison: typeof juge.raison === 'string' ? juge.raison : '',
    variantes: juge.variantes ?? null,
    ecartDetectable: fini(juge.ecartDetectable) ? juge.ecartDetectable : null
  };
}

/** Ce que l'écran dit des données vues d'une case (par fenêtre de DONNEES_VUES et des étapes). */
export function texteDesVues(vues) {
  const total = vues?.total ?? 0;
  const par = vues?.parFenetre ?? {};
  const ids = Object.keys(par).filter((k) => par[k] > 0);
  if (!total || !ids.length) return { texte: 'jamais vues', vues: false };
  const textes = ids.map((id) =>
    id === 'mesures-du-23-09' ? 'déjà vues (vérification du 23/09)'
    : id === 'apprentissage-23-09' ? 'déjà vues (apprentissage du 23/09)'
    : id === 'regle-de-value-23-09' ? 'déjà vues par le choix du livre de référence et la règle de pari'
    : /^candidate:/.test(id) ? 'déjà vues (candidate)'
    : /^rejeu:\d+$/.test(id) ? 'déjà vues (fenêtre du rejeu)'
    : /^(\d+|E):([^:]+):\d+$/.test(id) ? id.replace(/^(\d+|E):([^:]+):\d+$/, 'déjà vues (étape $1, version $2)')
    : `déjà vues (${id})`
  );
  const part = Math.max(...ids.map((id) => par[id])) / total;
  return { texte: `${[...new Set(textes)].join(' ; ')}${part < 1 ? ` — ${fr(part * 100)} % des matchs` : ''}`, vues: true };
}

/**
 * Le TABLEAU « moteur, marché, repère » d'un rejeu, pour un jeu de prix : une ligne par ligne de marché, une
 * colonne par tranche présente. Chaque cellule : matchs, pertes log du moteur / du marché / du repère, les
 * deux écarts du juge, les données vues. Une case absente se dit (« pas de match »), jamais un tiret.
 */
export function tableauDuRejeu(resume, { prix = 'fd-avant-match', sousTable = 'tout' } = {}) {
  const cases = Object.values(resume?.tranches ?? {}).flatMap((t) => (t.cases ?? []).map((c) => ({ ...c, tranche: t.tranche })));
  const choisies = cases.filter((c) => c.prix === prix && c.sousTable === sousTable);
  const colonnes = TRANCHES.filter((t) => choisies.some((c) => c.tranche === t.id));
  const parLigne = new Map();
  for (const c of choisies) {
    const cle = `${c.marketKey}|${c.ligne ?? '-'}`;
    const l = parLigne.get(cle) ?? { cle, marketKey: c.marketKey, ligne: c.ligne, libelle: libelleDuMarche(c.marketKey, c.ligne), cellules: {} };
    l.cellules[c.tranche] = {
      n: c.n,
      moteur: c.moteur?.perteLog ?? null,
      justes: c.moteur?.justes?.taux ?? null,
      marche: c.marche?.perteLog ?? null,
      repere: c.repere?.perteLog ?? null,
      ecartMarche: ecartDuJuge(c.marche?.juge),
      ecartRepere: ecartDuJuge(c.repere?.juge),
      vues: texteDesVues(c.vues),
      sansMarche: !c.marche,
      temoins: temoinsDe(c.moteur, c.marche)
    };
    parLigne.set(cle, l);
  }
  const rang = (l) => {
    const i = ORDRE.indexOf(l.marketKey);
    return (i === -1 ? ORDRE.length : i) * 100 + (fini(l.ligne) ? l.ligne : 0);
  };
  return { colonnes, lignes: [...parLigne.values()].sort((a, b) => rang(a) - rang(b)) };
}

/** Brier et RPS, témoins SANS pastille (amendement §8) : « Brier 0,6003 (marché 0,5998) · RPS 0,2043 ». */
function temoinsDe(moteur, marche) {
  const morceaux = [];
  if (fini(moteur?.brier)) morceaux.push(`Brier ${fr(moteur.brier, 4)}${fini(marche?.brier) ? ` (marché ${fr(marche.brier, 4)})` : ''}`);
  if (fini(moteur?.rps)) morceaux.push(`RPS ${fr(moteur.rps, 4)}${fini(marche?.rps) ? ` (marché ${fr(marche.rps, 4)})` : ''}`);
  return morceaux.length ? morceaux.join(' · ') : null;
}

/** Les jeux de prix présents dans un rejeu (pour le sélecteur), le témoin de clôture marqué. */
export function jeuxDuRejeu(resume, jeux = {}) {
  const presents = new Set(Object.values(resume?.tranches ?? {}).flatMap((t) => (t.cases ?? []).map((c) => c.prix)));
  const ordre = ['fd-avant-match', 'gratuites-avant-match', 'vos-bookmakers', 'sans-cote', 'fd-cloture'];
  return [...presents]
    .sort((a, b) => (ordre.indexOf(a) === -1 ? 99 : ordre.indexOf(a)) - (ordre.indexOf(b) === -1 ? 99 : ordre.indexOf(b)))
    .map((p) => ({
      value: p,
      label: p === 'sans-cote' ? 'Sans cote (face au repère seulement)' : p === 'fd-cloture' ? `${jeux[p]?.titre ?? p} — témoin : reproduction du 23/09 seulement` : jeux[p]?.titre ?? p
    }));
}

/**
 * Les JEUX DE PRIX FACE À FACE sur les matchs communs (1N2, résultat + total, score exact : les marchés dont la
 * distribution dépend du prix) : une ligne par tranche × paire × marché, « sur les N matchs communs ».
 */
export function communsDuRejeu(resume, jeux = {}) {
  const titre = (p) => jeux[p]?.titre ?? p;
  return (resume?.communs ?? [])
    .map((c) => ({
      cle: c.cle,
      tranche: c.tranche,
      titreTranche: TRANCHES.find((t) => t.id === c.tranche)?.titre ?? c.tranche,
      paire: `${titre(c.prixB)} face à ${titre(c.prixA)}`,
      libelle: libelleDuMarche(c.marketKey, c.ligne),
      n: c.n,
      texteN: `sur les ${entier(c.n)} matchs communs`,
      perteA: perteDite(c.perteLogA),
      perteB: perteDite(c.perteLogB),
      ecart: ecartDuJuge(c.juge)
    }))
    .sort((a, b) => TRANCHES.findIndex((t) => t.id === a.tranche) - TRANCHES.findIndex((t) => t.id === b.tranche) || a.paire.localeCompare(b.paire, 'fr') || a.libelle.localeCompare(b.libelle, 'fr'));
}

const bornes = (t) => `${fr(t.de * 100)} – ${fr(Math.min(1, t.a) * 100)} %`;
/**
 * La FIABILITÉ AFFICHÉE face au banc, tranche par tranche (bloc 4) : à gauche ce que l'appli affiche
 * (FIABILITE, mesurée le 23/09 sur 2025-26), à droite ce que le banc mesure sur la case choisie. Même ordre de
 * tranches ; une table sans fiabilité affichée (les dixièmes des autres marchés) le dit.
 */
export function fiabiliteFaceAuBanc(calibration, fiabilite = {}) {
  if (!calibration?.tranches?.length) return { table: null, lignes: [], sansReference: true };
  const reference = fiabilite[calibration.table] ?? null;
  return {
    table: calibration.table,
    sansReference: !reference,
    lignes: calibration.tranches.map((t, i) => {
      const r = reference?.[i] ?? null;
      return {
        cle: `${t.de}-${t.a}`,
        tranche: bornes(t),
        appli: r ? `${pourcentDit(r.realise)} sur ${entier(r.matchs)} matchs` : 'pas affichée',
        banc: t.n ? `${pourcentDit((t.realise ?? 0) * 100)} sur ${entier(t.n)} matchs` : 'aucun match',
        annonce: t.n && fini(t.annonce) ? pourcentDit(t.annonce * 100) : '—',
        n: t.n
      };
    })
  };
}

/** La table de calibration d'une case de la NOTE (avant-match football-data : la fiabilité « avec cotes »). */
const TABLE_DE_LA_NOTE = (marketKey) => (marketKey === 'result' ? 'cotes' : marketKey === 'scoreExact' ? 'score:cotes' : 'dixiemes');
/** La case de la note de départ pour la courbe : ses tranches de calibration deviennent les points. */
export function courbeDeLaNote(note, { tranche, marketKey, ligne = null }) {
  const cle = fini(ligne) ? `${marketKey}|${ligne}` : marketKey;
  const c = note?.depart?.[tranche]?.marches?.[cle];
  if (!c?.calibration) return { points: [], calibration: null };
  const tranches = c.calibration.map((t) => ({ de: t.de, a: t.a, n: t.n, annonce: t.annonce, realise: t.realise }));
  return { points: pointsDeLaCourbe({ courbe: tranches }), calibration: { table: TABLE_DE_LA_NOTE(marketKey), tranches } };
}

/** La courbe annoncé / réalisé d'une case (les dixièmes) : un point par tranche qui a des matchs. */
export function pointsDeLaCourbe(cas) {
  return (cas?.courbe ?? []).filter((t) => t.n > 0).map((t) => ({ de: t.de, a: t.a, n: t.n, annonce: t.annonce, realise: t.realise }));
}

/** Les fenêtres déjà vues d'une tranche de la note (P2, P4b), telles que la note les a recopiées de son rejeu (correction du 19/10). */
const vuesDeLaNote = (note, tranche) => texteDesVues({ total: 1, parFenetre: Object.fromEntries((note?.depart?.[tranche]?.vues ?? []).map((id) => [id, 1])) });

/**
 * Les QUATRE TUILES de la note de départ : 1N2 (P2, la preuve au banc ; P4b à côté), score exact, corners et
 * tirs (le pronostic retenu), paris simulés de P2. Chaque tuile dit sa fenêtre et si elle est déjà vue.
 */
export function tuilesDeLaNote(note) {
  if (!note) return null;
  const p2 = note.depart?.P2?.marches ?? {};
  const p4b = note.depart?.P4b?.marches ?? {};
  const r2 = p2.result;
  const r4 = p4b.result;
  const paris = note.depart?.P2?.paris;
  const ecart = (d) => (d?.enPourcent ? morceauxDuGain({ ...d.enPourcent, quoi: '' }) : null);
  const textePari = paris
    ? {
        valeur: `${entier(paris.paris)} paris`,
        detail: `rendement ${fini(paris.rendement?.parUnite) ? `${nombreSigne(paris.rendement.parUnite * 100)} %` : 'non mesuré'} (rapporté) · valeur de clôture ${fini(paris.valeurCloture?.moyenne) ? `${nombreSigne(paris.valeurCloture.moyenne * 100)} %` : 'non mesurée'} · pire série ${paris.pireSerie ?? '—'}`,
        verdict: libelleVerdict(paris.valeurCloture?.verdict)
      }
    : { valeur: 'aucun pari', detail: 'pas de pari simulé dans la note', verdict: null };
  const e2 = ecart(r2?.marche);
  return {
    resultat: {
      titre: '1N2 sur les cotes d’avant-match',
      valeur: r2 ? perteDite(r2.moteur.perteLog) : 'non mesuré',
      detail: r2 ? `perte log sur ${entier(r2.n)} matchs de 2019-2023 (${vuesDeLaNote(note, 'P2').vues ? 'déjà vus' : 'jamais vus'}) · ${pourcentDit(r2.moteur.justes)} de justes · marché : ${perteDite(r2.marche?.perteLog)}${e2 ? ` (${e2.gain} ${e2.fourchette ?? ''})` : ''}` : 'pas de note',
      aCote: r4 ? `2025-26 (${vuesDeLaNote(note, 'P4b').vues ? 'déjà vue' : 'jamais vue'}) : ${perteDite(r4.moteur.perteLog)} sur ${entier(r4.n)} matchs, ${pourcentDit(r4.moteur.justes)} de justes` : null,
      verdict: r2?.marche ? libelleVerdict(r2.marche.verdict) : null
    },
    score: {
      titre: 'Score exact',
      valeur: pourcentDit(p2.scoreExact?.moteur?.justes),
      detail: `de scores exacts (2019-2023) · « 1-1 partout » : ${pourcentDit(p2.scoreExact?.unUnPartout)} · dans le top 3 : ${pourcentDit(p2.scoreExact?.moteur?.top3)}`
    },
    statistiques: {
      titre: 'Corners et tirs',
      valeur: pourcentDit(p2.totalCorners?.moteur?.justes),
      detail: `du pronostic retenu juste (corners du match, 2019-2023) · tirs : ${pourcentDit(p2.totalShots?.moteur?.justes)} · tirs cadrés : ${pourcentDit(p2.totalShotsOnTarget?.moteur?.justes)}`
    },
    paris: { titre: 'Paris simulés (2019-2023)', ...textePari }
  };
}

/** « Moteur du 13/10/2026 (version 4 chez vous, empreinte 95a96429…) » ; la provenance de la note. */
export function phraseDeLaNote(note) {
  if (!note) return { titre: 'Pas encore de note de départ', detail: 'Elle s’écrit dans le code après le rejeu complet du bac à sable.' };
  const jour = typeof note.calculeeLe === 'string' ? note.calculeeLe.split('-').reverse().join('/') : 'date inconnue';
  const version = Number.isInteger(note.moteur?.version) ? `version ${note.moteur.version}` : 'sans numéro de version dans le bac';
  // Le commit qui porte ce moteur (correction du 19/10) : dit, qu'il existe ou non — sans lui, l'étape 47 ne le rejoue pas.
  const commit = typeof note.moteur?.commit === 'string' && /^[0-9a-f]{40}$/.test(note.moteur.commit)
    ? ` Commit du dépôt : ${note.moteur.commit.slice(0, 8)}….`
    : ' Aucun commit du dépôt ne porte encore ce moteur : la preuve finale (étape 47) attend que le dépôt soit commité.';
  const dit = (tranche) => {
    const v = vuesDeLaNote(note, tranche);
    return v.vues ? v.texte.replace(/^déjà vues/, 'déjà vu') : 'jamais vu par les réglages';
  };
  return {
    titre: `Moteur mesuré le ${jour} (${version}, empreinte ${String(note.moteur?.empreinte ?? '').slice(0, 8)}…)`,
    detail: `Écrite dans le code (noteDeDepart.js), d’après le rejeu n° ${note.rejeu?.id ?? '?'} du bac à sable. 2019-2023 : ${dit('P2')} ; 2025-26 : ${dit('P4b')}.${commit}`,
    commit: commit.trim()
  };
}

/**
 * La reproduction du 23/09, en une phrase (l'étalonnage du banc, pas une note). Dans le bac (la note) : à
 * l'identique (12 997 matchs, perte log à 1e-4). Sur l'appli de Pierre (`ici`), sa base a vécu depuis la copie
 * du bac : retrouvée à ± 1 % de matchs et à 0,001 de perte log (noteDeDepart.js), et dit comme tel.
 */
const pourcent2 = (x) => (fini(x) ? `${fr(x, 2)} %` : 'pas mesuré');
export function phraseDeLaReproduction(rp, { ici = false } = {}) {
  if (!rp?.lectureDirecte) return null;
  const d = rp.lectureDirecte;
  const a = rp.attendu ?? {};
  const tol = ici ? { matchs: 0.01, perte: 1e-3, justes: 0.5 } : { matchs: 0, perte: 1e-4, justes: 0.005 };
  const egal =
    fini(d.matchs) && fini(a.matchs) && Math.abs(d.matchs - a.matchs) <= tol.matchs * a.matchs &&
    Math.abs((d.perteLog ?? 0) - (a.perteLog ?? 0)) < tol.perte + 1e-12 &&
    Math.abs((d.justes ?? 0) - (a.justes ?? 0)) < tol.justes + 1e-12;
  const verdict = egal ? (ici ? 'retrouvée (à ± 1 % de matchs et 0,001 de perte log près)' : 'retrouvée') : 'pas retrouvée';
  const memeChose = rp.moteur && fini(rp.moteur.maxEcartP) ? rp.moteur.maxEcartP <= 1e-9 : null;
  return {
    texte: `Référence du 23/09 ${verdict} : ${entier(d.matchs)} matchs de 2025-26, ${pourcent2(d.justes)} de résultats justes, perte log ${perteDite(d.perteLog)} sur les cotes de clôture (attendu : ${entier(a.matchs)}, ${pourcent2(a.justes)}, ${perteDite(a.perteLog)}).`,
    egal,
    moteur: rp.moteur
      ? memeChose === false
        ? `Le moteur rejoué s’écarte de la lecture directe : jusqu’à ${fr(rp.moteur.maxEcartP * 100, 2)} point(s) de probabilité, sur ${entier(rp.moteur.matchs)} matchs.`
        : `Le moteur rejoué donne la même chose sur ${entier(rp.moteur.matchs)} matchs (${entier(rp.moteur.cotesIncoherentes)} cotes incohérentes refusées, comme dans l’appli).`
      : null
  };
}

/** L'état du rejeu sur cette appli : en cours, le dernier, ou aucun. */
export function etatDuRejeu({ enCours = null, dernierRejeu = null, dernierRefus = null } = {}) {
  if (enCours) {
    const fait = fini(enCours.fait) ? entier(enCours.fait) : '…';
    const total = fini(enCours.total) ? ` / ${entier(enCours.total)}` : '';
    return { ton: 'is-info', texte: `En cours : ${enCours.partie ?? 'préparation'} ${fait}${total}${enCours.date ? ` (${enCours.date.split('-').reverse().join('/')})` : ''}.`, enCours: true };
  }
  if (dernierRefus) return { ton: 'is-warning', texte: `Pas lancé : ${raisonDite(dernierRefus.raison)}.`, enCours: false };
  if (!dernierRejeu) return { ton: '', texte: 'Aucun rejeu encore sur cette appli : la note de départ vient du bac à sable.', enCours: false };
  const b = dernierRejeu.bilan ?? {};
  const minutes = fini(b.dureeMs) ? `${fr(b.dureeMs / 60000, 1)} min` : 'durée inconnue';
  const quand = typeof dernierRejeu.finiLe === 'string' ? new Date(dernierRejeu.finiLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ') : 'jamais fini (interrompu)';
  const periodes = (dernierRejeu.options?.periodes ?? []).join(', ');
  return {
    ton: b.erreur ? 'is-danger' : '',
    texte: b.erreur ? `Dernier rejeu arrêté : ${b.erreur}` : `Dernier rejeu le ${quand}, ${minutes}, ${entier(b.rencontres?.rejouees)} rencontres (${periodes}).`,
    enCours: false
  };
}

/** La confirmation du bouton « Lancer le banc ». */
export const CONFIRMATION_DU_LANCEMENT =
  'Lancer le banc d’essai ?\n\nIl rejoue le moteur sur 2019-2026 (environ 10 à 13 minutes), dans un processus à part : l’appli reste rapide et la mémoire du rejeu est rendue à la fin. Pendant ce temps, aucune actualisation ne tourne ; l’appli reste utilisable. Rien n’est changé dans vos chiffres, vos paris ou vos réglages : le banc mesure seulement.';

/** La raison d'un refus de lancement, en langage simple (le verrou parle de « processus » : Pierre n'a pas à le lire). */
export function raisonDite(raison) {
  const r = String(raison ?? '');
  if (/verrou détenu par un autre processus/.test(r)) return 'une autre tâche tenait la base (un import ou une actualisation lancés à la main)';
  if (/ en cours dans ce processus$/.test(r)) return `${r.replace(/ en cours dans ce processus$/, '')} tournait déjà`;
  return r;
}

/** Les paris simulés d'un rejeu, regroupés par règle puis par tranche ; la règle du moteur d'abord. */
export function parisDuRejeu(resume, jeux = {}) {
  const tous = resume?.paris ?? [];
  const ordreRegle = ['moteur', 'v-repli-moyenne', 'v-proxy-bet365'];
  const regles = [...new Set(tous.map((p) => p.regle))].sort((a, b) => ordreRegle.indexOf(a) - ordreRegle.indexOf(b));
  return regles.map((regle) => {
    const lignes = tous
      .filter((p) => p.regle === regle)
      .map((p) => ({
        cle: p.cle,
        tranche: p.tranche,
        prix: p.prix,
        prixTitre: jeux[p.prix]?.titre ?? p.prix,
        decisions: p.decisions,
        paris: p.n,
        refus: Object.entries(p.refus ?? {}).sort((a, b) => b[1] - a[1]),
        rendement: fini(p.rendement?.parUnite) ? `${nombreSigne(p.rendement.parUnite * 100)} %` : 'aucun pari',
        fourchetteRendement: p.rendement?.juge?.fourchette ? `[${p.rendement.juge.fourchette.map((x) => nombreSigne(x * 100)).join(' ; ')}]` : null,
        ecartDetectable: fini(p.rendement?.juge?.ecartDetectable) ? `± ${fr(p.rendement.juge.ecartDetectable * 100, 1)} %` : null,
        valeurCloture: fini(p.valeurCloture?.moyenne) ? `${nombreSigne(p.valeurCloture.moyenne * 100)} %` : 'pas de clôture',
        fourchetteCloture: p.valeurCloture?.juge?.fourchette ? `[${p.valeurCloture.juge.fourchette.map((x) => nombreSigne(x * 100)).join(' ; ')}]` : null,
        verdictCloture: p.valeurCloture?.juge ? libelleVerdict(p.valeurCloture.juge.verdict) : null,
        pireSerie: p.pireSerie,
        zoneNormale: p.zoneNormale,
        detail: detailDesParis(p),
        fraicheur: Object.entries(p.parFraicheur ?? {}).map(([etat, f]) => `${entier(f.n)} ${etat === 'fraiche' ? 'sur une cote fraîche' : etat === 'a-rafraichir' ? 'sur une cote à rafraîchir' : etat}`),
        tousLesReleves: p.tousLesReleves ?? null,
        relevesFrais: p.relevesFrais ?? null
      }))
      .sort((a, b) => TRANCHES.findIndex((t) => t.id === a.tranche) - TRANCHES.findIndex((t) => t.id === b.tranche));
    const premier = tous.find((p) => p.regle === regle);
    return { regle, titre: premier?.titre ?? regle, phrase: premier?.phrase ?? '', vosParis: premier?.vosParis === true, lignes };
  });
}

/**
 * Le détail d'une ligne de paris (bloc 5) : par tranche de cote et par championnat. Σ pour le nombre de paris,
 * ⌀ pour le rendement (gain total ÷ mise totale : jamais une somme de pourcentages). Rapporté, sans pastille.
 */
function detailDesParis(p) {
  const rendement = (gain, n) => (n ? `${nombreSigne((gain / n) * 100)} %` : 'aucun pari');
  const parCote = (p.parTranche ?? []).filter((t) => t.n > 0).map((t) => ({ cle: t.cle, libelle: t.libelle, n: t.n, rendement: rendement(t.gain, t.n) }));
  const parLigue = Object.entries(p.parChampionnat ?? {})
    .map(([league, c]) => ({ cle: league, libelle: league, n: c.n, rendement: rendement(c.gain, c.n), valeurCloture: c.nCloture ? `${nombreSigne((c.valeurCloture / c.nCloture) * 100)} %` : 'pas de clôture' }))
    .sort((a, b) => b.n - a.n || a.libelle.localeCompare(b.libelle, 'fr'));
  return { parCote, parLigue, total: { n: p.n ?? 0, rendement: rendement(p.rendement?.gain ?? 0, p.n ?? 0) } };
}

/**
 * Les paris simulés de la NOTE DE DÉPART (P2, règle du moteur, avant-match football-data), dans la forme de
 * parisDuRejeu, quand cette appli n'a encore fait aucun rejeu. Sans détail par cote ni par championnat : la
 * note ne les garde pas (le premier rejeu les donne).
 */
export function parisDeLaNote(note, regles = {}, jeux = {}) {
  const p = note?.depart?.P2?.paris;
  if (!p) return [];
  const pourcent = (x) => `${nombreSigne(x * 100)} %`;
  const fourchette = (f) => (Array.isArray(f) && f.length === 2 && f.every(fini) ? `[${f.map((x) => nombreSigne(x * 100)).join(' ; ')}]` : null);
  const regle = regles.moteur ?? {};
  return [
    {
      regle: 'moteur',
      titre: regle.titre ?? 'Règle du moteur',
      phrase: regle.phrase ?? '',
      vosParis: true,
      lignes: [
        {
          cle: 'note|P2|fd-avant-match|moteur',
          tranche: 'P2',
          prix: 'fd-avant-match',
          prixTitre: jeux['fd-avant-match']?.titre ?? 'fd-avant-match',
          decisions: p.decisions ?? 0,
          paris: p.paris ?? 0,
          refus: Object.entries(p.refus ?? {}).sort((a, b) => b[1] - a[1]),
          rendement: fini(p.rendement?.parUnite) ? pourcent(p.rendement.parUnite) : 'aucun pari',
          fourchetteRendement: fourchette(p.rendement?.fourchette),
          ecartDetectable: fini(p.rendement?.ecartDetectable) ? `± ${fr(p.rendement.ecartDetectable * 100, 1)} %` : null,
          valeurCloture: fini(p.valeurCloture?.moyenne) ? pourcent(p.valeurCloture.moyenne) : 'pas de clôture',
          fourchetteCloture: fourchette(p.valeurCloture?.fourchette),
          verdictCloture: p.valeurCloture?.verdict ? libelleVerdict(p.valeurCloture.verdict) : null,
          pireSerie: p.pireSerie ?? null,
          zoneNormale: p.zoneNormale ?? null,
          detail: null,
          fraicheur: [],
          tousLesReleves: null,
          relevesFrais: null
        }
      ]
    }
  ];
}

/** Les raisons de refus d'un pari, en clair. */
export const RAISONS_DE_REFUS = Object.freeze({
  pas_de_value: 'pas de value',
  trop_peu_de_bookmakers: 'pas de Pinnacle (trop peu de bookmakers de référence)',
  aucun_bookmaker_autorise: 'aucun de vos bookmakers ne cote le match',
  bookmakers_juges: 'vos bookmakers ont fixé la cote juste (juge et partie)',
  cotes_incoherentes: 'cotes incohérentes',
  value_hors_limites: 'value hors limites (cote > 5 ou avantage > 25 %)',
  no_market_odds: 'aucune cote'
});

/**
 * La CARTE championnat × marché (P2 ou P3) : une ligne par championnat, une colonne par marché ; chaque case
 * est un verdict (vert seulement « retenu », rouge « moins bon », gris sinon, « pas assez de matchs » en clair).
 */
export function carteDuRejeu(resume, { tranche = 'P2', groupe = null } = {}) {
  const cles = GROUPES_DE_LA_CARTE.find((g) => g.id === groupe)?.cles ?? null;
  const cases = (resume?.carte ?? []).filter((c) => c.type === 'probabilites' && c.tranche === tranche && (!cles || cles.includes(c.marketKey)));
  const ligues = [...new Set(cases.map((c) => c.league))].sort((a, b) => a.localeCompare(b, 'fr'));
  const marches = [...new Set(cases.map((c) => `${c.marketKey}|${c.ligne ?? '-'}`))].sort((a, b) => ORDRE.indexOf(a.split('|')[0]) - ORDRE.indexOf(b.split('|')[0]) || a.localeCompare(b));
  const index = new Map(cases.map((c) => [`${c.league}|${c.marketKey}|${c.ligne ?? '-'}`, c]));
  return {
    marches: marches.map((m) => {
      const [k, l] = m.split('|');
      return { cle: m, libelle: libelleDuMarche(k, l === '-' ? null : Number(l)) };
    }),
    lignes: ligues.map((league) => ({
      league,
      cases: marches.map((m) => {
        const c = index.get(`${league}|${m}`);
        return c ? { n: c.n, face: c.face, ...ecartDuJuge(c.juge) } : null;
      })
    })),
    paris: (resume?.carte ?? []).filter((c) => c.type === 'paris').map((c) => ({ league: c.league, zone: c.zone, indicatif: c.indicatif, n: c.n, ...ecartDuJuge(c.juge) }))
  };
}

/** Les groupes de colonnes de la carte (le sélecteur) : 27 lignes de marché ne tiennent pas d'un coup. */
export const GROUPES_DE_LA_CARTE = Object.freeze([
  Object.freeze({ id: 'buts', titre: 'Résultat, buts et score', cles: Object.freeze(['result', 'totalGoals', 'bothTeamsScore', 'teamGoals:home', 'teamGoals:away', 'resultAndTotal', 'scoreExact']) }),
  Object.freeze({ id: 'corners', titre: 'Corners', cles: Object.freeze(['totalCorners', 'teamCorners:home', 'teamCorners:away']) }),
  Object.freeze({ id: 'tirs', titre: 'Tirs', cles: Object.freeze(['totalShots', 'teamShots:home', 'teamShots:away']) }),
  Object.freeze({ id: 'cadres', titre: 'Tirs cadrés', cles: Object.freeze(['totalShotsOnTarget', 'teamShotsOnTarget:home', 'teamShotsOnTarget:away']) })
]);

const STATS_DITES = Object.freeze({ corners: 'corners', shots: 'tirs', shotsOnTarget: 'tirs cadrés' });
/** Les rencontres écartées d'une tranche (ou non réglées pour un marché), avec leur raison, en clair. */
export function ecarteesDites(comptes, jeux = {}) {
  if (!comptes) return [];
  const dits = {
    attribue: 'résultat attribué (ni pronostic ni pari)',
    prolongationSansScore90: 'prolongation sans score à 90 minutes',
    sansScore: 'sans score relevé',
    scoreDifferent: 'score différent de football-data (sans ses cotes)',
    rattachementIncertain: 'rattachement à football-data incertain',
    sansRencontreAuMagasin: 'ligne football-data sans rencontre au magasin (écartée, décision de Pierre)',
    doublonFd: 'ligne football-data en double (la première gardée)',
    fenetreIncomplete: 'moins de 6 relevés de corners d’un côté',
    sansMoyenneDeLigue: 'sans moyenne de buts du championnat (barème)'
  };
  const lignes = Object.entries(comptes)
    .filter(([k, v]) => k in dits && fini(v) && v > 0)
    .map(([k, v]) => ({ cle: k, texte: `${entier(v)} ${dits[k]}` }));
  // Les statistiques non réglées, par sorte : non relevées (0-0 du magasin), d'un match prolongé, d'un résultat attribué.
  const parPrefixe = (prefixe, phrase) => {
    const sortes = Object.entries(comptes).filter(([k, v]) => k.startsWith(`${prefixe}:`) && fini(v) && v > 0);
    if (sortes.length) lignes.push({ cle: prefixe, texte: `${phrase} : ${sortes.map(([k, v]) => `${STATS_DITES[k.split(':')[1]] ?? k.split(':')[1]} ${entier(v)}`).join(', ')}` });
  };
  parPrefixe('statNonRelevee', 'statistique non relevée');
  parPrefixe('prolongationStats', 'statistique d’un match prolongé (non réglable)');
  for (const [prix, c] of Object.entries(comptes.parPrix ?? {})) {
    if (fini(c.sansPrix) && c.sansPrix > 0) lignes.push({ cle: `sansPrix|${prix}`, texte: `${entier(c.sansPrix)} sans prix « ${jeux[prix]?.titre ?? prix} »` });
    if (fini(c.cotesIncoherentes) && c.cotesIncoherentes > 0) lignes.push({ cle: `incoherentes|${prix}`, texte: `${entier(c.cotesIncoherentes)} cotes incohérentes refusées (« ${jeux[prix]?.titre ?? prix} »)` });
  }
  return lignes;
}

/** Les codes football-data que le magasin ne suit pas, nommés pour Pierre (le reste : le code tel quel). */
const CODES_FD_DITS = Object.freeze({ EC: 'National League', JPN: 'J-League', SC1: 'Scottish Championship', SC2: 'Scottish League One', SC3: 'Scottish League Two' });

/**
 * Les rencontres ÉCARTÉES d'un rejeu (bloc 7) : celles du rejeu entier (bilan) puis, tranche par tranche, les
 * raisons comptées. Jamais une rencontre écartée en silence ; la décision 4 de Pierre (lien 4) dite avec son
 * compte, même nul.
 */
export function ecarteesDuRejeu(rejeu, jeux = {}) {
  const b = rejeu?.bilan;
  if (!b) return null;
  const e = b.ecartees ?? {};
  const liens = (code) => Object.values(b.liensFd ?? {}).reduce((s, v) => s + (fini(v?.[code]) ? v[code] : 0), 0);
  const globales = [
    { cle: 'attribue', texte: `${entier(e.attribue)} rencontre(s) au résultat attribué : ni pronostic ni pari` },
    { cle: 'lien4', texte: `${entier(liens('4'))} ligne(s) football-data sans rencontre au magasin (lien 4) : écartées et comptées (décision de Pierre)` },
    { cle: 'lien3', texte: `${entier(liens('3'))} ligne(s) football-data au rattachement incertain (lien 3) : écartées et comptées` }
  ];
  if (fini(e.fdHorsSource) && e.fdHorsSource > 0) {
    // Corrigé le 19/10 : ce ne sont pas des rencontres « laissées au magasin » — le magasin ne suit pas ces championnats.
    const parCode = Object.entries(b.fdHorsSourceParCode ?? {}).sort((x, y) => y[1] - x[1]);
    const noms = parCode.length ? ` (${parCode.map(([code, n]) => `${CODES_FD_DITS[code] ?? code} ${entier(n)}`).join(', ')})` : '';
    globales.push({ cle: 'fdHorsSource', texte: `${entier(e.fdHorsSource)} ligne(s) football-data d’après juin 2023 non rejouées : de 2023 à 2026, seul le magasin est rejoué, et il ne suit pas ces championnats${noms}` });
  }
  if (fini(e.avantMoteur) && e.avantMoteur > 0) globales.push({ cle: 'avantMoteur', texte: `${entier(e.avantMoteur)} rencontre(s) d’avant le 29/07/2005 : échauffement des formes seulement` });
  if (fini(e.sansLigneJourJ) && e.sansLigneJourJ > 0) globales.push({ cle: 'sansLigneJourJ', texte: `${entier(e.sansLigneJourJ)} rencontre(s) du magasin sans ligne dans la table du jour J` });
  if (fini(b.horsGrille) && b.horsGrille > 0) globales.push({ cle: 'horsGrille', texte: `${entier(b.horsGrille)} score(s) hors de la grille 9 × 9 : réglés au plancher et comptés, jamais écartés` });
  const parTranche = TRANCHES.filter((t) => rejeu.resume?.comptes?.[t.id]).map((t) => {
    const c = rejeu.resume.comptes[t.id];
    return { cle: t.id, titre: t.titre, rencontres: entier(c.rencontres), raisons: ecarteesDites(c, jeux) };
  });
  return { globales, parTranche };
}

/**
 * CE QUE LE BANC PEUT PROUVER, et sur quelle période (conception §4.2, tableau des amendements) : dit tel quel
 * sur la page, pour que personne ne lise une preuve là où il n'y en a pas.
 */
export const CE_QUI_SE_PROUVE = Object.freeze([
  Object.freeze({ quoi: '1N2', periode: 'P2 (2019-2023)', prix: 'football-data, avant-match', preuve: 'preuve au banc — le moteur est Pinnacle : l’écart mesure Pinnacle face à la moyenne' }),
  Object.freeze({ quoi: '1N2', periode: 'P3 (2023-24)', prix: 'football-data, avant-match ; cotes gratuites', preuve: 'indicatif ; la fiabilité face à celle de l’appli : mesure neuve' }),
  Object.freeze({ quoi: '1N2 sans cote', periode: 'P2 à P5', prix: 'aucun (face au repère)', preuve: 'témoin, hors de la note' }),
  Object.freeze({ quoi: 'Autres lignes, score exact, statistiques', periode: 'P2, P3', prix: 'face au repère', preuve: 'preuve au banc, une case par ligne' }),
  Object.freeze({ quoi: 'Paris : rendement', periode: '27/07/2012 → 27/03/2025', prix: 'football-data, avant-match', preuve: 'jamais : rapporté (environ ± 8 % pour 1 000 paris)' }),
  Object.freeze({ quoi: 'Paris : valeur de clôture', periode: 'même fenêtre', prix: 'clôture Pinnacle', preuve: 'elle prouve (environ ± 0,45 % pour 1 000 paris) : P2, et P1 depuis 07/2012 ; P3 et P4a indicatifs' }),
  Object.freeze({ quoi: 'Paris à vos prix', periode: 'P5 (depuis le 24/09/2026)', prix: 'vos bookmakers', preuve: 'preuve neuve ; environ 46 paris par mois : « pas assez de matchs » attendu à la fin du plan' })
]);

/**
 * Le même TABLEAU depuis la note de départ, quand cette appli n'a encore fait aucun rejeu : les deux fenêtres
 * de la note (P2, jamais vue ; P4b, déjà vue), au prix d'avant-match football-data. La structure reste
 * complète ; seules ces deux colonnes ont des chiffres.
 */
export function tableauDeLaNote(note) {
  const colonnes = TRANCHES.filter((t) => t.id === 'P2' || t.id === 'P4b');
  const parLigne = new Map();
  for (const t of colonnes) {
    const marches = note?.depart?.[t.id]?.marches ?? {};
    for (const [cle, c] of Object.entries(marches)) {
      const [marketKey, l] = cle.split('|');
      const ligne = l === undefined ? null : Number(l);
      const k = `${marketKey}|${ligne ?? '-'}`;
      const entree = parLigne.get(k) ?? { cle: k, marketKey, ligne, libelle: libelleDuMarche(marketKey, ligne), cellules: {} };
      const duel = (d) => (d ? { verdict: d.verdict, enPourcent: d.enPourcent, raison: '', variantes: null, ecartDetectable: null } : null);
      entree.cellules[t.id] = {
        n: c.n,
        moteur: c.moteur?.perteLog ?? null,
        justes: c.moteur?.justes ?? null,
        marche: c.marche?.perteLog ?? null,
        repere: c.repere?.perteLog ?? null,
        ecartMarche: ecartDuJuge(duel(c.marche)),
        ecartRepere: ecartDuJuge(duel(c.repere)),
        // Les fenêtres vues que la NOTE dit pour cette période (recopiées du rejeu), jamais retapées ici (19/10).
        vues: vuesDeLaNote(note, t.id),
        sansMarche: !c.marche,
        temoins: temoinsDe(c.moteur, null)
      };
      parLigne.set(k, entree);
    }
  }
  const rang = (l) => {
    const i = ORDRE.indexOf(l.marketKey);
    return (i === -1 ? ORDRE.length : i) * 100 + (fini(l.ligne) ? l.ligne : 0);
  };
  return { colonnes, lignes: [...parLigne.values()].sort((a, b) => rang(a) - rang(b)) };
}

/** La case d'un rejeu (ou de la note) pour la courbe : un marché, une tranche, un jeu de prix. */
export function caseDuRejeu(resume, { tranche, prix, marketKey, ligne = null, sousTable = 'tout' }) {
  return (resume?.tranches?.[tranche]?.cases ?? []).find((c) => c.prix === prix && c.marketKey === marketKey && (c.ligne ?? null) === ligne && c.sousTable === sousTable) ?? null;
}
