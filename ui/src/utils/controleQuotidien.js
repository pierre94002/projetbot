/**
 * controleQuotidien.js — les règles d'écran du contrôle quotidien et de la
 * santé des sources (étape 14 du plan, 07/10/2026). JavaScript pur, sans Vue
 * ni navigateur : les tests du serveur le rejouent.
 *
 * Rien n'est recalculé ici : le feu, la couleur de chaque contrôle, l'état de
 * chaque source et les raisons « à vérifier » viennent du serveur
 * (server/src/data/db/dailyChecks.js, server/src/data/sourceHealth.js). On ne
 * fait que les dire : mots, tons, ordre, et — pour le badge — choisir les
 * raisons qui touchent la famille d'un marché, avec la MÊME règle que le
 * serveur (familleDuMarche, comparée à celle du serveur par un test).
 */

/** Le feu et ses mots. Le vert dit « données vérifiées », jamais une value (contexte des données, pas d'un pari). */
export const FEUX = Object.freeze({
  vert: Object.freeze({ libelle: 'Données vérifiées', court: 'vert', ton: 'is-ok', icone: 'check' }),
  orange: Object.freeze({ libelle: 'Données : à regarder', court: 'orange', ton: 'is-warn', icone: 'alert' }),
  rouge: Object.freeze({ libelle: 'Données : à vérifier', court: 'rouge', ton: 'is-danger', icone: 'alert' })
});

/** Le statut d'un contrôle, en mots et en ton. */
export const STATUTS = Object.freeze({
  vert: Object.freeze({ libelle: 'Vert', ton: 'is-ok', icone: 'check', rang: 4 }),
  orange: Object.freeze({ libelle: 'Orange', ton: 'is-warn', icone: 'alert', rang: 2 }),
  rouge: Object.freeze({ libelle: 'Rouge', ton: 'is-danger', icone: 'alert', rang: 0 }),
  erreur: Object.freeze({ libelle: 'En panne', ton: 'is-warn', icone: 'x', rang: 1 }),
  'non-fait': Object.freeze({ libelle: 'Pas fait', ton: 'is-muted', icone: 'minus', rang: 3 })
});

/** L'état d'une source, en mots et en ton (le serveur donne aussi sa couleur). */
export const ETATS_SOURCE = Object.freeze({
  ok: Object.freeze({ libelle: 'En bon état', ton: 'is-ok', icone: 'check' }),
  'a-surveiller': Object.freeze({ libelle: 'À surveiller', ton: 'is-warn', icone: 'alert' }),
  'en-panne': Object.freeze({ libelle: 'En panne', ton: 'is-danger', icone: 'x' }),
  coupe: Object.freeze({ libelle: 'Coupée', ton: 'is-muted', icone: 'pause' }),
  inconnu: Object.freeze({ libelle: 'État inconnu', ton: 'is-muted', icone: 'info' })
});

/** Les sept familles, dans l'ordre de l'écran (le serveur les envoie ; ceci sert tant qu'il ne répond pas). */
export const FAMILLES_PAR_DEFAUT = Object.freeze([
  Object.freeze({ cle: 'scores', libelle: 'Scores' }),
  Object.freeze({ cle: 'doublons', libelle: 'Doublons et identité' }),
  Object.freeze({ cle: 'impossibles', libelle: 'Chiffres impossibles' }),
  Object.freeze({ cle: 'non-releves', libelle: 'Zéros « non relevé »' }),
  Object.freeze({ cle: 'completude', libelle: 'Complétude et fraîcheur' }),
  Object.freeze({ cle: 'reperes', libelle: 'Hors repères' }),
  Object.freeze({ cle: 'sources', libelle: 'Santé des sources' })
]);

