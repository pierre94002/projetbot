/**
 * APRÈS LE MATCH (étape 40 du plan, lot 1b, 17/11/2026) — règle PURE de l'écran : aucun import, aucun appel, aucune horloge.
 * Les mots et le chiffre réel du vert ou du rouge : AiMarketCard (prop `reel`, par MatchAiReviewPanel) et PronosticsGelesCard.
 * À part de ficheDuPronostic.js (la fiche d'avant le match, ses huit exports comptés par ses essais).
 */
// =====================================================================================================================
// Étape 40, lot 1b (17/11/2026) : APRÈS LE MATCH — vert ou rouge, avec le chiffre réel.
// La fiche vient du serveur (GET /api/match-ai-analysis/fixture avec `matchKey`, data/fiche/ficheApresMatch.js) : chaque
// pronostic y est déjà réglé comme au bilan de la fiabilité (juste, faux, ou non réglable et sa raison). Ici, seulement les
// mots : « Juste » en vert avec une coche, « Faux » en rouge avec une croix, « Non réglable » en gris avec sa raison, et le
// chiffre réel (« 11 corners (5 + 6) », « Score à la 90e minute : 2-1 (match prolongé) »). Jamais de vert ni de rouge pour
// une value : la couleur dit si le pronostic s'est réalisé, rien d'autre.
// =====================================================================================================================

export const MOTS_APRES_MATCH = Object.freeze({
  juste: 'Juste',
  faux: 'Faux',
  nonReglable: 'Non réglable',
  auMagasin: 'Réglé au magasin FotMob',
  titreReel: 'Réglé sur le score et les statistiques du magasin FotMob, comme le bilan de la fiabilité : score de la 90e minute, match attribué écarté, 0-0 de corners ou de tirs = non relevé.',
  ecart: (ia, magasin) => `Le bilan de l’IA dit « ${ia} » ; le règlement au magasin FotMob dit « ${magasin} » (score de la 90e minute, comme le bilan de la fiabilité).`,
  score: (h, a) => `Score : ${h}-${a}`,
  score90: (h, a) => `Score à la 90e minute : ${h}-${a} (match prolongé)`,
  titreCarte: 'Pronostics gelés du moteur',
  sousTitreCarte: 'Ce que le moteur annonçait avant le coup d’envoi, gelé sans retouche, puis réglé sur ce que le match a donné.',
  aucun: 'Aucun pronostic gelé du moteur ne se rattache à ce match (les deux clubs, la veille, le jour et le lendemain ont été lus).',
  chargement: 'La fiche d’après-match arrive avec l’analyse de l’IA…',
  absente: 'La fiche d’après-match n’a pas été lue : elle n’existe que sur la page d’un match du magasin.',
  premiere: (label, issue) => `Première valeur gelée : ${label} — ${issue}.`,
  versionMoteur: (v) => (Number.isInteger(v) ? `moteur n° ${v}` : 'version du moteur non notée'),
  derniere: 'dernière valeur avant le coup d’envoi',
  compte: (j, f, n) => `${j} juste${j > 1 ? 's' : ''} · ${f} faux · ${n} non réglable${n > 1 ? 's' : ''}`
});
const APRES = MOTS_APRES_MATCH;

/** L'issue dite : { cle: juste | faux | non-reglable, libelle, icone, raison } ; null si l'objet ne porte aucune issue. */
export function issueDite(x) {
  if (!x || typeof x !== 'object') return null;
  if (x.realise === true) return { cle: 'juste', libelle: APRES.juste, icone: 'check', raison: null };
  if (x.realise === false) return { cle: 'faux', libelle: APRES.faux, icone: 'x', raison: null };
  if (x.raison || x.raisonTexte) return { cle: 'non-reglable', libelle: APRES.nonReglable, icone: 'minus', raison: x.raisonTexte ?? x.raison };
  return null;
}

