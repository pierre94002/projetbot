/**
 * DES MONDES TIRÉS AU HASARD pour les essais du banc des débuts de saison (étape 35, lot 1a, partie B, 09/11/2026) — ce
 * n'est PAS un fichier de test. Pur : aucune base, aucun fichier, aucune donnée réelle ; un générateur à graine (xoshiro128**
 * semé par splitmix32, celui des simulations des étapes 28, 33 et de la critique de la 35).
 *
 *   mondeDesDebuts(options)  des rencontres à la forme de la passe (lectureDesDebuts.js : cle, date, league, saison, home,
 *                            away, drapeaux, buts90, faitDom, prix1n2) — la STRUCTURE RÉELLE des championnats (critique de la 35,
 *                            k1-monde.cjs, réécrit ici) : magasin (pyramides de 4 et 2 divisions aux libellés exacts de NIVEAUX,
 *                            18 championnats seuls juillet-juin, 18 d'année civile, du 2023 à la fin au 23/09/2026) ou
 *                            football-data (pyramides de 5, 4 et 2 divisions, 5 seules, codes de NIVEAUX_FD, 2000-01 →
 *                            2022-23, aucun xG) ; forces vraies en log, dérive, SAUT à la trêve de persistance ρ ; promus,
 *                            relégués et nouveaux venus aux effets donnés (face à la moyenne du NOUVEAU championnat) ; un signal
 *                            de « force de l'effectif » corrélé r au vrai saut (`signal(club, saison)`).
 */

const HA = 35;
const HD = 25;
const DEF_H = 1.45;
const DEF_A = 1.15;
const JOUR_MS = 86_400_000;
const iso = (n) => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const jour = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / JOUR_MS);

/** Le générateur (xoshiro128** semé par splitmix32) : u, normal, gamma, poisson. */
export function generateur(graine) {
  let s = graine >>> 0;
  const sm = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = sm();
  let b = sm();
  let c = sm();
  let d = sm();
  const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;
  const suivant = () => {
    const r = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
    const t = (b << 9) >>> 0;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return r / 4294967296;
  };
  let reserve = null;
  const normal = () => {
    if (reserve !== null) {
      const r = reserve;
      reserve = null;
      return r;
    }
    let u = 0;
    while (u <= 1e-12) u = suivant();
    const v = suivant();
    const m = Math.sqrt(-2 * Math.log(u));
    reserve = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  const gamma = (k) => {
    if (k < 1) return gamma(k + 1) * Math.pow(suivant(), 1 / k);
    const d2 = k - 1 / 3;
    const c2 = 1 / Math.sqrt(9 * d2);
    for (;;) {
      let x;
      let v2;
      do {
        x = normal();
        v2 = 1 + c2 * x;
      } while (v2 <= 0);
      v2 = v2 * v2 * v2;
      const u = suivant();
      if (u < 1 - 0.0331 * x * x * x * x) return d2 * v2;
      if (Math.log(u) < 0.5 * x * x + d2 * (1 - v2 + Math.log(v2))) return d2 * v2;
    }
  };
  const poisson = (mu) => {
    const L = Math.exp(-mu);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= suivant();
    } while (p > L);
    return k - 1;
  };
  return { u: suivant, normal, gamma, poisson };
}

const CIVILES = ['Allsvenskan - Sweden', 'Eliteserien - Norway', 'Veikkausliiga - Finland', 'Besta deildin - Iceland', 'League of Ireland', 'Virsliga - Latvia', 'Brazil Série A', 'MLS', 'Super League - China', 'Canadian Premier League', 'Primera División - Argentina', 'Primera División - Chile', 'Primera A - Colombia', 'Liga 1 - Peru', 'División Profesional - Paraguay', 'Primera División - Bolivia', 'Serie A - Ecuador', 'Primera División - Venezuela'];