/** Les six sources, dans l'ordre de la carte (le tableau garde ses six lignes même quand le serveur ne répond pas). */
export const SOURCES_PAR_DEFAUT = Object.freeze([
  Object.freeze({ cle: 'fotmob', nom: 'FotMob' }),
  Object.freeze({ cle: 'football-data', nom: 'football-data.co.uk' }),
  Object.freeze({ cle: 'odds-api', nom: 'The Odds API' }),
  Object.freeze({ cle: 'api-football', nom: 'API-Football' }),
  Object.freeze({ cle: 'claude', nom: 'Claude (Claude Code)' }),
  Object.freeze({ cle: 'cotes-gratuites', nom: 'Cotes gratuites de référence' })
]);

export const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
export const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;

/** « 06/10/2026 à 17:00 » (heure du poste), ou le texte de repli. */
export function quand(iso, repli = 'date inconnue') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return repli;
  const d = new Date(t);
  const jour = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

/** « 05/10/2026 » d'un jour AAAA-MM-JJ (sans fuseau), ou le repli. */
export function jourFr(jour, repli = 'date inconnue') {
  const m = String(jour ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : repli;
}

/** « 2,1 s » ; « 840 ms » sous la seconde. */
export function duree(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return 'durée inconnue';
  const n = Number(ms);
  return n < 1000 ? `${nombre(Math.round(n))} ms` : `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')} s`;
}

/**
 * Le feu dit en clair, pour la puce du haut et le titre de la carte. Jamais
 * « Données vérifiées » sans contrôle : tant que le premier n'est pas fait (ou
 * que l'état est illisible), un feu vert ne dit rien des données — seule une
 * source en difficulté, elle, se lit déjà (orange ou rouge).
 */
export function etatDuFeu(resume) {
  const feu = FEUX[resume?.feu] ? resume.feu : null;
  const controle = !resume?.etat || resume.etat === 'pret';
  if (!feu || (feu === 'vert' && !controle)) {
    return { feu: null, libelle: resume?.etat === 'illisible' ? 'Contrôle illisible' : 'Contrôle : pas encore fait', ton: 'is-muted', icone: 'info' };
  }
  return { feu, ...FEUX[feu] };
}

/** Le titre au survol de la puce : le feu, puis les contrôles en échec, un par ligne. */
export function titreDuFeu(resume) {
  const e = etatDuFeu(resume);
  const lignes = [`${e.libelle}${resume?.le ? ` — contrôle du ${quand(resume.le)}` : ''}`];
  for (const c of resume?.enEchec ?? []) lignes.push(`${STATUTS[c.statut]?.libelle ?? c.statut} · ${c.libelle} : ${String(c.constat ?? '').slice(0, 140)}`);
  if ((resume?.enEchecTotal ?? 0) > (resume?.enEchec?.length ?? 0)) lignes.push(`… et ${nombre(resume.enEchecTotal - resume.enEchec.length)} autre(s)`);
  lignes.push('— le détail dans Réglages › Contrôle quotidien');
  return lignes.join('\n');
}

/** Les contrôles d'une famille, dans l'ordre du serveur ; les familles vides restent (la structure ne bouge pas). */
export function parFamille(controles, familles = FAMILLES_PAR_DEFAUT) {
  return familles.map((f) => ({ ...f, controles: (controles ?? []).filter((c) => c.famille === f.cle) }));
}

/** Les comptes d'une liste de contrôles, par statut. Σ des statuts = nombre de contrôles. */
export function compter(controles) {
  const c = { vert: 0, orange: 0, rouge: 0, erreur: 0, 'non-fait': 0, total: 0 };
  for (const x of controles ?? []) {
    const s = STATUTS[x.statutLe] ? x.statutLe : 'non-fait';
    c[s]++;
    c.total++;
  }
  return c;
}

/** Les contrôles en échec d'abord (rouge, en panne, orange), dans l'ordre du serveur à statut égal. */
export function enEchecDabord(controles) {
  return [...(controles ?? [])].map((c, i) => ({ c, i })).sort((a, b) => (STATUTS[a.c.statutLe]?.rang ?? 9) - (STATUTS[b.c.statutLe]?.rang ?? 9) || a.i - b.i).map((x) => x.c);
}

/** Un constat dit « nouveau » (rouge depuis moins de 24 h) ou « connu depuis le … ». */
export function etiquetteDuConstat(c) {
  if (c?.classe === 'rouge') return c.couleur === 'rouge' ? 'nouveau' : `connu depuis le ${quand(c.trouveLe)}`;
  if (c?.classe === 'info') return 'information';
  return c?.trouveLe ? `vu depuis le ${quand(c.trouveLe)}` : 'à regarder';
}

// ------------------------------------------------------------ « à vérifier »

/** Les identifiants de marché du moteur qui ne viennent pas du score, et le seul marché de joueur qui existe déjà (la règle du serveur, dailyChecks.FAMILLE_PAR_MARCHE). */
export const FAMILLE_PAR_MARCHE = Object.freeze({
  totalCorners: 'corners',
  teamCorners: 'corners',
  totalShots: 'tirs',
  teamShots: 'tirs',
  totalShotsOnTarget: 'tirs',
  teamShotsOnTarget: 'tirs',
  totalCards: 'cartons',
  teamCards: 'cartons',
  anytimeScorer: 'joueurs'
});

/** Un identifiant du moteur (un seul mot, jamais un libellé) d'un marché sur un joueur à venir : firstScorer, playerShots, playerCards, assists… */
const ID_DE_JOUEUR = /^(player[A-Z0-9_].*|.*[Ss]corer|assists?)$/;

/**
 * La famille d'un marché : corners, tirs, cartons, joueurs (buteur, passeur… :
 * le moteur ne calcule encore aucun pari sur un joueur) ; tout le reste vient
 * du score (buts). Même règle que le serveur.
 */
export function familleDuMarche(marche) {
  const m = String(marche ?? '').trim();
  if (FAMILLE_PAR_MARCHE[m]) return FAMILLE_PAR_MARCHE[m];
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(m) && ID_DE_JOUEUR.test(m)) return 'joueurs';
  if (/^(buteurs?|passeurs?|joueurs?)\b/i.test(m)) return 'joueurs';
  if (/^corners?\b/i.test(m)) return 'corners';
  if (/^(tirs?|shots?)\b/i.test(m)) return 'tirs';
  if (/^(cartons?|cards?)\b/i.test(m)) return 'cartons';
  return 'buts';
}

