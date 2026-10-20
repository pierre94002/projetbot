/**
 * santeDuMoteur.js — LE TABLEAU DE BORD DU MOTEUR, « Santé du moteur » (étape 24 du plan, 14/10/2026).
 * -----------------------------------------------------------------------
 * Une page qui RASSEMBLE ce que les autres étapes ont déjà préparé, SANS RIEN RECALCULER :
 *   - les trois feux du haut : les données (contrôle quotidien, étape 14), les sauvegardes (étape 1), le budget
 *     Claude (étape 4) ;
 *   - la note du moteur face au marché (banc d'essai, étape 19 : la note de départ écrite dans le code et le
 *     dernier rejeu rangé dans la base) et son évolution mois par mois ;
 *   - ce que le moteur annonçait face à ce qui est arrivé, et la valeur de clôture (calibration, étape 20) ;
 *   - la liste « à vérifier » (contrôle quotidien) ;
 *   - la version du moteur en service, l'essai d'une candidate et l'alerte de dérive (étape 25) ;
 *   - la place des corrections à accepter ou refuser (étape 26 : vide aujourd'hui).
 *
 * UNE SEULE PLACE PAR INFORMATION : chaque bloc ne donne qu'un RÉSUMÉ court (un chiffre, un feu, une phrase) et
 * un lien vers sa vraie place (Historique moteur, Banc d'essai, Réglages) — les grands tableaux et les courbes
 * restent là-bas.
 *
 * RIEN DE LOURD AU CHARGEMENT : seulement des lectures de résumés déjà écrits (fichiers de data/runtime, lignes
 * de la base, constantes du code). Le bilan du mois en cours est PRÉPARÉ par l'étape de nuit « calibrationMensuelle »
 * (data/calibration.js) ; tant qu'il ne l'est pas, le bloc dit « pas encore mesuré » et pourquoi — il ne lance
 * jamais le calcul (6 s au premier appel de la route de la calibration, le 14/10 chez Pierre : c'était lui).
 * Un bloc dont la lecture échoue ou dont la donnée manque RESTE affiché, avec sa raison ; les autres ne sont
 * pas touchés.
 *
 * Forme de chaque bloc : { cle, titre, etat, valeur, legende, phrase, source, mesureLe, action, lien, … } avec
 * `etat` : ok · attention · pas-mesure · indisponible ; `source` : le vrai fournisseur ou fichier ; `mesureLe` :
 * l'heure de la mesure (celle du calcul, pas celle de la page) ; `lien` : sa vraie place dans l'appli.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { lireLeControle } from './controleQuotidien.js';
import { etatSauvegardes } from './sauvegardes/etatSauvegardes.js';
import { etatBudgetClaude } from '../core/ai/claudeBudget.js';
import { etatDesVersions } from '../core/engine/engineVersions.js';
import { deriveDuMoteur } from './deriveMoteur.js';
import { resumeDeLaCalibration } from './calibration.js';
import { NOTE_DE_DEPART } from '../bench/noteDeDepart.js';
import { dernierRejeu, rejeuxDe } from '../bench/depotBanc.js';

// ============================================================ les vraies places

/** Où se trouve chaque information en grand (la page n'en donne que le résumé). Testé contre le routeur et les pages. */
export const LIENS = Object.freeze({
  donnees: Object.freeze({ chemin: '/reglages', query: Object.freeze({ carte: 'controle-quotidien' }), libelle: 'Réglages › Contrôle quotidien des données' }),
  sauvegardes: Object.freeze({ chemin: '/reglages', query: null, libelle: 'Réglages › Sauvegardes' }),
  budget: Object.freeze({ chemin: '/reglages', query: null, libelle: 'Réglages › Budget Claude' }),
  note: Object.freeze({ chemin: '/historique-moteur', query: Object.freeze({ onglet: 'banc' }), libelle: 'Historique moteur › Banc d’essai' }),
  calibration: Object.freeze({ chemin: '/historique-moteur', query: null, libelle: 'Historique moteur › Calibration du mois' }),
  cloture: Object.freeze({ chemin: '/historique-moteur', query: null, libelle: 'Historique moteur › Calibration du mois (valeur de clôture)' }),
  aVerifier: Object.freeze({ chemin: '/reglages', query: Object.freeze({ carte: 'controle-quotidien' }), libelle: 'Réglages › Contrôle quotidien des données' }),
  versions: Object.freeze({ chemin: '/reglages', query: null, libelle: 'Réglages › Versions du moteur' }),
  corrections: Object.freeze({ chemin: '/feuille-de-route', query: null, libelle: 'Feuille de route › étape 26 (boucle de correction)' })
});

