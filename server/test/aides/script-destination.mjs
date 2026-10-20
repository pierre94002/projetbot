/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-destination.mjs <serveur de la copie> <faux OneDrive> <fausse clé>
 *
 * Les routes de la destination hors disque (backups.controller.js), appelées
 * comme le ferait Express, sur le data/runtime de la COPIE : état par défaut
 * (faux OneDrive, CM_TEST_ONEDRIVE), vérifications sans écriture, choix
 * refusés (400), PUT idempotent, alerte durable remise à jour, choix
 * illisible mis de côté. Le vrai OneDrive n'est pas dans l'environnement
 * (isolement.mjs le retire). Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur, fauxOneDrive, cle] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
for (const k of Object.keys(process.env)) if (/^OneDrive/i.test(k)) throw new Error(`Variable ${k} présente : le vrai OneDrive serait visible`);

const controleur = await imp('api/controllers/backups.controller.js');
const f = await imp('data/sauvegardes/fichiersSauvegarde.js');
const { NOM_FICHIER_REGLAGE, SOUS_DOSSIER_ONEDRIVE } = await imp('data/sauvegardes/destinationHorsDisque.js');
const { REFRESH_STATUS_FILE } = await imp('data/repositories/refreshStatusRepository.js');

const runtime = path.join(serveur, 'data', 'runtime');
const fichierChoix = path.join(runtime, NOM_FICHIER_REGLAGE);
const sauvegardes = f.dossierSauvegardesParDefaut(resolveDbPath());
fs.mkdirSync(sauvegardes, { recursive: true });

/** Un appel comme Express : { code, corps } ou { code, erreur } (ApiError → son code). */
function appel(fonction, body) {
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
    fonction({ body, query: {}, params: {} }, res);
  } catch (error) {
    return { code: error.statusCode ?? 500, erreur: error.message };
  }
  return { code: res.code, corps: res.corps };
}
const get = () => appel(controleur.getBackupsOverview);
const put = (body) => appel(controleur.putBackupDestination, body);
const check = (body) => appel(controleur.postBackupDestinationCheck, body);

/** Ce qui se voit d'un dossier (noms, tailles, dates) : prouve qu'une vérification n'écrit rien. */
const photo = (d) => {
  try {
    return fs.readdirSync(d, { recursive: true }).sort().map((n) => {
      const st = fs.statSync(path.join(d, n));
      return `${n}|${st.size}|${st.mtimeMs}`;
    });
  } catch {
    return null;
  }
};
const resumeHd = (r) => {
  const h = r.corps?.horsDisque;
  return h ? { reglage: h.reglage, type: h.type, source: h.source, destination: h.destination, garder: h.garder, choix: h.choix, utilisable: h.verification?.utilisable ?? null, problemes: h.verification?.problemes ?? null } : { code: r.code, erreur: r.erreur };
};
const codes = (r) => (r.corps?.alertes ?? []).map((a) => a.code).sort();
const alerteDurable = () => {
  try {
    return (JSON.parse(fs.readFileSync(REFRESH_STATUS_FILE, 'utf8')).alerts?.sauvegarde?.alertes ?? null)?.map((a) => a.code).sort() ?? null;
  } catch {
    return 'absente';
  }
};

const sortie = { sauvegardes, runtime, projet: f.DOSSIER_PROJET, bacActif: f.bacActif() };

// 1. Par défaut : le faux OneDrive, sans aucun choix enregistré.
const initial = get();
sortie.initial = { ...resumeHd(initial), alertes: codes(initial), fichierChoix: fs.existsSync(fichierChoix) };

// 2. Vérifications : rien n'est écrit, ni le dossier dédié de OneDrive créé.
const avant = { runtime: photo(runtime), od: photo(fauxOneDrive), cle: photo(cle), sauvegardes: photo(sauvegardes) };
const vOd = check({ type: 'onedrive' });
const vCle = check({ type: 'dossier', chemin: `"${cle}\\"` });
const vRel = check({ type: 'dossier', chemin: 'relatif\\dossier' });
const vType = check({ type: 'disquette' });
const apres = { runtime: photo(runtime), od: photo(fauxOneDrive), cle: photo(cle), sauvegardes: photo(sauvegardes) };
sortie.verifications = {
  onedrive: { code: vOd.code, utilisable: vOd.corps?.utilisable, aCreer: vOd.corps?.aCreer, destination: vOd.corps?.destination, variable: vOd.corps?.onedrive?.variable, essai: vOd.corps?.onedrive?.essai },
  cle: { code: vCle.code, utilisable: vCle.corps?.utilisable, existe: vCle.corps?.existe, destination: vCle.corps?.destination, libre: vCle.corps?.libre },
  relatif: { code: vRel.code, utilisable: vRel.corps?.utilisable, problemes: vRel.corps?.problemes?.map((p) => p.code) },
  type: { code: vType.code, erreur: vType.erreur },
  rienEcrit: JSON.stringify(avant) === JSON.stringify(apres),
  dossierOneDriveCree: fs.existsSync(path.join(fauxOneDrive, SOUS_DOSSIER_ONEDRIVE))
};

