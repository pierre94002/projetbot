/**
 * -----------------------------------------------------------------------
 * Identité par le nom : mise en forme et rapprochement.
 * -----------------------------------------------------------------------
 * Extrait de merge-match-stats.mjs pour que la fusion JSON et le magasin
 * SQLite partagent la MÊME définition de « ces deux écritures désignent le
 * même joueur ». Deux implémentations divergentes créeraient, à terme, deux
 * lignes pour le même homme et couperaient ses totaux en deux.
 */

export function slug(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nameTokens(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đð]/gi, 'd')
    .replace(/[øœ]/gi, 'o')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Deux écritures désignent-elles le même joueur ?
 *
 * Les sources ne s'accordent ni sur l'ordre des noms chinois (« Wu Xi » /
 * « Xi Wu »), ni sur la translittération (« Jinghang Hu » / « Jing Hu »), ni
 * sur les formes courtes. On accepte donc : mêmes mots dans n'importe quel
 * ordre, l'un contenu dans l'autre, un mot long partagé, ou un mot qui
 * préfixe l'autre — ce dernier cas borné à 4 lettres d'écart, sinon
 * « Wu » vaudrait « Wuhan ».
 */
export function sharesNameToken(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const sameSet = left.length === right.length && left.every((t) => rightSet.has(t));
  if (sameSet) return true; // ordre inversé
  if (left.every((t) => rightSet.has(t)) || right.every((t) => leftSet.has(t))) return true; // sous-ensemble
  if (right.some((t) => t.length >= 3 && leftSet.has(t))) return true; // mot long commun

  return left.some((x) =>
    right.some((y) => {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      return short.length >= 3 && long.startsWith(short) && long.length - short.length <= 4;
    })
  );
}
