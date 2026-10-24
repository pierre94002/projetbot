/**
 * Un ESSAI À BLANC FABRIQUÉ (réactivité de l'étape de nuit « moteurABlanc », 24/10/2026) — ce n'est PAS un
 * fichier de test. Exécuté DANS une copie de travail (cf. isolement.mjs) : jamais la vraie base.
 *
 * La nuit du 23 au 24/10/2026, l'étape « moteurABlanc » (la candidate « modele-buts-v1 » de l'étape 27) a tenu le
 * serveur de Pierre jusqu'à 2 191 ms d'affilée, à 42 matchs joués comparés ; l'essai ira jusqu'à 800 matchs (son
 * horizon). Ici, l'essai de la candidate DU CODE est fabriqué à la taille voulue, comme la nuit le laisse en base :
 *   - la candidate mise en essai (mettreLaCandidateEnEssai, registres d'ESSAI passés par l'appelant) à `depuis` ;
 *   - `joues` matchs JOUÉS : ceux du magasin (identifiants FotMob, score), complétés au besoin par des rencontres
 *     inventées (championnat « Essai réactivité ») insérées au magasin de la copie ;
 *   - `aVenir` matchs À VENIR (après `maintenant`, sans rencontre au magasin) ;
 *   - pour chaque match, les six lignes de la nuit (plus/moins 2,5, les deux marquent, buts de chaque équipe,
 *     résultat + total, le témoin du score exact : 81 cases), en `revisions` révisions (une par nuit où le match
 *     était à venir, chacune différente : sinon le dépôt ne l'écrit pas), écrites par le dépôt comme la nuit.
 * Les distributions sortent d'une grille de Poisson (λ tirés d'un générateur à graine) : aucun hasard d'un
 * lancement à l'autre — le même essai, ligne pour ligne, pour comparer deux versions du code.
 */

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const jourDe = (instant) => new Date(instant).toISOString().slice(0, 10);

/** Générateur à graine (mulberry32). */
function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const p4 = (x) => Number(x.toFixed(4));
const p6 = (x) => Number(x.toFixed(6));
const fact = [1];
for (let k = 1; k <= 20; k++) fact[k] = fact[k - 1] * k;
const poisson = (k, l) => (Math.exp(-l) * l ** k) / fact[k];

/** Les distributions d'un match pour (λh, λa) : la forme de distributionDuMarche (markets.js), et les 81 cases du score. */
function distributions(lh, la, provenance) {
  const g = [];
  let dans = 0;
  for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) {
    const p = poisson(h, lh) * poisson(a, la);
    g.push(p);
    dans += p;
  }
  const somme = (garder) => {
    let s = 0;
    for (let k = 0; k < 81; k++) if (garder(Math.floor(k / 9), k % 9)) s += g[k];
    return s / dans;
  };
  const over25 = somme((h, a) => h + a >= 3);
  const btts = somme((h, a) => h >= 1 && a >= 1);
  const h15 = somme((h) => h >= 2);
  const a15 = somme((h, a) => a >= 2);
  const rt = {
    homeOver: somme((h, a) => h > a && h + a >= 3),
    homeUnder: somme((h, a) => h > a && h + a < 3),
    drawOver: somme((h, a) => h === a && h + a >= 3),
    drawUnder: somme((h, a) => h === a && h + a < 3),
    awayOver: somme((h, a) => h < a && h + a >= 3),
    awayUnder: somme((h, a) => h < a && h + a < 3)
  };
  const issuesScore = {};
  for (let k = 0; k < 81; k++) issuesScore[`${Math.floor(k / 9)}-${k % 9}`] = p6(g[k]);
  let ml = 0;
  for (let k = 1; k < 81; k++) if (g[k] > g[ml]) ml = k;
  return {
    totalGoals: { ligne: 2.5, issues: { over: p4(over25), under: p4(1 - over25) }, provenance },
    bothTeamsScore: { issues: { yes: p4(btts), no: p4(1 - btts) }, provenance },
    teamGoalsHome: { equipe: 'home', ligne: 1.5, issues: { over: p4(h15), under: p4(1 - h15) }, provenance },
    teamGoalsAway: { equipe: 'away', ligne: 1.5, issues: { over: p4(a15), under: p4(1 - a15) }, provenance },
    resultAndTotal: { ligne: 2.5, issues: Object.fromEntries(Object.entries(rt).map(([k, v]) => [k, p4(v)])), provenance },
    scoreExact: { issues: issuesScore, horsGrille: p6(1 - dans) },
    scoreLePlusProbable: { home: Math.floor(ml / 9), away: ml % 9, p: p6(g[ml]) }
  };
}

const meilleure = (issues) => Object.entries(issues).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
const cote = (p) => Number((1 / p).toFixed(2));
const parametres = (params) => (params ? JSON.stringify(Object.fromEntries(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))) : null);

