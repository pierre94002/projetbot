/**
 * bulletins.js — les mots et les règles d'affichage du BULLETIN DU JOUR et du BILAN DE LA SEMAINE (étape 42 du plan,
 * 22/10/2026 ; carte « Bulletin du jour et bilan de la semaine » de Réglages, en attendant la page « Bulletin » de l'étape 45).
 * -----------------------------------------------------------------------
 * Règles PURES (ni Vue, ni service, ni horloge : l'heure est passée) pour que le composant n'ait qu'à les afficher et qu'un test
 * les rejoue sans navigateur. Ce qu'elles lisent est la réponse de GET /api/match-ai-analysis/bulletins : le serveur a déjà tout
 * calculé (la fiche chiffrée, la garde des chiffres, la décision), rien ici ne recalcule un chiffre.
 *
 * Quatre règles de dessin de l'appli, tenues ici : la structure ne disparaît jamais (un texte pas encore écrit a sa place, sa
 * raison et sa prochaine chance) ; Σ (total) et ⌀ (moyenne) au pied d'un tableau, jamais une somme de pourcentages ; le vrai
 * fournisseur (Claude Code, le quota de l'abonnement) et l'heure ; le français simple.
 * -----------------------------------------------------------------------
 */

export const nombreDit = (n) => Number(n ?? 0).toLocaleString('fr-FR');
export const pluriel = (n, un, plusieurs) => `${nombreDit(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;

const FUSEAU = 'Europe/Paris';

/** « 22/10/2026 » (le jour tel qu'il est écrit « AAAA-MM-JJ »). */
export function jourCourt(jour) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'date inconnue';
}

/** « 22/10 à 06 h 10 » (heure de Paris d'un instant ISO), ou « heure inconnue ». */
export function jourEtHeureDits(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'heure inconnue';
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} à ${p.hour} h ${p.minute}`;
}

