/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-direct-pur.mjs <serveur de la copie>
 *
 * Étape 46, T-O5 : le calcul, l'état et la mémoire du direct, calculés dans la copie (réseau coupé, heure figée par
 * CM_TEST_MAINTENANT). Sortie : une ligne JSON avec les empreintes (sha1) de ce qui est calculé et l'horloge du processus —
 * test/directOracle.test.mjs lance ce script à deux heures différentes et compare les octets entre eux et à l'appel direct
 * (`empreintes`, exporté : le test l'appelle sur les modules de son propre processus).
 * Nombres inventés ; aucun vrai match.
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const sha1 = (x) => crypto.createHash('sha1').update(x).digest('hex');
const LRM = String.fromCharCode(0x200e);
const RSQ = String.fromCharCode(0x2019);
const fm = (m) => `${m}${LRM}${RSQ}${LRM}`;

/** Les empreintes du direct, modules lus sous `src` (le dossier src d'un serveur). */
export async function empreintes(src) {
  const imp = (rel) => import(pathToFileURL(path.join(src, rel)).href);
  const C = await imp('data/direct/calculDuDirect.js');
  const RD = await imp('data/direct/reglagesDirect.js');
  const E = await imp('data/direct/etatDuDirect.js');
  const M = await imp('data/direct/memoireDuDirect.js');
  const { PARAMS_SANS_EFFETS } = await imp('data/simulation/simulationMatchsEnfant.js');
  const ligne = { grille: 'ancien-81', lambda: 1.6, mu: 1.0, rho: -0.075, fair: { home: 0.62, draw: 0.22, away: 0.16 } };
  const departs = [
    { creneau: 0, part: 0, h: 0, a: 0, rh: 0, ra: 0 },
    { creneau: 60, part: 0.5, h: 1, a: 1, rh: 1, ra: 0 },
    { creneau: 91, part: 0.37, h: 2, a: 1, rh: 0, ra: 2 }
  ];
  const lectures = departs.map((depart) => {
    const r = C.lecturesDuDirect({ ligne, depart, variantes: [...C.IDS_DES_VARIANTES], paramsSansEffets: PARAMS_SANS_EFFETS, coupes: RD.COUPES.direct, championnat: 'Championnat inconnu' });
    const sortie = {};
    for (const [id, l] of Object.entries(r.lectures)) sortie[id] = { ...l, grille: Array.from(l.grille) };
    return { affichee: r.affichee, ancrage: r.ancrage, moyennes: r.moyennes, lectures: sortie };
  });
  const c0 = C.loiDuScoreFinal({ lambda: lectures[0].ancrage.lambda, mu: lectures[0].ancrage.mu, depuis: departs[0], coupes: RD.COUPES.direct });
  const m0 = C.minute0({ ligne, grilleC0: c0.grille });
  const cles = [C.cleDuCalcul({ fotmobId: 4600001, cleDeNuit: '2026-11-13T23:41:07.000Z', ...ligne, ...departs[1], variante: 'direct-ancre' }), C.cleDeC0({ fotmobId: 4600001, cleDeNuit: '2026-11-13T23:41:07.000Z', ...ligne, variante: 'direct-ancre' })];
  // La mémoire et l'état, heures passées en argument (jamais lues).
  const t0 = Date.UTC(2026, 10, 14, 19, 0, 0);
  const tours = [
    { liste: { liveLabel: fm(88), started: true, homeGoals: 1, awayGoals: 1, liveMaxTime: 90 }, detail: { liveLabel: fm(88), started: true, homeGoals: 1, awayGoals: 1, homeRedCards: 0, awayRedCards: 1 } },
    { liste: { liveLabel: fm(89), started: true, homeGoals: 1, awayGoals: 1, liveMaxTime: 90 }, listeReelle: false },
    { liste: { liveLabel: 'ET', started: true, homeGoals: 1, awayGoals: 1, liveMaxTime: 90 } },
    { liste: { liveLabel: fm(95), started: true, homeGoals: 2, awayGoals: 1, liveMaxTime: 120 } }
  ];
  let memoire = null;
  const etats = [];
  tours.forEach((tour, i) => {
    const maintenant = t0 + i * 60_000;
    memoire = M.suivre(memoire, { ...tour, maintenant });
    etats.push(E.etatDuMatch({ match: { liste: tour.liste, memoire }, maintenant: maintenant + 30_000 }));
  });
  let suite = null;
  const instantanes = [
    { status: 'en cours', minute_label: fm(44), minute: 44, home_goals: 0, away_goals: 0, home_red: 1, away_red: 0 },
    { status: 'mi-temps', minute_label: 'HT', minute: 45, home_goals: 0, away_goals: 0, home_red: null, away_red: null },
    { status: 'en cours', minute_label: fm(47), minute: 47, home_goals: 1, away_goals: 0, home_red: null, away_red: null }
  ].map((ligneInstantane) => {
    const r = E.etatDepuisInstantane(ligneInstantane, { precedent: suite });
    suite = r.suite;
    return r.etat;
  });
  return {
    lectures: sha1(JSON.stringify(lectures)),
    minute0: sha1(JSON.stringify(m0)),
    cles: sha1(JSON.stringify(cles)),
    memoire: sha1(JSON.stringify(memoire)),
    etats: sha1(JSON.stringify(etats)),
    instantanes: sha1(JSON.stringify(instantanes))
  };
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const [serveur] = process.argv.slice(2);
  const e = await empreintes(path.join(serveur, 'src'));
  console.log(JSON.stringify({ ok: true, empreintes: e, horloge: new Date().toISOString() }));
}