/** Les six lignes d'un match pour une révision : la candidate (b) et la version en service (a) sur la même ligne. */
function lignesDuMatchFabrique(m, { candidateId, empreinte, versionEnService, recordedAt, db, da }) {
  const commun = {
    candidateId,
    candidateHash: empreinte,
    serviceVersion: versionEnService,
    recordedAt,
    fixtureKey: `fotmob:${m.homeId}|${m.awayId}|${m.date}`,
    matchId: m.matchKey,
    league: m.league,
    date: m.date,
    kickoff: m.kickoff,
    homeName: m.homeName,
    awayName: m.awayName,
    homeId: m.homeId,
    awayId: m.awayId,
    oddsSource: 'free',
    oddsAt: recordedAt,
    lineupState: 'none'
  };
  const marche = (marketKey, marketId, market, dB, dA, paramsDe) => {
    const [cb, pb] = meilleure(dB.issues);
    const [ca, pa] = meilleure(dA.issues);
    return {
      ...commun,
      marketKey,
      marketId,
      market,
      params: parametres(paramsDe(cb)),
      choice: cb,
      label: `${market} ${cb}`,
      probability: p4(pb),
      predictedOdds: cote(pb),
      distribution: JSON.stringify(dB),
      serviceParams: parametres(paramsDe(ca)),
      serviceChoice: ca,
      serviceProbability: p4(pa),
      servicePredictedOdds: cote(pa),
      serviceDistribution: JSON.stringify(dA)
    };
  };
  const mlB = db.scoreLePlusProbable;
  const mlA = da.scoreLePlusProbable;
  return [
    marche('bothTeamsScore', 'bothTeamsScore', 'Les 2 équipes marquent', db.bothTeamsScore, da.bothTeamsScore, (c) => ({ outcome: c })),
    marche('resultAndTotal', 'resultAndTotal', 'Résultat + Total buts', db.resultAndTotal, da.resultAndTotal, (c) => ({ line: 2.5, key: c })),
    {
      ...commun,
      marketKey: 'scoreExact',
      marketId: 'scoreExact',
      market: 'Score exact',
      params: null,
      choice: `${mlB.home}-${mlB.away}`,
      label: `Score exact ${mlB.home}-${mlB.away}`,
      probability: mlB.p,
      predictedOdds: null,
      distribution: JSON.stringify(db.scoreExact),
      serviceParams: null,
      serviceChoice: `${mlA.home}-${mlA.away}`,
      serviceProbability: mlA.p,
      servicePredictedOdds: null,
      serviceDistribution: JSON.stringify({ issues: da.scoreExact.issues, horsGrille: 0 })
    },
    marche('teamGoals:away', 'teamGoals', 'Buts de l’équipe', db.teamGoalsAway, da.teamGoalsAway, (c) => ({ team: 'away', line: 1.5, side: c })),
    marche('teamGoals:home', 'teamGoals', 'Buts de l’équipe', db.teamGoalsHome, da.teamGoalsHome, (c) => ({ team: 'home', line: 1.5, side: c })),
    marche('totalGoals', 'totalGoals', 'Total buts', db.totalGoals, da.totalGoals, (c) => ({ line: 2.5, side: c }))
  ];
}

const PROVENANCES = ['cotes-1n2-xg', 'cotes-plusmoins-xg', 'cotes-1n2-buts', 'xg-seuls', 'buts-seuls', 'moyennes-seules'];

/**
 * Fabrique l'essai. `imp` : l'importeur de la copie (versionsMoteurCommun.importeur). `versions` / `mesure` : les
 * registres d'ESSAI ({ fichier }). `depuis` / `maintenant` : instants (ms). `joues` : matchs joués ; `aVenir` :
 * matchs à venir ; `revisions` : { joues, aVenir } ; `magasin` : prendre d'abord les matchs joués du magasin.
 * Rend { candidate (celle de mettreLaCandidateEnEssai, avec son essai), joues, inventes, aVenir, lignes, ecrites }.
 */
