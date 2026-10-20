/**
 * planSauvegardes.js — les règles des sauvegardes, sans aucun accès au disque.
 * -----------------------------------------------------------------------
 * Étape 1 du plan CôteMaster. Ce module ne lit et n'écrit rien : il dit
 * comment s'appelle une sauvegarde, lesquelles garder, quand les essais sont
 * dus et ce qui doit alerter. Le tester revient à lui passer des dates
 * (test/sauvegardes.test.mjs).
 *
 * NOMS. Une sauvegarde automatique est un JEU de fichiers au nom de son jour,
 * en heure de PARIS — une copie faite à 0 h 30 le 6 octobre porte le 6, et
 * non le 5 comme le donnait la date UTC de l'ancien script :
 *    cotemaster-AAAA-MM-JJ.db.gz          la base (VACUUM INTO, compressée)
 *    cotemaster-AAAA-MM-JJ.donnees.zip    les données de l'appli (data/runtime, sans secrets)
 *    cotemaster-AAAA-MM-JJ.json           son bilan : tailles, empreintes, rencontres, réglages du moteur
 * Un jeu par jour : refaite le même jour, la sauvegarde remplace celle d'avant.
 * Les copies hebdomadaires de l'ancien format (auto-AAAA-MM-JJ.db, non
 * compressées, jusqu'au 05/10/2026) entrent dans la même rotation, pour ne
 * pas rester sur le disque à jamais. TOUT AUTRE NOM — une copie faite à la
 * main, « auto-2026-09-24 - Copie.db », un fichier déposé là — n'est jamais
 * touché.
 *
 * Pourquoi le nom ET la rotation changent ensemble : l'ancienne règle
 * (auto-AAAA-MM-JJ.db, « garder les 2 plus récentes ») appliquée à une copie
 * par nuit aurait effacé chaque copie au-delà de deux jours.
 *
 * ROTATION — la règle éprouvée de restic : on garde
 *   - la dernière sauvegarde de chacun des 7 derniers JOURS qui en ont une ;
 *   - la dernière de chacune des 4 dernières SEMAINES (lundi-dimanche) qui en ont une ;
 *   - la dernière de chacun des 12 derniers MOIS qui en ont une ;
 * le reste des sauvegardes automatiques est supprimé. « Les 7 derniers jours
 * qui en ont une », et non « les 7 derniers jours du calendrier » : après
 * deux semaines d'absence, il reste 7 copies quotidiennes au lieu de rien.
 * Une même copie peut compter à plusieurs titres (celle de ce soir est la
 * quotidienne, l'hebdomadaire et la mensuelle du moment).
 * -----------------------------------------------------------------------
 */

export const PREFIXE = 'cotemaster-';
export const POLITIQUE = Object.freeze({ quotidiennes: 7, hebdomadaires: 4, mensuelles: 12 });
/** Restauration d'essai, contrôle d'intégrité complet, copie hors disque : tous les combien de jours. */
export const CADENCE = Object.freeze({ restaurationJours: 7, controleCompletJours: 28, horsDisqueJours: 7 });
/** Copies gardées sur la destination hors disque (correction 18 du plan : 1 ou 2, jamais plus). */
export const HORS_DISQUE_MAX = 2;
const GO = 1024 ** 3;
/** Règle de place inchangée depuis l'ancien script : 2 × la base + 2 Go libres pour copier. */
export const MARGE_COPIE = 2 * GO;
/** En dessous de « requis + 5 Go », on prévient avant que la sauvegarde ne devienne impossible. */
export const MARGE_ALERTE = 5 * GO;
/** Une sauvegarde réussie plus vieille que ça (en jours de Paris) alerte. */
export const SAUVEGARDE_EN_RETARD_JOURS = 2;

const JOUR_MS = 86_400_000;
const formatParis = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });

/** Jour civil à Paris (AAAA-MM-JJ) d'un instant : c'est lui qui nomme la sauvegarde. */
export const jourParis = (instant = new Date()) => formatParis.format(new Date(instant));

/** AAAA-MM-JJ valide (le 30 février ne l'est pas) ? */
export function jourValide(jour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour))) return false;
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

const versUtc = (jour) => {
  const [a, m, j] = jour.split('-').map(Number);
  return Date.UTC(a, m - 1, j);
};

/** Jours civils de `a` à `b` (positif si b est après a). */
export const joursEntre = (a, b) => Math.round((versUtc(b) - versUtc(a)) / JOUR_MS);

