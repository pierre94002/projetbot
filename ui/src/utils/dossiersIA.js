/**
 * dossiersIA.js — LES DOSSIERS DE LA MÉMOIRE DE L'IA À L'ÉCRAN (étape 44 du plan, 23/10/2026) : règles PURES du bloc
 * « Mémoire de l'IA » de la page d'une équipe (AiDossierCard.vue), réutilisables par la page « Bulletin » (étape 45).
 *
 * Tout est LU (GET /api/match-ai-analysis/dossiers?club=…, écrit chaque nuit par l'actualisation) : rien n'est calculé
 * ici qu'une mise en forme. Les phrases viennent du serveur (les mêmes mots que ceux que l'IA lit) ; ici, l'état du bloc,
 * la provenance, et les lignes des tableaux, avec leur pied Σ / ⌀ — toujours affichés, même vides.
 */

/** « 18/10/2026 », au jour de PARIS pour un instant (un calcul de 1 h du matin le 23 n'est pas « du 22 »). */
const JOUR_DE_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
export function jourDit(iso, { annee = true } = {}) {
  let s = String(iso ?? '');
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s))) s = JOUR_DE_PARIS.format(new Date(s));
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return 'jour inconnu';
  return annee ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const virgule = (x, d = 1) => (fini(x) ? String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',') : '—');
const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;