export async function fabriquerEssai({ imp, database, versions, mesure, depuis, maintenant, joues, aVenir = 676, revisions = { joues: 3, aVenir: 2 }, magasin = true, graine = 20261024 }) {
  const V = await imp('core/engine/engineVersions.js');
  const { ecrirePronosticsABlanc } = await imp('data/enregistreurs/depot.js');
  const mis = V.mettreLaCandidateEnEssai({ fichier: versions.fichier, mesure, maintenant: depuis });
  const candidate = mis.candidate;
  if (!candidate?.essai) throw new Error('fabriquerEssai : la candidate du code n’a pas été mise en essai.');
  const u = generateur(graine);
  const premier = plusJours(jourDe(depuis), 1);
  const dernier = plusJours(jourDe(maintenant), -1);

  // Les matchs JOUÉS : le magasin d'abord, puis des rencontres inventées, insérées au magasin de la copie.
  let tires = [];
  if (magasin) {
    tires = database
      .prepare(
        `SELECT match_key AS matchKey, date, league, home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId FROM matches
         WHERE date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL AND home_goals IS NOT NULL AND away_goals IS NOT NULL
         ORDER BY date, match_key LIMIT ?`
      )
      .all(premier, dernier, joues)
      .map((r) => ({ ...r, kickoff: `${r.date}T18:00:00.000Z` }));
  }
  const jours = Math.max(1, Math.round((Date.parse(`${dernier}T00:00:00Z`) - Date.parse(`${premier}T00:00:00Z`)) / JOUR_MS) + 1);
  const inventes = [];
  for (let i = tires.length; i < joues; i++) {
    const date = plusJours(premier, i % jours);
    const cle = `essai-reactivite-${String(i).padStart(5, '0')}`;
    inventes.push({ matchKey: cle, date, league: 'Essai réactivité', homeName: `Essai Dom ${i}`, awayName: `Essai Ext ${i}`, homeId: `fotmob-91${String(i).padStart(5, '0')}`, awayId: `fotmob-92${String(i).padStart(5, '0')}`, kickoff: `${date}T18:00:00.000Z`, hg: Math.floor(u() * 4), ag: Math.floor(u() * 3) });
  }
  if (inventes.length) {
    const inserer = database.prepare(
      `INSERT OR IGNORE INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    database.exec('BEGIN');
    try {
      for (const m of inventes) inserer.run(m.matchKey, m.matchKey, m.date, m.league, m.homeName, m.awayName, m.homeId, m.awayId, m.hg, m.ag, JSON.stringify({ kickoff: m.kickoff }), new Date(maintenant).toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  const futurs = [];
  const demain = plusJours(jourDe(maintenant), 1);
  for (let i = 0; i < aVenir; i++) {
    const date = plusJours(demain, i % 6);
    futurs.push({ matchKey: `essai-reactivite-a-venir-${i}`, date, league: 'Essai réactivité', homeName: `Avenir Dom ${i}`, awayName: `Avenir Ext ${i}`, homeId: `fotmob-93${String(i).padStart(5, '0')}`, awayId: `fotmob-94${String(i).padStart(5, '0')}`, kickoff: `${date}T18:00:00.000Z` });
  }

  // Les lignes, révision par révision (une par nuit où le match était à venir).
  const base = { candidateId: candidate.id, empreinte: candidate.empreinte, versionEnService: candidate.essai.versionEnService };
  let lignes = 0;
  let ecrites = 0;
  const ecrire = (tas) => {
    for (let i = 0; i < tas.length; i += 600) ecrites += ecrirePronosticsABlanc(tas.slice(i, i + 600), { database });
    lignes += tas.length;
  };
  const tousLesMatchs = [...tires.map((m) => ({ m, n: revisions.joues })), ...inventes.map((m) => ({ m, n: revisions.joues })), ...futurs.map((m) => ({ m, n: revisions.aVenir }))];
  const parametresDuMatch = tousLesMatchs.map(() => ({ lh: 0.6 + u() * 1.6, la: 0.4 + u() * 1.4, bruit: 0.15 + u() * 0.2, prov: PROVENANCES[Math.floor(u() * PROVENANCES.length)] }));
  const maxRev = Math.max(revisions.joues, revisions.aVenir);
  for (let r = 1; r <= maxRev; r++) {
    const tas = [];
    tousLesMatchs.forEach(({ m, n }, k) => {
      if (r > n) return;
      // La révision r est gelée (n − r + 1) nuits avant le jour du match, à 03 h UTC — jamais après `maintenant`.
      const nuit = Math.min(Date.parse(`${plusJours(m.date, -(n - r + 1))}T03:00:00.000Z`), maintenant - 3_600_000);
      const recordedAt = new Date(nuit - (n - r) * 1000).toISOString();
      const p = parametresDuMatch[k];
      const derive = 1 + 0.03 * (r - 1);
      const db = distributions(p.lh * derive, p.la / derive, p.prov);
      const da = distributions(p.lh * (1 + p.bruit) * derive, p.la * (1 - p.bruit / 2) / derive, null);
      for (const d of [da.totalGoals, da.bothTeamsScore, da.teamGoalsHome, da.teamGoalsAway, da.resultAndTotal]) delete d.provenance;
      tas.push(...lignesDuMatchFabrique(m, { ...base, recordedAt, db, da }));
    });
    ecrire(tas);
  }
  return { candidate, joues: tires.length + inventes.length, duMagasin: tires.length, inventes: inventes.length, aVenir: futurs.length, lignes, ecrites };
}

/** Efface l'essai fabriqué de la copie (les lignes à blanc de la candidate, les rencontres inventées). */
export function effacerEssai(database, candidateId) {
  database.prepare('DELETE FROM engine_candidate_picks WHERE candidate_id = ?').run(candidateId);
  database.prepare("DELETE FROM matches WHERE match_key LIKE 'essai-reactivite-%'").run();
}
