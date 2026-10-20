/**
 * gardeFous.js — ce que l'ÉCRAN dit des garde-fous (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Le ticket (TicketDuPari) signale, AVANT « J'ai parié », ce que le serveur
 * signalera APRÈS (réponse de POST /api/bets, `alertes`) : une mise au-delà de
 * la mise maximale de Pierre, de la mise acceptée connue chez ce bookmaker ou
 * de son solde déclaré, un compte limité ou fermé, la perte maximale de la
 * semaine atteinte. Les phrases sont celles du serveur, mot pour mot
 * (server/src/core/risk/gardeFous.js, alertesDuPari : un test les compare).
 * JAMAIS un refus : ces alertes ne vont pas dans « ce qui manque » (utils/
 * ticket.js, controleDuTicket) ; le bouton reste actif.
 * JavaScript pur : ni Vue, ni navigateur, ni réseau.
 * -----------------------------------------------------------------------
 */

/** Les états d'un compte bookmaker (fiche de Réglages) — les mêmes que le serveur. */
export const LIMITATIONS = Object.freeze({ aucune: 'Aucune limitation connue', limite: 'Compte limité (mises réduites)', ferme: 'Compte fermé' });

const cents = (x) => Math.round(x * 100) / 100;
/** « 20 € », « 12,50 € » — l'écriture du serveur. */
export function euros(x) {
  const v = cents(Number(x));
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}
/** « 05/10/2026 », jour de Paris. */
export function jourDit(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(t));
}

/** Un montant tapé dans un champ : vide, texte ou non fini → null (« aucun plafond », « non connu »). */
export function montantSaisi(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Ce qu'il faut signaler d'un pari — la règle du serveur (alertesDuPari), mot pour mot.
 * @returns {{ code: string, niveau: 'danger'|'warning', texte: string }[]}
 */
export function alertesDuPari({ mise, bookmaker = null, bookmakerTitle = null, reglage = { miseMaxParPari: null, perteMaxParSemaine: null }, compte = null, etat = null } = {}) {
  const alertes = [];
  const m = Number(mise);
  const chez = bookmakerTitle ?? bookmaker ?? 'ce bookmaker';
  const fiche = compte?.majLe ? ` (fiche du ${jourDit(compte.majLe)})` : '';
  if (Number.isFinite(m) && m > 0 && reglage?.miseMaxParPari !== null && reglage?.miseMaxParPari !== undefined && m > reglage.miseMaxParPari) {
    alertes.push({ code: 'mise-max-depassee', niveau: 'warning', texte: `Mise de ${euros(m)} au-delà de votre mise maximale par pari (${euros(reglage.miseMaxParPari)}, Réglages). Le pari s'enregistre quand même.` });
  }
  if (compte && bookmaker) {
    if (compte.limitation === 'ferme') {
      alertes.push({ code: 'compte-ferme', niveau: 'danger', texte: `Compte ${chez} noté fermé${fiche}. Le pari s'enregistre quand même.` });
    }
    if (Number.isFinite(compte.miseMaxAcceptee) && Number.isFinite(m) && m > compte.miseMaxAcceptee) {
      alertes.push({ code: 'mise-acceptee-depassee', niveau: 'warning', texte: `Mise de ${euros(m)} au-delà de la mise acceptée connue chez ${chez} : ${euros(compte.miseMaxAcceptee)}${fiche}.` });
    } else if (compte.limitation === 'limite' && !Number.isFinite(compte.miseMaxAcceptee)) {
      alertes.push({ code: 'compte-limite', niveau: 'warning', texte: `Compte ${chez} noté limité${fiche} : la mise acceptée peut être réduite.` });
    }
    if (Number.isFinite(compte.soldeDeclare) && Number.isFinite(m) && m > compte.soldeDeclare) {
      alertes.push({ code: 'solde-depasse', niveau: 'warning', texte: `Mise de ${euros(m)} au-delà du solde déclaré chez ${chez} : ${euros(compte.soldeDeclare)}${fiche}.` });
    }
  }
  if (etat?.bloque) {
    alertes.push({
      code: etat.motif ?? 'perte-semaine-atteinte',
      niveau: etat.motif === 'perte-semaine-engagee' ? 'warning' : 'danger',
      texte: `${etat.motif === 'perte-semaine-engagee' ? 'Perte maximale de la semaine engagée' : 'Perte maximale de la semaine atteinte'} : le moteur ne conseille plus de mise. Le pari s'enregistre quand même.`
    });
  }
  return alertes;
}

/**
 * Les alertes du ticket : la mise, le bookmaker choisi (sa fiche), le réglage
 * et l'état des garde-fous tels que les rend GET /api/config/garde-fous, les
 * fiches de GET /api/bookmaker-accounts. Sans réglage ni fiche lus (serveur
 * d'avant l'étape 11, rien de chargé) : aucune alerte, rien d'inventé.
 * @param {object} p
 * @param {number|null} p.mise
 * @param {string|null} p.bookmaker
 * @param {{cle: string, titre: string}[]} p.bookmakers  vos bookmakers (pour le nom)
 * @param {object|null} p.gardeFous  { reglage, etat }
 * @param {object|null} p.comptes    { [cle]: fiche }
 */
export function alertesDuTicket({ mise = null, bookmaker = null, bookmakers = [], gardeFous = null, comptes = null } = {}) {
  if (!(Number(mise) > 0)) return [];
  const titre = bookmakers.find((b) => b.cle === bookmaker)?.titre ?? null;
  return alertesDuPari({
    mise,
    bookmaker,
    bookmakerTitle: titre,
    reglage: gardeFous?.reglage ?? { miseMaxParPari: null, perteMaxParSemaine: null },
    compte: bookmaker ? (comptes?.[bookmaker] ?? null) : null,
    etat: gardeFous?.etat ?? null
  });
}

/** Les fiches d'une réponse de GET /api/bookmaker-accounts, en { [cle]: fiche }. */
export function fichesParBookmaker(reponse) {
  return Object.fromEntries((reponse?.bookmakers ?? []).filter((b) => b.fiche).map((b) => [b.cle, b.fiche]));
}
