/**
 * Étape 28 du plan — B12 : LES DEUX ALIAS DU CALENDRIER (conception §2.2, critique §1.6).
 *   node --test test/simulationNoms.test.mjs        (depuis server/)
 *
 * Le calendrier de la saison écrit « SV Elversberg » et « SC Paderborn » ; la table officielle FotMob et le magasin
 * disent « Elversberg » et « Paderborn ». Sans alias, la fin de saison de la Bundesliga n'était pas calculée (nuit
 * mesurée dans le bac le 27/10 : « 1 club inconnu »). Les deux alias vont dans le registre FERME `TEAM_ALIASES`
 * (utils/teamNameMatch.js) — jamais dans la table `team_aliases`, effacée et reconstruite chaque nuit
 * (identityRegistry.js) : l'alias y disparaîtrait au matin.
 *
 * La fixture `fixtures/noms-calendrier-etape-28.json` : les 796 noms du calendrier restant au 24/10/2026, les clubs des
 * tables officielles de 48 championnats et leur annuaire, lus dans la base du bac (méthode de la mesure m3) ; avec les
 * rattachements d'AVANT les alias (793 noms). Garde aussi : `moteurCleEteinte.test.mjs` à l'octet et `noms.test.mjs`
 * (lancés à part) ; le fichier des alias n'est pas dans l'empreinte du moteur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { teamNamesEqual, teamNamesLikelyMatch } from '../src/utils/teamNameMatch.js';
import { rattacherLesNoms, idFotMob } from '../src/data/simulation/saisons.js';
import { fichiersDuMoteur } from '../src/core/engine/engineVersions.js';
import { SERVEUR } from './aides/isolement.mjs';

const SRC = path.join(SERVEUR, 'src');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'noms-calendrier-etape-28.json'), 'utf8'));
const NOUVEAUX = { 'SV Elversberg': '8232', 'SC Paderborn': '8460' };

/** Tous les fichiers .js de src/, chemin relatif → texte. */
function sources() {
  const out = {};
  for (const f of fs.readdirSync(SRC, { recursive: true })) {
    const rel = String(f).split(path.sep).join('/');
    if (rel.endsWith('.js')) out[rel] = fs.readFileSync(path.join(SRC, rel), 'utf8');
  }
  return out;
}

test('B12 les 796 noms du calendrier restant : 0 ambigu, « SV Elversberg » et « SC Paderborn » rattachés à leur club, seul « PK-35 » (absent du magasin) reste inconnu ; aucun autre rattachement ne change', () => {
  assert.equal(FIXTURE.ligues.length, 48, '48 championnats');
  assert.deepEqual(FIXTURE.totauxAvantLesAlias, { ligues: 48, noms: 796, table: 754, annuaire: 39, ambigus: 0, non: 3 }, 'la mesure m3 reproduite');
  const total = { noms: 0, table: 0, annuaire: 0, ambigus: [], inconnus: [] };
  const nouveaux = {};
  let avant = 0;
  for (const l of FIXTURE.ligues) {
    const r = rattacherLesNoms({ rows: l.rows, calendrier: l.noms, annuaire: l.annuaire });
    total.noms += l.noms.length;
    total.table += r.parTable;
    total.annuaire += r.parAnnuaire;
    total.ambigus.push(...r.ambigus.map((n) => `${l.league} : ${n}`));
    total.inconnus.push(...r.inconnus.map((n) => `${l.league} : ${n}`));
    // Rien de ce qui était rattaché ne change de club.
    for (const [nom, id] of Object.entries(l.attendu)) {
      avant++;
      assert.equal(String(r.parNom.get(nom)), id, `${l.league} : « ${nom} » rattaché à ${r.parNom.get(nom)} au lieu de ${id}`);
    }
    for (const [nom, id] of r.parNom) if (!(nom in l.attendu)) nouveaux[`${l.league}|${nom}`] = idFotMob(id);
  }
  assert.equal(avant, 793);
  assert.equal(total.noms, 796);
  assert.deepEqual(total.ambigus, [], 'aucun nom ambigu');
  assert.deepEqual(total.inconnus, ['Veikkausliiga - Finland : PK-35'], 'seul PK-35 reste inconnu (absent du magasin : rien à faire, conception §2.2)');
  assert.deepEqual(nouveaux, { 'Bundesliga - Germany|SC Paderborn': NOUVEAUX['SC Paderborn'], 'Bundesliga - Germany|SV Elversberg': NOUVEAUX['SV Elversberg'] }, 'les deux noms de la Bundesliga, et eux seuls');
  assert.deepEqual([total.table, total.annuaire], [756, 39], 'rattachés par la table (le nom du registre ferme), l’annuaire inchangé');
  // La Bundesliga : tous ses noms rattachés.
  const bl = FIXTURE.ligues.find((l) => l.league === 'Bundesliga - Germany');
  const r = rattacherLesNoms({ rows: bl.rows, calendrier: bl.noms, annuaire: bl.annuaire });
  assert.equal(r.inconnus.length + r.ambigus.length, 0);
  assert.equal(r.parNom.size, bl.noms.length);
});

test('B12 les deux alias sont dans le registre ferme TEAM_ALIASES (utils/teamNameMatch.js), nulle part ailleurs — jamais dans la table team_aliases, effacée chaque nuit ; le fichier n’est pas dans l’empreinte du moteur', () => {
  // Le verdict ferme du registre.
  assert.equal(teamNamesEqual('SV Elversberg', 'Elversberg'), true);
  assert.equal(teamNamesEqual('SC Paderborn', 'Paderborn'), true);
  assert.equal(teamNamesEqual('SC Paderborn', 'Paderborn 07'), true);
  assert.equal(teamNamesEqual('SV Elversberg', 'SC Paderborn'), false);
  assert.equal(teamNamesLikelyMatch('SV Elversberg', 'Paderborn'), false);
  // Écrits dans TEAM_ALIASES, une ligne chacun.
  const texte = fs.readFileSync(path.join(SRC, 'utils', 'teamNameMatch.js'), 'utf8');
  const registre = texte.slice(texte.indexOf('const TEAM_ALIASES = {'), texte.indexOf('\n};', texte.indexOf('const TEAM_ALIASES = {')));
  assert.match(registre, /^ {2}elversberg: \['sv elversberg'\],$/m);
  assert.match(registre, /^ {2}paderborn: \['sc paderborn', 'paderborn 07'\],$/m);
  // Nulle part ailleurs dans le code : ni une insertion dans team_aliases, ni une table locale de secours.
  const ailleurs = Object.entries(sources())
    .filter(([rel]) => rel !== 'utils/teamNameMatch.js')
    .filter(([, t]) => /sv elversberg|sc paderborn|paderborn 07/i.test(t))
    .map(([rel]) => rel);
  assert.deepEqual(ailleurs, [], 'un alias du calendrier hors du registre ferme');
  // Pourquoi jamais team_aliases : la table est vidée à chaque reconstruction de nuit.
  assert.match(fs.readFileSync(path.join(SRC, 'data', 'db', 'identityRegistry.js'), 'utf8'), /db\.exec\('DELETE FROM team_aliases'\);/);
  // Hors de l'empreinte du moteur : changer un alias ne crée pas de version et ne recommence pas l'essai de l'étape 27.
  assert.equal(fichiersDuMoteur().includes('utils/teamNameMatch.js'), false);
});