/** « jeudi 22 octobre 2026 » (« dimanche 1er novembre 2026 »). */
export function jourEnLettres(jour) {
  const t = Date.parse(`${jour}T12:00:00Z`);
  if (!Number.isFinite(t)) return 'jour inconnu';
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSEAU }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day === '1' ? '1er' : p.day} ${p.month} ${p.year}`;
}

/** Le mot du mode du budget Claude. */
export const modeDit = (mode) => (mode === 'econome' ? 'mode économe' : 'mode normal');

/** Les tokens d'un texte, en un mot : « 4 215 tokens », ou « tokens inconnus » (jamais un zéro inventé). */
export const tokensDits = (tokens) => (Number.isFinite(tokens) ? `${nombreDit(tokens)} tokens` : 'tokens inconnus');

// ------------------------------------------------------------------ les essais ratés
const TYPES_D_ESSAI = { panne: 'Claude Code n’a pas répondu', forme: 'réponse sans la forme demandée', chiffres: 'texte refusé : chiffres absents de la fiche' };

/** Un essai raté en une phrase : « à 06 h 10 — texte refusé : chiffres absents de la fiche (1,95 ; 62) ». */
export function essaiDit(essai) {
  const quand = jourEtHeureDits(essai?.at).replace(/^.* à /, 'à ');
  const nombres = essai?.type === 'chiffres' && Array.isArray(essai.refuses) ? [...new Set(essai.refuses.map((r) => r.nombre))] : [];
  const quoi = TYPES_D_ESSAI[essai?.type] ?? 'essai raté';
  const detail = nombres.length ? ` (${nombres.join(' ; ')})` : essai?.raison && essai.type !== 'chiffres' ? ` (${String(essai.raison).slice(0, 140)})` : '';
  return `${quand} — ${quoi}${detail}`;
}

// ------------------------------------------------------------------ l'état d'un texte
/**
 * L'état d'un texte (le bulletin du jour ou le bilan de la semaine), en un mot, une couleur et une phrase.
 * `entree` : le texte écrit pour le jour (ou la semaine) ; `situation` : ce que dit le serveur de l'écrire maintenant
 * ({ code, pourquoi, essais }) ; `essais` : les essais ratés de la clé.
 * Codes : ecrit, sans-appel, interrupteur, illisible, essais-epuises, trop-tot, a-faire, serveur-a-relancer.
 */
export function etatDuTexte({ entree = null, situation = null, essais = [] } = {}) {
  if (entree && !entree.sansAppel) return { code: 'ecrit', titre: 'Écrit', ton: 'is-accent', icone: 'check', phrase: `Écrit le ${jourEtHeureDits(entree.ecritLe)}, en un seul appel à Claude Code.` };
  if (entree) return { code: 'sans-appel', titre: 'Rien à commenter', ton: '', icone: 'info', phrase: entree.raison ?? 'Rien à commenter : aucun appel à Claude.' };
  if (!situation) return { code: 'serveur-a-relancer', titre: 'Pas lu', ton: 'is-warning', icone: 'alert', phrase: 'Le serveur ne répond pas à cette question : relancez-le pour activer cette fonction.' };
  const dernier = essais.at(-1);
  switch (situation.code) {
    case 'interrupteur':
      return { code: 'interrupteur', titre: 'Coupé', ton: 'is-warning', icone: 'pause', phrase: situation.pourquoi };
    case 'illisible':
      return { code: 'illisible', titre: 'Illisible', ton: 'is-danger', icone: 'x', phrase: situation.pourquoi };
    case 'essais-epuises':
      return { code: 'essais-epuises', titre: 'Abandonné', ton: 'is-danger', icone: 'alert', phrase: situation.pourquoi };
    case 'trop-tot':
      return { code: 'trop-tot', titre: 'Attend le matin', ton: '', icone: 'clock', phrase: situation.pourquoi };
    case 'deja-fait':
      return { code: 'ecrit', titre: 'Écrit', ton: 'is-accent', icone: 'check', phrase: situation.pourquoi };
    default:
      return { code: 'a-faire', titre: 'Pas encore écrit', ton: 'is-info', icone: 'clock', phrase: `Il s’écrit à la prochaine passe d’actualisation.${dernier ? ` Dernier essai raté : ${essaiDit(dernier)}.` : ''}` };
  }
}

// ------------------------------------------------------------------ la garde des chiffres
/** « Chiffres vérifiés par le code : 14 nombres cités, tous dans la fiche. » */
export function gardeDite(entree) {
  const g = entree?.garde;
  if (!g) return null;
  return `Chiffres vérifiés par le code : ${pluriel(g.nombresVus ?? 0, 'nombre cité', 'nombres cités')}, tous dans la fiche (${pluriel(g.nombresDeLaFiche ?? 0, 'nombre', 'nombres')}). Un texte qui citerait un autre nombre serait refusé.`;
}

// ------------------------------------------------------------------ les sections d'un texte
/** Les sections d'un texte, dans l'ordre où l'IA les a écrites (jamais réordonnées), avec leur titre. */
export function sectionsDuTexte(entree) {
  return (entree?.texte?.sections ?? []).map((s) => ({ cle: s.cle, titre: s.titre, texte: s.texte }));
}

// ------------------------------------------------------------------ le tableau des derniers textes
/**
 * Les derniers textes (bulletins et bilans mêlés, les plus récents d'abord) : une ligne chacun, avec leur coût.
 * Au pied : Σ (nombre de textes, tokens) et ⌀ (tokens par texte QUI A COÛTÉ — un texte sans appel ne tire pas la moyenne vers
 * zéro, ses tokens sont inconnus) ; jamais une somme de pourcentages.
 */
export function tableauDesTextes(historique) {
  const ligne = (genre, libelle) => (t) => ({ genre, libelle, date: t.cle, pour: genre === 'bulletin' ? jourCourt(t.cle) : `semaine du ${jourCourt(t.cle)}`, titre: t.titre, mode: t.mode, tokens: t.tokens, sansAppel: Boolean(t.sansAppel), ecritLe: t.ecritLe, essai: t.essai });
  const lignes = [...(historique?.bulletins ?? []).map(ligne('bulletin', 'Bulletin du jour')), ...(historique?.bilans ?? []).map(ligne('bilan', 'Bilan de la semaine'))].sort(
    (a, b) => String(b.ecritLe ?? '').localeCompare(String(a.ecritLe ?? '')) || a.genre.localeCompare(b.genre)
  );
  const avecTokens = lignes.filter((l) => Number.isFinite(l.tokens) && !l.sansAppel);
  const somme = avecTokens.reduce((n, l) => n + l.tokens, 0);
  return {
    lignes,
    total: { textes: lignes.length, appels: avecTokens.length, tokens: somme },
    moyenne: { tokens: avecTokens.length ? Math.round(somme / avecTokens.length) : null }
  };
}
