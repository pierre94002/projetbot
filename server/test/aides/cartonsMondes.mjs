/**
 * DES MONDES TIRÉS AU HASARD pour les essais du banc des cartons (étape 33, lot 1a, partie B, 02/11/2026) — ce n'est PAS
 * un fichier de test. Pur : aucune base, aucun fichier, aucune donnée réelle ; un générateur à graine.
 *
 *   mondeDesCartons(options)   des rencontres sous la forme de rencontreDuFlux (lectureDesCartons.js), du 02/01/2023 au
 *                              23/09/2026 : L championnats de T clubs, une journée tous les 4 jours ; des cartons
 *                              poissonniens de moyenne niveau du championnat × e^(pris + provoqués + sévérité de l'arbitre
 *                              + dérive) ; l'arbitre tiré au hasard dans le championnat, ou désigné selon l'intensité VRAIE
 *                              du match (constat 3 de la critique) ;
 *   lignesDeStatistique(o)     des lignes de corners (ou tirs) sous la forme du banc { cle, date, league, pli, xh, xa, eh,
 *                              ea } : attendus neutres bruités, réalisé binomial négatif de moyenne F_championnat × vrai.
 */

/** Générateur à graine (mulberry32). */
export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const JOUR_MS = 86_400_000;
const jour = (debut, n) => new Date(Date.parse(`${debut}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const normal = (u) => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
export function poisson(u, l) {
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * normal(u)));
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 200) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
}
/** Binomiale négative de moyenne mu et 1/k = invK (mélange gamma-Poisson, gamma de Marsaglia-Tsang). */
export function binomialeNegative(u, mu, invK) {
  if (!(invK > 0)) return poisson(u, mu);
  const forme = 1 / invK;
  const gamma = (k) => {
    if (k < 1) return gamma(k + 1) * u() ** (1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = normal(u);
      const v = (1 + c * x) ** 3;
      if (v <= 0) continue;
      if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
  };
  return poisson(u, (mu * gamma(forme)) / forme);
}

const pliDe = (d) => (d >= '2023-07-01' && d <= '2025-06-30' ? 'A' : d >= '2025-07-01' && d <= '2026-09-23' ? 'B' : null);

/**
 * UN MONDE DE CARTONS (rencontres du flux). Options : graine, ligues (6), clubs (12, pair), arbitres (12 par championnat),
 * sdPris, sdProvoques, sdArbitre (écarts-types log des effets), derive (écart-type log du pas de la marche aléatoire du
 * niveau de chaque championnat, un pas par saison au 1er juillet : la forme de la critique, constat 2), deriveLineaire (log
 * par an, commune), affectation ('hasard' | 'intensite'),
 * pas (jours entre deux journées), debut, fin.
 */
export function mondeDesCartons({ graine = 1, ligues = 6, clubs = 12, arbitres = 12, sdPris = 0.1, sdProvoques = 0.06, sdArbitre = 0.08, derive = 0, deriveLineaire = 0, affectation = 'hasard', pas = 4, debut = '2023-01-02', fin = '2026-09-23' } = {}) {
  const u = generateur(graine);
  const out = [];
  const jours = Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / JOUR_MS);
  for (let L = 0; L < ligues; L++) {
    const league = `Ligue ${L + 1}`;
    const ids = Array.from({ length: clubs }, (_, i) => 10_000 + L * 100 + i);
    const effet = new Map(ids.map((id) => [id, { prend: sdPris * normal(u), fait: sdProvoques * normal(u) }]));
    const severite = Array.from({ length: arbitres }, () => sdArbitre * normal(u));
    const niveau = Math.exp(0.15 * normal(u));
    // Le pas de chaque saison (2022-23 à 2026-27) : une marche aléatoire.
    const marche = [0];
    for (let s = 1; s < 6; s++) marche.push(marche[s - 1] + derive * normal(u));
    const saisonDe = (d) => Number(d.slice(0, 4)) - 2022 + (d.slice(5) >= '07-01' ? 1 : 0);
    const rot = [...ids];
    let ronde = 0;
    for (let j = L % pas; j <= jours; j += pas) {
      const date = jour(debut, j);
      const ans = j / 365.25;
      const paires = [];
      for (let i = 0; i < clubs / 2; i++) paires.push(ronde % 2 ? [rot[clubs - 1 - i], rot[i]] : [rot[i], rot[clubs - 1 - i]]);
      rot.splice(1, 0, rot.pop());
      ronde++;
      // L'intensité VRAIE de chaque match (ce que la ligue verrait en désignant ses arbitres).
      const intensites = paires.map(([h, a]) => effet.get(h).prend + effet.get(a).fait + effet.get(a).prend + effet.get(h).fait);
      const rangs = intensites.map((x, k) => [x, k]).sort((p, q) => p[0] - q[0]).map(([, k]) => k);
      paires.forEach(([h, a], k) => {
        let r;
        if (affectation === 'intensite') {
          // Les matchs les plus « chauds » vont aux arbitres de fin de liste (avec un peu de hasard).
          const q = rangs.indexOf(k) / Math.max(1, paires.length - 1);
          r = Math.min(arbitres - 1, Math.max(0, Math.round(q * (arbitres - 1) + (u() - 0.5) * 2)));
        } else r = Math.floor(u() * arbitres);
        const base = niveau * Math.exp(deriveLineaire * ans + marche[saisonDe(date)] + severite[r]);
        const ch = poisson(u, 1.9 * base * Math.exp(effet.get(h).prend + effet.get(a).fait));
        const ca = poisson(u, 2.2 * base * Math.exp(effet.get(a).prend + effet.get(h).fait));
        out.push({
          matchKey: `m-${date}-${h}-${a}`,
          date,
          league,
          saison: Number(date.slice(0, 4)),
          coupe: false,
          home: h,
          away: a,
          attribue: false,
          prolongation: false,
          nonJoue: false,
          statutBase: 'accord',
          valeur: { home: ch, away: ca, total: ch + ca },
          conventions: { un: { home: ch, away: ca, total: ch + ca }, trois: { home: ch, away: ca, total: ch + ca } },
          ecart: 0,
          deroule: { horsTerrain: 0, apres90: 0, deuxiemesJaunes: 0, ligneDom: ch, ligneExt: ca, jaunesDom: ch, jaunesExt: ca, jrDom: 0, jrExt: 0 },
          ligne: { jDom: ch, jExt: ca, rDom: 0, rExt: 0 },
          arbitre: { nom: `Arbitre ${L + 1}-${r + 1}`, pays: 'Pays' },
          stats: {}
        });
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : 1));
}

/**
 * DES LIGNES DE STATISTIQUE (forme du banc), du 01/07/2023 au 23/09/2026. Options : graine, ligues (20), parLigue (matchs
 * par championnat et par an), facteurs { dom, ext } VRAIS communs, tauF (écart-type log du facteur entre championnats),
 * ecarts (Map ligue → facteur multiplicatif planté), invKVrai, bruit (écart-type relatif des attendus neutres), moyenne.
 */
export function lignesDeStatistique({ graine = 1, ligues = 20, parLigue = 300, facteurs = { dom: 1.1, ext: 0.9 }, tauF = 0, ecarts = null, invKVrai = 0.1, bruit = 0.15, moyenne = 5 } = {}) {
  const u = generateur(graine);
  const out = [];
  const debut = '2023-07-01';
  const jours = Math.round((Date.parse('2026-09-23T00:00:00Z') - Date.parse(`${debut}T00:00:00Z`)) / JOUR_MS);
  const n = Math.round((parLigue * jours) / 365.25);
  for (let L = 0; L < ligues; L++) {
    const league = `Ligue ${L + 1}`;
    const plante = ecarts?.get?.(league) ?? 1;
    const fL = { dom: facteurs.dom * Math.exp(tauF * normal(u)) * plante, ext: facteurs.ext * Math.exp(tauF * normal(u)) * plante };
    for (let i = 0; i < n; i++) {
      const date = jour(debut, Math.floor((i * jours) / n));
      const vh = moyenne * Math.exp(0.2 * normal(u));
      const va = moyenne * Math.exp(0.2 * normal(u));
      const eh = vh * Math.exp(bruit * normal(u));
      const ea = va * Math.exp(bruit * normal(u));
      out.push({ cle: `s-${league}-${i}`, date, league, pli: pliDe(date), xh: binomialeNegative(u, fL.dom * vh, invKVrai), xa: binomialeNegative(u, fL.ext * va, invKVrai), eh, ea });
    }
  }
  return out.filter((l) => l.pli);
}