// 3. Choix refusés (400) : rien d'enregistré.
const refus = {
  relatif: put({ type: 'dossier', chemin: 'sauvegardes' }),
  absent: put({ type: 'dossier', chemin: path.join(cle, 'pas-la') }),
  sauvegardes: put({ type: 'dossier', chemin: sauvegardes }),
  dansSauvegardes: put({ type: 'dossier', chemin: path.join(sauvegardes, 'sous-dossier') }),
  projet: put({ type: 'dossier', chemin: runtime }),
  racineProjet: put({ type: 'dossier', chemin: f.DOSSIER_PROJET }),
  type: put({ type: 'disquette' }),
  sansType: put({ chemin: cle }),
  cheminPasTexte: put({ type: 'dossier', chemin: 12 }),
  ...(f.bacActif() ? { horsDuBac: put({ type: 'dossier', chemin: os.tmpdir() }) } : {})
};
sortie.refus = Object.fromEntries(Object.entries(refus).map(([k, r]) => [k, { code: r.code, erreur: r.erreur }]));
sortie.refusRienEcrit = !fs.existsSync(fichierChoix);

// 4. Clé USB : enregistré, puis le même choix (autre écriture du chemin) ne réécrit rien.
const pCle = put({ type: 'dossier', chemin: cle });
const mtime1 = fs.statSync(fichierChoix).mtimeMs;
const contenu1 = fs.readFileSync(fichierChoix, 'utf8');
const pCle2 = put({ type: 'dossier', chemin: `"${cle.toUpperCase()}\\"` });
sortie.cle = {
  code: pCle.code,
  change: pCle.corps?.enregistrement?.change,
  hd: resumeHd(pCle),
  alertes: codes(pCle),
  alerteDurable: alerteDurable(),
  fichier: JSON.parse(contenu1),
  rejoue: { code: pCle2.code, change: pCle2.corps?.enregistrement?.change, inchange: fs.statSync(fichierChoix).mtimeMs === mtime1 && fs.readFileSync(fichierChoix, 'utf8') === contenu1 }
};

// 5. « Aucune » : plus d'alerte hors disque, ni à l'écran ni en haut de l'appli.
const pAucune = put({ type: 'aucune' });
sortie.aucune = { code: pAucune.code, change: pAucune.corps?.enregistrement?.change, hd: resumeHd(pAucune), alertes: codes(pAucune), alerteDurable: alerteDurable() };

// 6. OneDrive choisi explicitement.
const pOd = put({ type: 'onedrive' });
sortie.onedrive = { code: pOd.code, change: pOd.corps?.enregistrement?.change, hd: resumeHd(pOd), alertes: codes(pOd) };

// 7. Choix illisible : jamais pris pour « pas de choix » ; le suivant le met de côté.
fs.writeFileSync(fichierChoix, '{"type": "onedr');
const illisible = get();
const pApres = put({ type: 'aucune' });
sortie.illisible = {
  hd: resumeHd(illisible),
  alertes: codes(illisible),
  apres: { code: pApres.code, change: pApres.corps?.enregistrement?.change, type: JSON.parse(fs.readFileSync(fichierChoix, 'utf8')).type },
  misDeCote: fs.readdirSync(runtime).filter((n) => n.startsWith('sauvegarde-hors-disque.illisible-')).length
};

// 8. Sans choix ni OneDrive (variable d'essai retirée) : non réglée.
fs.rmSync(fichierChoix);
delete process.env.CM_TEST_ONEDRIVE;
const nonReglee = get();
sortie.nonReglee = { hd: resumeHd(nonReglee), alertes: codes(nonReglee) };

console.log(JSON.stringify(sortie));
