// porte1-regles.md : les modifications AVANT le regard (décision de l'orchestrateur, 27/10/2026 à 10 h 17).
// Aucune barre oblique inverse : les fins de ligne viennent de NL.
const fs = require('fs');
const f = 'porte1-regles.md';
let t = fs.readFileSync(f, 'utf8');
const NL = String.fromCharCode(10);
const L = (...lignes) => lignes.join(NL);
const rep = (a, b) => {
  const n = t.split(a).length - 1;
  if (n !== 1) throw new Error(`ancre trouvée ${n} fois : ${a.slice(0, 70)}`);
  t = t.replace(a, b);
};

// En tête : la mention des modifications.
rep(
  "**Aucune issue réelle de P2 n'a été lue avant ce fichier** :",
  L(
    "**Modifié avant le regard le 27/10/2026 à 10 h 17 (décision de l'orchestrateur, §10)** : le seuil par marché de F2c porte",
    'sur le NET EXACT, 17 marchés ; §4 et §6 sont écrits dans leur forme modifiée.',
    '',
    "**Aucune issue réelle de P2 n'a été lue avant ce fichier** :"
  )
);

// §4 — la règle par marché (de « Par marché de mi-temps (16 … » jusqu'au §5).
const debut4 = t.indexOf('- **Par marché de mi-temps (16 : les 15 du bloc + au moins un rouge)**');
const fin4 = t.indexOf('## 5. La règle de la porte');
if (debut4 < 0 || fin4 < 0 || fin4 < debut4) throw new Error('bornes du §4');
t =
  t.slice(0, debut4) +
  L(
    '- **Par marché, 17 marchés jugés un par un** (modifié le 27/10 à 10 h 17, §10) : les 15 du bloc, « 2e mi-temps plus de',
    '  buts » (h2plusQueH1) et « au moins un rouge » ; les deux « mené à la mi-temps et gagne » sont les cases 2/1 et 1/2,',
    '  déjà dedans. Pour chaque marché M :',
    '  **net exact = moyenne, sur les rencontres retenues, de P_avec effets(M | case réelle du score final) − réalisé**,',
    '  P lue dans les chemins de la simulation AVEC effets qui finissent dans la case du score réel (à la 90e) : la part de',
    "  l'écart qui vient de la grille du score est ainsi retirée en entier, quelle que soit la façon dont elle passe au",
    '  marché. **Règle : |net exact| ≤ 1 pt** (arrondi au centième de point) ; au-delà, le marché est NOMMÉ et ÉTEINT SEUL.',
    "  Une rencontre dont la case réelle n'a aucun chemin est écartée du net exact, pour TOUS les marchés, et comptée ;",
    "  **si plus de 1 % de l'échantillon est écarté** (plus de 301 rencontres sur 30 149), le jugement par marché devient",
    "  **« non vérifié »** : les 17 marchés restent éteints en attendant P5, et la porte n'est pas fermée pour autant.",
    '  Le brut et le net additif ne sont plus que rapportés (§6).',
    "- **Net additif (rapporté seulement)** : brut − écart de la grille sur le marché du score hérité, d'après cette table",
    '  (preuve.md F2c : nul, les deux marquent, plus de 1,5 ; le « nul » est lu comme le résultat final de même sens) :',
    '',
    '  | Marché de mi-temps | Marché du score hérité (écart de la grille) |',
    '  |---|---|',
    '  | mi-temps : domicile mène (htH) | 1 (domicile gagne) |',
    '  | mi-temps nul (htD) | N (nul) |',
    '  | mi-temps : extérieur mène (htA) | 2 (extérieur gagne) |',
    '  | mi-temps plus de 0,5 (htO05), plus de 1,5 (htO15) | plus de 1,5 buts |',
    '  | 1/1, N/1, 2/1 (htFt0, htFt3, htFt6) | 1 |',
    '  | 1/N, N/N, 2/N (htFt1, htFt4, htFt7) | N |',
    '  | 1/2, N/2, 2/2 (htFt2, htFt5, htFt8) | 2 |',
    '  | un but dans chaque mi-temps (deuxMiTemps05) | les deux marquent |',
    '  | 2e mi-temps plus de buts (h2plusQueH1) | aucun : pas de net additif |',
    '  | au moins un rouge (rougeAuMoinsUn) | rien : net additif = brut |',
    '',
    ''
  ) +
  t.slice(fin4);

