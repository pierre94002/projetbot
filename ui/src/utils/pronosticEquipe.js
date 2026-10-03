/**
 * pronosticEquipe.js — de quelle équipe parle une ligne (pronostic du moteur,
 * sélection d'un pari, issue d'un match), pour mettre son logo devant —
 * demande de Pierre le 01/10/2026 : « des logos à chaque ligne où il y a un
 * nom d'équipe ».
 * -----------------------------------------------------------------------
 * Par ses données d'abord (cf. server/src/sports/football/markets.js) :
 * `params.team` (buts, corners, tirs d'une équipe), `params.outcome` ou
 * `predictedOutcome` (résultat 1N2), `params.key` (résultat + total buts,
 * « homeOver »…). Sinon — pronostics et paris d'avant ces champs, avis de
 * l'IA — par les noms des deux équipes dans son texte, sans accents ni
 * casse, en mots entiers et le nom le plus long d'abord (« Inter Miami »
 * avant « Inter »). Une ligne sur le total du match, le nul ou « les deux
 * équipes marquent » ne parle d'aucune équipe.
 * -----------------------------------------------------------------------
 */

const simplifier = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const lettre = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Position du nom dans le texte, en mot entier (« Leeds » n'est pas dans « Leedsville »), ou -1. */
function chercherMot(texte, nom) {
  if (!nom) return -1;
  let depart = 0;
  for (;;) {
    const i = texte.indexOf(nom, depart);
    if (i === -1) return -1;
    if (!lettre(texte[i - 1]) && !lettre(texte[i + nom.length])) return i;
    depart = i + 1;
  }
}

/** Les camps ('home', 'away') nommés dans un texte, dans l'ordre où ils y paraissent. */
export function campsDuTexte(texte, home, away) {
  let reste = simplifier(texte);
  if (!reste) return [];
  const trouves = [];
  const equipes = [
    ['home', simplifier(home)],
    ['away', simplifier(away)]
  ]
    .filter(([, nom]) => nom)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [cote, nom] of equipes) {
    const i = chercherMot(reste, nom);
    if (i === -1) continue;
    trouves.push({ cote, i });
    // Effacé, pour qu'« Inter » ne se retrouve pas dans « Inter Miami ».
    reste = `${reste.slice(0, i)}${' '.repeat(nom.length)}${reste.slice(i + nom.length)}`;
  }
  return trouves.sort((a, b) => a.i - b.i).map((t) => t.cote);
}

/**
 * Les camps dont parle une ligne : un pronostic ou une sélection (objet), ou
 * un simple texte. [] quand elle ne vise aucune équipe.
 */
export function campsDe(item, { home = null, away = null } = {}) {
  if (item && typeof item === 'object') {
    const p = item.params ?? {};
    if (p.team === 'home' || p.team === 'away') return [p.team];
    for (const issue of [p.outcome, p.key, item.predictedOutcome, item.outcome]) {
      if (issue === 'home' || issue === 'away') return [issue];
      if (issue === 'draw') return [];
      const combine = /^(home|away)(Over|Under)$/.exec(String(issue ?? ''));
      if (combine) return [combine[1]];
    }
  }
  const texte = typeof item === 'string' ? item : (item?.pick ?? item?.predictedLabel ?? item?.label ?? '');
  return campsDuTexte(texte, home, away);
}
