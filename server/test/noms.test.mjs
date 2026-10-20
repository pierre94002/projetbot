/**
 * Pièges de noms déjà rencontrés (étape 3 du plan).
 *   node --test test/noms.test.mjs        (depuis server/)
 *
 *  1. Le rapprocheur flou (utils/teamNameMatch.js), qui sert encore au
 *     règlement, au calendrier, aux sources tierces : les clubs distincts qui
 *     se ressemblent ne se confondent pas (Shanghai Port / Portsmouth / Porto,
 *     Port Vale, ham/hamburg, man/mansfield, Celta / Celta Fortuna…), les
 *     écritures d'un même club se retrouvent.
 *  2. La résolution PAR IDENTIFIANT (clubDuMagasin, findTeams,
 *     listTeamMatchStats, entrées du moteur), sur la base d'essai, dans une
 *     copie isolée : Leeds United ≠ DC United, les « Nacional » (Portugal,
 *     Paraguay), « Libertad » (Paraguay, Équateur) et « Universidad Católica »
 *     (Équateur, Chili) restent distincts par compétition ; sans compétition,
 *     un nom ambigu ne désigne personne plutôt que le mauvais club.
 * Mémoires : project_cotemaster_team_name_matching, project-cotemaster-identity-registry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { teamNamesLikelyMatch, teamNamesEqual, findBestTeamNameMatch } from '../src/utils/teamNameMatch.js';
import { sharesNameToken } from '../src/utils/nameIdentity.js';
import { executerIsole, SERVEUR } from './aides/isolement.mjs';

// ------------------------------------------------- 1. rapprocheur flou

const DISTINCTS = [
  // Le trou du 20/09/2026 : un mot court ouvrait sur des clubs sans rapport.
  ['Shanghai Port', 'Portsmouth'], ['Shanghai Port', 'Porto'], ['Shanghai Port', 'FC Porto'], ['Port Vale', 'Portsmouth'], ['Port Vale', 'Porto'], ['Port', 'Portsmouth'],
  ['West Ham', 'Hamburg'], ['Man United', 'Mansfield Town'], ['Man City', 'Mantova'], ['Juve Stabia', 'Juventus'], ['Pau FC', 'St Pauli'], ['West Brom', 'Bromley'],
  // Un nom entièrement contenu dans un autre : seul le registre les sépare.
  ['Celta Vigo', 'Celta Fortuna'], ['Celta', 'Celta Fortuna'], ['Real Sociedad', 'Real Sociedad B'], ['Red Star', 'Red Star Belgrade'], ['Athletic Club', 'Charlton Athletic'], ['Deportivo', 'Deportivo Alavés'],
  // Clubs distincts qui se ressemblent.
  ['Inter', 'AC Milan'], ['Paris FC', 'PSG'], ['Villarreal', 'Aston Villa'], ['Union Berlin', 'Union SG'], ['Sporting CP', 'Sporting Gijón'], ['Bristol City', 'Bristol Rovers'],
  ['Manchester United', 'Manchester City'], ['Real Madrid', 'Real Betis'], ['Club Brugge', 'Cercle Brugge'], ['Sheffield United', 'Sheffield Wednesday'], ['Leeds', 'DC United']
];
const MEMES = [
  ['Man United', 'Manchester United'], ['Man City', 'Manchester City'], ['PSG', 'Paris Saint-Germain'], ['Paris SG', 'Paris Saint Germain'], ['Sparta Praha', 'Sparta Prague'],
  ['Slavia Praha', 'Slavia Prague'], ['Lillestrøm', 'Lillestrom'], ['Bayern München', 'Bayern Munich'], ['Ein Frankfurt', 'Eintracht Frankfurt'], ['Ath Madrid', 'Atletico Madrid'],
  ['Atlético Madrid', 'Atletico Madrid'], ["Nott'm Forest", 'Nottingham Forest'], ['Wolves', 'Wolverhampton Wanderers'], ['Sheffield Weds', 'Sheffield Wednesday'], ['Shanghai SIPG', 'Shanghai Port'],
  ['FC Porto', 'Porto'], ['Karlsruher SC', 'Karlsruhe'], ['Brighton and Hove Albion', 'Brighton & Hove Albion'], ['Girona FC', 'Girona'], ['Leeds', 'Leeds United'],
  ['Athletic Bilbao', 'Athletic Club'], ['Red Star Belgrade', 'Crvena Zvezda']
];

test('rapprocheur flou : les clubs distincts qui se ressemblent ne se confondent pas', () => {
  for (const [a, b] of DISTINCTS) {
    assert.equal(teamNamesLikelyMatch(a, b), false, `${a} / ${b}`);
    assert.equal(teamNamesLikelyMatch(b, a), false, `${b} / ${a}`);
  }
});

test("rapprocheur flou : les écritures d'un même club se retrouvent", () => {
  for (const [a, b] of MEMES) assert.equal(teamNamesLikelyMatch(a, b), true, `${a} / ${b}`);
  // Équivalence ferme (registre) pour les abréviations et alias connus.
  for (const [a, b] of [['Man United', 'Manchester United'], ['PSG', 'Paris Saint-Germain'], ['Shanghai SIPG', 'Shanghai Port'], ['Athletic Bilbao', 'Athletic Club'], ['FC Porto', 'Porto']]) {
    assert.equal(teamNamesEqual(a, b), true, `${a} = ${b}`);
  }
  assert.equal(teamNamesEqual('Shanghai Port', 'Porto'), false);
});

test('meilleur candidat : le bon club, ou personne', () => {
  assert.equal(findBestTeamNameMatch('Leeds United', ['DC United', 'Leeds']), 'Leeds');
  assert.equal(findBestTeamNameMatch('Shanghai Port', ['Portsmouth', 'Porto', 'Port Vale']), null);
  assert.equal(findBestTeamNameMatch('Inter Milan', ['Inter', 'AC Milan']), 'Inter');
  assert.equal(findBestTeamNameMatch('Celta', ['Celta Fortuna', 'Celta Vigo']), 'Celta Vigo');
});

test('identité des joueurs : ordre inversé et transcriptions, jamais un mot court en préfixe', () => {
  assert.equal(sharesNameToken('Wu Xi', 'Xi Wu'), true);
  assert.equal(sharesNameToken('Jinghang Hu', 'Jing Hu'), true);
  assert.equal(sharesNameToken('Wu', 'Wuhan'), false);
  assert.equal(sharesNameToken('Pedrinho', 'Pedro'), false);
});

// Constats du 05/10/2026, laissés visibles (« # TODO » dans le bilan, jamais
// bloquants) : limites CONNUES du rapprocheur flou, que la résolution par
// identifiant (partie 2) contourne. Ils vérifient le comportement
// d'aujourd'hui ; s'ils cassent parce que le flou a été resserré, c'est une
// bonne nouvelle : mettre le constat à jour. À trancher avec Pierre.
test('constat : le mot seul « Port » est encore rapproché de « Porto » (préfixe à une lettre)', { todo: "aucun club ne s'appelle « Port » seul ; clubDuMagasin, lui, refuse (partie 2)" }, () => {
  assert.equal(teamNamesLikelyMatch('Port', 'Porto'), true);
  assert.equal(findBestTeamNameMatch('Port', ['Portsmouth', 'Porto', 'Port Vale']), 'Porto');
});
test('constat : « Leeds United » et « DC United » se ressemblent pour le flou (mot United)', { todo: "le serveur résout ces clubs par identifiant (partie 2) ; le flou ne sert plus qu'en dernier recours" }, () => {
  assert.equal(teamNamesLikelyMatch('Leeds United', 'DC United'), true);
  assert.equal(teamNamesLikelyMatch('Inter', 'Inter Miami CF'), true);
});

// ------------------------------- 2. par identifiant, sur la base d'essai

const r = executerIsole(path.join(SERVEUR, 'test', 'aides', 'script-noms.mjs'));
const club = (nom, ligue) => r.json?.clubs.find((c) => c.nom === nom && c.ligue === ligue)?.id;
const PT = 'Primeira Liga - Portugal';
const PY = 'División Profesional - Paraguay';
const EC = 'Serie A - Ecuador';
const CL = 'Primera División - Chile';
const LEEDS = 'fotmob-8463';
const DC = 'fotmob-6602';

test('base d\'essai : les fonctions de rapprochement tournent sans réseau', () => {
  assert.equal(r.code, 0, r.erreurs + r.sortie);
  assert.equal(r.reseau, false);
  assert.equal(r.json?.ok, true);
});

test('Leeds United ≠ DC United : par identifiant, jamais par le mot « United »', () => {
  assert.equal(club('Leeds United', 'EPL'), LEEDS);
  assert.equal(club('Leeds', 'EPL'), LEEDS);
  assert.equal(club('Leeds United', null), LEEDS);
  assert.equal(club('Leeds United', 'MLS'), LEEDS, 'même dans la compétition de DC United');
  assert.equal(club('DC United', 'MLS'), DC);
  assert.equal(club('DC United', 'EPL'), DC);
  assert.notEqual(club('D.C. United', 'MLS'), LEEDS, 'une écriture inconnue ne donne jamais Leeds');
  for (const cle of ['leedsEPL', 'leedsSansLigue']) {
    const liste = r.json.listes[cle];
    assert.ok(liste.length >= 10, `${cle} : ${liste.length} matchs`);
    assert.ok(liste.every((m) => m.equipe === LEEDS), `${cle} : un match qui n'est pas de Leeds`);
    assert.ok(!liste.some((m) => m.league === 'MLS' || m.adversaire === DC), `${cle} : un match de MLS`);
  }
  const dc = r.json.listes.dcUnited;
  assert.ok(dc.length >= 10 && dc.every((m) => m.equipe === DC));
  // Les entrées des corners/tirs du moteur viennent des deux bons clubs.
  assert.ok(r.json.entrees.statsLeeds?.home?.corners && r.json.entrees.statsDcUnited?.home?.corners);
});

test('les « Nacional » restent distincts par compétition, et sans compétition ne désignent personne', () => {
  assert.equal(club('Nacional', PT), 'fotmob-10214');
  assert.equal(club('C.D. Nacional', PT), 'fotmob-10214');
  assert.equal(club('Nacional', PY), 'fotmob-49689');
  assert.equal(club('Nacional', null), null, 'ambigu : personne plutôt que le mauvais');
  assert.equal(club('Nacional', 'EPL'), null);
  assert.ok(r.json.annuaire.Nacional.length >= 2, "l'annuaire connaît les deux clubs");
  for (const [cle, id, ligue] of [['nacionalPT', 'fotmob-10214', PT], ['nacionalPY', 'fotmob-49689', PY]]) {
    const liste = r.json.listes[cle];
    assert.ok(liste.length >= 10 && liste.every((m) => m.equipe === id), cle);
  }
  // Forme lue par le moteur : nom ambigu, mais jamais hors de sa compétition.
  for (const [cle, ligue] of [['nacionalPT', PT], ['nacionalPY', PY], ['libertadEC', EC], ['libertadPY', PY]]) {
    const f = r.json.formes[cle];
    assert.ok(f.n >= 5, `${cle} : ${f.n}`);
    assert.deepEqual(f.ligues, [ligue], cle);
  }
  assert.deepEqual(r.json.entrees.scoreNacionalPT.home, 'fotmob-10214');
  assert.deepEqual(r.json.entrees.scoreNacionalPY.home, 'fotmob-49689');
});

test('« Libertad » et « Universidad Católica » : un club par pays', () => {
  assert.equal(club('Libertad', PY), 'fotmob-6620');
  assert.equal(club('Libertad', EC), 'fotmob-1345405');
  assert.equal(club('Libertad', null), null);
  assert.equal(club('Universidad Católica', EC), 'fotmob-113053');
  assert.equal(club('Universidad Católica', CL), 'fotmob-6458');
  assert.equal(club('Universidad Catolica', null), null);
});

test('Port / Portsmouth / Porto / Shanghai Port : jamais une ressemblance approximative', () => {
  assert.equal(club('Port', 'Super League - China'), 'fotmob-198616', '« Port » chez les Chinois : Shanghai Port');
  assert.equal(club('Port', 'League 2'), 'fotmob-9799', 'en League 2 : Port Vale');
  assert.equal(club('Port', 'Championship'), null, 'jamais Portsmouth');
  assert.equal(club('Port', PT), null, 'jamais Porto');
  assert.equal(club('Portsmouth', 'Championship'), 'fotmob-8462');
  assert.equal(club('Porto', PT), 'fotmob-9773');
  assert.equal(club('FC Porto', PT), 'fotmob-9773');
  assert.equal(club('Port Vale', 'League 2'), 'fotmob-9799');
  assert.equal(club('Shanghai SIPG FC', 'Super League - China'), 'fotmob-198616', 'ancienne raison sociale');
  assert.equal(club('Inter Miami CF', 'MLS'), 'fotmob-960720');
  assert.equal(club('Inter', 'Serie A - Italy'), 'fotmob-8636');
  assert.deepEqual(r.json.annuaire.Port, [], "« Port » n'est le nom d'aucun club");
});
