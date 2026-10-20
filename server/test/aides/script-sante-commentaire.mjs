/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-sante-commentaire.mjs <serveur de la copie>
 *
 * Lot 3 (07/10/2026) — LE TEXTE MINUTE PAR MINUTE DANS LA SANTÉ DES SOURCES.
 * Le vrai `fotMobCommentaire.js` (lecture), le vrai `relevesDesSources.js` (les
 * notes) et le vrai `sourceHealth.js` (l'état et la ligne FotMob), avec un faux
 * `fetch` passé à la lecture (aucune adresse n'est jamais jointe : la garde des
 * essais coupe le réseau) ; heure figée au 05/10/2026 12 h UTC, dossier
 * data/runtime de la copie. Chaque scénario part d'un suivi vide.
 *
 *   lecture       « en » absent (403) puis « en_gen » lu : deux requêtes, deux notes
 *   absentes      vingt langues absentes (403 attendu) : jamais un échec, jamais une série
 *   inattendus    un 401, un 404, un 429 : ceux-là sont des échecs, avec leur nature
 *   natures       réseau, délai, JSON illisible, fichier compressé abîmé : la nature de chaque échec
 *   serie         trois échecs de suite : « à surveiller », jamais « en panne » ; remis à zéro par une lecture ; périmé après 24 h
 *   forme         un fichier qui n'a pas la forme attendue : « à surveiller »
 *   api           une panne de l'API de FotMob que le texte ne masque pas ; un 403 de l'API reste un échec
 *   persistance   le suivi enregistré en fin de passe, relu après un redémarrage
 *   lignes        la ligne FotMob de « Santé des sources », telle que l'écran la lit (et,
 *                 dans `reponses`, la réponse complète de GET /api/health/sources)
 *   types         le type d'une adresse ; un 403 de l'API de FotMob (échec) face à celui du texte (absence)
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const MAINTENANT = Date.parse('2026-10-05T12:00:00.000Z');
const HEURE = 3_600_000;
/** La configuration d'un serveur « réel » (clés présentes) : dans le bac, les clés sont vidées. */
const CONFIG_REELLE = { actualisation: true, intervalleMinutes: 180, cotesGratuites: true, cleOddsApi: true, cleApiFootball: true, jetonClaude: true, bac: false };

const { closeDb } = await imp('data/db/matchStatsDb.js');
const T = await imp('data/providers/fotMobCommentaire.js');
const R = await imp('data/relevesDesSources.js');
const H = await imp('data/sourceHealth.js');

const octets = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const gz = (objet) => ({ arrayBuffer: async () => octets(zlib.gzipSync(Buffer.from(JSON.stringify(objet)))) });
const texte = (t) => ({ arrayBuffer: async () => octets(Buffer.from(t)) });
const abime = { arrayBuffer: async () => octets(Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from('pas un fichier compressé du tout')])) };
const FICHIER = { Events: [{ IncidentCode: 'var', Elapsed: 77, ElapsedPlus: -1, Description: 'VAR Decision: Goal León 1-0 Juárez (Sebastián Jurado).' }] };

/**
 * Un faux `fetch` : `reponses` dit, pour un nom de fichier (« 5071387_en.json.gz ») ou « * », ce qu'il répond — un nombre (le statut
 * d'un refus), une erreur (jetée), « jamais » (ne répond jamais), un corps lisible. Un fichier absent de la liste répond 403 (comme chez FotMob).
 */