/** Le lundi de la semaine d'un jour : la clé de sa semaine (lundi-dimanche). */
export function lundiDe(jour) {
  const t = versUtc(jour);
  const decalage = (new Date(t).getUTCDay() + 6) % 7; // lundi = 0
  return new Date(t - decalage * JOUR_MS).toISOString().slice(0, 10);
}

export const moisDe = (jour) => jour.slice(0, 7);

/** Les trois fichiers d'un jeu. */
export function nomsDuJour(jour) {
  return {
    base: `${PREFIXE}${jour}.db.gz`,
    donnees: `${PREFIXE}${jour}.donnees.zip`,
    bilan: `${PREFIXE}${jour}.json`
  };
}

const MOTIF_JEU = /^cotemaster-(\d{4}-\d{2}-\d{2})\.(db\.gz|donnees\.zip|json)$/;
// Nom EXACT de l'ancien format : « auto-2026-09-24 - Copie.db » n'y répond pas.
const MOTIF_ANCIEN = /^auto-(\d{4}-\d{2}-\d{2})\.db$/;
// Fichiers d'écriture d'un processus (son numéro dans le nom), et les annexes
// que SQLite pose à côté d'une copie ouverte pour contrôle.
const MOTIF_TRAVAIL = /^cotemaster-(\d{4}-\d{2}-\d{2})\.(db|db\.gz|donnees\.zip|json)\.(\d+)\.en-cours(-wal|-shm|-journal)?$/;
const PARTIES = { 'db.gz': 'base', 'donnees.zip': 'donnees', json: 'bilan' };

/** Fichiers d'état tenus à côté des sauvegardes : ni sauvegarde ni copie à la main. */
export const FICHIERS_ETAT = Object.freeze({ sauvegarde: 'etat-sauvegarde.json', restauration: 'etat-restauration.json' });
const MOTIF_TEMP_RESTAURATION = /^restauration-essai\.(\d+)\.en-cours$/;

/**
 * Ce qu'est un nom de fichier du dossier des sauvegardes :
 *   { type: 'jeu', jour, partie: 'base'|'donnees'|'bilan' }  sauvegarde automatique ;
 *   { type: 'ancienne', jour, partie: 'ancienne' }           ancien format, même rotation ;
 *   { type: 'travail', jour, pid }                           écriture en cours (ou abandonnée) ;
 *   { type: 'etat' }                                          fichier d'état ;
 *   null                                                      tout le reste : JAMAIS touché.
 */
export function classerNom(nom) {
  const n = String(nom);
  let m = MOTIF_JEU.exec(n);
  if (m && jourValide(m[1])) return { type: 'jeu', jour: m[1], partie: PARTIES[m[2]] };
  m = MOTIF_ANCIEN.exec(n);
  if (m && jourValide(m[1])) return { type: 'ancienne', jour: m[1], partie: 'ancienne' };
  m = MOTIF_TRAVAIL.exec(n);
  if (m && jourValide(m[1])) return { type: 'travail', jour: m[1], pid: Number(m[3]) };
  if (Object.values(FICHIERS_ETAT).includes(n)) return { type: 'etat' };
  return null;
}

/** Nom du dossier temporaire d'une restauration d'essai (un par processus). */
export const nomTempRestauration = (pid = process.pid) => `restauration-essai.${pid}.en-cours`;
export function classerDossierTemp(nom) {
  const m = MOTIF_TEMP_RESTAURATION.exec(String(nom));
  return m ? { pid: Number(m[1]) } : null;
}

/**
 * La rotation. `jours` : les jours qui ont une sauvegarde (un jeu chacun).
 * Rend { garder: Map(jour → ['quotidienne', 'hebdomadaire', 'mensuelle']…),
 * supprimer: [jours] }. Le jour le plus récent est toujours gardé.
 */
export function planRotation(jours, politique = POLITIQUE) {
  const tries = [...new Set(jours.filter(jourValide))].sort().reverse(); // le plus récent d'abord
  const garder = new Map();
  const regles = [
    ['quotidienne', (j) => j, politique.quotidiennes],
    ['hebdomadaire', lundiDe, politique.hebdomadaires],
    ['mensuelle', moisDe, politique.mensuelles]
  ];
  for (const [raison, panier, combien] of regles) {
    let vus = 0;
    let precedent = null;
    for (const jour of tries) {
      if (vus >= combien) break;
      const p = panier(jour);
      // Parcours du plus récent au plus ancien : le premier jour rencontré
      // d'un panier en est le plus récent.
      if (p === precedent) continue;
      precedent = p;
      vus++;
      if (!garder.has(jour)) garder.set(jour, []);
      garder.get(jour).push(raison);
    }
  }
  return { garder, supprimer: tries.filter((j) => !garder.has(j)) };
}