/** La structure des championnats (tailles, montées et descentes, sorties vers une division non suivie). */
function structure(type, { petit = false } = {}) {
  const L = [];
  const add = (o) => L.push({ id: L.length, ...o });
  if (type === 'magasin') {
    const pyr = [
      ['ENG', ['EPL', 'Championship', 'League 1', 'League 2'], [20, 24, 24, 24], [3, 3, 4], 2],
      ['ESP', ['La Liga - Spain', 'La Liga 2 - Spain'], [20, 22], [3], 4],
      ['ITA', ['Serie A - Italy', 'Serie B - Italy'], [20, 20], [3], 4],
      ['GER', ['Bundesliga - Germany', 'Bundesliga 2 - Germany'], [18, 18], [3], 3],
      ['FRA', ['Ligue 1 - France', 'Ligue 2 - France'], [18, 18], [3], 3]
    ];
    for (const [p, noms, tailles, mv, out] of petit ? pyr.slice(0, 2) : pyr) tailles.forEach((n, k) => add({ pyr: p, niv: k, nom: noms[k], n, rythme: 'eu', cotes: true, up: k > 0 ? mv[k - 1] : 0, down: k < tailles.length - 1 ? mv[k] : 0, out: k === tailles.length - 1 ? out : 0 }));
    const jj = [12, 16, 12, 18, 18, 16, 10, 14, 16, 12, 18, 12, 14, 16, 16, 12, 20, 18];
    (petit ? jj.slice(0, 4) : jj).forEach((n, i) => add({ pyr: null, niv: 0, nom: `Monde juillet-juin ${i + 1}`, n, rythme: 'eu', cotes: i < 6, up: 0, down: 0, out: n >= 16 ? 2 : 1 }));
    const civ = [16, 16, 12, 12, 10, 10, 20, 28, 16, 8, 28, 16, 20, 18, 12, 16, 16, 14];
    (petit ? civ.slice(0, 4) : civ).forEach((n, i) => add({ pyr: null, niv: 0, nom: CIVILES[i], n, rythme: 'civ', cotes: false, up: 0, down: 0, out: n >= 16 ? 2 : 1 }));
  } else {
    const pyr = [
      ['ENG', ['E0', 'E1', 'E2', 'E3', 'EC'], [20, 24, 24, 24, 24], [3, 3, 4, 2], 3],
      ['SCO', ['SC0', 'SC1', 'SC2', 'SC3'], [12, 10, 10, 10], [1, 1, 1], 1],
      ['GER', ['D1', 'D2'], [18, 18], [3], 3],
      ['ITA', ['I1', 'I2'], [20, 20], [3], 4],
      ['ESP', ['SP1', 'SP2'], [20, 22], [3], 4],
      ['FRA', ['F1', 'F2'], [20, 20], [3], 3]
    ];
    for (const [p, noms, tailles, mv, out] of petit ? pyr.slice(0, 1) : pyr) tailles.forEach((n, k) => add({ pyr: p, niv: k, nom: noms[k], n, rythme: 'eu', cotes: true, up: k > 0 ? mv[k - 1] : 0, down: k < tailles.length - 1 ? mv[k] : 0, out: k === tailles.length - 1 ? out : 0 }));
    (petit ? ['N1'] : ['N1', 'B1', 'P1', 'T1', 'G1']).forEach((nom, i) => add({ pyr: null, niv: 0, nom, n: i === 4 ? 16 : 18, rythme: 'eu', cotes: true, up: 0, down: 0, out: 2 }));
  }
  return L;
}

function calendrier(n, cycles, rnd) {
  const ids = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd.u() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const base = [];
  const arr = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const ronde = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      ronde.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    base.push(ronde);
    arr.splice(1, 0, arr.pop());
  }
  const out = [];
  for (let c = 0; c < cycles; c++) out.push(...(c % 2 === 0 ? base : base.map((ro) => ro.map(([a, b]) => [b, a]))));
  return out;
}
const cyclesDe = (n) => (n >= 28 ? 1 : n >= 16 ? 2 : n >= 12 ? 3 : 4);

/** Le 1N2 juste d'une paire (λ, μ) poissonnienne (grille 0-10), pour le « 1N2 seul » rapporté. */
function unDeuxDe(l, m) {
  const px = [Math.exp(-l)];
  const py = [Math.exp(-m)];
  for (let k = 1; k <= 10; k++) {
    px.push((px[k - 1] * l) / k);
    py.push((py[k - 1] * m) / k);
  }
  let h = 0;
  let d = 0;
  let a = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = px[i] * py[j];
    if (i > j) h += p;
    else if (i === j) d += p;
    else a += p;
  }
  const t = h + d + a;
  return [h / t, d / t, a / t];
}

/**
 * UN MONDE. options : { type: 'magasin' | 'fd', graine, rho (persistance à la trêve ; 1 = aucun saut), promo: { pa, pd, ra,
 * rd } (effets en log face à la moyenne du NOUVEAU championnat ; zéros = aucun effet), couplage (lien au passé d'un club qui
 * change de championnat ; 0 = « nul pur »), nouveauxFacteur, kx (forme Gamma de l'xG), rEff (corrélation du signal de
 * l'effectif avec le vrai saut ; 0 = aucun renseignement), petit (moins de championnats : les essais rapides), saisons }.
 * Rend { rencontres (dans l'ordre jour, clé), signal(club, saison) → { dOff, dDef } | null, comptes }.
 */
