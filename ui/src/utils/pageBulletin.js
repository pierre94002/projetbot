/**
 * pageBulletin.js — les mots et les règles d'affichage de la PAGE « BULLETIN » (étape 45 du plan, 24/10/2026) : le bandeau, les
 * titres des quatre cartes, la fiabilité de l'IA en résumé, le pied « d'où viennent ces données ». Règles PURES (ni Vue, ni service,
 * ni horloge), pour que la page n'ait qu'à les afficher et qu'un test les rejoue sans navigateur.
 *
 * Ce qu'elles lisent, ce sont des réponses de routes déjà préparées par l'actualisation :
 *   - GET /api/match-ai-analysis/bulletins  le bulletin du jour et le bilan de la semaine (étape 42) ;
 *   - GET /api/match-ai/scorecard           le carnet de l'IA (étape 21) ;
 *   - GET /api/match-ai-analysis/dossiers/resume  l'index des dossiers et des leçons (étape 44, route de l'étape 45).
 * Rien n'est recalculé ici, aucun appel à Claude : on met en mots. Les règles du carnet (tenus, face au moteur seul, état d'un
 * marché) restent celles de utils/carnetIA.js — UNE seule façon de les dire — ; la page n'en ajoute qu'une, la moyenne par marché
 * du pied (chaque marché pèse autant), qui n'est ni une somme ni une moyenne de pourcentages de pourcentages.
 *
 * Règles de dessin de l'appli tenues ici : la structure ne disparaît jamais (une lecture qui manque se DIT : « pas encore
 * calculé », « illisible », « non lu »), Σ (total) et ⌀ (moyenne) au pied d'un tableau, le vrai fournisseur et l'heure.
 */

import { etatDuTexte, jourEnLettres, jourEtHeureDits, nombreDit, pluriel } from './bulletins.js';
import { tenusDits } from './carnetIA.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** La page : son titre, son icône et ce qu'elle montre en une phrase (le bandeau). */
export const PAGE = Object.freeze({
  titre: 'Bulletin',
  icone: 'sparkles',
  intro:
    'Ce que l’IA écrit et ce qu’elle vaut : le texte du matin et le bilan de la semaine, la fiabilité de ses avis marché par marché, et la mémoire que le code tient pour chaque équipe. ' +
    'Rien n’est calculé en ouvrant la page et aucun appel n’est fait à Claude : tout est lu dans ce que l’actualisation a déjà préparé, avec sa source et son heure.'
});

/** Les quatre cartes de la page, dans l'ordre : leur titre, ce qu'elles disent, leur icône. */
export const SECTIONS = Object.freeze({
  budget: { cle: 'budget', titre: 'Budget Claude', eyebrow: 'Intelligence artificielle', icone: 'cpu', sousTitre: 'Les tokens de l’appli, aujourd’hui et cette semaine, face au budget — le détail et le réglage sont dans Réglages' },
  textes: { cle: 'textes', titre: 'Bulletin du jour et bilan de la semaine', eyebrow: 'Écrit par l’IA · chiffres vérifiés par le code', icone: 'sparkles', sousTitre: 'Deux textes écrits par Claude Code : un le matin, un le lundi. Chaque nombre qu’ils citent doit être dans la fiche chiffrée du code, sinon le texte est refusé et jamais montré.' },
  fiabilite: { cle: 'fiabilite', titre: 'L’IA a-t-elle souvent raison ?', eyebrow: 'Carnet de l’IA', icone: 'target', sousTitre: 'Chaque avis d’avant-match de l’IA, réglé au coup de sifflet final : a-t-il tenu, et fait-elle mieux que le moteur seul ? Marché par marché et championnat par championnat — le carnet complet est dans Historique moteur.' },
  dossiers: { cle: 'dossiers', titre: 'Dossiers et leçons', eyebrow: 'Mémoire de l’IA', icone: 'folder', sousTitre: 'Ce que le code retient de chaque équipe et de chaque championnat, et les leçons que le carnet a confirmées sur plusieurs matchs, avec leur date et leur match d’origine.' }
});

/** Le lien vers le carnet complet (sa seule place) et vers le détail du budget. */
export const LIEN_DU_CARNET = Object.freeze({ to: '/historique-moteur', texte: 'Voir le carnet complet dans Historique moteur' });
export const LIEN_DU_BUDGET = Object.freeze({ to: '/reglages', texte: 'Détail et réglage du budget dans Réglages' });