/** Combien de copies par titre (une copie peut compter à plusieurs titres). */
export function compterParType(garder) {
  const n = { quotidiennes: 0, hebdomadaires: 0, mensuelles: 0, jeux: garder.size };
  for (const raisons of garder.values()) {
    if (raisons.includes('quotidienne')) n.quotidiennes++;
    if (raisons.includes('hebdomadaire')) n.hebdomadaires++;
    if (raisons.includes('mensuelle')) n.mensuelles++;
  }
  return n;
}

/**
 * Un essai périodique est-il dû ? `derniere` : instant ISO de la dernière
 * réussite (ou null) ; la période se compte en jours civils de Paris, pour
 * qu'une passe de nuit qui glisse de 0 h 10 à 2 h 50 ne repousse pas l'essai
 * d'un jour.
 */
export function estDue(derniere, periodeJours, maintenant = new Date()) {
  if (!derniere || Number.isNaN(Date.parse(derniere))) return true;
  return joursEntre(jourParis(derniere), jourParis(maintenant)) >= periodeJours;
}

/** Place libre face à la règle de copie. niveau : ok | surveiller | insuffisante | inconnue. */
export function placeDisque(libre, tailleBase) {
  const requis = 2 * (tailleBase ?? 0) + MARGE_COPIE;
  const seuilAlerte = requis + MARGE_ALERTE;
  const niveau = libre === null || libre === undefined ? 'inconnue' : libre < requis ? 'insuffisante' : libre < seuilAlerte ? 'surveiller' : 'ok';
  return { libre: libre ?? null, requis, seuilAlerte, niveau };
}

