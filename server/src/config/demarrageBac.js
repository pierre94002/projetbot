/**
 * Garde-fou du bac à sable, exécuté AVANT tout le reste du serveur : c'est le
 * premier import de server.js. Les imports d'un module ES s'évaluent dans
 * l'ordre et avant son corps : quand ce module tourne, aucun autre n'a encore
 * lu l'environnement ni ouvert la base. dotenv d'abord, pour contrôler
 * l'environnement tel que le serveur le verra (un MATCH_STATS_DB ou une clé
 * posés dans un .env compris). Refus : message clair et sortie immédiate.
 * Hors bac à sable : ne fait rien. Cf. bacASable.js, docs/bac-a-sable.md.
 */
import 'dotenv/config';
import { gardeDemarrage } from './bacASable.js';

gardeDemarrage();