const lien = (cle) => {
  const l = LIENS[cle];
  return { chemin: l.chemin, query: l.query ? { ...l.query } : null, libelle: l.libelle };
};

// ============================================================ les mots

const NOMS_DES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const nombre = (n) => fr(fini(n) ? n : 0);
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${fini(n) && Math.abs(n) >= 2 ? plusieurs : un}`;
const signe1 = (x) => {
  const r = Math.round(x * 10) / 10;
  return `${r < 0 ? '−' : '+'}${fr(Math.abs(r), 1)}`;
};
const moisDit = (mois) => (/^\d{4}-\d{2}$/.test(mois ?? '') ? `${NOMS_DES_MOIS[Number(mois.slice(5, 7)) - 1] ?? mois} ${mois.slice(0, 4)}` : 'mois inconnu');
const jourDit = (jour) => (/^\d{4}-\d{2}-\d{2}/.test(jour ?? '') ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : 'jour inconnu');
const FORMAT_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partiesDeParis = (instant) => {
  const t = Date.parse(instant ?? '');
  return Number.isFinite(t) ? Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(t)).map((x) => [x.type, x.value])) : null;
};
/** « 14/10/2026 à 02 h 31 », heure de Paris ; « date inconnue » sans instant lisible. */
function quand(instant) {
  const p = partiesDeParis(instant);
  return p ? `${p.day}/${p.month}/${p.year} à ${p.hour} h ${p.minute}` : 'date inconnue';
}
/** « 14/10/2026 », le jour de Paris d'un instant. */
function jourDeParis(instant) {
  const p = partiesDeParis(instant);
  return p ? `${p.day}/${p.month}/${p.year}` : 'jour inconnu';
}
/** Des tokens en mots simples : 760 000 → « 0,76 M », 1 200 000 → « 1,2 M », 850 → « 850 ». */
const tokensDits = (n) => (!fini(n) ? 'inconnu' : n >= 100_000 ? `${fr(n / 1e6, 2).replace(/,?0+$/, '')} M` : nombre(n));
const pourcentEntier = (x) => (fini(x) ? `${fr(Math.round(x * 100))} %` : 'inconnu');

/** Un bloc dont la donnée manque : toujours affiché, avec « pas encore mesuré » et pourquoi. */
const pasMesure = (base, raison) => ({ ...base, etat: 'pas-mesure', feu: null, valeur: 'pas encore mesuré', legende: null, phrase: `Pas encore mesuré : ${raison}`, raison });
/** Un bloc dont la lecture a échoué : affiché quand même, avec l'erreur. */
const indisponible = (base, erreur) => ({
  ...base,
  etat: 'indisponible',
  feu: null,
  valeur: 'illisible pour l’instant',
  legende: null,
  phrase: `Illisible pour l’instant : ${String(erreur ?? 'raison inconnue').slice(0, 240)}. Le reste de la page n’est pas touché.`,
  raison: String(erreur ?? 'raison inconnue').slice(0, 240)
});

// ============================================================ les lecteurs (seulement des lectures)

/** Les lectures de la page : chacune lit un résumé DÉJÀ écrit, aucune ne calcule. Remplaçables (les essais y mettent les leurs). */
export const LECTEURS = Object.freeze({
  controle: ({ maintenant }) => lireLeControle({ maintenant }),
  sauvegardes: ({ maintenant }) => etatSauvegardes({ maintenant: new Date(maintenant) }),
  budget: ({ maintenant }) => etatBudgetClaude({ maintenant }),
  banc: () => {
    const database = openDb();
    return { note: NOTE_DE_DEPART, dernier: dernierRejeu({ database, avecResume: false }), rejeux: rejeuxDe({ database, limite: 10 }).length };
  },
  calibration: ({ maintenant }) => resumeDeLaCalibration({ database: openDb(), maintenant }),
  versions: () => ({ versions: etatDesVersions(), derive: deriveDuMoteur({ database: openDb() }) }),
  // L'EMPLACEMENT des corrections (étape 26, boucle de correction) : vide tant qu'elle n'est pas construite. L'étape 26
  // remplace cette lecture par celle de ses propositions ({ disponible: true, aAccepter: [...] }).
  corrections: () => ({ disponible: false, aAccepter: [] })
});

// ============================================================ les trois feux

function feuDonnees(c) {
  const base = {
    cle: 'donnees',
    titre: 'Données',
    source: { libelle: 'Contrôle quotidien des données (fait par l’actualisation, étape 14)', fichier: c.fichier ?? 'data/runtime/controle-quotidien.json' },
    mesureLe: c.le ?? null,
    action: 'contrôlé',
    lien: lien('donnees')
  };
  if (c.etat === 'jamais') return pasMesure(base, 'le contrôle quotidien se fait à la fin de la prochaine passe d’actualisation.');
  if (c.etat !== 'pret') return indisponible(base, c.raison ?? c.erreur ?? 'état du contrôle illisible');
  const compte = c.compte ?? {};
  const total = (compte.vert ?? 0) + (compte.orange ?? 0) + (compte.rouge ?? 0) + (compte.erreur ?? 0) + (compte.nonFait ?? 0);
  const aRegarder = (compte.orange ?? 0) + (compte.rouge ?? 0) + (compte.erreur ?? 0);
  const feu = ['vert', 'orange', 'rouge'].includes(c.feu) ? c.feu : null;
  return {
    ...base,
    etat: feu === 'vert' ? 'ok' : 'attention',
    feu,
    valeur: aRegarder ? pluriel(aRegarder, 'contrôle à regarder', 'contrôles à regarder') : 'tout est vert',
    legende: `sur ${pluriel(total, 'contrôle', 'contrôles')}`,
    phrase:
      `Contrôle du ${quand(c.le)} : ${nombre(compte.vert ?? 0)} vert${(compte.vert ?? 0) >= 2 ? 's' : ''}, ${nombre(compte.orange ?? 0)} orange, ${nombre(compte.rouge ?? 0)} rouge` +
      ((compte.erreur ?? 0) ? `, ${pluriel(compte.erreur, 'en panne', 'en panne')}` : '') +
      ((compte.nonFait ?? 0) ? `, ${nombre(compte.nonFait)} pas fait${compte.nonFait >= 2 ? 's' : ''}` : '') +
      '.'
  };
}

function feuSauvegardes(s) {
  const base = {
    cle: 'sauvegardes',
    titre: 'Sauvegardes',
    source: { libelle: 'Sauvegardes de la base (étape 1) : état préparé par les scripts de sauvegarde et de restauration d’essai', fichier: s.dossier ?? null },
    mesureLe: s.etatPrepareLe ?? s.derniereReussie?.fin ?? null,
    action: 'préparé',
    lien: lien('sauvegardes')
  };
  const alertes = Array.isArray(s.alertes) ? s.alertes : [];
  // Ni sauvegarde notée, ni tentative, ni alerte : rien n'a été mesuré (jamais un feu vert sur du vide).
  if (!s.derniereReussie && !s.derniere && !alertes.length) return pasMesure(base, 'aucune sauvegarde de nuit n’est notée pour l’instant ; la première se fait à la prochaine passe d’actualisation.');
  const grave = alertes.some((a) => a.niveau === 'danger');
  const feu = grave ? 'rouge' : alertes.length ? 'orange' : 'vert';
  const reussie = s.derniereReussie ?? null;
  return {
    ...base,
    etat: feu === 'vert' ? 'ok' : 'attention',
    feu,
    valeur: reussie ? `le ${jourDeParis(reussie.fin)}` : 'aucune pour l’instant',
    legende: 'dernière sauvegarde réussie',
    phrase: alertes.length
      ? `${pluriel(alertes.length, 'point à regarder', 'points à regarder')} : ${String(alertes[0].texte).replace(/\.$/, '')}${alertes.length > 1 ? ` (et ${pluriel(alertes.length - 1, 'autre', 'autres')}).` : '.'}`
      : `Dernière sauvegarde réussie le ${quand(reussie?.fin)} ; restauration d’essai saine, copie hors du disque en ordre.`
  };
}

function feuBudget(b) {
  const base = {
    cle: 'budget',
    titre: 'Budget Claude',
    source: { libelle: 'Journal des appels à Claude (étape 4) : tokens du jour et de la semaine face au budget choisi', fichier: b.journal?.dossier ?? null },
    mesureLe: b.generatedAt ?? null,
    action: 'lu',
    lien: lien('budget')
  };
  const jour = b.aujourdhui ?? {};
  const semaine = b.cetteSemaine ?? {};
  if (!fini(jour.part)) return pasMesure(base, 'le journal des appels à Claude ne donne pas encore les tokens du jour.');
  const depasse = (jour.part ?? 0) >= 1 || (semaine.part ?? 0) >= 1;
  const econome = Boolean(b.mode?.econome);
  const probleme = Boolean(b.journal?.erreur) || (b.journal?.problemes ?? []).length > 0;
  const feu = depasse ? 'rouge' : econome || probleme ? 'orange' : 'vert';
  return {
    ...base,
    etat: feu === 'vert' ? 'ok' : 'attention',
    feu,
    valeur: pourcentEntier(jour.part),
    legende: 'du budget du jour',
    phrase:
      `Aujourd’hui ${tokensDits(jour.tokens?.total)} tokens sur ${tokensDits(jour.budget)} (${pourcentEntier(jour.part)}) ; cette semaine ${tokensDits(semaine.tokens?.total)} sur ${tokensDits(semaine.budget)} (${pourcentEntier(semaine.part)}). ` +
      `${b.mode?.raison ? String(b.mode.raison).replace(/\.$/, '') : econome ? 'Mode économe' : 'Mode normal'}` +
      (probleme ? ` ; le journal des appels a un souci (${b.journal?.erreur ?? b.journal?.problemes?.[0] ?? 'à voir dans Réglages'}).` : '.') +
      ' L’appli ne voit pas la semaine de l’abonnement Max, seulement ses propres appels.'
  };
}

// ============================================================ les blocs

function blocNote({ note, dernier, rejeux }) {
  const base = {
    cle: 'note',
    titre: 'Note du moteur face au marché',
    source: { libelle: `Banc d’essai (étape 19) : note de départ du ${jourDit(note?.calculeeLe)} écrite dans le code${dernier ? `, dernier rejeu n° ${dernier.id} rangé dans le magasin` : ''}`, fichier: 'src/bench/noteDeDepart.js ; table bench_runs du magasin SQLite' },
    mesureLe: dernier?.finiLe ?? note?.calculeeLe ?? null,
    action: 'noté',
    lien: lien('note')
  };
  const lignes = note?.depart?.P2?.marches ?? null;
  if (!lignes || !Object.keys(lignes).length) return pasMesure(base, 'la note de départ du banc d’essai n’est pas écrite dans le code (elle l’est après le rejeu complet du bac à sable).');
  const duel = (cle, libelle) => {
    const l = lignes[cle];
    const m = l?.marche;
    if (!m) return null;
    return { cle, libelle, matchs: l.n, moteur: l.moteur?.perteLog ?? null, marche: m.perteLog ?? null, gainPourcent: m.enPourcent?.gain ?? null, verdict: m.verdict ?? null };
  };
  const faceAuMarche = [duel('result', 'Résultat (1N2)'), duel('totalGoals|2.5', 'Total buts 2,5')].filter(Boolean);
  const comptes = { retenu: 0, pasProuve: 0, moinsBon: 0, autres: 0, total: 0 };
  for (const l of Object.values(lignes)) {
    const v = l.repere?.verdict;
    if (!v) continue;
    comptes.total++;
    if (v === 'retenu') comptes.retenu++;
    else if (v === 'pas-prouve') comptes.pasProuve++;
    else if (v === 'moins-bon') comptes.moinsBon++;
    else comptes.autres++;
  }
  const un = faceAuMarche.find((d) => d.cle === 'result');
  const plusMoins = faceAuMarche.find((d) => d.cle === 'totalGoals|2.5');
  const phraseUn = !un
    ? ''
    : un.verdict === 'pas-prouve'
      ? `Sur le 1N2, le moteur fait aussi bien que le marché (perte ${fr(un.moteur, 4)} contre ${fr(un.marche, 4)} : pas de différence prouvée). `
      : un.verdict === 'retenu'
        ? `Sur le 1N2, le moteur fait mieux que le marché (perte ${fr(un.moteur, 4)} contre ${fr(un.marche, 4)}). `
        : `Sur le 1N2, le moteur fait moins bien que le marché (perte ${fr(un.moteur, 4)} contre ${fr(un.marche, 4)}). `;
  const phrasePlusMoins = !plusMoins ? '' : `Sur le plus/moins 2,5 buts, ${plusMoins.verdict === 'moins-bon' ? 'il fait moins bien' : plusMoins.verdict === 'retenu' ? 'il fait mieux' : 'la différence n’est pas prouvée'} (${fr(plusMoins.moteur, 4)} contre ${fr(plusMoins.marche, 4)}). `;
  return {
    ...base,
    etat: 'ok',
    feu: null,
    valeur: `${nombre(comptes.retenu)} sur ${nombre(comptes.total)}`,
    legende: 'marchés meilleurs que le championnat seul (2019-2023, jamais vus)',
    phrase: `${phraseUn}${phrasePlusMoins}Face au championnat seul : ${nombre(comptes.retenu)} marchés mieux, ${nombre(comptes.pasProuve)} pas prouvés, ${nombre(comptes.moinsBon)} moins bien. Par championnat, le détail est dans le banc d’essai.`,
    faceAuMarche,
    faceAuRepere: comptes,
    periode: { nom: 'P2', de: '2019-07-01', a: '2023-06-30', jamaisVue: true },
    noteDuJour: note?.calculeeLe ?? null,
    dernierRejeu: dernier ? { id: dernier.id, finiLe: dernier.finiLe, dureeMs: dernier.bilan?.dureeMs ?? null, ou: dernier.ou ?? null } : null,
    rejeux
  };
}

/** L'évolution mois par mois : les mois figés, du plus ancien au plus récent (au plus douze), chacun avec son écart annoncé / réalisé et son verdict. */
function evolutionDesMois(figes) {
  return [...(figes ?? [])]
    .slice(0, 12)
    .reverse()
    .map((m) => ({ mois: m.mois, pronostics: m.pronostics ?? 0, matchs: m.matchs ?? 0, annonce: m.annonce ?? null, realise: m.realise ?? null, ecart: m.ecart ?? null, verdict: m.verdict ?? null }));
}

function raisonSansBilan(preparation, prochainGel) {
  switch (preparation?.etat) {
    case 'absente':
      return 'le bilan du mois en cours est préparé chaque nuit par l’actualisation (et à chaque clic sur « Actualiser ») ; la prochaine passe l’écrira. La page ne le calcule jamais.';
    case 'illisible':
      return `le bilan préparé du mois en cours ne se lit pas pour l’instant${preparation.erreur ? ` (${preparation.erreur})` : ''} ; la prochaine actualisation le refera.`;
    case 'ancienne':
      return 'le bilan préparé date d’un autre mois ou d’une autre forme du calcul ; la prochaine actualisation le refera.';
    default:
      return `aucun pronostic mesuré pour l’instant${prochainGel?.le ? ` (le premier mois sera figé le ${jourDit(prochainGel.le)} à partir de ${prochainGel.heure ?? 6} h)` : ''}.`;
  }
}

function blocCalibration(c) {
  const base = {
    cle: 'calibration',
    titre: 'Annoncé face à réalisé',
    source: { libelle: 'Pronostics gelés du moteur · magasin FotMob (étape 20), bilan préparé par l’actualisation', fichier: 'data/runtime/calibration-en-cours.json (mois en cours) ; table calibration_monthly du magasin SQLite (mois figés)' },
    mesureLe: c.bilan?.fige ? c.bilan.figeLe : c.bilan?.calculeLe ?? null,
    action: c.bilan?.fige ? 'figé' : 'préparé',
    lien: lien('calibration')
  };
  const evolution = evolutionDesMois(c.figes);
  const v = c.bilan?.premiere ?? null;
  if (!c.bilan || !v?.global) return { ...pasMesure(base, raisonSansBilan(c.preparation, c.prochainGel)), mois: c.moisEnCours, evolution, prochainGel: c.prochainGel };
  const g = v.global;
  const etatDuMois = c.bilan.fige ? 'figé' : c.bilan.enCours ? 'en cours' : 'pas encore figé';
  const suffixe = g.pronostics
    ? `le moteur annonçait ${fr((g.annonce ?? 0) * 100, 1)} % en moyenne, il est arrivé ${fr((g.realise ?? 0) * 100, 1)} % — ${pluriel(g.pronostics, 'pronostic réglé', 'pronostics réglés')} sur ${pluriel(g.matchs, 'match', 'matchs')}.`
    : `aucun pronostic réglé pour l’instant (${pluriel(c.bilan.pronostics?.geles ?? 0, 'pronostic gelé', 'pronostics gelés')}, les résultats arrivent).`;
  return {
    ...base,
    etat: 'ok',
    feu: null,
    valeur: g.pronostics && fini(g.ecart) ? `${signe1(g.ecart * 100)} point${Math.abs(g.ecart * 100) >= 2 ? 's' : ''}` : 'pas encore mesuré',
    legende: `réalisé moins annoncé, tous marchés, ${moisDit(c.bilan.mois)} (${etatDuMois})`,
    phrase: `${moisDit(c.bilan.mois).replace(/^./, (x) => x.toUpperCase())} (${etatDuMois}) : ${suffixe} Les courbes, marché par marché et par championnat, sont dans Historique moteur.`,
    mois: c.bilan.mois,
    etatDuMois,
    jusquAu: c.bilan.jusquAu ?? null,
    global: g,
    pronostics: { reglees: v.reglees, matchs: v.matchs, geles: c.bilan.pronostics?.geles ?? 0 },
    evolution,
    prochainGel: c.prochainGel,
    juge: c.juge
  };
}

function blocCloture(c) {
  const base = {
    cle: 'cloture',
    titre: 'Valeur de clôture',
    source: { libelle: 'Cotes gratuites archivées (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets) face aux pronostics gelés (étape 20)', fichier: 'tables odds_events et odds_quotes du magasin SQLite ; bilan préparé : data/runtime/calibration-en-cours.json' },
    mesureLe: c.bilan?.fige ? c.bilan.figeLe : c.bilan?.calculeLe ?? null,
    action: c.bilan?.fige ? 'figé' : 'préparé',
    lien: lien('cloture')
  };
  const cloture = c.bilan?.premiere?.cloture ?? null;
  const paris = c.bilan?.paris?.cloture ?? null;
  if (!c.bilan || !cloture) return pasMesure(base, raisonSansBilan(c.preparation, c.prochainGel));
  const mesures = cloture.mesures ?? 0;
  const pronos = mesures
    ? `La cote juste a ${cloture.moyenne >= 0 ? 'baissé' : 'monté'} de ${fr(Math.abs(cloture.moyenne), 1)} % en moyenne entre le gel du pronostic et la clôture (${pluriel(mesures, 'pronostic mesuré', 'pronostics mesurés')}) : le marché ${cloture.moyenne >= 0 ? 'a plutôt donné raison au moteur' : 'est plutôt allé contre le moteur'}.`
    : 'Aucun pronostic mesuré pour l’instant (il faut les cotes d’avant le coup d’envoi et le match joué).';
  const pari = paris?.mesures ? ` Vos paris simples : ${signe1(paris.moyenne)} % sur ${pluriel(paris.mesures, 'pari mesuré', 'paris mesurés')}.` : paris?.indisponible ? ` Vos paris : pas mesurés (${paris.indisponible}).` : ' Aucun de vos paris simples n’est mesuré ce mois-là.';
  return {
    ...base,
    etat: 'ok',
    feu: null,
    valeur: mesures ? `${signe1(cloture.moyenne)} %` : 'pas encore mesurée',
    legende: mesures ? `sur ${pluriel(mesures, 'pronostic mesuré', 'pronostics mesurés')} — ${moisDit(c.bilan.mois)}` : `${moisDit(c.bilan.mois)}`,
    phrase: `${pronos}${pari} Seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » ont des cotes de clôture gratuites.`,
    mois: c.bilan.mois,
    cloture,
    paris
  };
}

function blocAVerifier(c) {
  const base = {
    cle: 'aVerifier',
    titre: 'À vérifier',
    source: { libelle: 'Contrôle quotidien des données (étape 14) : les raisons pour lesquelles des données sont douteuses', fichier: c.fichier ?? 'data/runtime/controle-quotidien.json' },
    mesureLe: c.le ?? null,
    action: 'contrôlé',
    lien: lien('aVerifier')
  };
  if (c.etat === 'jamais') return pasMesure(base, 'le contrôle quotidien se fait à la fin de la prochaine passe d’actualisation ; sans lui, aucun pronostic n’est marqué « à vérifier ».');
  if (c.etat !== 'pret') return indisponible(base, c.raison ?? c.erreur ?? 'état du contrôle illisible');
  const enEchec = (c.enEchec ?? []).slice(0, 6).map((x) => ({ cle: x.cle, libelle: x.libelle, statut: x.statut, constat: String(x.constat ?? '').slice(0, 200), total: x.total ?? 0 }));
  const av = c.aVerifier ?? {};
  const clubs = av.clubs ?? 0;
  const ligues = av.ligues ?? 0;
  const touches = clubs + ligues;
  return {
    ...base,
    etat: (c.enEchec ?? []).length ? 'attention' : 'ok',
    feu: null,
    valeur: (c.enEchec ?? []).length ? pluriel((c.enEchec ?? []).length, 'contrôle en échec', 'contrôles en échec') : 'rien à vérifier',
    legende: touches ? `${pluriel(clubs, 'club', 'clubs')} et ${pluriel(ligues, 'championnat', 'championnats')} concernés` : null,
    phrase: (c.enEchec ?? []).length
      ? `Les pronostics de ${pluriel(clubs, 'club', 'clubs')} et de ${pluriel(ligues, 'championnat', 'championnats')} portent le badge « à vérifier » (cartes de marchés, Opportunités, page du match) ; leur verdict ne change jamais. Les contrôles en échec, du plus grave au moins grave :`
      : 'Aucun contrôle en échec : aucun pronostic n’est marqué « à vérifier ».',
    clubs,
    ligues,
    generales: av.global ?? 0,
    enEchec,
    enEchecTotal: (c.enEchec ?? []).length
  };
}

const STATUTS_DE_CANDIDATE = Object.freeze({
  'pas-en-essai': 'pas encore calculée à blanc',
  'en-essai': 'en essai à blanc',
  jugee: 'jugée',
  modifiee: 'modifiée depuis son essai',
  'autre-version': 'à rejuger (la version en service a changé)'
});

function blocVersions({ versions: v, derive: d }) {
  const base = {
    cle: 'versions',
    titre: 'Versions du moteur',
    source: { libelle: 'Registre des versions du moteur (étape 25) et alerte de dérive (jugée sur le dernier mois figé de la calibration)', fichier: v?.fichier ?? 'data/runtime/engine-versions.json' },
    mesureLe: v?.majLe ?? null,
    action: 'noté',
    lien: lien('versions')
  };
  if (!v || v.source !== 'enregistre' || !v.enService) {
    return pasMesure(base, v?.source === 'absent' ? 'aucune version n’est notée pour l’instant ; la première le sera au prochain démarrage du serveur.' : 'le registre des versions est illisible pour l’instant.');
  }
  const candidate = v.candidate ?? null;
  const phraseCandidate = candidate
    ? `Candidate en essai : « ${candidate.quoi ?? candidate.id} » (${STATUTS_DE_CANDIDATE[candidate.statut] ?? candidate.statut}${candidate.jugement?.verdict ? `, verdict : ${candidate.jugement.verdict}` : ''}).`
    : 'Aucune candidate en essai.';
  const dernierMois = d?.dernierMois ?? null;
  let phraseDerive;
  if (d?.probleme) phraseDerive = `Dérive : pas lisible pour l’instant (${d.probleme}).`;
  else if (!dernierMois) phraseDerive = 'Dérive : pas encore jugée — elle se juge sur le premier mois figé (le 1er du mois suivant, à partir de 6 h).';
  else if (dernierMois.derive) phraseDerive = `Dérive du moteur en ${moisDit(dernierMois.mois)} : ${(dernierMois.signaux ?? []).map((x) => x.libelle ?? x.type).join(', ') || 'écart qui grandit'}.`;
  else phraseDerive = `Aucune dérive au dernier mois figé (${moisDit(dernierMois.mois)}).`;
  const enDerive = Boolean(dernierMois?.derive);
  return {
    ...base,
    etat: enDerive ? 'attention' : 'ok',
    feu: null,
    valeur: `version n° ${v.enService.numero}`,
    legende: `en service depuis le ${jourDit(v.enService.creeeLe)}`,
    phrase: `${phraseCandidate} ${phraseDerive}${v.adoption?.possible ? ' Une adoption est possible : elle se décide dans Réglages.' : ''}`,
    enService: { numero: v.enService.numero, creeeLe: v.enService.creeeLe, pourquoi: v.enService.pourquoi ?? null },
    enSynchro: v.enSynchro ?? null,
    candidate: candidate ? { id: candidate.id ?? null, quoi: candidate.quoi ?? null, statut: candidate.statut ?? null, verdict: candidate.jugement?.verdict ?? null } : null,
    adoption: { possible: Boolean(v.adoption?.possible), texte: v.adoption?.texte ?? null },
    derive: { jugee: Boolean(dernierMois), derive: enDerive, mois: dernierMois?.mois ?? null, moisFiges: d?.moisFiges ?? null, alerte: Boolean(d?.alerte) }
  };
}

function blocCorrections(r) {
  const base = {
    cle: 'corrections',
    titre: 'Corrections à accepter ou refuser',
    source: { libelle: 'Boucle de correction (étape 26 du plan)', fichier: null },
    mesureLe: null,
    action: 'proposé',
    lien: lien('corrections'),
    etape: '26',
    aAccepter: []
  };
  if (!r?.disponible) return pasMesure(base, 'la boucle de correction (étape 26) n’est pas encore construite. Ses propositions de correction arriveront ici, à accepter ou à refuser une par une ; rien n’est à décider aujourd’hui.');
  const liste = Array.isArray(r.aAccepter) ? r.aAccepter : [];
  return {
    ...base,
    etat: liste.length ? 'attention' : 'ok',
    feu: null,
    valeur: liste.length ? pluriel(liste.length, 'correction à décider', 'corrections à décider') : 'aucune à décider',
    legende: null,
    phrase: liste.length ? 'La boucle de correction propose des changements : chacun s’accepte ou se refuse ici.' : 'La boucle de correction n’a rien proposé.',
    aAccepter: liste
  };
}

// ============================================================ l'assemblage

/** Lit une source : sa valeur, ou l'erreur — jamais une exception qui emporterait la page. */
function lire(nom, lecteur, contexte) {
  const debut = performance.now();
  try {
    return { nom, ok: true, valeur: lecteur(contexte), ms: Math.round((performance.now() - debut) * 10) / 10 };
  } catch (error) {
    return { nom, ok: false, erreur: String(error?.message ?? error), ms: Math.round((performance.now() - debut) * 10) / 10 };
  }
}

/** Le bloc d'une lecture : la construction du bloc, ou « illisible » si la lecture (ou la construction) a échoué. */
function bloc(lecture, construire, basePourErreur) {
  if (!lecture.ok) return indisponible(basePourErreur, lecture.erreur);
  try {
    return construire(lecture.valeur);
  } catch (error) {
    return indisponible(basePourErreur, error?.message ?? error);
  }
}

const BASES_POUR_ERREUR = Object.freeze({
  donnees: { cle: 'donnees', titre: 'Données', source: { libelle: 'Contrôle quotidien des données (étape 14)', fichier: null }, mesureLe: null, action: 'contrôlé', lien: lien('donnees') },
  sauvegardes: { cle: 'sauvegardes', titre: 'Sauvegardes', source: { libelle: 'Sauvegardes de la base (étape 1)', fichier: null }, mesureLe: null, action: 'préparé', lien: lien('sauvegardes') },
  budget: { cle: 'budget', titre: 'Budget Claude', source: { libelle: 'Journal des appels à Claude (étape 4)', fichier: null }, mesureLe: null, action: 'lu', lien: lien('budget') },
  note: { cle: 'note', titre: 'Note du moteur face au marché', source: { libelle: 'Banc d’essai (étape 19)', fichier: null }, mesureLe: null, action: 'noté', lien: lien('note') },
  calibration: { cle: 'calibration', titre: 'Annoncé face à réalisé', source: { libelle: 'Calibration du mois (étape 20)', fichier: null }, mesureLe: null, action: 'préparé', lien: lien('calibration') },
  cloture: { cle: 'cloture', titre: 'Valeur de clôture', source: { libelle: 'Calibration du mois (étape 20)', fichier: null }, mesureLe: null, action: 'préparé', lien: lien('cloture') },
  aVerifier: { cle: 'aVerifier', titre: 'À vérifier', source: { libelle: 'Contrôle quotidien des données (étape 14)', fichier: null }, mesureLe: null, action: 'contrôlé', lien: lien('aVerifier') },
  versions: { cle: 'versions', titre: 'Versions du moteur', source: { libelle: 'Registre des versions du moteur (étape 25)', fichier: null }, mesureLe: null, action: 'noté', lien: lien('versions') },
  corrections: { cle: 'corrections', titre: 'Corrections à accepter ou refuser', source: { libelle: 'Boucle de correction (étape 26)', fichier: null }, mesureLe: null, action: 'proposé', lien: lien('corrections'), etape: '26', aAccepter: [] }
});

/**
 * Assemble la page : les trois feux, puis les blocs. Chaque source est lue UNE fois (le contrôle quotidien sert
 * à deux blocs). `lecteurs` : remplace une lecture (les essais). Ne lève jamais ; ne calcule rien.
 */
export function assemblerLaSante({ maintenant = Date.now(), lecteurs = {} } = {}) {
  const debut = performance.now();
  const L = { ...LECTEURS, ...lecteurs };
  const contexte = { maintenant };
  const lectures = Object.fromEntries(Object.keys(LECTEURS).map((nom) => [nom, lire(nom, L[nom], contexte)]));
  const B = BASES_POUR_ERREUR;
  const feux = [bloc(lectures.controle, feuDonnees, B.donnees), bloc(lectures.sauvegardes, feuSauvegardes, B.sauvegardes), bloc(lectures.budget, feuBudget, B.budget)];
  const blocs = {
    note: bloc(lectures.banc, blocNote, B.note),
    calibration: bloc(lectures.calibration, blocCalibration, B.calibration),
    cloture: bloc(lectures.calibration, blocCloture, B.cloture),
    aVerifier: bloc(lectures.controle, blocAVerifier, B.aVerifier),
    versions: bloc(lectures.versions, blocVersions, B.versions),
    corrections: bloc(lectures.corrections, blocCorrections, B.corrections)
  };
  // L'évolution de la note vient des mois figés de la calibration : un seul endroit où on les lit.
  if (blocs.note.etat !== 'indisponible') {
    const figes = lectures.calibration.ok ? lectures.calibration.valeur.figes : [];
    blocs.note.evolution = evolutionDesMois(figes);
    blocs.note.prochainGel = lectures.calibration.ok ? lectures.calibration.valeur.prochainGel : null;
  }
  return {
    genereLe: new Date(maintenant).toISOString(),
    dureeMs: Math.round((performance.now() - debut) * 10) / 10,
    feux,
    blocs,
    lectures: Object.values(lectures).map((l) => ({ nom: l.nom, ok: l.ok, ms: l.ms, erreur: l.ok ? null : l.erreur.slice(0, 200) })),
    regle: 'Cette page ne calcule rien : elle lit des résumés déjà écrits. Une information qui manque est dite « pas encore mesurée », jamais calculée à la volée.'
  };
}