const go = (o) => `${(o / GO).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '?');

/**
 * Ce qui doit alerter, à partir des états préparés par les scripts et de
 * deux mesures du moment (place libre, destination hors disque). Une seule
 * source pour l'alerte durable de l'actualisation et pour la carte de Réglages.
 *   sauvegarde   contenu de etat-sauvegarde.json (ou null)
 *   restauration contenu de etat-restauration.json (ou null)
 *   horsDisque   la destination en vigueur (destinationHorsDisque.js) :
 *                { reglage: 'non-configuree'|'refusee'|'configuree'|'illisible',
 *                  type, destination, probleme }. « refusee » (choix
 *                « Aucune ») n'alerte jamais. Les essais faits vers une AUTRE
 *                destination (choix changé depuis) ne comptent plus.
 *   disque       résultat de placeDisque()
 * Rend [{ niveau: 'danger'|'warning', code, texte }].
 */
export function alertesSauvegarde({ sauvegarde = null, restauration = null, horsDisque = null, disque = null, maintenant = new Date() } = {}) {
  const alertes = [];
  const ajouter = (niveau, code, texte) => alertes.push({ niveau, code, texte });
  const aujourdHui = jourParis(maintenant);

  // 1. La sauvegarde de la nuit.
  const reussie = sauvegarde?.derniereReussie ?? null;
  const tentee = sauvegarde?.derniere ?? null;
  if (tentee && tentee.ok === false) {
    ajouter('danger', 'sauvegarde-echec', `La sauvegarde du ${dateCourte(tentee.fin ?? tentee.debut)} a échoué : ${tentee.erreur ?? 'raison inconnue'}.`);
  }
  if (sauvegarde?.rotation?.erreur) {
    ajouter('warning', 'rotation-echec', `Rotation incomplète (une vieille copie n'a pas pu être supprimée, reprise la nuit suivante) : ${sauvegarde.rotation.erreur}.`);
  }
  if (!reussie) {
    ajouter('warning', 'sauvegarde-aucune', "Aucune sauvegarde au format de nuit pour l'instant : la première se fait à la prochaine passe d'actualisation.");
  } else {
    const retard = joursEntre(jourParis(reussie.fin), aujourdHui);
    if (retard >= SAUVEGARDE_EN_RETARD_JOURS) {
      ajouter('danger', 'sauvegarde-retard', `Dernière sauvegarde réussie le ${dateCourte(reussie.fin)}, il y a ${retard} jours.`);
    }
  }

  // 2. La restauration d'essai.
  const essai = restauration?.derniere ?? null;
  const saine = restauration?.derniereSaine ?? null;
  if (essai && essai.fait !== false && essai.saine === false) {
    ajouter('danger', 'restauration-malsaine', `La restauration d'essai du ${dateCourte(essai.fin)} n'est pas saine : ${(essai.problemes ?? []).join(' ; ') || 'voir la carte Sauvegardes'}.`);
  } else if (essai?.impossible) {
    ajouter('warning', 'restauration-impossible', `Restauration d'essai impossible le ${dateCourte(essai.fin)} : ${essai.impossible}.`);
  }
  if (!saine) {
    if (!essai) ajouter('warning', 'restauration-aucune', "Aucune restauration d'essai réussie pour l'instant : la première suit la prochaine sauvegarde.");
  } else if (joursEntre(jourParis(saine.fin), aujourdHui) > CADENCE.restaurationJours + 1) {
    ajouter('warning', 'restauration-retard', `Dernière restauration d'essai saine le ${dateCourte(saine.fin)} : plus d'une semaine.`);
  }

  // 3. La copie hors du disque.
  const hd = sauvegarde?.horsDisque ?? null;
  // Un essai compte s'il visait la destination en vigueur (quand elle est connue).
  const versIci = (essai) => {
    if (!essai || !horsDisque?.destination) return essai ?? null;
    return essai.destination && String(essai.destination).toLowerCase() === String(horsDisque.destination).toLowerCase() ? essai : null;
  };
  if (horsDisque?.reglage === 'non-configuree') {
    ajouter('warning', 'hors-disque-non-configuree', 'Copie hors du disque non réglée : choisissez OneDrive ou une clé USB dans Réglages › Sauvegardes.');
  } else if (horsDisque?.reglage === 'illisible') {
    ajouter('warning', 'hors-disque-reglage-illisible', `Choix de la destination hors disque illisible (${horsDisque.probleme ?? 'fichier abîmé'}) : rien ne part hors du disque ; choisissez de nouveau la destination dans Réglages › Sauvegardes.`);
  } else if (horsDisque?.reglage === 'configuree' && horsDisque.type === 'onedrive' && !horsDisque.destination) {
    ajouter('warning', 'hors-disque-onedrive-absent', `Copie hors disque vers OneDrive impossible : ${horsDisque.probleme ?? "OneDrive n'est pas détecté sur ce PC"}. Choisissez une clé USB ou un autre dossier dans Réglages › Sauvegardes.`);
  } else if (horsDisque?.reglage === 'configuree') {
    const t = versIci(hd?.derniereTentative ?? null);
    if (t?.statut === 'absente') {
      ajouter('warning', 'hors-disque-absente', t.type === 'onedrive' ? `Dossier OneDrive absent le ${dateCourte(t.fin)} (${t.destination}) : ${t.message ?? "rien n'a été copié"}.` : `Destination hors disque absente le ${dateCourte(t.fin)} (${t.destination}) : clé débranchée ? Rien n'a été copié.`);
    } else if (t?.statut === 'place-insuffisante') ajouter('warning', 'hors-disque-place', `Place insuffisante sur ${t.destination} le ${dateCourte(t.fin)} : ${t.message ?? 'rien n’a été copié'}.`);
    else if (t?.statut === 'erreur') ajouter('warning', 'hors-disque-erreur', `Copie hors disque en échec le ${dateCourte(t.fin)} : ${t.message ?? 'erreur'}.`);
    const faite = versIci(hd?.derniereReussie ?? null);
    if (!faite && !t) ajouter('warning', 'hors-disque-jamais', "Copie hors disque réglée mais pas encore faite : elle part avec la prochaine sauvegarde de nuit.");
    else if (faite && joursEntre(jourParis(faite.fin), aujourdHui) > CADENCE.horsDisqueJours + 1) {
      ajouter('warning', 'hors-disque-retard', `Dernière copie hors disque le ${dateCourte(faite.fin)} : plus d'une semaine.`);
    }
    if (faite?.memeDisque) ajouter('warning', 'hors-disque-meme-disque', `La destination ${faite.destination} est sur le même disque que la base : elle ne protège pas d'une panne de ce disque.`);
  }

  // 4. La place sur le disque des sauvegardes.
  if (disque?.niveau === 'insuffisante') {
    ajouter('danger', 'disque-plein', `Plus assez de place pour sauvegarder : ${go(disque.libre)} libres, il en faut ${go(disque.requis)} (2 × la base + 2 Go).`);
  } else if (disque?.niveau === 'surveiller') {
    ajouter('warning', 'disque-se-remplit', `Le disque se remplit : ${go(disque.libre)} libres ; la sauvegarde devient impossible sous ${go(disque.requis)}.`);
  }
  return alertes;
}
