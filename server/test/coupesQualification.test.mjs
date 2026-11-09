/**
 * LA CHANCE DE SE QUALIFIER ET LE LIEU (étape 36, lot 1, 09/11/2026) :
 *   node --test test/coupesQualification.test.mjs        (depuis server/)
 *
 *   T-Q1 la chance v1 sur des grilles faites à la main (match unique, retour à avance −2 à +2) : la somme fait 1 à 1e-12,
 *        la symétrie (échanger les camps et l'avance échange les chances), l'égalité après 90 minutes partagée en deux ;
 *   T-Q4 le chemin de la page (entreesDeLAnalyse, grilleDesEntrees, alignerSurLe1N2) : à avance 0, la part « dans les 90
 *        minutes » du club qui reçoit = le « 1 » affiché à 1e-9, pour les deux grilles (modele-buts-441 et ancien-81) ;
 *   T-Q5 la base : BASE_STATISTIQUE = la candidate de l'étape 27 = celle de l'étape 32 ; les périodes = celles de la 32 ;
 *        λS et μS de la passe de la 36 = ceux de la passe de la 32, À L'OCTET, sur le même magasin fabriqué ;
 *   T-N1 le lieu : domicile, chez le visiteur (une finale dans le stade d'un des deux clubs n'est pas neutre pour lui),
 *        neutre (avec les distances), inconnu ;
 *   T-N2 le stade habituel sur 365 jours, par identifiant : le plus fréquent (au moins 3 réceptions), un stade provisoire,
 *        un stade renommé d'une saison à l'autre (la fenêtre glisse) ;
 *   T-N4 aucun chiffre ne change avec ou sans le lieu (la chance ne lit jamais le lieu).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as Q from '../src/data/coupes/qualification.js';
import * as N from '../src/data/coupes/terrainNeutre.js';
import { BASE_STATISTIQUE, PERIODES_DU_BANC, EMPREINTE_DE_LA_BASE, STADES } from '../src/data/coupes/reglagesCoupes.js';
import * as B32 from '../src/data/contexte/bancDuContexte.js';
import { PERIODES_DU_BANC as P32 } from '../src/data/contexte/reglagesContexte.js';
import { CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';
import { grilleDesButs, empreinteDesForces, reglagesDuModeleDeButs } from '../src/core/engine/goalModel.js';
import { entreesDeLAnalyse, grilleDesEntrees, alignerSurLe1N2 } from '../src/data/simulation/entreesSimulation.js';

const T = 21;
/** Une grille faite à la main : `cases` { 'i-j': p } (le reste à 0). */
const grille = (cases) => {
  const g = new Float64Array(T * T);
  for (const [k, p] of Object.entries(cases)) {
    const [i, j] = k.split('-').map(Number);
    g[i * T + j] = p;
  }
  return g;
};
/** La même grille, camps échangés. */
const inverse = (g) => {
  const h = new Float64Array(T * T);
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) h[j * T + i] = g[i * T + j];
  return h;
};

