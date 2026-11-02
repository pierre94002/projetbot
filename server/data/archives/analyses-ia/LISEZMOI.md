# Archives des analyses de l'IA

Un fichier par jour de match : `AAAA-MM-JJ.json` (date du coup d'envoi, heure de Paris ; `sans-date.json` pour les rares analyses sans date lisible).

Ce sont des **copies** des analyses que CôteMaster écrit dans `server/data/runtime/match-ai-analyses.json`. Ce gros fichier ne part plus sur GitHub depuis le 02/11/2026 : GitHub refuse les fichiers de plus de 100 Mo. L'appli ne lit jamais ces archives.

- **Mettre à jour** (fait avant chaque envoi sur GitHub), depuis le dossier du projet : `node server/scripts/archiver-analyses-ia.mjs`
- **Voir ce qui changerait**, sans rien écrire : `node server/scripts/archiver-analyses-ia.mjs --verifier`
- **Refaire le fichier complet** (par exemple après une panne) : `node server/scripts/archiver-analyses-ia.mjs --reconstituer <nouveau fichier>`, puis, CôteMaster fermé, le mettre à la place de `server/data/runtime/match-ai-analyses.json`.
- **Rien ne se perd** : une analyse reste dans son jour même si elle disparaît du fichier de l'appli, et aucun jour n'est supprimé.