export function mondeDesDebuts(opts) {
  const o = { couplage: 0.35, rho: 0.9, promo: { pa: -0.14, pd: 0.07, ra: 0.07, rd: -0.1 }, nouveauxFacteur: 1, kx: 1.75, sigA: 0.22, sigD: 0.18, sigW: 0.012, rEff: 0, bruitT: 0.15, bruitS: 0.06, petit: false, ...opts };
  const rnd = generateur(o.graine);
  const mag = o.type === 'magasin';
  const ligues = structure(o.type, { petit: o.petit });
  const saisons = o.saisons ?? (mag ? 4 : 23);
  const an0 = mag ? 2023 : 2023 - saisons;
  const FIN = mag ? jour(2026, 9, 23) : jour(2023, 6, 30);
  const VRAI = new Map();
  const signaux = new Map();
  let prochain = 1;
  const tirer = () => {
    const q = rnd.normal();
    return { a: o.sigA * (0.74 * q + 0.67 * rnd.normal()), d: o.sigD * (-0.74 * q + 0.67 * rnd.normal()) };
  };
  const nouveauClub = (v) => {
    const id = prochain++;
    VRAI.set(id, { ...v, venu: false });
    return id;
  };
  const membres = ligues.map((l) => Array.from({ length: l.n }, () => nouveauClub(tirer())));
  const niveau = ligues.map(() => 0.1 * rnd.normal());
  const rencontres = [];
  const sdJA = o.sigA * Math.sqrt(Math.max(0, 1 - o.rho * o.rho));
  const sdJD = o.sigD * Math.sqrt(Math.max(0, 1 - o.rho * o.rho));
  const comptes = { matchs: 0, mouvements: 0, nouveaux: 0 };
  for (let s = 0; s < saisons; s++) {
    const Y = an0 + s;
    if (s > 0) {
      for (let li = 0; li < ligues.length; li++) {
        niveau[li] += 0.03 * rnd.normal();
        for (const c of membres[li]) {
          const v = VRAI.get(c);
          if (v.venu) {
            v.venu = false;
            continue;
          }
          const k = Math.sqrt(Math.max(0, 1 - o.rho * o.rho));
          const ja = (o.rho - 1) * v.a + k * o.sigA * rnd.normal();
          const jd = (o.rho - 1) * v.d + k * o.sigD * rnd.normal();
          v.a += ja;
          v.d += jd;
          const r = o.rEff;
          const sA = r > 0 && sdJA > 0 ? (r * ja) / sdJA + Math.sqrt(1 - r * r) * rnd.normal() : rnd.normal();
          const sD = r > 0 && sdJD > 0 ? (r * -jd) / sdJD + Math.sqrt(1 - r * r) * rnd.normal() : rnd.normal();
          // le signal « apport » : offensif dans le sens de l'attaque, défensif dans le sens d'une défense meilleure (moins de buts encaissés)
          signaux.set(`${c}|${Y}`, { dOff: 0.1 * sA, dDef: 0.1 * sD });
        }
      }
    }
    const journees = [];
    for (let li = 0; li < ligues.length; li++) {
      const lg = ligues[li];
      const cal = calendrier(lg.n, cyclesDe(lg.n), rnd);
      const R = cal.length;
      const debut = lg.rythme === 'eu' ? jour(Y, 8, 8) + Math.floor(rnd.u() * 14) : jour(Y, 2, 10) + Math.floor(rnd.u() * 50);
      const pas = Math.min(7, (lg.rythme === 'eu' ? 285 : 255) / (R - 1));
      for (let r = 0; r < R; r++) journees.push({ li, r, jour: Math.round(debut + pas * r), paires: cal[r] });
    }
    journees.sort((x, y) => x.jour - y.jour || x.li - y.li);
    const pts = ligues.map((lg, li) => new Map(membres[li].map((c) => [c, 0])));
    for (const jn of journees) {
      if (jn.jour > FIN) continue;
      const lg = ligues[jn.li];
      const eq = membres[jn.li];
      const lh = DEF_H * Math.exp(niveau[jn.li]);
      const la = DEF_A * Math.exp(niveau[jn.li]);
      for (const [ih, ia] of jn.paires) {
        const h = eq[ih];
        const a = eq[ia];
        const vh = VRAI.get(h);
        const va = VRAI.get(a);
        const lam = lh * Math.exp(vh.a + va.d);
        const mu = la * Math.exp(va.a + vh.d);
        const gh = rnd.poisson(lam);
        const ga = rnd.poisson(mu);
        const xh = mag ? (rnd.gamma(o.kx) * lam) / o.kx : null;
        const xa = mag ? (rnd.gamma(o.kx) * mu) / o.kx : null;
        const date = iso(jn.jour);
        const saison = mag ? (lg.rythme === 'civ' ? Y : Number(date.slice(5, 7)) >= 7 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1) : Y;
        const cle = `${mag ? 'm' : 'fd'}:${lg.nom}|${date}|${h}|${a}`;
        const libelle = mag ? null : `${Y}-${String((Y + 1) % 100).padStart(2, '0')}`;
        let prix1n2 = null;
        if (lg.cotes) {
          const T = 0.5 * (Math.log(lam) + Math.log(mu)) + o.bruitT * rnd.normal();
          const S = 0.5 * (Math.log(lam) - Math.log(mu)) + o.bruitS * rnd.normal();
          prix1n2 = unDeuxDe(Math.exp(T + S), Math.exp(T - S));
        }
        rencontres.push({
          cle,
          date,
          league: lg.nom,
          saison,
          libelle,
          home: h,
          away: a,
          attribue: false,
          prolongation: false,
          compte: true,
          coupe: false,
          aScore90: true,
          buts90: { dom: gh, ext: ga },
          faitDom: { matchKey: cle, club: h, adversaire: a, camp: 1, date, league: lg.nom, saison: mag ? saison : libelle, attribue: 0, prolongation: 0, compte: 1, coupe: 0, bp: gh, bc: ga, bp90: gh, bc90: ga, xg_p: xh, xg_c: xa },
          joueurs: null,
          prix1n2
        });
        comptes.matchs += 1;
        const P = pts[jn.li];
        P.set(h, P.get(h) + (gh > ga ? 3 : gh === ga ? 1 : 0));
        P.set(a, P.get(a) + (ga > gh ? 3 : gh === ga ? 1 : 0));
      }
      for (const c of eq) {
        const v = VRAI.get(c);
        v.a += o.sigW * rnd.normal();
        v.d += o.sigW * rnd.normal();
      }
    }
    if (s < saisons - 1) {
      const cl = ligues.map((lg, li) => [...membres[li]].sort((x, y) => pts[li].get(y) - pts[li].get(x) || x - y));
      const arrivees = ligues.map(() => []);
      const partants = ligues.map(() => new Set());
      for (let li = 0; li < ligues.length; li++) {
        const lg = ligues[li];
        if (lg.pyr) {
          const haut = ligues.find((x) => x.pyr === lg.pyr && x.niv === lg.niv - 1);
          const bas = ligues.find((x) => x.pyr === lg.pyr && x.niv === lg.niv + 1);
          if (haut) for (const c of cl[li].slice(0, lg.up)) {
            arrivees[haut.id].push({ c, sens: 'promu' });
            partants[li].add(c);
          }
          if (bas) for (const c of cl[li].slice(-lg.down)) {
            arrivees[bas.id].push({ c, sens: 'relegue' });
            partants[li].add(c);
          }
        }
        if (lg.out) for (const c of cl[li].slice(-lg.out)) partants[li].add(c);
      }
      for (let li = 0; li < ligues.length; li++) {
        const P = o.promo;
        for (const { c, sens } of arrivees[li]) {
          const v = VRAI.get(c);
          const kc = o.couplage;
          if (sens === 'promu') {
            v.a = P.pa + kc * (v.a - 0.2) + 0.11 * rnd.normal();
            v.d = P.pd + kc * (v.d + 0.17) + 0.11 * rnd.normal();
          } else {
            v.a = P.ra + kc * (v.a + 0.2) + 0.11 * rnd.normal();
            v.d = P.rd + kc * (v.d - 0.17) + 0.11 * rnd.normal();
          }
          v.venu = true;
          comptes.mouvements += 1;
        }
        membres[li] = membres[li].filter((c) => !partants[li].has(c)).concat(arrivees[li].map((x) => x.c));
        const f = o.nouveauxFacteur;
        while (membres[li].length < ligues[li].n) {
          const id = nouveauClub({ a: f * P.pa + 0.13 * rnd.normal(), d: f * P.pd + 0.13 * rnd.normal() });
          VRAI.get(id).venu = true;
          membres[li].push(id);
          comptes.nouveaux += 1;
        }
      }
    }
  }
  rencontres.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : 0));
  return {
    rencontres,
    comptes,
    /** Le signal de la force de l'effectif d'un club pour une saison (null : aucun, première saison ou club venu). */
    signal: (club, saison) => signaux.get(`${club}|${saison}`) ?? null
  };
}

/** Le Δ d'un monde à la forme de la passe (effectifAuJourJ) : le signal du club pour sa saison, dès son 2e match joué. */
export const effectifDuMonde = (monde) => (club, saison) => {
  const s = monde.signal(club, saison);
  return s ? { dOff: s.dOff, dDef: s.dDef, eOff: null, eDef: null, eOffAvant: null, eDefAvant: null, couverture: 1 } : null;
};

export { HA, HD };
