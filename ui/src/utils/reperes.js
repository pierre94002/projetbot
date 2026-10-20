/**
 * reperes.js — les règles d'affichage des REPÈRES DU CHAMPIONNAT (étape 15 du
 * plan, 07/10/2026 ; onglet « Statistiques ligue »). JavaScript pur, sans Vue
 * ni navigateur : les tests du serveur le rejouent (server/test/reperes*.test.mjs).
 *
 * Rien n'est calculé ici qui ne le soit déjà au serveur
 * (server/src/data/db/leagueBenchmarks.js, GET /api/match-stats/benchmarks) :
 * l'écran met en forme, choisit les colonnes, dessine la petite courbe et
 * refait, pour les lignes affichées, la ligne « toutes les saisons » : chaque
 * repère pondéré par ses matchs (Σ valeur × matchs / Σ matchs) — jamais une
 * somme ni une moyenne de pourcentages. Un test vérifie qu'elle retombe sur
 * celle du serveur.
 */

export const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');

const fini = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/** « 2,82 » ; une part (0 à 1) : « 54,0 % » ; signé : « +0,30 ». */
export function valeurTexte(v, type = 'moyenne', { signe = false, chiffres = null } = {}) {
  if (!fini(v)) return null;
  const x = Number(v);
  if (type === 'part') return `${(100 * x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const c = chiffres ?? 2;
  const t = x.toLocaleString('fr-FR', { minimumFractionDigits: c, maximumFractionDigits: c });
  return signe && x > 0 ? `+${t}` : t;
}

/** Le texte d'une case : sa valeur, sinon pourquoi elle est vide (« non relevé par football-data.co.uk »), jamais un tiret. */
export function texteCase(cellule, definition) {
  const t = cellule && cellule.matchs ? valeurTexte(cellule.valeur, definition?.type, { signe: definition?.signe }) : null;
  return t ?? cellule?.nonReleve ?? 'non relevé';
}

/**
 * Les repères que l'écran montre, avec leur forme (part ou moyenne par match),
 * pour que le tableau garde sa structure même sans réponse du serveur.
 */
export const DEFINITIONS = Object.freeze(
  Object.fromEntries(
    [
      ['buts', 'moyenne'], ['avantage_terrain', 'moyenne', true], ['victoires_dom', 'part'], ['nuls', 'part'], ['victoires_ext', 'part'],
      ['plus_1_5', 'part'], ['plus_2_5', 'part'], ['plus_3_5', 'part'], ['deux_marquent', 'part'], ['buts_1re_mt', 'moyenne'], ['buts_2e_mt', 'moyenne'],
      ['corners', 'moyenne'], ['tirs', 'moyenne'], ['tirs_cadres', 'moyenne'], ['cartons_jaunes', 'moyenne'], ['cartons_rouges', 'moyenne'],
      ['penalties', 'moyenne'], ['penalties_tires', 'moyenne']
    ].map(([cle, type, signe = false]) => [cle, Object.freeze({ cle, type, signe })])
  )
);

/** Les colonnes du tableau saison par saison, dans l'ordre de lecture. `sous` : le repère écrit en petit sous la valeur. */
export const COLONNES = Object.freeze([
  { cle: 'buts', titre: 'Buts', aide: 'Buts par match, les deux équipes ensemble' },
  { cle: 'avantage_terrain', titre: 'Avantage terrain', aide: 'Buts de l’équipe qui reçoit moins ceux de l’équipe qui se déplace, par match' },
  { cle: 'victoires_dom', titre: 'Victoires dom.', aide: 'Part des matchs gagnés par l’équipe qui reçoit' },
  { cle: 'nuls', titre: 'Nuls', aide: 'Part des matchs nuls' },
  { cle: 'victoires_ext', titre: 'Victoires ext.', aide: 'Part des matchs gagnés par l’équipe qui se déplace' },
  { cle: 'plus_1_5', titre: '+1,5 but', aide: 'Part des matchs à 2 buts ou plus' },
  { cle: 'plus_2_5', titre: '+2,5 buts', aide: 'Part des matchs à 3 buts ou plus' },
  { cle: 'plus_3_5', titre: '+3,5 buts', aide: 'Part des matchs à 4 buts ou plus' },
  { cle: 'deux_marquent', titre: 'Les 2 marquent', aide: 'Part des matchs où les deux équipes marquent' },
  { cle: 'buts_1re_mt', titre: '1re mi-temps', aide: 'Buts par match en première mi-temps (minute des buts chez FotMob, score à la mi-temps chez football-data)' },
  { cle: 'buts_2e_mt', titre: '2e mi-temps', aide: 'Buts par match en seconde mi-temps' },
  { cle: 'corners', titre: 'Corners', aide: 'Corners par match, les deux équipes ensemble' },
  { cle: 'tirs', titre: 'Tirs', sous: 'tirs_cadres', aide: 'Tirs par match (en petit : tirs cadrés)' },
  { cle: 'cartons_jaunes', titre: 'Jaunes', sous: 'cartons_rouges', aide: 'Cartons jaunes par match (en petit : rouges)' },
  { cle: 'penalties', titre: 'Penalties', sous: 'penalties_tires', aide: 'Penalties marqués par match (en petit : tirés, d’après la carte des tirs FotMob)' }
]);

/** Toutes les clés que montre le tableau (colonnes et petites lignes). */
export const CLES_DU_TABLEAU = Object.freeze(COLONNES.flatMap((c) => (c.sous ? [c.cle, c.sous] : [c.cle])));

/** Les repères que la petite courbe sait dessiner. */
export const COURBES = Object.freeze([
  { cle: 'buts', libelle: 'Buts' },
  { cle: 'nuls', libelle: 'Nuls' },
  { cle: 'plus_2_5', libelle: '+2,5 buts' },
  { cle: 'deux_marquent', libelle: 'Les 2 marquent' },
  { cle: 'corners', libelle: 'Corners' },
  { cle: 'cartons_jaunes', libelle: 'Jaunes' }
]);

/** Le libellé d'une source, tel qu'on le dit : jamais une étiquette vague. */
export function libelleSource(source) {
  if (source === 'fotmob') return 'FotMob';
  if (source === 'football-data') return 'football-data.co.uk';
  if (source === 'fotmob+football-data') return 'FotMob et football-data.co.uk';
  return 'source inconnue';
}

/**
 * La ligne « toutes les saisons » des lignes AFFICHÉES : pour chaque repère,
 * Σ (valeur × matchs) / Σ matchs — la part de tous ces matchs réunis pour un
 * pourcentage, jamais une somme ni la moyenne des pourcentages des saisons.
 */
export function toutesLesSaisons(saisons, definitions = []) {
  const out = { matchs: 0, saisons: saisons.length, reperes: {} };
  for (const s of saisons) out.matchs += s.matchs ?? 0;
  for (const d of definitions) {
    let n = 0;
    let somme = 0;
    for (const s of saisons) {
      const c = s.reperes?.[d.cle];
      if (!c || !c.matchs || !fini(c.valeur)) continue;
      n += c.matchs;
      somme += c.valeur * c.matchs;
    }
    out.reperes[d.cle] = { valeur: n ? somme / n : null, matchs: n };
  }
  return out;
}

/** « 1-1 (12,4 %), 2-1 (9,7 %), 1-0 (9,2 %) » : les scores les plus fréquents. */
export function scoresTexte(scores, matchs, combien = 3) {
  if (!Array.isArray(scores) || !scores.length || !matchs) return 'aucun match';
  return scores
    .slice(0, combien)
    .map(([score, n]) => `${score} (${valeurTexte(n / matchs, 'part')})`)
    .join(', ');
}

/** « 2000-01 → 2026-27 ». */
export function texteSaisons(premiere, derniere) {
  if (!premiere) return 'aucune saison';
  return premiere === derniere || !derniere ? premiere : `${premiere} → ${derniere}`;
}

/** Ce que dit le bloc quand il n'a pas de repères à montrer (la structure du tableau reste). */
export function etatDuBloc(reponse, erreur = null) {
  if (erreur) {
    if (/introuvables pour le match benchmarks/.test(erreur)) return { cle: 'pas-a-jour', ton: 'is-warning', texte: "Le serveur n'est pas à jour : relancez demarrer-cotemaster.bat pour activer les repères du championnat." };
    return { cle: 'erreur', ton: 'is-danger', texte: `Repères illisibles : ${erreur}` };
  }
  if (!reponse) return { cle: 'chargement', ton: 'is-info', texte: 'Lecture des repères…' };
  if (reponse.etat === 'pret') return { cle: 'pret', ton: null, texte: null };
  if (reponse.etat === 'coupe') return { cle: 'coupe', ton: 'is-info', texte: `Les coupes sont tenues à part (terrain neutre, prolongations, tirs au but) : aucun repère de championnat pour ${reponse.league}.` };
  if (reponse.etat === 'inconnu') return { cle: 'inconnu', ton: 'is-warning', texte: reponse.raison ?? 'Championnat inconnu du magasin.' };
  return { cle: 'jamais', ton: 'is-info', texte: 'Pas encore calculés : ils le seront à la prochaine passe de nuit de l’actualisation (étape « Repères de chaque championnat »).' };
}

/** Une précision sous le nom d'une saison : en cours, partielle, écartés, fichier football-data. */
export function notesDeSaison(s) {
  const notes = [];
  if (s.enCours) notes.push('saison en cours');
  if (s.partielle) notes.push('saison partielle : commencée avant le magasin FotMob');
  if (s.source === 'football-data' && s.fichier) notes.push(`fichier ${s.fichier}.csv${s.fichier.startsWith('new/') ? ' (par pays : score final seulement, playoffs compris)' : ''}`);
  const e = s.exclus;
  if (e) {
    const parts = [];
    if (e.horsClassement) parts.push(`${nombre(e.horsClassement)} hors classement`);
    if (e.attribues) parts.push(`${nombre(e.attribues)} attribué(s)`);
    if (e.prolongations) parts.push(`${nombre(e.prolongations)} prolongé(s)`);
    if (e.nonJoues) parts.push(`${nombre(e.nonJoues)} non joué(s)`);
    if (parts.length) notes.push(`écartés : ${parts.join(', ')}`);
  }
  return notes;
}

// ------------------------------------------------------------ la petite courbe

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const nomDuMois = (mm) => MOIS[Number(mm) - 1] ?? mm;

/** Les mois dans l'ordre de la saison : juillet → juin, ou janvier → décembre pour une saison d'année civile (« 2026 »). */
export function ordreDesMois(libelleSaison) {
  const civile = /^\d{4}$/.test(String(libelleSaison ?? ''));
  const debut = civile ? 1 : 7;
  return Array.from({ length: 12 }, (_, i) => String(((debut - 1 + i) % 12) + 1).padStart(2, '0'));
}

function echelle(valeurs, hauteur, marge) {
  const v = valeurs.filter(fini);
  if (!v.length) return null;
  let min = Math.min(...v);
  let max = Math.max(...v);
  if (max - min < 1e-9) {
    min -= 0.5 * Math.abs(min || 1) * 0.1;
    max += 0.5 * Math.abs(max || 1) * 0.1;
  }
  const y = (x) => marge + (hauteur - 2 * marge) * (1 - (x - min) / (max - min));
  return { min, max, y };
}

/**
 * La courbe SAISON PAR SAISON d'un repère : un point par saison, de la plus
 * ancienne à la plus récente, la source de chaque point (FotMob plein,
 * football-data creux), la saison en cours marquée, et la moyenne de toutes
 * les saisons en tirets. `saisons` : celles de la route (la plus récente
 * d'abord). Rend { vide, points, chemin, moyenneY, min, max, premiere, derniere }.
 */
export function courbeDesSaisons(saisons, cle, { largeur = 600, hauteur = 120, marge = 10, moyenne = null } = {}) {
  const points = [...(saisons ?? [])]
    .reverse()
    .map((s) => ({ saison: s.saison, source: s.source, enCours: Boolean(s.enCours), valeur: s.reperes?.[cle]?.matchs ? s.reperes[cle].valeur : null, matchs: s.reperes?.[cle]?.matchs ?? 0 }))
    .filter((p) => fini(p.valeur));
  if (points.length < 2) return { vide: true, points: [], chemin: '', moyenneY: null, min: null, max: null, premiere: points[0]?.saison ?? null, derniere: points.at(-1)?.saison ?? null };
  const e = echelle([...points.map((p) => p.valeur), ...(fini(moyenne) ? [moyenne] : [])], hauteur, marge);
  const pas = (largeur - 2 * marge) / (points.length - 1);
  for (const [i, p] of points.entries()) {
    p.x = Math.round((marge + i * pas) * 10) / 10;
    p.y = Math.round(e.y(p.valeur) * 10) / 10;
  }
  return {
    vide: false,
    points,
    chemin: points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '),
    moyenneY: fini(moyenne) ? Math.round(e.y(moyenne) * 10) / 10 : null,
    min: e.min,
    max: e.max,
    premiere: points[0].saison,
    derniere: points.at(-1).saison
  };
}

/**
 * La courbe MOIS PAR MOIS d'un repère : toutes les saisons réunies (mois d'au
 * moins `minimum` matchs) et la saison choisie, dans l'ordre de la saison.
 * `mois` : { toutes: [{ mois, valeur, matchs }], saison: [...] }.
 */
export function courbeDesMois({ toutes = [], saison = [] } = {}, libelleSaison, { largeur = 600, hauteur = 120, marge = 10, minimum = 10 } = {}) {
  const ordre = ordreDesMois(libelleSaison);
  const parMois = (liste, min) => new Map((liste ?? []).filter((m) => fini(m.valeur) && m.matchs >= min).map((m) => [m.mois, m]));
  const a = parMois(toutes, minimum);
  const b = parMois(saison, 1);
  const mois = ordre.filter((m) => a.has(m) || b.has(m));
  if (mois.length < 2) return { vide: true, mois: [], toutes: '', saison: '', pointsToutes: [], pointsSaison: [], min: null, max: null };
  const e = echelle([...[...a.values()].map((m) => m.valeur), ...[...b.values()].map((m) => m.valeur)], hauteur, marge);
  const pas = (largeur - 2 * marge) / (mois.length - 1);
  const x = (m) => Math.round((marge + mois.indexOf(m) * pas) * 10) / 10;
  const points = (carte) => mois.filter((m) => carte.has(m)).map((m) => ({ mois: m, nom: nomDuMois(m), valeur: carte.get(m).valeur, matchs: carte.get(m).matchs, x: x(m), y: Math.round(e.y(carte.get(m).valeur) * 10) / 10 }));
  const chemin = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const pointsToutes = points(a);
  const pointsSaison = points(b);
  return { vide: false, mois: mois.map((m) => ({ mois: m, nom: nomDuMois(m), x: x(m) })), toutes: chemin(pointsToutes), saison: chemin(pointsSaison), pointsToutes, pointsSaison, min: e.min, max: e.max };
}

// ------------------------------------------------------- dispersion et facteur de terrain

const trois = (v) => valeurTexte(v, 'moyenne', { chiffres: 3 });

/**
 * Une case de mesure : « 1,094 » et son intervalle à 95 %, la valeur retenue,
 * la valeur du moteur, et si le moteur sort de l'intervalle (à regarder :
 * ambre, jamais vert ni rouge — ce n'est ni bon ni mauvais, c'est mesuré).
 */
export function caseDeMesure(m, { chiffresMoteur = 3 } = {}) {
  if (!m || !fini(m.mesure)) return { texte: 'pas assez de matchs relevés', ic: null, retenue: null, moteur: m && fini(m.moteur) ? valeurTexte(m.moteur, 'moyenne', { chiffres: chiffresMoteur }) : null, horsIntervalle: false };
  const [bas, haut] = Array.isArray(m.ic95) ? m.ic95 : [null, null];
  return {
    texte: trois(m.mesure),
    ic: fini(bas) && fini(haut) ? `${trois(bas)} – ${trois(haut)}` : null,
    retenue: fini(m.retenue) ? trois(m.retenue) : null,
    moteur: fini(m.moteur) ? valeurTexte(m.moteur, 'moyenne', { chiffres: chiffresMoteur }) : null,
    horsIntervalle: fini(m.moteur) && fini(bas) && fini(haut) && (m.moteur < bas || m.moteur > haut),
    brute: fini(m.brute) ? trois(m.brute) : null,
    matchs: m.matchs ?? 0
  };
}

/** Les lignes du tableau de la dispersion : une par statistique et par portée (ce championnat, tous). */
export function lignesDeDispersion(dispersion) {
  const lignes = [];
  for (const st of dispersion?.statistiques ?? []) {
    for (const [portee, libelle] of [['ligue', 'Ce championnat'], ['tous', 'Tous les championnats']]) {
      const b = st[portee] ?? {};
      lignes.push({
        cle: `${st.cle}-${portee}`,
        statistique: st.libelle,
        portee: libelle,
        matchs: b.equipe?.matchs ?? b.dom?.matchs ?? 0,
        dom: caseDeMesure(b.dom, { chiffresMoteur: 2 }),
        ext: caseDeMesure(b.ext, { chiffresMoteur: 2 }),
        equipe: caseDeMesure(b.equipe),
        total: caseDeMesure(b.total)
      });
    }
  }
  return lignes;
}

/** Le recoupement des deux sources, en lignes : repère, FotMob, football-data, écart. */
export function lignesDuRecoupement(recoupement, definitions = []) {
  if (!recoupement?.reperes) return [];
  return definitions
    .filter((d) => recoupement.reperes[d.cle])
    .map((d) => {
      const r = recoupement.reperes[d.cle];
      const ecart = r.ecart;
      return {
        cle: d.cle,
        libelle: d.libelle,
        fotmob: valeurTexte(r.fotmob, d.type),
        footballData: valeurTexte(r.footballData, d.type),
        ecart: d.type === 'part' ? `${ecart >= 0 ? '+' : '−'}${(100 * Math.abs(ecart)).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pt` : `${ecart >= 0 ? '+' : '−'}${Math.abs(ecart).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
        matchs: `${nombre(r.matchsFotmob)} / ${nombre(r.matchsFootballData)}`
      };
    });
}