// §6 — ce qui est rapporté.
rep(
  L(
    '- Les écarts bruts de tout ce qui se juge (les 16 marchés, les 14 combinés, leurs jambes, les marchés du score hérités) ;',
    '  « 2e mi-temps plus de buts » (h2plusQueH1), « domicile gagne mené à la MT » (= 2/1) et « extérieur gagne mené à la MT »',
    '  (= 1/2) : bruts, hors des règles (non nommés par la décision).'
  ),
  L(
    '- Les écarts bruts de tout ce qui se juge (les 17 marchés, les 14 combinés, leurs jambes, les marchés du score hérités) ;',
    '  le net additif de chaque marché de mi-temps (§4) ; « domicile gagne mené à la MT » (= 2/1) et « extérieur gagne mené à',
    '  la MT » (= 1/2) : leurs nombres, les mêmes que ceux des deux cases.'
  )
);
rep(
  L(
    '- La décomposition exacte de chaque marché de mi-temps : « net exact » = moyenne de P_avec effets(marché | case du score',
    '  final réel) − réalisé, sur les rencontres dont la case réelle a au moins un chemin (les autres comptées).'
  ),
  "- La part de chaque écart qui vient de la grille du score : annoncé − moyenne de P_avec effets(marché | case réelle)."
);
rep(
  '- Les déciles (tranches de 300 rencontres ou plus), la masse non couverte, la taille effective, le biais du banc dû à N.',
  L(
    '- Les déciles (tranches de 300 rencontres ou plus), la masse non couverte, la taille effective, le biais du banc dû à N',
    '  (N = 4 000 gardé : ≤ 0,10 pt, §2).'
  )
);

// §10 — les modifications et leur raison.
t =
  t.trimEnd() +
  NL +
  NL +
  L(
    "## 10. Modifications avant le regard (27/10/2026, 10 h 17 — `date` : 09:17:50 UTC —, décision de l'orchestrateur)",
    '',
    "Aucune issue réelle de P2 n'avait été lue. Changements :",
    '1. **F2c, la règle par marché porte sur le NET EXACT** (§4) : moyenne de P_avec effets(marché | case réelle du score',
    '   final) − réalisé ; |net exact| ≤ 1 pt, sinon le marché est nommé et éteint seul. Le net additif (table d’héritage) et',
    '   le brut deviennent seulement rapportés. Une rencontre dont la case réelle n’a aucun chemin est écartée du net exact,',
    '   pour tous les marchés, et comptée ; plus de 1 % de l’échantillon écarté → jugement par marché « non vérifié » : tous',
    '   les marchés de mi-temps restent éteints en attendant P5, la porte n’est pas fermée pour autant.',
    '   **Raison** : la règle d’avant retranchait l’écart ENTIER du marché du score hérité, comme s’il passait au marché de',
    '   mi-temps à 100 %. Le modèle lui-même, calculé sur les entrées seules (`transfert-kappa.mjs` → `transfert-kappa.txt`,',
    '   300 rencontres de l’échantillon, 20 000 chemins), dit que la part transmise κ vaut **0,28 à 0,62** (mi-temps nul ← N :',
    '   0,28 ; N/N ← N : 0,62 ; un but dans chaque mi-temps ← les deux marquent : 0,45) et **0,06 pour 1/2 et 2/1** :',
    '   retrancher l’écart entier surcorrige (avec un biais de −2 pt sur « les deux marquent », comme sur V, « un but dans',
    '   chaque mi-temps » serait déplacé d’environ 1,1 pt, plus que le seuil). Et l’héritage du « nul » a le **mauvais signe**',
    '   pour « domicile mène » (κ = −0,20 ; 1/1 ← N : −0,37). Le net exact retire toute la part qui vient de la grille du',
    '   score, sans table ni coefficient. À la répétition synthétique : 1/2 brut +0,01, net additif −0,51, net exact +0,02.',
    '2. **F3a** : le net proportionnel au premier ordre (§3) est confirmé comme porte ; l’additif reste rapporté.',
    '3. **La table d’héritage** ne sert plus qu’au net additif rapporté.',
    '4. **N = 4 000** est gardé ; son biais (≤ 0,10 pt sur le marché le plus touché) est rapporté.',
    '5. **« 2e mi-temps plus de buts » (h2plusQueH1) entre dans la règle par marché**, avec le même net exact ≤ 1 pt :',
    '   17 marchés jugés un par un (les 15 du bloc, au moins un rouge, h2plusQueH1) ; les deux « mené à la mi-temps et',
    '   gagne » sont les cases 2/1 et 1/2, déjà dedans. « Au moins un rouge » est jugé lui aussi sur son net exact.',
    '',
    'Inchangés : le bloc F2c « pas moins bon », le bloc F3a, la règle de la porte (§5).',
    'Le script `porte1.mjs` est modifié en conséquence (empreinte au §8) ; sur 300 rencontres synthétiques, tous les nombres',
    'de la version d’avant sont rendus à l’identique (seuls changent le nom du champ « net » → « netAdditif », les nouveaux',
    'champs du net exact et le marché h2plusQueH1 entré dans la règle).',
    ''
  );
fs.writeFileSync(f, t);
console.log('porte1-regles.md modifié');
