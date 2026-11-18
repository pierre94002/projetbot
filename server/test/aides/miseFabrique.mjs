/**
 * DONNÉES FABRIQUÉES de la mise (étape 39, lot 2, 16/11/2026) — ce n'est PAS un fichier de test. Pur : n'importe rien,
 * ne lit ni fichier ni horloge ; tout est tiré d'un générateur semé. Aucune donnée réelle : ni le carnet, ni le capital
 * de Pierre (montants neutres : 1 000 et 2 000 €).
 *   - matchsFabriques(n, graine) : des matchs adaptés comme le moteur les reçoit ({ home, away, marketOdds: { byBookmaker },
 *     bankroll }), variés — avec ou sans Pinnacle (les trois paliers de la cote juste), un à neuf bookmakers, étrangers
 *     et français, lignes saines, incohérentes ou incomplètes, bourse, cote de référence, match sans cote ;
 *   - contexteFabrique(i) : six contextes de mise, du plus vide au plus contraint (capital, paris en attente sur le
 *     match, plafonds en euros, fiches de comptes, plancher) ;
 *   - CONFIG_FABRIQUEE : un réglage du moteur complet (les valeurs en service), ses bookmakers en deux listes.
 * Servent miseLot2.test.mjs et la preuve « aucune ligne d'avant-match ne change » (comparaison du code d'avant et d'après).
 */

