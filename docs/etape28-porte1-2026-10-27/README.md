# Étape 28 — les pièces de la porte 1 (27/10/2026)

SCR = le scratchpad de l'étape 28 ; ses pièces sont copiées ici, sha1 dans SHA1.txt.

## Ce que c'est

Le 27/10/2026, la simulation complète de l'étape 28 a passé sa **porte 1** : un seul passage sur des matchs qu'elle
n'avait jamais vus (football-data, juillet 2019 à juin 2023, 30 149 matchs), avec des **règles écrites avant de
regarder** les résultats. Verdict : porte ouverte ; les combinés calculés par la grille du moteur prévoient mieux que le
produit des simples ; deux marchés de déroulé sont écartés (« un but dans chaque mi-temps », « au moins un rouge »).

L'appli garde ces chiffres dans `server/src/data/simulation/noteDeLaSimulation.js` (la « note »). La note cite ses
règles par leur empreinte (sha1) : une empreinte ne prouve que les règles étaient écrites avant le regard **que si le
fichier lui-même reste lisible**. Ces pièces vivaient seulement dans un dossier temporaire du PC (le scratchpad) ; elles
sont copiées ici, telles quelles, pour être gardées avec le code qu'elles justifient.

Rien ici n'est lu par l'appli. Aucune base de données n'est dans ce dossier.

## Les pièces, une par une

| Fichier | En mots simples |
|---|---|
| `porte1-regles.md` | **Les règles, écrites avant de regarder** (8 h 25, modifiées avant le regard à 10 h 17). Ce que la porte juge, comment, et ce qui la ferme. Son sha1 (a5d5d737…) est celui que cite la note et que le verrou a noté au moment du passage. |
| `porte1-regles.avant-modifications.md` | Les mêmes règles **avant** la modification de 10 h 17 (décidée avant le regard, sa raison écrite au §10 des règles) : pour voir ce qui a changé. |
| `modifier-regles.cjs` | Le petit programme qui a fait cette modification de 10 h 17 dans le fichier des règles (rien à la main). |
| `porte1.mjs` | **Le programme du passage** : il vérifie les empreintes des règles, du code et des données, pose le verrou, puis lit les résultats réels une seule fois et écrit la sortie. |
| `porte1-passage-reel.lock` | **Le verrou** posé au moment du passage (10 h 20 min 30 s, heure de Paris ; « pose » est en heure universelle) : il porte le sha1 des règles. Le programme refuse de repasser tant qu'il existe. |
| `porte1-resultat.json` | **La sortie du passage** (tous les chiffres). La note est recopiée d'elle par programme, jamais retapée ; son sha1 (975a18e8…) est dans la note, champ `sortie`. |
| `porte1-resultat.log` | Le journal du passage (son déroulement, ses durées). |
| `porte1-resultat.out` | Le résumé en quelques lignes : porte ouverte, les deux verdicts, les éteints, 30 149 rencontres, 3 918,9 s. |
| `echantillon.mjs` | Le programme qui a choisi les 30 149 matchs **sur les seules entrées** (aucun résultat lu). |
| `echantillon-p2.txt` | Ce qu'il a trouvé, en clair : combien de matchs rejouables, et pourquoi. |
| `artefact-n.txt` | Le biais du calcul dû au nombre de matchs simulés par rencontre (mesuré sur les entrées seules) : d'où N = 4 000. |
| `transfert-kappa.txt` | La part de l'écart d'un marché de score qui passe dans un marché de mi-temps (mesurée sur les entrées seules) : la raison de la modification de 10 h 17. |

## Vérifier

Chaque fichier a son sha1 dans `SHA1.txt` (calculé le 27/10/2026 à la copie, identique à l'octet aux originaux du
scratchpad). Pour en vérifier un : `certutil -hashfile porte1-regles.md SHA1` (Windows) doit redonner la valeur de la
liste.