/**
 * D'où viennent les chiffres du carnet : les MÊMES mots que le bloc « Carnet de l'IA » d'Historique moteur (AiScorecardPanel) — un test
 * compare les deux textes, pour qu'ils ne se séparent jamais.
 */
export const PROVENANCE_DU_CARNET = Object.freeze({
  source: 'Analyses de l’IA · magasin FotMob · cotes gratuites archivées',
  action: 'calculé',
  fichier: 'data/runtime/carnet-ia.json (refait chaque nuit) ; data/runtime/match-ai-analyses.json ; magasin SQLite : tables matches, team_stats, engine_picks, odds_quotes'
});

// ------------------------------------------------------------------ le bandeau
const tuile = (cle, label, valeur, detail, extra = {}) => ({ cle, label, valeur, detail, ...extra });

/** Une lecture { loading, error, data } sans donnée : « lecture en cours », « illisible » ou « non lu ». */
function sansDonnee(lecture) {
  if (lecture?.error) return { valeur: 'illisible', detail: lecture.error, ton: 'is-warning' };
  if (lecture?.loading) return { valeur: 'lecture…', detail: 'en cours', ton: '' };
  return { valeur: 'non lu', detail: 'rien n’a encore été lu', ton: '' };
}

function tuileDuTexte(cle, label, lecture, genre) {
  const data = lecture?.data ?? null;
  if (!data) {
    const s = sansDonnee(lecture);
    return tuile(cle, label, s.valeur, s.detail, { ton: s.ton });
  }
  const entree = genre === 'bulletin' ? data.bulletin ?? null : data.bilan ?? null;
  const etat = etatDuTexte({ entree, situation: data.situation?.[genre] ?? null, essais: data.essais?.[genre] ?? [] });
  const quand = genre === 'bulletin' ? (data.jour ? jourEnLettres(data.jour) : 'jour inconnu') : data.semaine?.enLettres ?? 'semaine inconnue';
  return tuile(cle, label, etat.titre, quand, { ton: etat.ton, icone: etat.icone });
}

/**
 * Les quatre chiffres clés du bandeau : l'état du bulletin du jour, celui du bilan de la semaine, les avis de l'IA tenus (le carnet),
 * les leçons confirmées (les dossiers). Toujours quatre, même quand une lecture manque : la tuile dit pourquoi.
 * Chaque argument est une lecture { loading, error, data }.
 */
export function chiffresClesDeLaPage({ bulletins = null, scorecard = null, resume = null } = {}) {
  const c = scorecard?.data?.carnet ?? null;
  let fiabilite;
  if (c) {
    const t = c.total?.bilan ?? {};
    fiabilite = tuile('fiabilite', 'Avis de l’IA tenus', tenusDits(t.aiRight, t.aiVerdicts), `${pluriel(c.total?.matchsJuges ?? 0, 'match jugé', 'matchs jugés')} · les avis « nuance » ne comptent pas`);
  } else if (scorecard?.data) {
    fiabilite = tuile('fiabilite', 'Avis de l’IA tenus', 'pas encore calculé', 'le carnet se remplit à la prochaine actualisation', { ton: '' });
  } else {
    const s = sansDonnee(scorecard);
    fiabilite = tuile('fiabilite', 'Avis de l’IA tenus', s.valeur, s.detail, { ton: s.ton });
  }
  const r = resume?.data ?? null;
  let memoire;
  if (r && r.etat !== 'absent') {
    const t = r.totaux ?? {};
    memoire = tuile('memoire', 'Leçons confirmées', nombreDit(t.confirmees ?? 0), `${pluriel(t.retirees ?? 0, 'retirée', 'retirées')} · ${pluriel(t.equipes ?? 0, 'équipe', 'équipes')} · ${pluriel(t.championnats ?? 0, 'championnat', 'championnats')}`, { ton: r.etat === 'autreVersion' ? 'is-warning' : '' });
  } else if (r) {
    memoire = tuile('memoire', 'Leçons confirmées', 'pas encore écrites', 'les dossiers s’écrivent à la prochaine passe de nuit', { ton: '' });
  } else {
    const s = sansDonnee(resume);
    memoire = tuile('memoire', 'Leçons confirmées', s.valeur, s.detail, { ton: s.ton });
  }
  return [tuileDuTexte('bulletin', 'Bulletin du jour', bulletins, 'bulletin'), tuileDuTexte('bilan', 'Bilan de la semaine', bulletins, 'bilan'), fiabilite, memoire];
}