const STAT_DU_MARCHE = Object.freeze({
  totalCorners: ['corners', 'corner', 'corners', false],
  teamCorners: ['corners', 'corner', 'corners', true],
  totalShots: ['shots', 'tir', 'tirs', false],
  teamShots: ['shots', 'tir', 'tirs', true],
  totalShotsOnTarget: ['shotsOnTarget', 'tir cadré', 'tirs cadrés', false],
  teamShotsOnTarget: ['shotsOnTarget', 'tir cadré', 'tirs cadrés', true]
});
const BUTS = new Set(['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
const compte = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const entier = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/**
 * Le chiffre réel qui règle UN pronostic (`p` : { marketId, params }), d'après `reel` de la fiche ; `noms` : { home, away }.
 * Null quand le chiffre manque (la raison de « non réglable » le dit alors).
 */
export function chiffreReel(p, reel, noms = {}) {
  if (!p || !reel) return null;
  const equipe = p.params?.team === 'home' || p.params?.team === 'away' ? p.params.team : null;
  const nom = equipe ? (noms[equipe] ?? (equipe === 'home' ? 'Domicile' : 'Extérieur')) : null;
  const stat = STAT_DU_MARCHE[p.marketId];
  if (stat) {
    const s = reel.stats?.[stat[0]];
    if (!s || !entier(s.home) || !entier(s.away)) return null;
    if (stat[3]) return nom ? `${compte(s[equipe], stat[1], stat[2])} pour ${nom}` : null;
    return `${compte(s.home + s.away, stat[1], stat[2])} (${s.home} + ${s.away})`;
  }
  if (!BUTS.has(p.marketId)) return null;
  const b = reel.buts;
  if (!b || !entier(b.home) || !entier(b.away)) return null;
  const prolonge = reel.prolongation === true;
  const score = `${b.home}-${b.away}`;
  const a90 = prolonge ? ' à la 90e minute' : '';
  const suite = prolonge ? `${score}, match prolongé` : score;
  if (p.marketId === 'totalGoals') return `${compte(b.home + b.away, 'but', 'buts')}${a90} (${suite})`;
  if (p.marketId === 'teamGoals') return nom ? `${compte(b[equipe], 'but', 'buts')} pour ${nom}${a90} (${suite})` : null;
  return prolonge ? APRES.score90(b.home, b.away) : APRES.score(b.home, b.away);
}

const ISSUE_DE_L_IA = Object.freeze({ correct: 'Pronostic juste', incorrect: 'Pronostic faux' });

/**
 * Ce que dit la carte d'un marché après le match (AiMarketCard, prop `reel`) : l'avis de l'IA rattaché au pronostic qu'elle a
 * commenté (le marché et le libellé EXACTS du résumé gardé), sinon le pronostic gelé du même marché et du même libellé.
 * `ligne` : { market, pick, source } ; `statut` : l'issue du bilan de l'IA (correct, incorrect, pending) ; la note ambre
 * `ecart` quand le bilan de l'IA et le règlement au magasin ne disent pas la même chose. Null : rien à dire (pas de fiche,
 * fiche en panne, match à venir, ou aucun pronostic de ce marché).
 */
export function reelDeLaCarte(ligne, fiche, { statut = null, noms = {} } = {}) {
  if (!fiche || typeof fiche !== 'object' || !ligne) return null;
  const memes = (a, b) => a !== null && a !== undefined && a === b;
  const avis = (Array.isArray(fiche.avis) ? fiche.avis : []).filter((a) => memes(a.market, ligne.market) && memes(a.predictedLabel, ligne.pick));
  const geles = (Array.isArray(fiche.pronostics) ? fiche.pronostics : []).filter((p) => memes(p.market, ligne.market) && memes(p.label, ligne.pick));
  const trouve = avis.length === 1 ? avis[0] : avis.length === 0 && geles.length === 1 ? geles[0] : null;
  const issue = issueDite(trouve);
  if (!issue) return null;
  const marche = { marketId: trouve.marketId ?? ligne.source?.marketId ?? null, params: ligne.source?.params ?? trouve.params ?? null };
  const ia = ISSUE_DE_L_IA[statut] ?? null;
  const ecart = ia && issue.cle !== 'non-reglable' && (statut === 'correct') !== (issue.cle === 'juste') ? APRES.ecart(ia, issue.libelle) : null;
  return { ...issue, chiffre: issue.cle === 'non-reglable' ? null : chiffreReel(marche, fiche.reel, noms), ecart, titre: APRES.titreReel };
}

const ORDRE_DES_MARCHES = ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal', 'totalCorners', 'teamCorners', 'totalShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget'];
const rangDuMarche = (id) => (ORDRE_DES_MARCHES.includes(id) ? ORDRE_DES_MARCHES.indexOf(id) : ORDRE_DES_MARCHES.length);

/**
 * La carte « Pronostics gelés du moteur » (PronosticsGelesCard.vue) : { etat, message, lignes, compte, provenance, butsCaches }.
 * `etat` : chargement, absente, panne, ou celui de la fiche (regle, a-venir, introuvable, sans-identifiant, sans-score, reporte,
 * attribue). Chaque ligne : le marché, le pronostic, son pourcentage, l'issue dite, le chiffre réel, la version du moteur, et la
 * première valeur quand elle différait.
 */
export function pronosticsGeles(fiche, { chargement = false, noms = {} } = {}) {
  const vide = (etat, message) => ({ etat, message, lignes: [], compte: null, provenance: fiche?.provenance ?? null, butsCaches: fiche?.butsCaches ?? null });
  if (chargement && !fiche) return vide('chargement', APRES.chargement);
  if (!fiche || typeof fiche !== 'object') return vide('absente', APRES.absente);
  if (fiche.etat === 'panne') return vide('panne', fiche.message ?? null);
  const lignes = (Array.isArray(fiche.pronostics) ? fiche.pronostics : [])
    .map((p) => {
      const issue = issueDite(p);
      const premiereDite = p.premiere ? issueDite(p.premiere) : null;
      return {
        cle: `${p.fixtureKey ?? ''}|${p.marketKey}`,
        marketId: p.marketId,
        marche: p.market ?? p.marketId,
        pronostic: p.label ?? '',
        item: { ...p, predictedOutcome: p.choice },
        pourcentage: typeof p.probability === 'number' ? `${Math.round(p.probability * 100)} %` : null,
        issue,
        chiffre: issue && issue.cle !== 'non-reglable' ? chiffreReel(p, fiche.reel, noms) : null,
        version: APRES.versionMoteur(p.engineVersion),
        premiere: p.premiere && premiereDite ? APRES.premiere(p.premiere.label ?? '', premiereDite.cle === 'non-reglable' ? `${premiereDite.libelle} (${premiereDite.raison})` : premiereDite.libelle) : null
      };
    })
    .sort((a, b) => rangDuMarche(a.marketId) - rangDuMarche(b.marketId) || String(a.marche).localeCompare(String(b.marche)) || String(a.pronostic).localeCompare(String(b.pronostic)));
  const n = (cle) => lignes.filter((l) => l.issue?.cle === cle).length;
  const message = fiche.message ?? (fiche.etat === 'regle' && !lignes.length ? APRES.aucun : null);
  const compteDit = lignes.length ? { juste: n('juste'), faux: n('faux'), nonReglable: n('non-reglable'), texte: APRES.compte(n('juste'), n('faux'), n('non-reglable')) } : null;
  return { etat: fiche.etat ?? 'regle', message, lignes, compte: compteDit, provenance: fiche.provenance ?? null, butsCaches: fiche.butsCaches ?? null };
}
