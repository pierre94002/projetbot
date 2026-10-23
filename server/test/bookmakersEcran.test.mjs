/**
 * La page BOOKMAKERS SE REND (étape 31 du plan, 22/10/2026) : route /bookmakers, entrée du menu « Mes paris », cinq
 * cartes (meilleur moment, justesse, vitesse, marges, biais) et le contrôle du 23/09.
 *   node --test test/bookmakersEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-bookmakers.mjs plante, dans une copie isolée de la base
 * d'essai, 400 rencontres, leurs cotes archivées et 300 lignes football-data, lance le calcul de l'étape 22 (processus
 * à part), puis appelle GET /api/market-knowledge (application Express, sans réseau) : jamais calculé, prêt (tous les
 * championnats, un championnat), championnat inconnu, calcul d'une autre version. Le rendu est fait côté serveur, sans
 * navigateur (test/aides/rendu.mjs) : `fetch` remplacé — seule la route de la page répond, tout le reste est refusé
 * et compté.
 *
 *  1. La page prête : le bandeau (titre, chiffres clés, provenance et heure du calcul), les huit tableaux avec toutes
 *     leurs lignes, leurs Σ et ⌀ recomptés sur les lignes du serveur ; un seul appel, en lecture.
 *  2. Un championnat (?championnat=…) : l'adresse décide de la lecture, le championnat choisi est marqué.
 *  3. Les états sans chiffres (jamais calculé, serveur en erreur, serveur pas à jour, championnat inconnu) : la raison
 *     est dite, les huit tableaux gardent leurs en-têtes, leurs lignes et leur pied, et une case vide ne dit pas une
 *     cause qu'elle ne connaît pas ; le calcul d'une autre version est lu et signalé.
 *  4. Les favoris d'abord, le câblage de la page (adresse, relecture, réponse tardive) et l'hygiène des six fichiers.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, blocDe, corps, pied, entetes, tableauDe, texteDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const B = await imp(path.join(UI, 'src', 'utils', 'bookmakers.js'));

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-bookmakers.mjs'), { args: ['ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

/** Un nombre à la française, ses espaces fines ramenées à une espace (comme le texte rendu). */
const fr = (x, d = 0) => espaces(x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
const moyenne = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
const signe = (x, d = 1) => `${x < 0 ? '−' : '+'}${fr(Math.abs(x), d)}`;
/** Un motif dans du HTML : le message d'échec ne recopie jamais la page entière. */
const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const absent = (html, motif, message) => assert.ok(!motif.test(html), message ?? `motif présent : ${motif}`);
/** Les cellules d'une ligne de tableau : leur texte (espaces normalisées). */
const cellules = (ligne) => [...ligne.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => espaces(texteDe(m[1])));
/** La ligne d'un tableau qui porte data-livre="…" (ou data-portee="…"). */
const ligneDe = (tab, attribut, valeur) => corps(tab).find((x) => x.includes(`${attribut}="${valeur}"`)) ?? null;
/** Les classes de la balise ouvrante d'un élément (Vue range les classes dans l'ordre qu'il veut : on ne suppose rien). */
const classes = (html) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(/\s+/);
/** Les puces (cm-chip) d'un morceau de page : leurs classes et leur texte. */
const puces = (html) => [...html.matchAll(/<span class="([^"]*\bcm-chip\b[^"]*)"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => ({ classes: m[1].split(/\s+/), texte: espaces(texteDe(m[2])) }));

let s; // les réponses du serveur
let rendu;
let Page;
before(async () => {
  s = reponsesDuServeur();
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /BookmakersView\.vue$/, routes: ['/bookmakers'] });
  Page = (await rendu.charger('/src/views/BookmakersView.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});

const TOUS = /\/api\/market-knowledge$/;
const LIGUE = /\/api\/market-knowledge\?championnat=Ligue%20Essai$/;
const INCONNU = /\/api\/market-knowledge\?championnat=Championnat%20de%20nulle%20part$/;
/** Rend la page à l'adresse donnée ; la mémoire du routeur est remise à /bookmakers ensuite. */
async function page(reponse, { route = TOUS, adresse = '/bookmakers', avant = null } = {}) {
  await rendu.routeur.push(adresse);
  try {
    return await rendu.rendre(Page, {}, [[route, reponse]], { avant });
  } finally {
    await rendu.routeur.push('/bookmakers');
  }
}

/** Les huit tableaux de la page, dans l'ordre où ils apparaissent, leurs en-têtes et le nombre de lignes quand il est fixe. */
const TABLEAUX = [
  ['valeurs', ['Moment', 'Matchs', 'Valeur de clôture', 'Favori', 'Nul', 'Outsider'], 4],
  ['comparaisons', ['Comparaison', 'Matchs', 'Écart', 'Fourchette', 'Verdict'], 5],
  ['championnats', ['Championnat', 'Mieux vaut parier…', 'Matchs comparés'], null],
  ['justesse', ['Rang', 'Bookmaker', 'Matchs', 'Perte log sur ses matchs', 'Bat', 'Perd contre', 'À égalité', 'Face au meneur'], null],
  ['vitesse', ['Rang', 'Bookmaker', 'Matchs', 'Avance sur le marché', 'Devance', 'Est devancé par', 'À égalité', 'Face au meneur'], null],
  ['marges', ['Bookmaker', 'Ouverture', 'Relevé du vendredi ou du mardi', '3 h avant', 'Après les compositions', 'Juste avant', 'Clôture', 'Votre relevé payant'], null],
  ['biais', ['Bookmaker', 'Outsiders', 'Nuls', 'Domicile', 'Grandes équipes'], null],
  ['mesure-du-23-09', ['Rang', 'Bookmaker', 'Bat', 'Perd contre', 'À égalité', 'Face au meneur'], null]
];
const BLOCS = { 'meilleur-moment': ['valeurs', 'comparaisons', 'championnats'], justesse: ['justesse'], vitesse: ['vitesse'], marges: ['marges'], biais: ['biais'], 'mesure-du-23-09': ['mesure-du-23-09'] };

/** Ce que doit avoir TOUTE version de la page : ses six cartes, ses huit tableaux (en-têtes, Σ et ⌀), son bandeau, sa provenance. */
function structureDeLaPage(r) {
  const t = espaces(r.texte);
  trouve(r.html, /data-page="bookmakers"/);
  assert.ok(t.startsWith('Bookmakers '), 'le titre');
  assert.ok(t.includes('Championnat') && t.includes('Relire'));
  for (const [bloc, tableaux] of Object.entries(BLOCS)) {
    const b = blocDe(r.html, bloc);
    assert.ok(b, `la carte ${bloc}`);
    for (const nom of tableaux) assert.ok(b.includes(`data-tableau="${nom}"`), `${bloc} : le tableau ${nom}`);
  }
  for (const [nom, titres, n] of TABLEAUX) {
    const tab = tableauDe(r.html, nom);
    assert.ok(tab, `le tableau ${nom}`);
    assert.deepEqual(entetes(tab), titres, `${nom} : les en-têtes restent`);
    assert.ok(corps(tab).length >= 1, `${nom} : au moins une ligne`);
    if (n) assert.equal(corps(tab).length, n, `${nom} : ${n} lignes, mesurées ou non`);
    const [sigma, moy] = pied(tab).map((x) => espaces(texteDe(x)));
    assert.equal(pied(tab).length, 2, `${nom} : Σ et ⌀`);
    assert.ok(sigma.startsWith('Σ Total'), `${nom} : ${sigma}`);
    assert.ok(moy.startsWith('⌀ Moyenne'), `${nom} : ${moy}`);
  }
  // La provenance : le vrai fournisseur de chaque morceau, dans le bandeau et sous chacune des six cartes.
  const source = 'football-data.co.uk · ESPN · 365Scores · Kalshi · Smarkets · The Odds API';
  assert.equal(t.split(source).length - 1, 7, 'la source dite sept fois : le bandeau et les six cartes');
  assert.ok(!/Odds API \(cotes de marché\)|Cotes marché/.test(t), 'jamais « Cotes marché (Odds API) »');
  // Aucun bouton qui lance quoi que ce soit : « Relire » relit, les noms de championnat choisissent, les onglets changent de moment.
  const boutons = [...r.html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => espaces(texteDe(m[1])));
  assert.ok(boutons.includes('Relire'));
  assert.ok(!boutons.some((x) => /Lancer|Calculer|Recalculer|Actualiser|Supprimer|Envoyer/i.test(x)), `boutons : ${boutons.join(' | ')}`);
  absent(r.html, /<form\b/);
  return t;
}

// ================================================ 1. la page prête, tous les championnats

test('page prête — le bandeau : titre, chiffres clés lus dans le calcul, provenance et heure, un seul appel en lecture', options, async () => {
  const r = await page(s.pret);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, [], 'aucune autre lecture que celle de la page');
  assert.deepEqual(r.appels, ['GET http://localhost:4000/api/market-knowledge'], 'un seul appel, en lecture, sans paramètre pour « tous »');
  const t = structureDeLaPage(r);
  trouve(r.html, /data-etat="pret"/);
  const calcul = s.pret.corps.calcul;
  assert.ok(t.startsWith(`Bookmakers calcul n° ${fr(calcul.id)} Relire`), t.slice(0, 80));
  assert.ok(t.includes('Ce que les cotes archivées apprennent des bookmakers'));
  assert.ok(t.includes('Rien n’est calculé en ouvrant la page'), 'la page dit qu’elle ne calcule rien');
  assert.ok(t.includes('Championnat Tous les championnats'), 'le champ du championnat dit ce qui est lu');
  // Les quatre chiffres clés, tels que le calcul les donne.
  const cles = B.chiffresCles(s.pret.corps);
  assert.ok(t.includes(espaces(`Calcul ${cles.calcul.valeur} ${cles.calcul.detail}`)), cles.calcul.detail);
  assert.ok(t.includes(espaces(`Cotes lues ${cles.cotes.valeur} ${cles.cotes.detail}`)));
  assert.ok(t.includes(espaces(`Le plus juste ${cles.plusJuste.valeur} ${cles.plusJuste.detail}`)));
  assert.ok(t.includes(espaces(`Bouge le premier ${cles.premier.valeur} ${cles.premier.detail}`)));
  assert.equal(cles.plusJuste.valeur, 'Pinnacle (football-data)');
  assert.ok(t.includes(`Cotes lues ${fr(s.pret.corps.bilan.releves.cotes)} cotes lues sur ${fr(s.pret.corps.bilan.releves.rencontres)} rencontres`));
  // La provenance : le vrai fournisseur, l'heure du calcul (horloge figée au 22/10 18 h UTC), ancien dit en mots.
  assert.ok(t.includes('football-data.co.uk · ESPN · 365Scores · Kalshi · Smarkets · The Odds API calculé le 05/10 à 14:00 · il y a 17 jours'), 'le vrai fournisseur et l’heure');
  assert.equal((r.html.match(/\bprov is-ancien\b/g) ?? []).length, 7, 'ambre au-delà de 48 h : le bandeau et les six cartes');
  // La note de bas de page et le contrôle de la méthode.
  assert.ok(t.includes(s.pret.corps.regles.methode.slice(0, 60)));
  assert.ok(t.endsWith('Mesuré seulement : le moteur ne lit rien de cette page, aucun de ses chiffres n’en dépend.'));
  // Pas de note d'état au-dessus des cartes quand tout va bien.
  absent(r.html, /data-raison=/);
});

test('page prête — meilleur moment : conclusion, valeur de clôture par moment, tôt contre tard, championnat par championnat (Σ et ⌀ recomptés)', options, async () => {
  const r = await page(s.pret);
  const lignes = s.pret.corps.lignes;
  const m = B.meilleurMomentDuChampionnat({ lignes });
  const bloc = blocDe(r.html, 'meilleur-moment');
  trouve(bloc, /data-portee="\*"/);
  const t = espaces(texteDe(bloc));
  // La conclusion du serveur, en mots, sur son nombre de matchs.
  const conclusion = s.pret.corps.resume.moments.find((x) => x.championnat === '*');
  assert.equal(conclusion.conclusion, 'juste-avant', 'dans l’essai, le dernier quart d’heure est le meilleur moment');
  assert.ok(t.includes('Tous les championnats Juste avant le coup d’envoi'), 'le nom du championnat puis la puce de la conclusion');
  assert.ok(t.includes(`${conclusion.phrase.replace(/^./, (c) => c.toUpperCase())}. Sur ${fr(conclusion.n)} matchs comparés ; dernier quart d’heure.`), t.slice(0, 700));
  for (const type of ['favori', 'nul', 'outsider']) assert.ok(t.includes(`Pour un${type === 'nul' ? ' match' : ''} ${type === 'nul' ? 'nul' : type}`), `une phrase pour ${type}`);
  // La valeur de clôture : les quatre moments, mesurés ou non.
  const valeurs = corps(tableauDe(r.html, 'valeurs')).map(cellules);
  assert.deepEqual(valeurs.map((c) => c[0]), ['Ouverture', 'Relevé du vendredi ou du mardi', 'Après les compositions', 'Juste avant']);
  for (const [i, v] of m.valeurs.entries()) {
    if (v.mesure) assert.deepEqual(valeurs[i], [v.libelle, fr(v.n), v.texte, v.issuesTexte.favori, v.issuesTexte.nul, v.issuesTexte.outsider], v.moment);
    else assert.deepEqual(valeurs[i], [v.libelle, 'pas mesuré : pas de relevé daté à ce moment dans ce championnat'], `${v.moment} : non mesuré, dit avec sa cause`);
  }
  assert.ok(valeurs[0][2].startsWith('−'), 'une valeur de clôture négative a le vrai signe moins');
  assert.equal(valeurs[2].length, 2, 'un moment sans relevé daté : une seule case, dite');
  const [sigmaV, moyV] = pied(tableauDe(r.html, 'valeurs')).map(cellules);
  assert.deepEqual(sigmaV, ['Σ Total 3 moments mesurés sur 4', 'les mêmes matchs servent à plusieurs moments : pas de somme de matchs ni de valeurs']);
  const mesures = m.valeurs.filter((v) => v.mesure);
  assert.deepEqual(moyV, ['⌀ Moyenne des moments mesurés', '', `${signe(moyenne(mesures.map((v) => v.valeur)))} %`, ...['favori', 'nul', 'outsider'].map((x) => `${signe(moyenne(mesures.map((v) => v.issues[x])))} %`)]);
  // Tôt contre tard : cinq comparaisons, leur verdict en bleu quand l'écart est prouvé.
  const comp = corps(tableauDe(r.html, 'comparaisons'));
  assert.equal(comp.length, 5);
  for (const [i, c] of m.comparaisons.entries()) {
    const cel = cellules(comp[i]);
    assert.equal(cel[0], c.libelle);
    assert.equal(cel[1], c.n === null ? 'non lu' : fr(c.n));
    assert.equal(cel[2], c.ecartTexte);
    assert.equal(cel[3], c.fourchette ?? 'non mesurée');
    assert.equal(cel[4], c.dit);
    const verdict = puces(comp[i]).at(-1);
    assert.equal(verdict.texte, c.dit);
    assert.equal(verdict.classes.includes('is-info'), c.verdict === 'retenu' || c.verdict === 'moins-bon', `${c.tot}/${c.tard} : un écart prouvé est bleu, le reste sans ton`);
    assert.ok(!verdict.classes.includes('is-warning') || c.verdict === 'pas-assez-de-matchs');
  }
  assert.equal(m.comparaisons.filter((c) => c.verdict === 'retenu').length, 2, 'deux comparaisons prouvées dans l’essai');
  absent(tableauDe(r.html, 'comparaisons'), /\bis-(accent|danger)\b/, 'ni vert ni rouge');
  const [sigmaC, moyC] = pied(tableauDe(r.html, 'comparaisons')).map(cellules);
  assert.equal(sigmaC[0], espaces(`Σ Total ${m.pied.texte.comparaisonsSigma}`));
  assert.equal(sigmaC[1], 'jamais de somme d’écarts : la moyenne est sur la ligne suivante');
  const ecarts = m.comparaisons.filter((c) => c.mesuree).map((c) => c.ecart);
  assert.equal(moyC[1], `${signe(moyenne(ecarts), 2)} points`, '⌀ = la moyenne des écarts mesurés');
  // Championnat par championnat : « Tous » d'abord, puis les autres par ordre alphabétique, le championnat lu marqué.
  const champs = corps(tableauDe(r.html, 'championnats'));
  assert.deepEqual(champs.map((x) => /data-portee="([^"]*)"/.exec(x)[1]), ['*', 'EPL', 'Ligue Essai']);
  const [tous, epl, essai] = champs.map(cellules);
  assert.deepEqual(tous, ['Tous les championnats', 'Juste avant le coup d’envoi dernier quart d’heure', '700']);
  assert.deepEqual(epl, ['EPL', 'Juste avant le coup d’envoi dernier quart d’heure', '300']);
  assert.deepEqual(essai, ['Ligue Essai', 'Parier tôt relevé du vendredi ou du mardi', '400']);
  assert.ok(classes(champs[0].split('>')[0]).includes('is-choisi') && !classes(champs[1].split('>')[0]).includes('is-choisi'), 'seul le championnat lu est marqué');
  trouve(champs[0], /aria-pressed="true"/);
  trouve(champs[1], /aria-pressed="false"/);
  const [sigmaH, moyH] = pied(tableauDe(r.html, 'championnats')).map(cellules);
  assert.deepEqual(sigmaH, ['Σ Total 2 championnats, 2 mesurés', '1 tôt · 0 après les compositions · 1 juste avant · 0 sans moment prouvé', '700 matchs comparés']);
  assert.equal(sigmaH[2], `${fr(300 + 400)} matchs comparés`, 'Σ = les matchs de chaque championnat, ajoutés une seule fois');
  assert.deepEqual(moyH, ['⌀ Moyenne par championnat mesuré (« Tous les championnats » n’y est pas)', '', '350 matchs par championnat']);
  // Aide : on dit comment lire la valeur de clôture.
  assert.ok(t.includes('Elle est négative presque partout : c’est la marge du bookmaker.'));
});

test('page prête — qui est le plus juste, qui bouge le premier : une ligne par livre du meneur au dernier, le verdict face au meneur, Σ et ⌀', options, async () => {
  const r = await page(s.pret);
  const lignes = s.pret.corps.lignes;
  const livres = s.pret.corps.livres;
  for (const [mesure, moment, cle] of [['justesse', 'cloture', 'propres'], ['vitesse', 'releve', 'avance']]) {
    const bloc = blocDe(r.html, mesure);
    trouve(bloc, new RegExp(`data-moment="${moment}"`), `${mesure} : le moment proposé d’abord est le premier qui a un meneur`);
    const tab = tableauDe(r.html, mesure);
    const men = lignes[mesure].find((l) => l.cle === 'meneur' && l.moment === moment);
    const classement = men.detail.classement;
    const rangs = corps(tab);
    assert.equal(rangs.length, classement.length, `${mesure} : une ligne par livre`);
    const c = B.classementDuMoment({ lignes, livres, mesure, moment });
    for (const [i, x] of classement.entries()) {
      const propres = lignes[mesure].find((l) => l.moment === moment && l.livre === x.livre && l.cle === cle);
      const cel = cellules(rangs[i]);
      assert.equal(cel[0], String(i + 1), `${mesure} ${x.livre} : le rang`);
      assert.equal(cel[1], `${B.titreDuLivre(x.livre, livres)} ${B.typeDuLivre(x.livre, livres).texte}`, `${mesure} : le titre et le type`);
      assert.equal(cel[2], fr(propres.n));
      assert.equal(cel[3], mesure === 'justesse' ? fr(propres.valeur, 4) : espaces(B.avanceDite(propres.valeur)));
      assert.deepEqual(cel.slice(4, 7), [String(x.victoires), String(x.defaites), String(x.egalites)]);
      trouve(rangs[i], new RegExp(`data-livre="${x.livre.replace('|', '\\|')}"`), `${mesure} : la ligne porte son livre`);
      if (i === 0) {
        assert.equal(cel[7], 'le meneur');
        assert.ok(classes(rangs[0].split('>')[0]).includes('is-meneur'));
      } else {
        const face = lignes[mesure].find((l) => l.moment === moment && l.livre === men.livre && l.cle === `face|${x.livre}`);
        if (face) assert.ok(cel[7].startsWith(face.detail.dit), `${mesure} ${x.livre} : ${cel[7]}`);
        else assert.ok(cel[7].startsWith('pas comparé au meneur : moins de 200 matchs en commun'), `${mesure} ${x.livre} : ${cel[7]}`);
      }
      if (c.lignes[i].type.cle === 'bourse') assert.ok(rangs[i].includes('is-violet'), `${x.livre} : une bourse a sa couleur`);
    }
    // Les bourses : Kalshi et Betfair Exchange sont dites bourses, DraftKings un bookmaker, la moyenne une moyenne.
    assert.ok(rangs.some((x) => cellules(x)[1] === 'Kalshi (bourse) bourse' || mesure === 'vitesse'));
    // Le pied : Σ victoires = Σ défaites, ⌀ de chaque colonne.
    const [sigma, moy] = pied(tab).map(cellules);
    assert.equal(sigma[0], espaces(`Σ Total ${c.pied.texte.sigma}`));
    assert.equal(sigma[1], espaces(c.pied.texte.cotes));
    assert.equal(sigma[2], 'somme sans objet', 'jamais une somme de pertes log');
    assert.deepEqual(sigma.slice(3, 6), [String(c.pied.sigma.bat), String(c.pied.sigma.perd), String(c.pied.sigma.egal)]);
    assert.equal(sigma[3], sigma[4], `${mesure} : Σ victoires = Σ défaites`);
    assert.equal(sigma[6], 'une victoire est la défaite d’un autre');
    assert.equal(moy[0], '⌀ Moyenne chaque livre compte pour un');
    assert.deepEqual(moy.slice(1, 4), [c.pied.texte.n, c.pied.texte.valeur, c.pied.texte.bat].map(espaces));
  }
  // Le meneur de la justesse est dit en une phrase ; celui de la vitesse aussi.
  const t = espaces(r.texte);
  assert.ok(t.includes('Clôture : Pinnacle (football-data) est le plus juste — il bat 3 livres sur 3 sur leurs matchs communs.'));
  assert.ok(t.includes('Relevé du vendredi ou du mardi : Moyenne du marché (football-data) bouge le premier — il devance 3 livres sur 3 sur leurs matchs communs.'));
  assert.ok(t.includes('À quel moment du prix ?'));
  // Les moments proposés : ceux de la mesure, ni plus ni moins.
  const onglets = (b) => [...b.matchAll(/<button\b[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => espaces(texteDe(m[1])));
  assert.deepEqual(onglets(blocDe(r.html, 'justesse')), ['Clôture', 'Relevé du vendredi ou du mardi', 'Ouverture', 'Votre relevé payant']);
  assert.deepEqual(onglets(blocDe(r.html, 'vitesse')), ['Relevé du vendredi ou du mardi', '3 h avant']);
  assert.deepEqual(onglets(blocDe(r.html, 'biais')), ['Clôture', 'Votre relevé payant']);
});

test('page prête — marges et biais : une ligne par livre, une bourse montre sa commission, le vrai signe moins, Σ et ⌀ recomptés', options, async () => {
  const r = await page(s.pret);
  const lignes = s.pret.corps.lignes;
  const livres = s.pret.corps.livres;
  // --- les marges : sept colonnes de moments, « pas coté » quand le livre n'a pas de cote à ce moment.
  const marges = tableauDe(r.html, 'marges');
  const brutes = lignes.marges.filter((l) => l.cle === 'marge');
  const rangs = corps(marges);
  assert.equal(rangs.length, new Set(brutes.map((l) => l.livre)).size, 'une ligne par livre mesuré');
  for (const l of brutes) {
    const ligne = ligneDe(marges, 'data-livre', l.livre);
    assert.ok(ligne, `${l.livre} : sa ligne`);
    const cel = cellules(ligne);
    const texte = cel[1 + B.MOMENTS_DE_MARGE.indexOf(l.moment)];
    if (l.valeur === null) assert.match(texte, /^(commission \d+ %|sans marge) [\d  ]+ matchs$/, `${l.livre} ${l.moment} : une bourse ne montre pas de marge`);
    else assert.equal(texte, `${fr(l.valeur, 1)} % ${fr(l.n)} matchs`, `${l.livre} ${l.moment}`);
  }
  const betfair = cellules(ligneDe(marges, 'data-livre', 'fd|Betfair Exchange'));
  assert.equal(betfair[0], 'Betfair Exchange (football-data) bourse');
  assert.equal(betfair[6], 'commission 5 % 400 matchs');
  assert.equal(betfair[3], 'pas coté', 'pas de relevé trois heures avant : dit, pas laissé vide');
  assert.equal(cellules(ligneDe(marges, 'data-livre', 'kalshi|Kalshi'))[6], 'sans marge 400 matchs');
  const marge = (livre) => cellules(ligneDe(marges, 'data-livre', livre))[6];
  assert.equal(marge('fd|Pinnacle'), '4,0 % 300 matchs', 'Pinnacle garde peu, à la clôture');
  assert.ok(brutes.filter((l) => l.moment === 'cloture' && l.valeur !== null).length >= 4);
  // Du moins cher au plus cher, à la clôture.
  const chers = rangs.map((x) => cellules(x)[6]).map((x) => (/^(\d+,\d) %/.exec(x) ? Number(/^(\d+),(\d)/.exec(x).slice(1).join('.')) : null)).filter((x) => x !== null);
  assert.deepEqual(chers, [...chers].sort((a, b) => a - b), 'du moins cher au plus cher');
  const [sigmaM, moyM] = pied(marges).map(cellules);
  for (const [i, m] of B.MOMENTS_DE_MARGE.entries()) {
    const du = brutes.filter((l) => l.moment === m);
    assert.equal(sigmaM[1 + i], du.length ? `${fr(du.reduce((t, l) => t + l.n, 0))} cotes` : 'aucune cote', `Σ ${m}`);
    const vals = du.map((l) => l.valeur).filter((x) => x !== null);
    assert.equal(moyM[1 + i], vals.length ? `${fr(moyenne(vals), 1)} %` : 'pas de moyenne', `⌀ ${m} : les bourses n’y sont pas`);
  }
  // --- les biais : quatre colonnes, l'écart signé en points, ce que dit le juge, le nombre de matchs.
  const biais = tableauDe(r.html, 'biais');
  const du = lignes.biais.filter((l) => l.moment === 'cloture');
  assert.equal(corps(biais).length, new Set(du.map((l) => l.livre)).size);
  for (const l of du) {
    const cel = cellules(ligneDe(biais, 'data-livre', l.livre));
    const i = 1 + Object.keys(B.CATEGORIES_DE_BIAIS).indexOf(l.cle);
    assert.equal(cel[i], `${signe(l.valeur, 1)} point${Math.abs(l.valeur) >= 2 ? 's' : ''} ${l.detail.dit} · ${fr(l.n)} matchs`, `${l.livre} ${l.cle}`);
  }
  const gros = du.find((l) => l.cle === 'grandes-equipes');
  assert.ok(gros, 'des grandes équipes mesurées dans l’essai');
  const ligneGros = ligneDe(biais, 'data-livre', gros.livre);
  assert.match(cellules(ligneGros)[4], /^\+6,0 points trop peu de matchs pour juger · 60 matchs$/, 'un échantillon maigre est dit en toutes lettres');
  assert.ok(/cm-chip[^"]*is-warning|is-warning[^"]*cm-chip/.test(ligneGros), 'ambre pour trop peu de matchs');
  assert.ok(du.some((l) => l.valeur < 0), 'un écart négatif dans l’essai');
  assert.ok(cellules(ligneDe(biais, 'data-livre', 'fd|Betfair Exchange'))[2].startsWith('−0,7 point pas de biais prouvé'), 'le vrai signe moins, jamais un tiret');
  absent(biais, /\bis-(accent|danger)\b/, 'un biais n’est pas une erreur : ni vert ni rouge');
  const [sigmaB, moyB] = pied(biais).map(cellules);
  for (const [i, cat] of Object.keys(B.CATEGORIES_DE_BIAIS).entries()) {
    const d = du.filter((l) => l.cle === cat);
    const prouves = d.filter((l) => l.verdict === 'retenu' || l.verdict === 'moins-bon').length;
    assert.equal(sigmaB[1 + i], `${fr(d.reduce((t, l) => t + l.n, 0))} cotes · ${prouves} biais prouvé${prouves > 1 ? 's' : ''}`, `Σ ${cat}`);
    assert.equal(moyB[1 + i], `${signe(moyenne(d.map((l) => l.valeur)), 1)} point${Math.abs(moyenne(d.map((l) => l.valeur))) >= 2 ? 's' : ''}`, `⌀ ${cat}`);
  }
  assert.equal(titres(marges).length, rangs.length);
  function titres(tab) {
    return corps(tab).map((x) => cellules(x)[0]);
  }
  assert.ok(titres(marges).every((x) => / (bookmaker|bourse|moyenne)$/.test(x)), 'chaque livre dit s’il est un bookmaker, une bourse ou une moyenne');
  assert.ok(livres.length >= 7);
});

test('vos bookmakers portent leur NOM — « Winamax (FR) », « PMU », « Betclic », « Unibet (FR) », « Winamax (DE) », « Betfair Exchange (EU) » — et aucune clé « mot_mot » n’apparaît dans le texte de la page', options, async () => {
  // Les clés brutes de The Odds API rangées dans la base, et le nom que la page doit en dire.
  const NOMS = { winamax_fr: 'Winamax (FR)', pmu_fr: 'PMU', betclic_fr: 'Betclic', unibet_fr: 'Unibet (FR)', winamax_de: 'Winamax (DE)', betfair_ex_eu: 'Betfair Exchange (EU)', onexbet: '1xBet', mybookieag: 'MyBookie.ag', pinnacle: 'Pinnacle' };
  const pages = [
    ['tous les championnats', await page(s.pret)],
    ['un championnat', await page(s.ligue, { route: LIGUE, adresse: '/bookmakers?championnat=Ligue%20Essai' })]
  ];
  for (const [quoi, r] of pages) {
    assert.deepEqual(r.avertissements, [], quoi);
    const t = espaces(r.texte);
    // Aucune clé de l'API dans le texte : ni « mot_mot », ni la clé seule (« onexbet », « pinnacle » en minuscules).
    assert.doesNotMatch(t, /\b[a-z0-9]+_[a-z0-9_]+\b/, `${quoi} : une clé « mot_mot » dans le texte`);
    for (const cle of Object.keys(NOMS)) assert.ok(!new RegExp(`(^|[^A-Za-z.])${cle}([^A-Za-z]|$)`).test(t), `${quoi} : la clé brute « ${cle} » dans le texte`);
    // Les infobulles (title) disent les noms aussi : seule la clé du livre reste dans l'attribut data-livre.
    assert.doesNotMatch(r.html.replace(/data-livre="[^"]*"/g, ''), /\b(winamax_fr|pmu_fr|betclic_fr|unibet_fr|winamax_de|betfair_ex_eu|onexbet|mybookieag)\b/, `${quoi} : une clé brute dans une infobulle ou un attribut`);
    // Chaque bookmaker, dans le tableau des marges, sous son nom (la source reste dite : Pinnacle de vos bookmakers n'est pas celui de football-data).
    const marges = tableauDe(r.html, 'marges');
    for (const [cle, nomDit] of Object.entries(NOMS)) {
      const ligne = ligneDe(marges, 'data-livre', `odds-api|${cle}`);
      assert.ok(ligne, `${quoi} : la ligne de ${cle}`);
      assert.equal(cellules(ligne)[0].replace(/ (bookmaker|bourse|moyenne)$/, ''), `${nomDit} (vos bookmakers)`, `${quoi} : ${cle}`);
    }
    assert.ok(t.includes('Pinnacle (football-data)') && t.includes('Pinnacle (vos bookmakers)'), `${quoi} : les deux Pinnacle restent distincts`);
  }
  // Les noms de Réglages, mot pour mot (la carte « Vos bookmakers » dit les mêmes).
  const t = espaces(pages[0][1].texte);
  for (const nomDit of ['Winamax (FR) (vos bookmakers)', 'PMU (vos bookmakers)', 'Betclic (vos bookmakers)', 'Unibet (FR) (vos bookmakers)', 'Winamax (DE) (vos bookmakers)', 'Betfair Exchange (EU) (vos bookmakers)']) assert.ok(t.includes(nomDit), nomDit);
  // Les autres états de la page ne montrent pas non plus de clé brute (la page reste entière sans chiffres).
  for (const reponse of [s.jamais, s.inconnu, s.autreVersion]) {
    const r = await page(reponse);
    assert.doesNotMatch(espaces(r.texte), /\b[a-z0-9]+_[a-z0-9_]+\b/);
  }
});

test('le championnat se dit dans les cartes par le nom que l’appli lui donne dans ses listes — « Besta deildin (ISL) », « EPL (ENG) » — jamais le libellé brut « Besta deildin - Iceland »', options, async () => {
  for (const [brut, dit] of [['Besta deildin - Iceland', 'Besta deildin (ISL)'], ['EPL', 'EPL (ENG)'], ['Tous les championnats', 'Tous les championnats']]) {
    const variante = JSON.parse(JSON.stringify(s.ligue));
    variante.corps.portee = brut === 'Tous les championnats' ? '*' : brut;
    variante.corps.nom = brut;
    if (brut !== 'Tous les championnats') variante.corps.championnats = [...variante.corps.championnats, { portee: brut, nom: brut, horsAppli: false, lignes: 3 }];
    const adresse = brut === 'Tous les championnats' ? '/bookmakers' : `/bookmakers?championnat=${encodeURIComponent(brut)}`;
    const route = brut === 'Tous les championnats' ? TOUS : new RegExp(`/api/market-knowledge\\?championnat=${encodeURIComponent(brut).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const r = await page(variante, { route, adresse });
    const t = espaces(r.texte);
    assert.deepEqual(r.avertissements, [], brut);
    assert.ok(t.includes(`${dit} · à la clôture (le dernier prix avant le coup d’envoi)`), `${brut} : la carte de justesse dit « ${dit} »`);
    assert.ok(t.includes(`${dit} · au relevé du vendredi ou du mardi`), `${brut} : la carte de vitesse`);
    assert.ok(t.includes(`Championnat ${brut.includes(' - ') ? brut.split(' - ')[0] : brut}`), `${brut} : le champ du haut garde le nom du badge (sans le pays du libellé brut)`);
    // Le libellé brut avec son pays (« Besta deildin - Iceland ») ne reste nulle part dans le texte.
    if (brut.includes(' - ')) assert.ok(!t.includes(brut), `${brut} : le libellé brut dans le texte`);
  }
});

test('page prête — le contrôle du 23/09 : le panier absent de l’essai est dit, la référence aussi, le tableau garde sa structure', options, async () => {
  const r = await page(s.pret);
  const bloc = blocDe(r.html, 'mesure-du-23-09');
  const t = espaces(texteDe(bloc));
  assert.ok(t.includes('Retrouve-t-on la mesure du 23/09 ?'));
  trouve(bloc, /data-etat-repro/);
  assert.ok(t.includes('pas retrouvée Pas retrouvé : le panier de matchs du 23/09 (18 championnats rattachés) n’est pas là.'), t.slice(0, 600));
  assert.ok(t.includes('Le 23/09 Pinnacle (football-data) perte log 0,9925 sur 15 885 matchs'));
  assert.ok(t.includes('Aujourd’hui pas mesuré le panier de matchs du 23/09 manque'));
  assert.ok(t.includes('Période 01/07/2023 → 23/09/2026'));
  assert.ok(t.includes('Référence du 23/09 : valueFinder.js (mesure du 23/09/2026) : Pinnacle, perte log 0,9925 sur 15 885 matchs'), 'la source de la référence, dite');
  const tab = tableauDe(r.html, 'mesure-du-23-09');
  assert.deepEqual(corps(tab).map(cellules), [['aucun livre à classer']], 'une ligne vide : ce que le tableau a, pas « dans ce championnat »');
  const [sigma, moy] = pied(tab).map(cellules);
  assert.deepEqual(sigma, ['Σ Total 0 livre du panier du 23/09', '0', '0', '0', 'une victoire est la défaite d’un autre']);
  assert.deepEqual(moy, ['⌀ Moyenne chaque livre compte pour un', 'pas de moyenne', 'pas de moyenne', 'pas de moyenne', '']);
  absent(bloc, /\bis-(accent|danger)\b/, 'ni vert ni rouge');
  trouve(bloc, /cm-chip[^"]*is-warning|is-warning[^"]*cm-chip/, '« pas retrouvée » est ambre');
});

// ================================================ 2. un championnat

test('un championnat — l’adresse décide de la lecture (?championnat=Ligue Essai), le championnat lu est marqué, les tableaux ne montrent que ses lignes', options, async () => {
  const r = await page(s.ligue, { route: LIGUE, adresse: '/bookmakers?championnat=Ligue%20Essai' });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels, ['GET http://localhost:4000/api/market-knowledge?championnat=Ligue%20Essai'], 'la lecture porte le championnat de l’adresse');
  const t = structureDeLaPage(r);
  trouve(r.html, /data-etat="pret"/);
  assert.ok(t.includes('Championnat Ligue Essai'), 'le champ montre le championnat lu');
  trouve(blocDe(r.html, 'meilleur-moment'), /data-portee="Ligue Essai"/);
  const mm = espaces(texteDe(blocDe(r.html, 'meilleur-moment')));
  assert.ok(mm.includes('Ligue Essai Parier tôt'), 'le nom du championnat puis sa conclusion');
  // La ligne du championnat lu est marquée, pas celle de « Tous ».
  const champs = corps(tableauDe(r.html, 'championnats'));
  const essai = champs.find((x) => x.includes('data-portee="Ligue Essai"'));
  const tous = champs.find((x) => x.includes('data-portee="*"'));
  assert.ok(classes(essai.split('>')[0]).includes('is-choisi'));
  assert.ok(!classes(tous.split('>')[0]).includes('is-choisi'));
  trouve(essai, /aria-pressed="true"/);
  // Les tableaux : les lignes de CE championnat (400 matchs), pas celles du total (700).
  const lignes = s.ligue.corps.lignes;
  const men = lignes.justesse.find((l) => l.cle === 'meneur' && l.moment === 'cloture');
  const rangs = corps(tableauDe(r.html, 'justesse'));
  assert.equal(rangs.length, men.detail.classement.length);
  const propres = lignes.justesse.filter((l) => l.cle === 'propres' && l.moment === 'cloture');
  for (const l of propres) assert.equal(cellules(ligneDe(tableauDe(r.html, 'justesse'), 'data-livre', l.livre))[2], fr(l.n));
  assert.ok(propres.every((l) => l.n <= 400), 'au plus les 400 matchs du championnat');
  const valeurs = corps(tableauDe(r.html, 'valeurs')).map(cellules);
  assert.equal(valeurs[1][1], '400', 'le relevé du vendredi ou du mardi : 400 matchs, pas 700');
  // La liste des championnats reste entière : on peut en choisir un autre.
  assert.deepEqual(champs.map((x) => /data-portee="([^"]*)"/.exec(x)[1]), ['*', 'EPL', 'Ligue Essai']);
});

test('le moment proposé d’abord est le premier qui a des chiffres — sans meneur à la clôture, la justesse s’ouvre sur le suivant, les biais aussi ; l’onglet choisi reste cohérent avec le tableau', options, async () => {
  const lignes = s.pret.corps.lignes;
  const premier = (liste, moments, aMeneur) => moments.find((m) => liste.some((l) => l.moment === m && (!aMeneur || l.cle === 'meneur')));
  const sansCloture = JSON.parse(JSON.stringify(s.pret));
  sansCloture.corps.lignes.justesse = sansCloture.corps.lignes.justesse.filter((l) => l.moment !== 'cloture');
  sansCloture.corps.lignes.biais = sansCloture.corps.lignes.biais.filter((l) => l.moment !== 'cloture');
  const attenduJustesse = premier(sansCloture.corps.lignes.justesse, B.MOMENTS_DE_JUSTESSE, true);
  const attenduBiais = premier(sansCloture.corps.lignes.biais, B.MOMENTS_DE_BIAIS, false);
  assert.notEqual(attenduJustesse, 'cloture');
  assert.notEqual(attenduBiais, 'cloture');
  const r = await page(sansCloture);
  assert.deepEqual(r.avertissements, []);
  trouve(blocDe(r.html, 'justesse'), new RegExp(`data-moment="${attenduJustesse}"`), 'la justesse s’ouvre sur le premier moment qui a un meneur');
  trouve(blocDe(r.html, 'biais'), new RegExp(`data-moment="${attenduBiais}"`), 'les biais sur le premier moment qui a des lignes');
  const men = sansCloture.corps.lignes.justesse.find((l) => l.cle === 'meneur' && l.moment === attenduJustesse);
  assert.equal(corps(tableauDe(r.html, 'justesse')).length, men.detail.classement.length, 'le tableau est celui du moment affiché');
  const biaisDuMoment = new Set(sansCloture.corps.lignes.biais.filter((l) => l.moment === attenduBiais).map((l) => l.livre));
  assert.equal(corps(tableauDe(r.html, 'biais')).length, biaisDuMoment.size);
  // Ce qui est en place reste : avec les chiffres de la clôture, c'est la clôture (le premier moment proposé).
  const normal = await page(s.pret);
  trouve(blocDe(normal.html, 'justesse'), /data-moment="cloture"/);
  trouve(blocDe(normal.html, 'biais'), /data-moment="cloture"/);
  assert.ok(lignes.biais.some((l) => l.moment === 'cloture'));
});

test('un championnat où rien n’a pu être comparé (n = 0) — la carte dit « trop peu de matchs pour juger », jamais « pas de moment meilleur prouvé », et la liste le range avec les non mesurés', options, async () => {
  // Ce que le calcul range pour 20 championnats sur 75 dans la vraie base : une conclusion à 0 match, des valeurs de clôture sur quelques matchs.
  const variante = JSON.parse(JSON.stringify(s.ligue));
  variante.corps.lignes.moments = variante.corps.lignes.moments
    .filter((l) => l.cle === 'valeur' || l.cle === 'conclusion')
    .map((l) => (l.cle === 'conclusion' ? { ...l, n: 0, verdict: 'trop-peu', detail: { conclusion: null, phrase: 'trop peu de matchs pour juger', jugees: 0, type: 'une issue au hasard', comparaisons: [] } } : l));
  variante.corps.resume.moments = variante.corps.resume.moments.map((m) => (m.championnat === 'Ligue Essai' ? { ...m, conclusion: null, phrase: 'trop peu de matchs pour juger', n: 0, comparaisons: [] } : m));
  const r = await page(variante, { route: LIGUE, adresse: '/bookmakers?championnat=Ligue%20Essai' });
  assert.deepEqual(r.avertissements, []);
  const bloc = blocDe(r.html, 'meilleur-moment');
  const t = espaces(texteDe(bloc));
  assert.ok(t.includes('Ligue Essai Trop peu de matchs pour juger Pas mesuré : trop peu de cotes archivées et datées dans ce championnat pour comparer les moments.'), t.slice(0, 500));
  assert.ok(!puces(bloc).some((p) => p.texte === 'Pas de moment meilleur prouvé'), 'rien n’a été comparé : aucune puce ne dit qu’on n’a rien trouvé');
  assert.deepEqual(puces(bloc).map((p) => p.texte).slice(0, 1), ['Trop peu de matchs pour juger'], 'la puce de la conclusion');
  assert.ok(!/Pour un (favori|match nul|outsider)/.test(t), 'aucune phrase par type d’issue sans comparaison');
  const valeurs = corps(tableauDe(r.html, 'valeurs')).map(cellules);
  assert.ok(valeurs.some((c) => c.length === 6), 'les moments qui ont des cotes gardent leur valeur de clôture');
  assert.ok(corps(tableauDe(r.html, 'comparaisons')).map(cellules).every((c) => c[1] === 'non lu'), 'aucune comparaison lue');
  const champs = corps(tableauDe(r.html, 'championnats')).map(cellules);
  assert.deepEqual(champs.find((c) => c[0] === 'Ligue Essai'), ['Ligue Essai', 'pas assez de relevés datés aucune comparaison tôt / tard possible ici', 'non mesuré']);
  assert.equal(pied(tableauDe(r.html, 'championnats')).map(cellules)[0][0], 'Σ Total 2 championnats, 1 mesuré', 'seuls les championnats comparés sont mesurés');
});

test('un lien vers un championnat inconnu — la page le dit, les tableaux restent, le champ garde son nom et la liste permet d’en choisir un autre', options, async () => {
  const r = await page(s.inconnu, { route: INCONNU, adresse: '/bookmakers?championnat=Championnat%20de%20nulle%20part' });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  trouve(r.html, /data-etat="championnat-inconnu"/);
  const t = structureDeLaPage(r);
  trouve(r.html, /data-raison="championnat-inconnu"/);
  assert.ok(t.includes('Championnat inconnu Le calcul n’a rien mesuré pour « Championnat de nulle part » : choisissez un autre championnat.'));
  assert.ok(t.includes('Championnat Championnat de nulle part'), 'le champ garde le nom demandé au lieu de « Choisir… »');
  assert.ok(!t.includes('Choisir…'));
  // Le calcul existe (son heure se lit) ; les cases vides ne prétendent pas savoir pourquoi.
  assert.ok(t.includes('calculé le 05/10 à 14:00'));
  const valeurs = corps(tableauDe(r.html, 'valeurs')).map(cellules);
  assert.ok(valeurs.every((c) => c.length === 2 && c[1] === 'championnat non mesuré'), 'les quatre moments disent « championnat non mesuré »');
  assert.deepEqual(corps(tableauDe(r.html, 'justesse')).map(cellules), [['championnat non mesuré']]);
  assert.deepEqual(corps(tableauDe(r.html, 'marges')).map(cellules), [['championnat non mesuré']]);
  assert.ok(t.includes('Pas mesuré à la clôture (le dernier prix avant le coup d’envoi) pour Championnat de nulle part : championnat non mesuré.'), 'jamais « aucun bookmaker n’a assez de matchs » : on ne le sait pas');
  assert.ok(!t.includes('trop peu de relevés datés') && !t.includes('pas de relevé daté à ce moment'), 'aucune cause inventée');
  // La liste des championnats mesurés reste là pour en choisir un autre.
  const champs = corps(tableauDe(r.html, 'championnats'));
  assert.deepEqual(champs.map((x) => /data-portee="([^"]*)"/.exec(x)[1]), ['*', 'EPL', 'Ligue Essai']);
  // Le contrôle du 23/09 ne dépend pas du championnat : sa ligne vide ne parle pas de championnat.
  assert.deepEqual(corps(tableauDe(r.html, 'mesure-du-23-09')).map(cellules), [['aucun livre à classer']]);
});

// ================================================ 3. les états sans chiffres

const CAS = [
  ['jamais', s_ => s_.jamais, /Pas encore mesuré Le marché n’a pas encore été mesuré : la prochaine passe de nuit de l’actualisation le fera/, 'pas encore mesuré'],
  ['erreur', () => ({ code: 500, corps: { error: 'Erreur interne du serveur.' } }), /Bookmakers illisibles Erreur interne du serveur\. Les tableaux ci-dessous restent affichés, sans valeurs\./, 'illisible : voir l’erreur plus haut'],
  ['pas-a-jour-serveur', () => ({ code: 404, corps: { error: 'Route introuvable : GET /api/market-knowledge' } }), /Serveur à relancer Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer cette fonction\./, 'serveur à relancer']
];

test('sans chiffres (jamais calculé, serveur en erreur, serveur pas à jour) — la raison est dite, les huit tableaux gardent en-têtes, lignes et pied, et chaque case vide dit ce qu’elle sait, pas une cause inventée', options, async () => {
  for (const [cle, reponse, motif, vide] of CAS) {
    const r = await page(reponse(s));
    assert.deepEqual(r.avertissements, [], cle);
    assert.deepEqual(rendu.interdits, [], cle);
    trouve(r.html, new RegExp(`data-etat="${cle}"`), cle);
    const t = structureDeLaPage(r);
    assert.match(t, motif, cle);
    trouve(r.html, new RegExp(`<div class="[^"]*\\bcm-note\\b[^"]*" role="alert" data-raison="${cle}"`), `${cle} : la note d’état porte sa raison`);
    // Le bandeau : pas de calcul, pas d'heure, et le dit.
    assert.ok(t.startsWith('Bookmakers aucun calcul Relire'), cle);
    assert.ok(t.includes('Calcul aucun pas encore mesuré'), cle);
    assert.ok(t.includes('Cotes lues non lu pas encore mesuré'), cle);
    assert.ok(t.includes('Le plus juste non lu pas encore mesuré'), cle);
    assert.equal(t.split('heure du calcul inconnue').length - 1, 7, `${cle} : sept provenances, aucune heure inventée`);
    assert.ok(!t.includes('calculé le'), `${cle}`);
    // Les tableaux : leurs lignes fixes disent `vide`, les autres une seule ligne qui le dit.
    const valeurs = corps(tableauDe(r.html, 'valeurs')).map(cellules);
    assert.deepEqual(valeurs.map((c) => c.length), [2, 2, 2, 2], cle);
    assert.ok(valeurs.every((c) => c[1] === vide), `${cle} : les quatre moments disent « ${vide} »`);
    const comp = corps(tableauDe(r.html, 'comparaisons')).map(cellules);
    assert.equal(comp.length, 5);
    assert.ok(comp.every((c) => c[1] === 'non lu' && c[2] === 'pas mesuré' && c[3] === 'non mesurée' && c[4] === vide), `${cle} : les cinq comparaisons disent « ${vide} »`);
    for (const nom of ['justesse', 'vitesse', 'marges', 'biais']) assert.deepEqual(corps(tableauDe(r.html, nom)).map(cellules), [[vide]], `${cle} ${nom}`);
    assert.deepEqual(corps(tableauDe(r.html, 'mesure-du-23-09')).map(cellules), [[vide]], `${cle} : le contrôle`);
    const champs = corps(tableauDe(r.html, 'championnats')).map(cellules);
    assert.equal(champs.length, 2, `${cle} : « Tous » puis la ligne qui dit qu’aucun autre n’est mesuré`);
    assert.deepEqual(champs[0], ['Tous les championnats', vide, 'non mesuré']);
    assert.equal(champs[1][0], 'Aucun autre championnat mesuré pour l’instant.');
    // Les pieds disent « aucune cote », « pas de moyenne » : jamais un faux zéro de moyenne.
    assert.ok(pied(tableauDe(r.html, 'marges')).map(cellules).every((l) => l.slice(1).every((x) => x === 'aucune cote' || x === 'pas de moyenne')), cle);
    assert.deepEqual(pied(tableauDe(r.html, 'valeurs')).map(cellules)[1], ['⌀ Moyenne des moments mesurés', '', 'pas de moyenne', 'pas de moyenne', 'pas de moyenne', 'pas de moyenne']);
    // Les phrases de cause : ni « aucun bookmaker n'a assez de matchs » ni « pas de relevé daté » sans lecture.
    assert.ok(!/aucun bookmaker n’a assez de matchs|pas de relevé daté|trop peu de cotes archivées|trop peu de relevés datés/.test(t), `${cle} : aucune cause inventée`);
    assert.ok(t.includes(`Pas mesuré : ${vide}.`), `${cle} : la conclusion dit ce qu’elle sait`);
    assert.ok(t.includes(`Pas mesuré à la clôture (le dernier prix avant le coup d’envoi) pour Tous les championnats : ${vide}.`), `${cle} : le classement aussi`);
    // Le bouton « Relire » reste actif : c'est ainsi qu'on réessaie.
    absent(r.html, /<button[^>]*disabled[^>]*>[\s\S]*?Relire/, `${cle} : « Relire » reste actif`);
  }
});

test('un calcul d’une autre version — ses chiffres sont lus et la page dit qu’il sera refait à la prochaine nuit', options, async () => {
  const r = await page(s.autreVersion);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  const t = structureDeLaPage(r);
  trouve(r.html, /data-etat="pret"/);
  trouve(r.html, /data-raison="autre-version"/);
  assert.ok(t.includes('Calcul d’une autre version Le calcul lu a été fait par une autre forme du calcul : la prochaine passe de nuit le refait. Ses chiffres restent lus en attendant.'));
  // Les mêmes chiffres que la page prête : seule la note change.
  const prete = await page(s.pret);
  for (const nom of ['valeurs', 'justesse', 'vitesse', 'marges', 'biais']) assert.deepEqual(corps(tableauDe(r.html, nom)).map(cellules), corps(tableauDe(prete.html, nom)).map(cellules), nom);
  assert.ok(t.includes('Clôture : Pinnacle (football-data) est le plus juste'));
});

// ================================================ 4. les favoris, le câblage et l'hygiène

test('les favoris d’abord — un championnat favori passe avant les autres dans la liste « championnat par championnat », étoilé ; « Tous » reste en tête', options, async () => {
  const { useFavoritesStore } = await rendu.charger('/src/stores/favoritesStore.js');
  const avec = await page(s.pret, {
    avant: (pinia) => {
      useFavoritesStore(pinia).leagues = [{ name: 'Ligue Essai', addedAt: '2026-10-01T00:00:00.000Z' }];
    }
  });
  const champs = corps(tableauDe(avec.html, 'championnats'));
  assert.deepEqual(champs.map((x) => /data-portee="([^"]*)"/.exec(x)[1]), ['*', 'Ligue Essai', 'EPL'], 'le favori avant l’autre, « Tous » jamais déplacé');
  assert.ok(classes(champs[1].split('>')[0]).includes('is-favori'), 'la ligne du favori est marquée');
  assert.ok(!classes(champs[2].split('>')[0]).includes('is-favori') && !classes(champs[0].split('>')[0]).includes('is-favori'));
  // Sans favori : l'ordre alphabétique du calcul.
  const sans = await page(s.pret);
  assert.deepEqual(corps(tableauDe(sans.html, 'championnats')).map((x) => /data-portee="([^"]*)"/.exec(x)[1]), ['*', 'EPL', 'Ligue Essai']);
  assert.ok(!/is-favori/.test(tableauDe(sans.html, 'championnats')));
  // Les Σ et ⌀ ne dépendent pas de l'ordre.
  assert.deepEqual(pied(tableauDe(avec.html, 'championnats')).map(cellules), pied(tableauDe(sans.html, 'championnats')).map(cellules));
});

test('câblage de la page — une lecture à l’ouverture, relire, l’adresse décide du championnat, une réponse tardive est ignorée, une relecture ratée garde la dernière page', () => {
  const vue = lireUi('views', 'BookmakersView.vue');
  assert.equal((vue.match(/onMounted\(charger\)/g) ?? []).length, 1, 'une seule lecture à l’ouverture');
  assert.equal((vue.match(/marketKnowledgeApi\.get\(/g) ?? []).length, 1, 'un seul appel de lecture dans la page');
  assert.match(vue, /@click="charger"/, '« Relire » relit');
  assert.match(vue, /const portee = ref\(typeof route\.query\.championnat === 'string' && route\.query\.championnat \? route\.query\.championnat : PORTEE_TOUS\);/, 'le championnat de départ vient de l’adresse');
  assert.match(vue, /watch\(portee, \(apres, avant\) => \{[\s\S]*?router\.replace\(\{ query \}\);[\s\S]*?charger\(\);/, 'un autre choix change l’adresse sans empiler l’historique, puis relit');
  assert.doesNotMatch(vue, /router\.push\(/, 'jamais d’historique empilé à chaque choix');
  assert.match(vue, /if \(apres === PORTEE_TOUS\) delete query\.championnat;/, '« Tous » : pas de paramètre dans l’adresse');
  assert.match(vue, /watch\(\s*\(\) => route\.query\.championnat,/, 'un lien vers un autre championnat alors que la page est ouverte : le choix suit l’adresse');
  assert.match(vue, /if \(portee\.value === choisie\) etat\.value = \{ loading: false, error: null, data \};/, 'une réponse arrivée après un autre choix est ignorée');
  assert.match(vue, /error: error\.message, data: etat\.value\.data/, 'une relecture ratée garde la dernière page');
  assert.match(vue, /const erreurSansDonnees = computed\(\(\) => \(reponse\.value \? null : etat\.value\.error\)\);/);
  assert.match(vue, /const erreurDeRelecture = computed\(\(\) => \(reponse\.value \? etat\.value\.error : null\)\);/);
  assert.match(vue, /Lecture impossible — dernière page affichée/);
  // La page n'a que des lectures : aucune écriture, aucun appel payant, aucun calcul lancé d'ici.
  assert.doesNotMatch(vue, /\.(post|put|patch|delete)\(|lineups-by-name|resolveTeamAverages|API-Football|apiFootball|connaitreLeMarche|calculerAPart/i);
  assert.match(lireUi('services', 'marketKnowledgeApi.js'), /get: \(\{ championnat = null \} = \{\}\) => httpClient\.get\(`\/market-knowledge\$\{championnat && championnat !== '\*' \? `\?championnat=\$\{encodeURIComponent\(championnat\)\}` : ''\}`\)/);
  // Les six cartes et le tableau de la page sont dans la page, une fois chacun, et nulle part ailleurs.
  const cartes = ['MarketMomentsCard', 'BookmakerRankingCard', 'BookmakerMarginsCard', 'BookmakerBiasCard', 'MarketReproductionCard'];
  const toutes = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).map((f) => String(f).split(path.sep).join('/'));
  const emplois = (nom) => toutes.filter((f) => lireUi(...f.split('/')).includes(nom) && !f.endsWith(`${nom}.vue`));
  for (const nom of cartes) assert.deepEqual(emplois(nom), ['views/BookmakersView.vue'], `${nom} : une seule place`);
  assert.equal((vue.match(/<BookmakerRankingCard /g) ?? []).length, 2, 'la justesse et la vitesse');
  assert.deepEqual(emplois('BookmakersView'), ['router/index.js'], 'la page n’est branchée que par le routeur');
});

test('hygiène des six fichiers : jetons seulement, pas de !important, polices ≥ 10 px, icônes connues, pas de vert ni de rouge de résultat, rien du moteur', () => {
  const jetons = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  const fichiers = [
    ['views', 'BookmakersView.vue'],
    ['components', 'analysis', 'MarketMomentsCard.vue'],
    ['components', 'analysis', 'BookmakerRankingCard.vue'],
    ['components', 'analysis', 'BookmakerMarginsCard.vue'],
    ['components', 'analysis', 'BookmakerBiasCard.vue'],
    ['components', 'analysis', 'MarketReproductionCard.vue']
  ];
  for (const f of fichiers) {
    const vue = lireUi(...f);
    const nom = f.at(-1);
    const style = vue.split('<style scoped>')[1];
    assert.ok(style, `${nom} : un style`);
    assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, `${nom} : aucune couleur en dur`);
    assert.doesNotMatch(style.replace(/rgba?\(var\(--[^)]+\)[^)]*\)/g, '').replace(/rgb\(var\(--[^)]+\) \/ var\(--[^)]+\)\)/g, ''), /rgba?\(/, `${nom} : une transparence passe par un jeton`);
    assert.doesNotMatch(vue, /!important/, `${nom}`);
    for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `${nom} : police de ${m[1]} px`);
    for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `${nom} : jeton inconnu ${m[1]}`);
    assert.doesNotMatch(vue, /\.(post|put|patch|delete)\(/, `${nom} : aucune écriture`);
    assert.doesNotMatch(vue, /lineups-by-name|resolveTeamAverages|API-Football|apiFootball/i, `${nom} : aucun appel payant`);
    assert.doesNotMatch(vue, /<select\b/, `${nom} : pas de liste native`);
    for (const m of vue.matchAll(/<AppIcon :?name="([\w-]+)"|\bicon="(\w+)"/g)) {
      const icone = m[1] ?? m[2];
      if (/^[a-z]+$/.test(icone)) assert.ok(connues.has(icone), `${nom} : l’icône ${icone} n’existe pas`);
    }
    // Rien de ces cartes n'est une value : ni vert d'accent ni ValueBadge ; le rouge est réservé à l'erreur de la page.
    if (nom !== 'BookmakersView.vue') assert.doesNotMatch(vue, /--cm-accent|--cm-danger\b(?!-)|ValueBadge|is-accent|is-danger/, `${nom} : ni vert ni rouge de résultat`);
  }
  // Les cinq cartes relisent quand leurs lignes changent (le championnat choisi change) : le moment proposé suit.
  assert.match(lireUi('components', 'analysis', 'BookmakerRankingCard.vue'), /watch\(\s*\(\) => \[props\.lignes, props\.mesure\],/);
  assert.match(lireUi('components', 'analysis', 'BookmakerBiasCard.vue'), /watch\(\s*\(\) => props\.lignes,/);
  // Les règles de la page sont pures et ne connaissent ni Vue ni le serveur : elles ne lisent que les noms de vos bookmakers.
  assert.deepEqual([...reglesPures('bookmakers.js')].sort(), ['bookmakers.js', 'vosBookmakers.js'], 'les règles de la page sont pures');
  assert.deepEqual([...reglesPures('vosBookmakers.js')], ['vosBookmakers.js']);
  assert.doesNotMatch(lireUi('utils', 'bookmakers.js'), /\.(post|put|patch|delete)\(|fetch\(/);
  // Les noms de vos bookmakers : une seule liste, lue par Réglages et par la page.
  assert.match(lireUi('components', 'settings', 'EngineConfigForm.vue'), /import \{ BOOKMAKERS \} from '@\/utils\/vosBookmakers\.js';/);
  assert.doesNotMatch(lireUi('components', 'settings', 'EngineConfigForm.vue'), /key: '[a-z_0-9]+', title:/, 'Réglages ne garde pas sa propre copie');
  // La page dit le championnat par le nom que l'appli lui donne dans ses listes (« Besta deildin (ISL) »).
  assert.match(lireUi('views', 'BookmakersView.vue'), /const nom = computed\(\(\) => formatLeagueOptionLabel\(reponse\.value\?\.nom \?\? /);
});
