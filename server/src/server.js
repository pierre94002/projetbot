import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`CôteMaster API à l'écoute sur http://localhost:${env.port}`);
});
