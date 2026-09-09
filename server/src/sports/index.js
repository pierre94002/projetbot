import { registerSport, getSport, listSports } from './sportPort.js';
import { football } from './football/index.js';

registerSport(football);

export { getSport, listSports };