// ------------------------------------------------------------------ la fiabilité, en résumé
/**
 * Le ⌀ du tableau « Par marché » : la moyenne sur les marchés QUI ONT DES AVIS COMPTÉS (chaque marché pèse autant) — les avis comptés et
 * les avis tenus par marché, et le taux moyen des marchés (la moyenne des taux, jamais une somme de pourcentages). Sans aucun avis
 * compté, la structure reste et la moyenne n'est pas un zéro inventé.
 */
export function moyenneDesMarches(carnet) {
  const avec = (carnet?.types ?? []).filter((t) => fini(t?.bilan?.aiVerdicts) && t.bilan.aiVerdicts > 0);
  if (!avec.length) return { marches: 0, comptes: '—', tenus: '—', taux: '—' };
  const n = avec.length;
  const comptes = avec.reduce((s, t) => s + t.bilan.aiVerdicts, 0) / n;
  const tenus = avec.reduce((s, t) => s + (t.bilan.aiRight ?? 0), 0) / n;
  const taux = avec.reduce((s, t) => s + (100 * (t.bilan.aiRight ?? 0)) / t.bilan.aiVerdicts, 0) / n;
  return { marches: n, comptes: fr(comptes, 1), tenus: fr(tenus, 1), taux: `${fr(taux, 1)} %` };
}

/** Combien de lignes du tableau par championnat sont montrées d'abord (le reste se déplie). */
export const CHAMPIONNATS_MONTRES = 12;

/** « Voir les 64 autres championnats » / « Replier » : le texte du bouton qui déplie le tableau par championnat. */
export function boutonDesAutres(total, montres, deplie) {
  const reste = Math.max(0, total - montres);
  if (!reste) return null;
  return deplie ? 'Replier la liste' : `Voir ${pluriel(reste, 'ligne de plus', 'lignes de plus')}`;
}

// ------------------------------------------------------------------ le pied de la page
/**
 * « D'où viennent ces données » : pour chaque source de la page, le fichier lu sur ce PC et la date de ce qui y est écrit. Les trois
 * lectures sont des { loading, error, data }. Une source non lue le dit, jamais une date inventée.
 */
export function piedDeLaPage({ bulletins = null, scorecard = null, resume = null } = {}) {
  const b = bulletins?.data ?? null;
  const textes = [...(b?.historique?.bulletins ?? []), ...(b?.historique?.bilans ?? [])].map((t) => t.ecritLe).filter(Boolean).sort();
  const c = scorecard?.data?.carnet ?? null;
  const r = resume?.data ?? null;
  const quand = (iso, mot) => (iso ? `${mot} le ${jourEtHeureDits(iso)}` : 'pas encore écrit');
  return [
    { cle: 'bulletins', libelle: 'Bulletin du jour et bilan de la semaine', fichier: b?.fichier ?? 'data/runtime/ai-bulletins.json', quand: b ? quand(textes.at(-1) ?? null, 'dernier texte écrit') : 'non lu', fournisseur: 'Claude Code (abonnement), un appel par texte' },
    { cle: 'budget', libelle: 'Budget Claude', fichier: 'data/runtime/journal-claude/ (un fichier par jour) ; data/runtime/budget-claude.json', quand: 'journal tenu à chaque appel de l’appli', fournisseur: 'journal de l’appli — jamais le pourcentage de l’abonnement' },
    { cle: 'carnet', libelle: 'Fiabilité de l’IA', fichier: 'data/runtime/carnet-ia.json', quand: scorecard?.data ? (c ? quand(c.calculeLe, 'calculé') : 'pas encore calculé') : 'non lu', fournisseur: 'carnet de l’IA, calculé chaque nuit par l’actualisation' },
    { cle: 'dossiers', libelle: 'Dossiers et leçons', fichier: r?.fichier ?? 'data/runtime/ai-dossiers.json', quand: r ? (r.etat === 'absent' ? 'pas encore écrit' : quand(r.calculeLe, 'écrit')) : 'non lu', fournisseur: 'écrit par le code chaque nuit, jamais par l’IA' }
  ];
}

/** La règle de la page, en une phrase (le pied). */
export const REGLE_DE_LA_PAGE =
  'Cette page ne lance rien : aucun bouton n’écrit un texte, aucun clic n’appelle Claude. Les textes de l’IA sont montrés tels qu’elle les a écrits, avec la preuve que leurs chiffres sont ceux du code ; un texte refusé par cette garde n’est jamais montré, seul son motif l’est. Le moteur ne lit rien de ce qui est ici.';
