/**
 * Un BAC À SABLE SIMULÉ, explicitement — ce n'est PAS un fichier de test.
 *
 * Le code reconnaît le bac à son EMPLACEMENT (config/bacASable.js) : tout code
 * qui tourne sous <dossier personnel>\CoteMaster\bac-a-sable est « le bac » —
 * clés payantes et jeton Claude vidés, actualisation automatique et cotes
 * gratuites coupées, analyses IA refusées. Certains essais supposent ce
 * comportement : la santé des sources d'un serveur « sans clé » (coupées par le
 * bac, jamais « à surveiller »), le feu d'un contrôle jamais fait (vert, sans
 * « à surveiller » venu d'un jeton absent)…
 *
 * Or les copies d'essai d'isolement.mjs sont rangées dans
 * bac-a-sable\essais-tests quand les tests tournent DANS le bac (ce sont alors
 * des bacs), mais dans le dossier temporaire du système quand ils tournent
 * depuis le dépôt (ce sont alors des serveurs ordinaires) : quatre essais du
 * contrôle quotidien réussissaient dans le bac et échouaient dans le dépôt
 * (07/10/2026). Un essai ne doit pas dépendre de l'endroit où il tourne.
 *
 * Ici, la simulation est EXPLICITE et la même partout :
 *   - la copie est rangée dans un FAUX dossier personnel, à la disposition du
 *     vrai bac : <maison>\CoteMaster\bac-a-sable\essais-tests\cm-tests-XXXX
 *     (code\server, base\match-stats.db), comme dans le vrai bac ;
 *   - le sous-processus reçoit ce dossier comme SIEN (USERPROFILE et HOME :
 *     os.homedir() le rend) : le code se reconnaît dans le bac, avec son
 *     comportement exact, sans variable de démarrage ni changement de code ;
 *   - ce faux dossier personnel est dans le dossier d'essais (le temporaire du
 *     système depuis le dépôt, bac-a-sable\essais-tests dans le bac), jamais à
 *     côté de la vraie base : le sous-processus ne voit ni %USERPROFILE%\CoteMaster
 *     (vraie base, sauvegardes, football-data) ni le data\runtime de l'appli ;
 *   - la copie et le faux dossier sont effacés ensemble (aucun lien dedans).
 *
 * À l'inverse, un essai qui veut un serveur SANS bac (clés présentes, interrupteurs
 * allumés) le dit par une configuration explicite (CONFIG_REELLE de
 * script-controle-quotidien.mjs : `bac: false` et les clés à `true`), jamais
 * par l'endroit où il est rangé.
 */

import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, nettoyer, RACINE_ESSAIS } from './isolement.mjs';

/**
 * Comme `preparerCopie`, mais rangée dans un faux bac. Rend la même chose, plus
 * `maison` (le faux dossier personnel) ; `nettoyer()` efface la copie ET le
 * faux dossier.
 */
export function preparerCopieDeBac(options = {}) {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const maison = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-maison-'));
  try {
    const copie = preparerCopie({ ...options, racine: path.join(maison, 'CoteMaster', 'bac-a-sable', 'essais-tests') });
    return {
      ...copie,
      maison,
      nettoyer: () => {
        try {
          copie.nettoyer();
        } finally {
          nettoyer(maison);
        }
      }
    };
  } catch (error) {
    nettoyer(maison);
    throw error;
  }
}

/** Comme `executer`, mais le sous-processus a le faux dossier personnel de la copie pour sien : le code s'y reconnaît dans le bac. */
export function executerDansLeBac(copie, script, options = {}) {
  if (!copie.maison) throw new Error("executerDansLeBac : la copie doit venir de preparerCopieDeBac (aucun faux dossier personnel).");
  return executer(copie, script, { ...options, env: { ...options.env, USERPROFILE: copie.maison, HOME: copie.maison } });
}