/** L'état du bloc : { cle, ton, titre, texte }. */
export function etatDuDossier({ chargement = false, erreur = null, reponse = null, clubId = null } = {}) {
  const garde = 'Les tableaux ci-dessous restent affichés, sans valeurs.';
  if (!clubId) return { cle: 'sans-club', ton: 'is-warning', titre: 'Club non reconnu', texte: `La page n’a pas trouvé l’identifiant FotMob de ce club : un dossier ne se lit jamais par le nom seul. ${garde}` };
  if (erreur) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} ${garde}` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Dossier illisible', texte: `${erreur} ${garde}` };
  }
  if (chargement || !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture du dossier…' };
  if (reponse.etat === 'absent') return { cle: 'jamais', ton: 'is-info', titre: 'Pas encore calculé', texte: `Les dossiers de l’IA n’ont pas encore été écrits : la prochaine passe de nuit de l’actualisation le fera (quelques secondes, sans aucun appel à Claude). ${garde}` };
  if (reponse.etat === 'autreVersion') return { cle: 'autre-version', ton: 'is-warning', titre: 'Dossier d’une autre forme', texte: `Ce dossier a été écrit par une autre forme du calcul : la prochaine passe de nuit le refait, et l’IA ne le lit pas en attendant. ${garde}` };
  if (!reponse.dossier) return { cle: 'sans-dossier', ton: 'is-info', titre: 'Pas de dossier pour ce club', texte: `Un dossier s’écrit pour chaque club qui a joué dans l’année (match relevé au magasin FotMob). ${garde}` };
  return { cle: 'pret', ton: '', titre: null, texte: null };
}

/** La vraie provenance : qui écrit le dossier, d'où viennent ses morceaux, quand il a été mis à jour, où il est rangé. */
export function provenanceDuDossier(reponse) {
  const d = reponse?.dossier ?? null;
  const p = reponse?.provenance ?? {};
  const morceaux = [p.faits, p.absents, p.entraineur, p.style, p.lecons].filter(Boolean);
  return {
    source: 'Écrit par le code · magasin FotMob et carnet de l’IA',
    releveLe: d?.majLe ?? reponse?.calculeLe ?? null,
    action: 'mis à jour',
    fichier: reponse?.fichier ?? 'data/runtime/ai-dossiers.json',
    detail: `${morceaux.length ? `D’où viennent ses morceaux : ${morceaux.join(' ; ')}.` : ''} Refait chaque nuit, seulement quand l’équipe a joué.`.trim()
  };
}

const ISSUES = { V: 'victoire', N: 'nul', D: 'défaite' };

/** Le tableau de la forme : ses 10 derniers matchs (toutes compétitions), et son pied Σ / ⌀. */
export function lignesDeForme(dossier) {
  const derniers = dossier?.forme?.derniers ?? [];
  const lignes = derniers.map((m) => ({
    cle: `${m.date}|${m.adversaireId ?? m.adversaire}`,
    jour: jourDit(m.date),
    league: m.league,
    lieu: m.lieu === 'dom' ? 'domicile' : 'extérieur',
    adversaire: m.adversaire ?? 'adversaire inconnu',
    adversaireId: m.adversaireId ?? null,
    score: `${m.bp}-${m.bc}`,
    issue: m.issue,
    issueDite: ISSUES[m.issue] ?? '—'
  }));
  const b = dossier?.forme?.bilan;
  const pied = b?.matchs
    ? {
        sigma: `${b.matchs} matchs · ${b.v} V, ${b.n} N, ${b.d} D · buts ${b.bp}-${b.bc} · ${b.points} points`,
        moyenne: `${virgule(b.points / b.matchs, 2)} point par match · ${virgule(b.bp / b.matchs, 2)} but marqué et ${virgule(b.bc / b.matchs, 2)} encaissé par match`
      }
    : { sigma: '0 match relevé', moyenne: '—' };
  return { lignes, pied };
}

/** Une leçon, en ligne de tableau. */
function ligneDeLecon(l, preuves = {}) {
  return {
    cle: l.id,
    jour: jourDit(l.date),
    home: l.match?.home ?? '?',
    away: l.match?.away ?? '?',
    homeId: l.match?.homeId ?? null,
    awayId: l.match?.awayId ?? null,
    league: l.match?.league ?? null,
    marche: l.market ?? '—',
    pronostic: `${l.pick ?? '—'} (${l.issue === 'juste' ? 'passé' : 'pas passé'})`,
    texte: l.texte,
    preuve: preuves[l.id] ?? '—',
    confirmeeLe: l.confirmeeLe ? jourDit(l.confirmeeLe) : '—',
    retireeLe: l.retireeLe ? jourDit(l.retireeLe) : '—',
    raison: l.raison ?? '—',
    sens: l.sens === -1 ? 'le moteur s’y est trompé' : 'le moteur a tenu'
  };
}

/** Le tableau des leçons CONFIRMÉES d'un dossier (club ou championnat), et son pied Σ / ⌀. */
export function lignesDesLecons(lecons, preuves = {}) {
  const confirmees = (lecons?.confirmees ?? []).map((l) => ligneDeLecon(l, preuves));
  const n = lecons?.confirmeesEnTout ?? confirmees.length;
  const matchs = (lecons?.confirmees ?? []).map((l) => l.preuve?.matchs).filter(fini);
  return {
    lignes: confirmees,
    pied: {
      sigma: `${n} confirmée${n > 1 ? 's' : ''}${n > confirmees.length ? ` (les ${confirmees.length} plus récentes affichées)` : ''} · ${lecons?.enAttente ?? 0} en attente du carnet · ${lecons?.retireesEnTout ?? 0} retirée${(lecons?.retireesEnTout ?? 0) > 1 ? 's' : ''}`,
      moyenne: matchs.length ? `${virgule(matchs.reduce((a, x) => a + x, 0) / matchs.length)} matchs suivants comptés par leçon confirmée` : '—'
    }
  };
}

/** Le tableau des leçons RETIRÉES (démenties par le carnet, ou jamais confirmées), et son pied Σ / ⌀. */
export function lignesDesRetirees(lecons, preuves = {}) {
  const retirees = (lecons?.retirees ?? []).map((l) => ligneDeLecon(l, preuves));
  const n = lecons?.retireesEnTout ?? retirees.length;
  const matchs = (lecons?.retirees ?? []).map((l) => l.preuve?.matchs).filter(fini);
  return {
    lignes: retirees,
    pied: {
      sigma: `${n} retirée${n > 1 ? 's' : ''}${n > retirees.length ? ` (les ${retirees.length} dernières affichées)` : ''} · ${retirees.filter((l) => /démentie/.test(l.raison)).length} démentie${retirees.filter((l) => /démentie/.test(l.raison)).length > 1 ? 's' : ''} par le carnet`,
      moyenne: matchs.length ? `${virgule(matchs.reduce((a, x) => a + x, 0) / matchs.length)} matchs suivants comptés par leçon retirée` : '—'
    }
  };
}

/** Le tableau des absents connus, et son pied. */
const MOTIFS = { injury: 'blessure', suspension: 'suspension' };
export function lignesDesAbsents(dossier) {
  const a = dossier?.absents ?? null;
  const lignes = (a?.liste ?? []).map((x) => ({ cle: x.id ?? x.nom, nom: x.nom, id: x.id ?? null, motif: MOTIFS[x.motif] ?? x.motif ?? 'indisponible', retour: x.retour ?? 'retour non annoncé' }));
  const blesses = lignes.filter((l) => l.motif === 'blessure').length;
  return {
    lus: a ? `Lus le ${jourDit(a.lusLe)}${a.match ? ` pour le match du ${jourDit(a.match.date)} contre ${a.match.adversaire ?? 'un adversaire inconnu'}` : ''}` : 'Aucune lecture des absents dans les 30 derniers jours',
    adversaireId: a?.match?.adversaireId ?? null,
    lignes,
    pied: { sigma: `${lignes.length} absent${lignes.length > 1 ? 's' : ''} · ${blesses} blessé${blesses > 1 ? 's' : ''} · ${lignes.length - blesses} autre${lignes.length - blesses > 1 ? 's' : ''}`, moyenne: '—' }
  };
}

/** Ce que l'IA lit de ce dossier : le texte, ses mots, ses tokens estimés (comme le budget de l'étape 41). */
export function texteLuParLIA(reponse) {
  const t = reponse?.texteIA ?? null;
  if (!t) return { texte: null, resume: 'L’IA ne reçoit rien de ce club tant qu’il n’a pas de dossier.' };
  return { texte: t.texte, resume: `${t.mots} mots, environ ${t.tokens} tokens (estimés comme le budget de l’étape 41). Avant un match, l’IA reçoit les dossiers des deux équipes et du championnat : ${reponse?.mots?.min ?? 300} à ${reponse?.mots?.max ?? 500} mots en tout.` };
}

/** La règle, dite en bas du bloc. */
export const REGLE_DU_DOSSIER =
  'Écrit par le code, jamais par l’IA : une leçon n’y entre que si le carnet de l’IA la confirme sur plusieurs matchs, et elle en sort pour de bon s’il la dément. L’IA lit ce texte ; elle ne fournit jamais un chiffre au moteur, et le moteur ne lit pas les dossiers. Votre note manuscrite d’un match n’y entre pas.';