function faux(reponses) {
  const demandes = [];
  const fetchImpl = async (url) => {
    const nom = String(url).replace(/^.*\/gsm\//, '');
    demandes.push(nom);
    const r = nom in reponses ? reponses[nom] : reponses['*'];
    if (r instanceof Error) throw r;
    if (r === 'jamais') return new Promise(() => {});
    if (r === undefined) return { ok: false, status: 403, arrayBuffer: async () => octets(Buffer.from('<Error><Code>AccessDenied</Code></Error>')) };
    if (typeof r === 'number') return { ok: false, status: r, arrayBuffer: async () => octets(Buffer.from('<Error/>')) };
    return { ok: true, status: 200, ...r };
  };
  return { fetchImpl, demandes };
}

const repartir = () => R.__testing.viderSuiviFotmob();
const apiOk = () => R.noterReponseFotmob({ url: 'https://www.fotmob.com/api/data/matches?date=20261005', ok: true, payload: { leagues: [] } });
const apiEchec = (statut = 503) => R.noterReponseFotmob({ url: 'https://www.fotmob.com/api/data/matchDetails?matchId=1', ok: false, statut, erreur: new Error(`HTTP ${statut}`) });
const lire = (id, reponses, options = {}) => {
  const f = faux(reponses);
  return T.lireCommentaire(id, { fetchImpl: f.fetchImpl, ...options }).then((lu) => ({ lu, demandes: f.demandes }));
};
/** Ce que le suivi en mémoire dit : le global (l'API de FotMob) et la sorte « commentaire ». */
const suivi = () => {
  const s = R.suiviFotmobEnMemoire();
  return { global: { requetes: s.requetes, reussites: s.reussites, echecs: s.echecs, erreursDeSuite: s.erreursDeSuite, derniereReussite: s.derniereReussite, derniereErreur: s.derniereErreur }, texte: s.parType.commentaire ?? null, types: Object.keys(s.parType) };
};
const etat = (plus = {}) => {
  const e = H.etatFotmob({ maintenant: MAINTENANT, config: CONFIG_REELLE, ...plus });
  return { etat: e.etat, enPanne: e.enPanne, raison: e.raison, erreursDeSuite: e.erreursDeSuite, derniereReussite: e.derniereReussite, derniereErreur: e.derniereErreur, requetes: e.requetes, echecs: e.echecs, source: e.source, commentaire: e.commentaire, formes: e.formes.map((f) => ({ type: f.type, libelle: f.libelle, requetes: f.requetes, reussites: f.reussites, echecs: f.echecs, absentes: f.absentes, aSurveiller: f.aSurveiller, manques: f.manques })) };
};
/** La réponse complète de GET /api/health/sources (les six lignes), telle que l'écran la lit. */
const reponseSources = (plus = {}) => H.etatDesSources({ maintenant: MAINTENANT, config: CONFIG_REELLE, ...plus });
const ligneFotMob = (plus = {}) => {
  const l = reponseSources(plus).sources.find((x) => x.cle === 'fotmob');
  return { etat: l.etat, couleur: l.couleur, libelleEtat: l.libelleEtat, resume: l.resume, details: l.details, provenance: l.provenance.quoi, dernierReleve: l.dernierReleve };
};

const sortie = {};

// 1. Une lecture : « en » n'existe pas (403), « en_gen » est lu. Deux requêtes — celles d'avant —, deux notes.
repartir();
apiOk();
{
  const r = await lire('5071387', { '5071387_en_gen.json.gz': gz(FICHIER) });
  sortie.lecture = { langue: r.lu?.langue ?? null, evenements: r.lu?.evenements.length ?? null, demandes: r.demandes, suivi: suivi(), etat: etat() };
  // Le même match une seconde fois, « en » existe cette fois : une requête, une note de plus.
  const r2 = await lire('5071388', { '5071388_en.json.gz': { json: async () => FICHIER } });
  sortie.lectureJson = { langue: r2.lu?.langue ?? null, demandes: r2.demandes, texte: suivi().texte };
}

// 2. Des langues absentes, vingt fois : le 403 attendu n'est jamais un échec, ni une série.
repartir();
apiOk();
{
  const demandes = [];
  for (let i = 0; i < 10; i++) {
    const r = await lire(String(100 + i), {});
    if (r.lu !== null) throw new Error('un fichier absent ne rend aucun texte');
    demandes.push(...r.demandes);
  }
  sortie.absentes = { demandes: demandes.length, suivi: suivi(), etat: etat(), ligne: ligneFotMob() };
  // Une lecture réussie ensuite : les absences restent comptées, la série reste à zéro.
  await lire('200', { '200_en_gen.json.gz': gz(FICHIER) });
  sortie.absentesPuisLue = { suivi: suivi(), etat: etat() };
}
// … et sur un serveur qui n'a encore rien reçu de l'API de FotMob (il vient de démarrer) : ces notes comptent, elles sont lues en mémoire.
repartir();
{
  for (let i = 0; i < 3; i++) await lire(String(150 + i), {});
  const e = etat();
  sortie.absentesSeulesAuDemarrage = { suivi: suivi(), source: e.source, requetes: e.requetes, commentaire: e.commentaire, etat: e.etat, ligne: ligneFotMob().details.find((d) => d.startsWith('texte minute par minute')) };
}

// 3. Des refus qui n'en sont pas : un 401, un 404, un 429 — des ÉCHECS, avec leur nature (seul le 403 est attendu).
repartir();
apiOk();
{
  const natures = {};
  for (const statut of [401, 404, 429, 500, 503]) {
    repartir();
    apiOk();
    await lire('300', { '*': statut }, { langues: ['en'] });
    const t = suivi().texte;
    natures[statut] = { requetes: t.requetes, reussites: t.reussites, echecs: t.echecs, absentes: t.absentes, nature: t.derniereErreur?.nature ?? null, statut: t.derniereErreur?.statut ?? null, message: t.derniereErreur?.message ?? null };
  }
  sortie.inattendus = natures;
}

// 4. La nature de chaque échec d'une lecture (une seule requête chacune).
{
  const cas = {
    reseau: { '*': new TypeError('fetch failed') },
    delai: { '*': 'jamais' },
    jsonIllisible: { '*': texte('<html>page de maintenance</html>') },
    fichierAbime: { '*': abime },
    erreurAutre: { '*': new Error('boum') }
  };
  const natures = {};
  for (const [nom, reponses] of Object.entries(cas)) {
    repartir();
    apiOk();
    const r = await lire('400', reponses, { langues: ['en'], delaiMs: 30 });
    const t = suivi().texte;
    natures[nom] = { lu: r.lu, demandes: r.demandes, requetes: t.requetes, reussites: t.reussites, echecs: t.echecs, nature: t.derniereErreur?.nature ?? null, message: t.derniereErreur?.message ?? null };
  }
  sortie.natures = natures;
}

// 5. La série : trois fichiers de suite en échec (hors langue absente) — « à surveiller », jamais « en panne ».
repartir();
apiOk();
{
  const pas = [];
  for (let i = 1; i <= 8; i++) {
    await lire(String(500 + i), { '*': 500 }, { langues: ['en'] });
    const e = etat();
    pas.push({ echecs: i, etat: e.etat, enPanne: e.enPanne, serieDuTexte: e.commentaire.erreursDeSuite, serieDeFotMob: e.erreursDeSuite, raison: e.raison });
  }
  sortie.serie = { pas, suivi: suivi() };
  // Une langue absente au milieu ne remet rien à zéro et n'allonge rien ; une lecture réussie remet la série à zéro.
  await lire('600', {}, { langues: ['en'] });
  sortie.serie.apresAbsente = { serieDuTexte: etat().commentaire.erreursDeSuite, etat: etat().etat };
  await lire('601', { '*': gz(FICHIER) }, { langues: ['en'] });
  sortie.serie.apresLecture = { serieDuTexte: etat().commentaire.erreursDeSuite, etat: etat().etat, raison: etat().raison };
  // Trois échecs, puis 25 heures plus tard (aucune lecture depuis) : la série est trop vieille pour compter.
  for (let i = 1; i <= 3; i++) await lire(String(700 + i), { '*': 500 }, { langues: ['en'] });
  const aujourdhui = etat();
  // 25 heures plus tard, l'API de FotMob a répondu entre-temps (sinon c'est elle qui serait « à surveiller ») ; la série du texte, elle, date de 25 heures.
  R.noterReponseFotmob({ url: 'https://www.fotmob.com/api/data/matches?date=20261006', ok: true, payload: { leagues: [] }, maintenant: MAINTENANT + 25 * HEURE - 60_000 });
  const plusTard = etat({ maintenant: MAINTENANT + 25 * HEURE });
  sortie.serie.aVingtCinqHeures = { aujourdhui: { etat: aujourdhui.etat, serieDuTexte: aujourdhui.commentaire.erreursDeSuite, echecsEnTout: aujourdhui.commentaire.echecs, raison: aujourdhui.raison }, plusTard: { etat: plusTard.etat, serieDuTexte: plusTard.commentaire.erreursDeSuite, raison: plusTard.raison } };
}

// 6. Un fichier qui n'a pas la forme attendue (pas de « Events »).
repartir();
apiOk();
{
  const r = await lire('800', { '*': { arrayBuffer: async () => octets(Buffer.from(JSON.stringify({ rien: 1 }))) } });
  const e = etat();
  sortie.forme = { lu: r.lu, demandes: r.demandes, texte: suivi().texte, etat: e.etat, raison: e.raison, forme: e.formes.find((f) => f.type === 'commentaire') };
}

// 7. L'API de FotMob : une panne que le texte ne masque pas, un 403 qui reste un échec.
repartir();
{
  for (let i = 0; i < 5; i++) apiEchec(403);
  const avant = etat();
  await lire('900', { '900_en.json.gz': gz(FICHIER) });
  const apres = etat();
  sortie.api = { avant: { etat: avant.etat, enPanne: avant.enPanne, erreursDeSuite: avant.erreursDeSuite, requetes: avant.requetes, echecs: avant.echecs }, apresUneLectureDuTexte: { etat: apres.etat, enPanne: apres.enPanne, erreursDeSuite: apres.erreursDeSuite, requetes: apres.requetes, echecs: apres.echecs, lus: apres.commentaire.lus }, derniereErreur: suivi().global.derniereErreur };
  // Le texte en échec ne remplace pas non plus la dernière erreur de l'API, et l'API qui répond de nouveau remet sa série à zéro.
  await lire('901', { '*': 500 }, { langues: ['en'] });
  sortie.api.apresUnEchecDuTexte = { derniereErreur: suivi().global.derniereErreur?.type ?? null, erreursDeSuite: etat().erreursDeSuite };
  apiOk();
  sortie.api.apresRetour = { etat: etat().etat, erreursDeSuite: etat().erreursDeSuite };
}

// 8. Le suivi enregistré en fin de passe, relu après un redémarrage (la mémoire est vidée).
repartir();
apiOk();
{
  await lire('1000', { '1000_en_gen.json.gz': gz(FICHIER) });
  await lire('1001', { '*': 500 }, { langues: ['en'] });
  const enMemoire = suivi().texte;
  const ecrit = R.enregistrerSuiviFotmob({ maintenant: MAINTENANT });
  const fichier = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'sante-fotmob.json'), 'utf8'));
  repartir();
  const relu = etat();
  sortie.persistance = { ecrit: ecrit.ecrit, enMemoire, dansLeFichier: fichier.parType.commentaire, source: relu.source, commentaire: relu.commentaire, ligne: ligneFotMob().details.at(-2) };
}