test('T-Q1 — la chance v1 : grilles faites à la main, avance −2 à +2, somme 1 à 1e-12, symétrie, égalité partagée en deux', () => {
  const g = grille({ '0-0': 0.1, '1-0': 0.2, '0-1': 0.15, '1-1': 0.15, '2-0': 0.1, '0-2': 0.05, '2-1': 0.1, '1-2': 0.08, '3-0': 0.07 });
  // Match unique : dom = 1-0, 2-0, 2-1, 3-0 → 0,47 ; ext = 0-1, 0-2, 1-2 → 0,28 ; égalité = 0,25 → dom 0,595, ext 0,405.
  const u = Q.chanceDeQualification({ grille: g, avance: 0 });
  assert.ok(Math.abs(u.dom.p90 - 0.47) < 1e-12 && Math.abs(u.ext.p90 - 0.28) < 1e-12 && Math.abs(u.egal - 0.25) < 1e-12);
  assert.ok(Math.abs(u.dom.total - 0.595) < 1e-12 && Math.abs(u.ext.total - 0.405) < 1e-12);
  assert.equal(u.apres90, 'pile-ou-face');
  for (const avance of [-2, -1, 0, 1, 2]) {
    const c = Q.chanceDeQualification({ grille: g, avance });
    assert.ok(Math.abs(c.dom.total + c.ext.total - 1) < 1e-12, `somme à l'avance ${avance}`);
    assert.ok(Math.abs(c.dom.apres90 - c.egal / 2) < 1e-15 && c.dom.apres90 === c.ext.apres90, 'pile ou face');
    // Symétrie : la grille inversée et l'avance opposée échangent les chances.
    const s = Q.chanceDeQualification({ grille: inverse(g), avance: -avance });
    assert.ok(Math.abs(s.dom.total - c.ext.total) < 1e-12 && Math.abs(s.ext.total - c.dom.total) < 1e-12, `symétrie à ${avance}`);
  }
  // Avance +1 (le club qui reçoit mène d'un but) : un nul ou une victoire le qualifie ; perdre d'un but → égalité au cumul.
  const plus1 = Q.issuesDeLaGrille(g, 1);
  assert.ok(Math.abs(plus1.p90Dom - (0.47 + 0.25)) < 1e-12);
  assert.ok(Math.abs(plus1.pEgal - (0.15 + 0.08)) < 1e-12, '0-1 et 1-2');
  assert.throws(() => Q.issuesDeLaGrille(g, 0.5), /avance entière/);
  assert.throws(() => Q.issuesDeLaGrille(new Float64Array(10), 0), /441/);
});

test('T-Q4 — le chemin de la page : le « 1 » affiché = la part du club qui reçoit dans les 90 minutes, à 1e-9, pour les deux grilles', () => {
  const fair = { home: 0.47, draw: 0.27, away: 0.26 };
  const modele = { distributions: { result: fair }, modeleDeButs: { expectedGoals: { home: 1.42, away: 1.08 }, rho: -0.05 }, engineVersion: 5 };
  const ancien = { distributions: { result: fair }, expectedGoals: { home: 1.6, away: 0.9 } };
  for (const [resultat, nom] of [[modele, 'modele-buts-441'], [ancien, 'ancien-81']]) {
    const e = entreesDeLAnalyse(resultat, { defaultCorrelation: -0.08 });
    assert.equal(e.grille, nom);
    const g = alignerSurLe1N2(grilleDesEntrees(e), e.fair);
    const c = Q.chanceDeQualification({ grille: g, avance: 0 });
    assert.ok(Math.abs(c.dom.p90 - fair.home) < 1e-9, `${nom} : ${c.dom.p90} face à ${fair.home}`);
    assert.ok(Math.abs(c.ext.p90 - fair.away) < 1e-9 && Math.abs(c.egal - fair.draw) < 1e-9, nom);
    const un = Q.unNDeuxDeLaGrille(g);
    assert.ok(Math.abs(un.home - fair.home) < 1e-9);
  }
});

test('T-Q5 — la base : celle de la candidate 27 et de la 32 ; les périodes de la 32 ; λS et μS de la passe = ceux de la passe de la 32, à l’octet', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(BASE_STATISTIQUE)), JSON.parse(JSON.stringify(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs)));
  assert.deepEqual(JSON.parse(JSON.stringify(BASE_STATISTIQUE)), JSON.parse(JSON.stringify(B32.BASE_STATISTIQUE)));
  assert.equal(empreinteDesForces(BASE_STATISTIQUE), EMPREINTE_DE_LA_BASE);
  assert.equal(EMPREINTE_DE_LA_BASE, B32.EMPREINTE_DE_LA_BASE);
  assert.doesNotThrow(() => reglagesDuModeleDeButs({ modeleDeButs: BASE_STATISTIQUE }));
  assert.deepEqual(JSON.parse(JSON.stringify(PERIODES_DU_BANC)), JSON.parse(JSON.stringify(P32)));
  const c = preparerCopie({ base: false });
  try {
    const x = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-coupes.mjs'), { args: ['base', '{}'], timeout: 300_000 });
    assert.equal(x.code, 0, `script-coupes base :\n${x.erreurs.slice(-3000)}`);
    assert.ok(x.json.base.comparees >= 80, `${x.json.base.comparees} matchs de coupe comparés`);
    assert.equal(x.json.base.egales, x.json.base.comparees, JSON.stringify(x.json.base.ecarts));
  } finally {
    c.nettoyer();
  }
});