/** Un générateur semé (mulberry32). */
export function semer(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LIVRES_FR = Object.freeze(['unibet_fr', 'betclic_fr', 'winamax_fr', 'pmu_fr']);
export const LIVRES_ETRANGERS = Object.freeze(['williamhill', 'sport888', 'betsson', 'nordicbet', 'unibet_nl', 'unibet_se', 'leovegas_se', 'tipico_de', 'coolbet', 'codere_it']);
const TITRES = Object.freeze({ unibet_fr: 'Unibet (FR)', betclic_fr: 'Betclic (FR)', winamax_fr: 'Winamax (FR)', pmu_fr: 'PMU (FR)', williamhill: 'William Hill', pinnacle: 'Pinnacle', marathonbet: 'Marathon Bet', betfair_ex_eu: 'Betfair' });

/** Le réglage du moteur des essais : les valeurs en service au 16/11/2026 (aucune n'est lue d'un fichier). */
export const CONFIG_FABRIQUEE = Object.freeze({
  edgeThresholdMin: 0.02,
  edgeThresholdMax: 0.25,
  maxValueOdds: 5,
  defaultCorrelation: -0.075,
  kellyFraction: 0.125,
  maxStakePercent: 0.02,
  homeAdvantage: 1.06,
  cornersAdjustmentMax: 0.08,
  weights: Object.freeze({ market: 1, structural: 0, exogenous: 0 })
});
export const configAvec = (valueBookmakers) => ({ ...CONFIG_FABRIQUEE, weights: { ...CONFIG_FABRIQUEE.weights }, valueBookmakers: [...valueBookmakers] });

const deuxDecimales = (x) => Number(x.toFixed(2));

/**
 * n matchs fabriqués. Chaque match a ses vraies probabilités tirées, une ligne Pinnacle (marge 2 à 4 %) présente deux fois
 * sur trois, et des bookmakers dont chaque cote s'écarte de la cote juste de −10 % à +14 % (de quoi produire des values,
 * des cotes trop hautes, des avantages invraisemblables et des lignes sans rien).
 */
export function matchsFabriques(n, graine = 3902) {
  const tirer = semer(graine);
  const entre = (a, b) => a + tirer() * (b - a);
  const matchs = [];
  for (let i = 0; i < n; i++) {
    const p1 = entre(0.12, 0.72);
    const p2 = (1 - p1) * entre(0.2, 0.75);
    const p = [p1, p2, 1 - p1 - p2];
    const ligne = (cle, ecart) => {
      const marge = entre(1.02, 1.09);
      const o = p.map((x) => deuxDecimales(Math.max(1.01, (1 / (x * marge)) * (1 + ecart()))));
      return { key: cle, title: TITRES[cle] ?? cle, odds1: o[0], oddsDraw: o[1], odds2: o[2] };
    };
    const byBookmaker = [];
    const sorte = i % 12;
    if (sorte !== 11) {
      if (i % 3 !== 2) byBookmaker.push(ligne('pinnacle', () => entre(-0.005, 0.005)));
      else if (i % 2) byBookmaker.push(ligne('marathonbet', () => entre(-0.01, 0.01)));
      const combien = sorte === 10 ? 1 : 2 + Math.floor(tirer() * 7);
      const tous = [...LIVRES_FR, ...LIVRES_ETRANGERS];
      for (let k = 0; k < combien; k++) {
        const cle = tous[Math.floor(tirer() * tous.length)];
        if (byBookmaker.some((b) => b.key === cle)) continue;
        byBookmaker.push(ligne(cle, () => entre(-0.1, 0.14)));
      }
      // Quelques pièges : une ligne incomplète, une ligne incohérente (périmée), une bourse, une cote de référence.
      if (sorte === 3 && byBookmaker.length > 1) byBookmaker[1] = { ...byBookmaker[1], oddsDraw: null };
      if (sorte === 5 && byBookmaker.length > 1) byBookmaker[1] = { ...byBookmaker[1], odds1: deuxDecimales(byBookmaker[1].odds1 * 3) };
      if (sorte === 7) byBookmaker.push(ligne('betfair_ex_eu', () => entre(0, 0.03)));
      if (sorte === 9) byBookmaker.push({ ...ligne('draftkings', () => entre(0.02, 0.1)), referenceOnly: true });
    }
    const pin = byBookmaker.find((b) => b.key === 'pinnacle') ?? byBookmaker[0] ?? null;
    matchs.push({
      matchId: `fabrique-${graine}-${i}`,
      home: `Domicile ${i}`,
      away: `Extérieur ${i}`,
      league: 'Championnat fabriqué',
      commenceTime: `2026-11-${String(17 + (i % 10)).padStart(2, '0')}T19:00:00.000Z`,
      hasOdds: byBookmaker.length > 0,
      bankroll: [1000, 2000, 10000][i % 3],
      marketOdds: byBookmaker.length ? { odds1: pin.odds1, oddsDraw: pin.oddsDraw, odds2: pin.odds2, bookmakersCount: byBookmaker.length, byBookmaker } : null
    });
  }
  return matchs;
}

/**
 * Six contextes de mise (ce que l'APPELANT passe au moteur : match.contexteDeMise). `base` : la base du match — quand le
 * capital est indiqué, c'est lui (comme dans l'appli : la base de calcul EST le capital réglé).
 */
export function contexteFabrique(i, base = 2000) {
  switch (i % 6) {
    case 0:
      return null;
    case 1:
      return { capital: { indique: false }, enAttenteDuMatch: [25], gardeFous: { miseMaxParPari: 5, resteSemaine: 40 }, comptes: {}, plancher: null };
    case 2:
      return { capital: { indique: true, montant: base, plusHaut: base }, enAttenteDuMatch: [], gardeFous: null, comptes: {}, plancher: null };
    case 3:
      return { capital: { indique: true, montant: base, plusHaut: base }, enAttenteDuMatch: i % 12 === 3 ? [base * 0.004] : [base * 0.03], gardeFous: null, comptes: {}, plancher: null };
    case 4:
      return {
        capital: { indique: true, montant: base, plusHaut: base },
        enAttenteDuMatch: [],
        gardeFous: { miseMaxParPari: base * 0.004, resteSemaine: base * 0.05 },
        comptes: Object.fromEntries([...LIVRES_FR, ...LIVRES_ETRANGERS].map((k, j) => [k, { miseMaxAcceptee: j % 2 ? base * 0.002 : null, soldeDeclare: base * 0.1 }])),
        plancher: null
      };
    default:
      return { capital: { indique: true, montant: base, plusHaut: base * 1.05 }, enAttenteDuMatch: [], gardeFous: null, comptes: {}, plancher: base * 0.06 };
  }
}