// 9. La ligne FotMob de « Santé des sources » : sans note, puis avec ce que le texte a rendu.
repartir();
fs.rmSync(path.join(RUNTIME, 'sante-fotmob.json'), { force: true });
{
  sortie.lignes = { sansNote: ligneFotMob() };
  apiOk();
  sortie.lignes.apiSeule = ligneFotMob();
  await lire('1100', { '1100_en_gen.json.gz': gz(FICHIER) });
  sortie.lignes.lectureEtAbsente = ligneFotMob();
  // Les réponses complètes (les six lignes), pour le rendu de la carte.
  sortie.reponses = { lectureEtAbsente: reponseSources() };
  for (let i = 0; i < 3; i++) await lire(String(1110 + i), { '*': 500 }, { langues: ['en'] });
  sortie.lignes.troisEchecs = ligneFotMob();
  sortie.reponses.troisEchecs = reponseSources();
}

// 10. La dernière réponse réussie de FotMob reste celle de l'API : un fichier du texte lu PLUS TARD ne la remplace pas (ni son échec, plus tard encore, la dernière erreur).
repartir();
apiOk();
R.noterReponseFotmob({ url: 'https://data.fotmob.com/webcl/ltc/gsm/1_en.json.gz', ok: true, payload: FICHIER, maintenant: MAINTENANT + HEURE });
R.noterReponseFotmob({ url: 'https://data.fotmob.com/webcl/ltc/gsm/1_en.json.gz', ok: false, statut: 500, erreur: new Error('HTTP 500'), maintenant: MAINTENANT + 2 * HEURE });
{
  const e = etat({ maintenant: MAINTENANT + 2 * HEURE });
  sortie.derniereReussite = { fotmob: e.derniereReussite, derniereErreur: e.derniereErreur, texteLuLe: e.commentaire.derniereReussite, texteEnEchecLe: e.commentaire.derniereErreur?.le ?? null, etat: e.etat };
}

