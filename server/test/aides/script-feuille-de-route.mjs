/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-feuille-de-route.mjs <serveur de la copie> <phase>
 *
 * La feuille de route (étape 5 du plan) : les notes de Pierre — le seul fichier
 * d'exécution de la page, data/runtime/roadmap.json de la COPIE —, appelées
 * comme le ferait Express (contrôleurs), puis par l'application Express
 * elle-même (phase « routes »). Phases (chacune dans son processus ; « ecrire »
 * puis « relire » partagent la même copie : c'est le redémarrage simulé) :
 *   ecrire    écrire, rejouer (idempotent), fusionner, effacer, empreinte des données ;
 *   relire    après un redémarrage : la note est là, rejouée elle ne réécrit rien ;
 *   refus     étape inconnue, demande invalide : refusées, rien d'écrit ;
 *   illisible fichier illisible ou de forme inattendue : jamais pris pour vide, jamais
 *             écrasé, relu sans cache une fois réparé ;
 *   fusion    un fichier plus riche (mise de côté, champs inconnus, note orpheline) ;
 *   routes    GET /api/roadmap et PUT /api/roadmap/etapes/:id/note par Express.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

// La feuille de route n'ouvre JAMAIS la base : la copie d'essai peut n'en avoir aucune (le garde — garde.mjs —
// contrôle seulement que MATCH_STATS_DB est dans la copie). Rien d'autre que le fichier des notes n'est lu ni écrit.
const controleur = await imp('api/controllers/roadmap.controller.js');
const depot = await imp('data/repositories/roadmapRepository.js');
const { getDataVersion } = await imp('data/repositories/dataVersionRepository.js');
const fichier = depot.FICHIER_FEUILLE_DE_ROUTE;
const runtime = path.join(serveur, 'data', 'runtime');

/** Un appel comme Express : { code, corps } ou { code, erreur } (ApiError → son code). */
function appel(fonction, { params = {}, body } = {}) {
  const res = {
    code: 200,
    corps: null,
    status(c) {
      this.code = c;
      return this;
    },
    json(x) {
      this.corps = x;
      return this;
    }
  };
  try {
    fonction({ params, body, query: {} }, res);
  } catch (error) {
    return { code: error.statusCode ?? 500, erreur: error.message };
  }
  return { code: res.code, corps: res.corps };
}
const get = () => appel(controleur.getRoadmap);
const put = (id, note, corps) => appel(controleur.putRoadmapNote, { params: { id }, body: corps === undefined ? { note } : corps });

/** Le fichier tel qu'il est : existence, octets exacts, date — prouve qu'une demande n'a rien réécrit. */
function photo() {
  if (!fs.existsSync(fichier)) return { existe: false };
  const st = fs.statSync(fichier);
  return { existe: true, octets: fs.readFileSync(fichier, 'utf8'), mtimeMs: st.mtimeMs, taille: st.size };
}
const memePhoto = (a, b) => a.existe === b.existe && a.octets === b.octets && a.mtimeMs === b.mtimeMs;
const json = () => JSON.parse(fs.readFileSync(fichier, 'utf8'));
const etape = (etat, id) => etat.lots.flatMap((l) => l.etapes).find((e) => e.id === id);
const resume = (r) =>
  r.corps
    ? {
        code: r.code,
        notes: r.corps.notes,
        orphelines: r.corps.notesOrphelines,
        avancement: r.corps.avancement,
        lots: r.corps.lots.length,
        etapes: r.corps.lots.reduce((n, l) => n + l.etapes.length, 0),
        enregistrement: r.corps.enregistrement ?? null,
        notesParEtape: Object.fromEntries(r.corps.lots.flatMap((l) => l.etapes).filter((e) => e.note).map((e) => [e.id, e.note])),
        etats: Object.fromEntries(r.corps.lots.flatMap((l) => l.etapes).map((e) => [e.id, e.etat]))
      }
    : { code: r.code, erreur: r.erreur };

const sortie = { phase, fichier, dansLaCopie: path.resolve(fichier).toLowerCase().startsWith(path.resolve(runtime).toLowerCase() + path.sep) };

const NOTE_A = 'Penser à relire le bilan du lot 1 avec Pierre.\nDeuxième ligne : é, ç, œ, € — et des « guillemets ».';
const NOTE_B = 'Note modifiée : le lot 2 passe avant.';
const NOTE_E = 'Les enregistreurs ont déjà servi.';
const NOTE_FINALE = 'Cette note doit survivre à un redémarrage.\nElle a deux lignes et des accents : été, garçon, Noël.';

if (phase === 'ecrire') {
  // État de départ : aucun fichier, 7 étapes terminées sur 49, rien de noté.
  sortie.initial = { ...resume(get()), fichierExiste: fs.existsSync(fichier) };
  const v0 = getDataVersion().version;

  // 1. Une première note : écrite, relue.
  const p1 = put('12', NOTE_A);
  sortie.p1 = { ...resume(p1), fichier: json() };
  const photo1 = photo();

  // 2. Rejouée à l'identique, avec des espaces et des fins de ligne Windows : rien n'est réécrit.
  const p2 = put('12', NOTE_A);
  const p3 = put('12', `  ${NOTE_A.replace(/\n/g, '\r\n')} \r\n\r\n`);
  sortie.rejoue = { p2: { code: p2.code, change: p2.corps?.enregistrement?.change }, p3: { code: p3.code, change: p3.corps?.enregistrement?.change }, inchange: memePhoto(photo1, photo()) };

  // 3. Une note sur une autre étape (identifiant « e » en minuscule) : les deux notes cohabitent.
  const pe = put('e', NOTE_E);
  const apresE = json();
  sortie.etapeE = { ...resume(pe), fichier: apresE, noteDe12Gardee: apresE.etapes['12']?.note === NOTE_A, dateDe12Gardee: apresE.etapes['12']?.noteLe === sortie.p1.fichier.etapes['12'].noteLe };

  // 4. La note de l'étape 12 change (instant donné) : sa date change, celle de l'étape E non.
  const avantB = json();
  const rB = depot.enregistrerNote('12', NOTE_B, { maintenant: new Date('2026-10-06T08:30:00Z') });
  const apresB = json();
  sortie.modifie = { change: rB.change, noteLe: rB.noteLe, fichier: apresB, dateDeELaMeme: apresB.etapes.E.noteLe === avantB.etapes.E.noteLe, majLe: apresB.majLe };

  // 5. Effacer : un texte vide retire la note de 12 et garde celle de E ; effacer encore ne réécrit rien.
  const effacer = put('12', '');
  const apresEffacer = json();
  const photoEffacee = photo();
  const encore = put('12', '   \n  ');
  sortie.efface = { ...resume(effacer), fichier: apresEffacer, encore: { code: encore.code, change: encore.corps?.enregistrement?.change }, inchange: memePhoto(photoEffacee, photo()) };

  // 6. Les notes ne changent pas l'empreinte des données (pas de « nouvelles données » partout).
  sortie.empreinte = { avant: v0, apres: getDataVersion().version };

  // 7. L'état final pour le redémarrage : la note de 12 (et celle de E).
  const pf = put('12', NOTE_FINALE);
  sortie.finale = { ...resume(pf), fichier: json() };
  sortie.textes = { A: NOTE_A, B: NOTE_B, E: NOTE_E, finale: NOTE_FINALE };
} else if (phase === 'relire') {
  // Un AUTRE processus, sur la même copie : le redémarrage.
  const r = get();
  const photoAvant = photo();
  const rejoue = put('12', NOTE_FINALE);
  const photoApres = photo();
  const autre = put('13', 'Une note après le redémarrage.');
  sortie.relu = resume(r);
  sortie.note12 = etape(r.corps, '12').note;
  sortie.noteE = etape(r.corps, 'E').note;
  sortie.rejoue = { code: rejoue.code, change: rejoue.corps?.enregistrement?.change, inchange: memePhoto(photoAvant, photoApres) };
  sortie.autre = { ...resume(autre), fichier: json() };
  sortie.textes = { E: NOTE_E, finale: NOTE_FINALE };
} else if (phase === 'refus') {
  const inconnus = ['99', '48', '07', '1.0', 'abc', '', '  ', 'ee', 'E1', '-1', '12abc', '0x1', 'toutes'];
  const refuses = {};
  for (const id of inconnus) {
    const r = put(id, 'une note');
    refuses[id] = { code: r.code, erreur: r.erreur };
  }
  // Un identifiant qui n'est pas du tout un texte : jamais deviné non plus.
  refuses['(absent)'] = (() => {
    const r = appel(controleur.putRoadmapNote, { params: {}, body: { note: 'x' } });
    return { code: r.code, erreur: r.erreur };
  })();
  sortie.inconnus = refuses;
  sortie.rienEcritInconnus = !fs.existsSync(fichier);

  const invalides = {
    sansCorps: appel(controleur.putRoadmapNote, { params: { id: '12' } }),
    corpsVide: put('12', undefined, {}),
    nombre: put('12', undefined, { note: 12 }),
    nul: put('12', undefined, { note: null }),
    objet: put('12', undefined, { note: { texte: 'x' } }),
    liste: put('12', undefined, { note: ['x'] }),
    booleen: put('12', undefined, { note: false }),
    trop: put('12', 'x'.repeat(4001)),
    // Le texte exact au maximum passe ; ses espaces de bord ne comptent pas.
    juste: put('12', ` ${'y'.repeat(4000)} `)
  };
  sortie.invalides = Object.fromEntries(Object.entries(invalides).map(([k, r]) => [k, { code: r.code, erreur: r.erreur, change: r.corps?.enregistrement?.change }]));
  const dernier = json();
  sortie.fichierApresJuste = { cles: Object.keys(dernier.etapes), longueur: dernier.etapes['12'].note.length };
  sortie.longueurMax = depot.LONGUEUR_NOTE_MAX;
} else if (phase === 'illisible') {
  const brut = fs.readFileSync(fichier, 'utf8');
  const photoAvant = photo();
  // Fichier tronqué : la page le dit, garde le plan et l'historique, et refuse d'écrire.
  const g1 = get();
  const p1 = put('12', 'une note');
  sortie.tronque = { get: resume(g1), etapes49: g1.corps.lots.reduce((n, l) => n + l.etapes.length, 0), terminees: g1.corps.avancement.terminees, put: { code: p1.code, erreur: p1.erreur }, inchange: memePhoto(photoAvant, photo()), contenu: photo().octets === brut };
  // Forme inattendue (un tableau, une entrée qui n'est pas un objet, une note qui n'est pas un texte).
  const formes = { tableau: '[]', etapesTableau: '{"etapes": []}', entreeTexte: '{"etapes": {"12": "bonjour"}}', noteNombre: '{"etapes": {"12": {"note": 12}}}', miseDeCoteTexte: '{"etapes": {"12": {"miseDeCote": "oui"}}}' };
  sortie.formes = {};
  for (const [nom, contenu] of Object.entries(formes)) {
    fs.writeFileSync(fichier, contenu);
    const avant = photo();
    const g = get();
    const p = put('12', 'une note');
    sortie.formes[nom] = { source: g.corps.notes.source, probleme: g.corps.notes.probleme, put: p.code, inchange: memePhoto(avant, photo()) };
  }
  // Réparé : relu tout de suite, sans qu'une lecture ratée n'ait été gardée en mémoire.
  fs.writeFileSync(fichier, JSON.stringify({ version: 1, etapes: { 12: { note: 'Une note réparée', noteLe: '2026-10-06T08:00:00.000Z' } } }, null, 2));
  const g2 = get();
  sortie.repare = { source: g2.corps.notes.source, note12: etape(g2.corps, '12').note, nombre: g2.corps.notes.nombre };
  const p2 = put('13', 'Et une autre');
  sortie.apresReparation = { code: p2.code, fichier: json() };
} else if (phase === 'fusion') {
  const avant = json();
  const g0 = get();
  const p = put('12', 'Ma note sur la 12');
  const apres = json();
  const g1 = get();
  sortie.avant = { fichier: avant, etats: resume(g0).etats, avancement: g0.corps.avancement, orphelines: g0.corps.notesOrphelines, notesParEtape: resume(g0).notesParEtape, mise12: etape(g0.corps, '12').miseDeCote, mise0: etape(g0.corps, '0').miseDeCote, etat0: etape(g0.corps, '0').etat };
  sortie.put = { code: p.code, change: p.corps?.enregistrement?.change };
  sortie.apres = { fichier: apres, etat12: etape(g1.corps, '12').etat, note12: etape(g1.corps, '12').note, mise12: etape(g1.corps, '12').miseDeCote, avancement: g1.corps.avancement, orphelines: g1.corps.notesOrphelines, notesParEtape: resume(g1).notesParEtape };
  // Effacer la note de 12 garde sa mise de côté (l'entrée n'est retirée que si elle est vide).
  const e = put('12', '');
  sortie.efface = { fichier: json(), mise12: etape(e.corps, '12').miseDeCote };
  // Effacer la note de 13 (la seule chose de cette entrée) retire l'entrée entière.
  const e13 = put('13', '');
  sortie.efface13 = { cles: Object.keys(json().etapes) };
} else if (phase === 'routes') {
  // L'application Express elle-même, appelée sans réseau (le réseau est coupé) :
  // une requête fabriquée, le corps déjà lu, la réponse captée.
  const { createApp } = await imp('app.js');
  const app = createApp();
  const requete = (methode, url, corps) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
      if (corps !== undefined) {
        req._body = true; // express.json() saute une requête dont le corps est déjà lu
        req.body = corps;
      }
      const res = new http.ServerResponse(req);
      const morceaux = [];
      res.write = (c) => {
        morceaux.push(Buffer.from(c));
        return true;
      };
      res.end = (c) => {
        if (c) morceaux.push(Buffer.from(c));
        let corpsRendu = null;
        try {
          corpsRendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        } catch {
          // laissé à null
        }
        resolve({ code: res.statusCode, corps: corpsRendu });
        return res;
      };
      app.handle(req, res, reject);
    });

  const g = await requete('GET', '/api/roadmap');
  const ecriteParGet = fs.existsSync(fichier);
  const p = await requete('PUT', '/api/roadmap/etapes/12/note', { note: 'Note par Express' });
  const rejoue = await requete('PUT', '/api/roadmap/etapes/12/note', { note: 'Note par Express' });
  const inconnue = await requete('PUT', '/api/roadmap/etapes/99/note', { note: 'x' });
  const invalide = await requete('PUT', '/api/roadmap/etapes/12/note', { note: 7 });
  const aucune = await requete('GET', '/api/roadmap/rien');
  sortie.get = { code: g.code, lots: g.corps?.lots?.length, etapes: g.corps?.lots?.reduce((n, l) => n + l.etapes.length, 0), terminees: g.corps?.avancement?.terminees, tests: g.corps?.tests };
  sortie.put = { code: p.code, change: p.corps?.enregistrement?.change, note12: etape(p.corps, '12').note?.texte };
  sortie.rejoue = { code: rejoue.code, change: rejoue.corps?.enregistrement?.change };
  sortie.inconnue = { code: inconnue.code, erreur: inconnue.corps?.error };
  sortie.invalide = { code: invalide.code, erreur: invalide.corps?.error };
  sortie.aucune = { code: aucune.code, erreur: aucune.corps?.error };
  sortie.fichierApresGet = ecriteParGet;
  sortie.fichier = json();
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