test('T-N1 — le lieu : domicile, chez le visiteur (finale dans son stade : pas neutre pour lui), neutre avec les distances, inconnu', () => {
  const roma = { stade: 'Stadio Olimpico', receptions: 19, lat: 41.934, long: 12.455, autres: [] };
  const fio = { stade: 'Stadio Artemio Franchi', receptions: 18, lat: 43.781, long: 11.282, autres: [] };
  const inter = { stade: 'Stadio Giuseppe Meazza', receptions: 18, lat: 45.478, long: 9.124, autres: [] };
  const olimpico = { stade: 'Stadio Olimpico', ville: 'Roma', lat: 41.934, long: 12.455 };
  assert.equal(N.lieuDuMatch(olimpico, roma, fio).valeur, 'domicile');
  // La finale de Coppa Italia à l'Olimpico, la Roma inscrite à l'extérieur : chez le visiteur.
  assert.equal(N.lieuDuMatch(olimpico, fio, roma).valeur, 'chez-le-visiteur');
  const neutre = N.lieuDuMatch(olimpico, fio, inter);
  assert.equal(neutre.valeur, 'neutre');
  assert.ok(neutre.distances.dom > 200 && neutre.distances.ext > 400, JSON.stringify(neutre.distances));
  // Le même stade par les coordonnées (2 km au plus), même sous un autre nom.
  assert.equal(N.lieuDuMatch({ stade: 'Olimpico di Roma', lat: 41.935, long: 12.456 }, roma, fio).valeur, 'domicile');
  assert.equal(N.lieuDuMatch(null, roma, fio).valeur, 'inconnu');
  assert.equal(N.lieuDuMatch(olimpico, null, fio).valeur, 'inconnu', 'un club sans stade habituel : jamais « neutre » deviné');
  assert.deepEqual(N.REGLES_DU_LIEU, STADES, 'la copie des réglages du lieu (terrainNeutre n’importe que formulesDuContexte)');
});

test('T-N2 — le stade habituel sur 365 jours, par identifiant : le plus fréquent (3 réceptions au moins), un stade provisoire, un stade renommé', () => {
  const recs = [];
  const ajouter = (club, de, n, stade, pas = 14) => {
    for (let i = 0; i < n; i++) recs.push({ club, date: new Date(Date.parse(`${de}T00:00:00Z`) + i * pas * 86_400_000).toISOString().slice(0, 10), stade, lat: null, long: null });
  };
  ajouter(1, '2025-01-04', 10, 'Stade A');
  ajouter(1, '2025-06-01', 3, 'Stade Provisoire');
  ajouter(1, '2025-09-01', 2, 'Stade Rare');
  ajouter(2, '2024-08-01', 12, 'Ancien Nom');
  ajouter(2, '2025-08-01', 14, 'Nouveau Nom');
  const h = N.stadesHabituels(recs, { jour: '2025-12-01' });
  assert.equal(h.get(1).stade, 'Stade A');
  assert.deepEqual(h.get(1).autres.map((s) => s.stade), ['Stade Provisoire'], 'deux réceptions : pas un stade habituel');
  assert.equal(h.get(2).stade, 'Nouveau Nom', 'le nom de la saison d’avant est sorti de la fenêtre');
  assert.equal(N.stadesHabituels(recs, { jour: '2025-01-01' }).get(1), undefined, 'rien d’avant J : pas de stade habituel');
  // Par identifiant : deux clubs au nom proche ne partagent rien.
  assert.equal(N.stadesHabituels(recs, { jour: '2025-12-01' }).get(3), undefined);
});

test('T-N4 — aucun chiffre ne change avec ou sans le lieu : la chance ne lit jamais le lieu ni le stade', () => {
  const g = grilleDesButs(1.3, 1.1, -0.05);
  const a = Q.chanceDeQualification({ grille: g, avance: 1, format: 'prolongation' });
  const b = Q.chanceDeQualification({ grille: g, avance: 1, format: 'prolongation', lieu: 'neutre', stade: 'Stade de France' });
  assert.deepEqual(b, a);
  const texte = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'coupes', 'qualification.js'), 'utf8');
  assert.doesNotMatch(texte.replace(/\/\*\*[\s\S]*?\*\//g, ''), /lieu|stade|neutre/i);
});