/**
 * Les raisons « à vérifier » qui touchent un marché : celles de toutes
 * familles (« tout ») et celles de SA famille. `aVerifier` : ce que le serveur
 * a joint au pronostic ou à l'analyse ({ raisons, texte }) ; `marche` : un
 * identifiant de marché, ou null pour toutes les raisons jointes — au résumé
 * d'un match le serveur n'y met jamais celles de la famille « joueurs » (écart
 * de buteurs ou de gardiens) : pas de bandeau pour elles, seulement le badge
 * d'un marché de joueurs.
 */
export function raisonsPourMarche(aVerifier, marche = null) {
  const raisons = Array.isArray(aVerifier?.raisons) ? aVerifier.raisons : [];
  if (marche === null || marche === undefined) return raisons;
  const famille = familleDuMarche(marche);
  return raisons.filter((r) => (r.familles ?? ['tout']).includes('tout') || (r.familles ?? []).includes(famille));
}

/** Le texte court d'un badge : la première raison, et combien d'autres. */
export function texteDesRaisons(raisons) {
  const liste = raisons ?? [];
  if (!liste.length) return '';
  return liste.length > 1 ? `${liste[0].texte} (et ${pluriel(liste.length - 1, 'autre raison', 'autres raisons')})` : liste[0].texte;
}

/** La phrase complète du badge (survol, lecteur d'écran) : toutes les raisons, et ce que le badge ne fait pas. */
export function phraseDuBadge(raisons) {
  const liste = raisons ?? [];
  if (!liste.length) return '';
  return `À vérifier : ${liste.map((r) => r.texte).join(' ; ')}. Le pronostic et son verdict ne changent pas : les données qu’il a lues sont à vérifier.`;
}