// 11. Le type d'une adresse.
sortie.types = Object.fromEntries(
  [
    'https://data.fotmob.com/webcl/ltc/gsm/5071387_en_gen.json.gz',
    'https://data.fotmob.com/webcl/ltc/gsm/5071387_pt-BR_gen.json.gz',
    'https://www.fotmob.com/api/data/matches?date=20261005',
    'https://www.fotmob.com/api/data/matchDetails?matchId=1',
    'https://www.fotmob.com/api/data/leagues?id=47',
    'https://www.fotmob.com/api/data/teams?id=8456',
    'https://www.fotmob.com/api/data/playerData?id=1',
    'https://www.fotmob.com/api/data/autre?x=1',
    'https://data.fotmob.com/autre/chose.json'
  ].map((u) => [u, R.typeDeRequeteFotmob(u)])
);
sortie.libelle = R.TYPES_FOTMOB.commentaire;
// Un 403 de l'API (hors texte) reste un échec « accès refusé » ; celui du texte est une absence.
repartir();
R.noterReponseFotmob({ url: 'https://www.fotmob.com/api/data/leagues?id=47', ok: false, statut: 403, erreur: new Error('HTTP 403') });
R.noterReponseFotmob({ url: 'https://data.fotmob.com/webcl/ltc/gsm/1_en.json.gz', ok: false, statut: 403, erreur: new Error('HTTP 403') });
{
  const s = R.suiviFotmobEnMemoire();
  sortie.deuxRefus = { global: { requetes: s.requetes, echecs: s.echecs, erreursDeSuite: s.erreursDeSuite, nature: s.derniereErreur?.nature ?? null }, competition: s.parType.competition ?? null, commentaire: s.parType.commentaire ?? null };
}

closeDb();
console.log(JSON.stringify({ ok: true, ...sortie }));
