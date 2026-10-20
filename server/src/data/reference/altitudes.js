/**
 * altitudes.js — la courte liste, faite à la main, des stades en altitude
 * (étape 13 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * FotMob ne donne pas l'altitude d'un stade. Seules les villes à environ
 * 1 500 m ou plus des compétitions que le magasin suit sont listées ici
 * (Bolivie, Équateur, Colombie, Pérou, Mexique, Venezuela, Chili, MLS) ; un
 * stade absent de la liste a une altitude inconnue (null), jamais 0.
 *
 * SOURCE : valeurs de référence connues de l'altitude de la ville du stade
 * (ou du stade lui-même quand il est connu à part), arrondies, écrites à la
 * main le 06/10/2026 — NON vérifiées en ligne ce jour-là (± 50 m). À relire
 * par Pierre avant de s'en servir pour autre chose qu'un ordre de grandeur.
 *
 * `pays` : le pays tel que FotMob l'écrit (infoBox.Stadium.country) ;
 * `villes` : les écritures possibles de la ville du stade chez FotMob. La
 * table des stades (venues.json, scripts/build-reference-venues.mjs) prend
 * l'altitude d'un club quand son stade est dans une de ces villes, dans ce
 * pays — jamais par ressemblance : la ville doit être écrite pareil (sans
 * accents ni casse). « León » au Mexique n'est pas León en Espagne.
 * -----------------------------------------------------------------------
 */

export const ALTITUDES = Object.freeze([
  { pays: 'Bolivia', villes: ['El Alto'], altitude: 4090, stade: 'Estadio Municipal de El Alto (Villa Ingenio)' },
  { pays: 'Bolivia', villes: ['Potosí', 'Potosi'], altitude: 3960, stade: 'Estadio Víctor Agustín Ugarte' },
  { pays: 'Bolivia', villes: ['Oruro'], altitude: 3735, stade: 'Estadio Jesús Bermúdez' },
  { pays: 'Bolivia', villes: ['La Paz'], altitude: 3640, stade: 'Estadio Hernando Siles' },
  { pays: 'Bolivia', villes: ['Sucre'], altitude: 2800, stade: 'Estadio Olímpico Patria' },
  { pays: 'Bolivia', villes: ['Cochabamba', 'Quillacollo', 'Sacaba', 'Vinto'], altitude: 2560, stade: 'Estadio Félix Capriles (Cochabamba)' },
  { pays: 'Bolivia', villes: ['Tarija'], altitude: 1870, stade: 'Estadio IV Centenario' },
  { pays: 'Ecuador', villes: ['Quito'], altitude: 2850, stade: 'Estadio Rodrigo Paz Delgado ; Atahualpa vers 2 780 m' },
  { pays: 'Ecuador', villes: ['Sangolquí', 'Sangolqui'], altitude: 2500, stade: null },
  { pays: 'Ecuador', villes: ['Cumbayá', 'Cumbaya'], altitude: 2350, stade: null },
  { pays: 'Ecuador', villes: ['Ambato'], altitude: 2580, stade: 'Estadio Bellavista' },
  { pays: 'Ecuador', villes: ['Cuenca'], altitude: 2560, stade: 'Estadio Alejandro Serrano Aguilar' },
  { pays: 'Ecuador', villes: ['Riobamba'], altitude: 2750, stade: 'Estadio Olímpico de Riobamba' },
  { pays: 'Ecuador', villes: ['Latacunga'], altitude: 2780, stade: null },
  { pays: 'Ecuador', villes: ['Ibarra'], altitude: 2220, stade: 'Estadio Olímpico de Ibarra' },
  { pays: 'Ecuador', villes: ['Loja'], altitude: 2060, stade: 'Estadio Reina del Cisne' },
  { pays: 'Colombia', villes: ['Bogotá', 'Bogota', 'Bogotá, D.C.'], altitude: 2600, stade: 'Estadio El Campín' },
  { pays: 'Colombia', villes: ['Tunja'], altitude: 2820, stade: null },
  { pays: 'Colombia', villes: ['Pasto', 'San Juan de Pasto'], altitude: 2530, stade: 'Estadio Departamental Libertad' },
  { pays: 'Colombia', villes: ['Manizales'], altitude: 2150, stade: 'Estadio Palogrande' },
  { pays: 'Colombia', villes: ['Rionegro'], altitude: 2125, stade: null },
  { pays: 'Colombia', villes: ['Envigado'], altitude: 1575, stade: null },
  { pays: 'Colombia', villes: ['Itagüí', 'Itagui'], altitude: 1550, stade: null },
  { pays: 'Colombia', villes: ['Medellín', 'Medellin'], altitude: 1495, stade: 'Estadio Atanasio Girardot' },
  { pays: 'Colombia', villes: ['Armenia'], altitude: 1480, stade: 'Estadio Centenario' },
  { pays: 'Peru', villes: ['Juliaca'], altitude: 3825, stade: 'Estadio Guillermo Briceño Rosamedina' },
  { pays: 'Peru', villes: ['Puno'], altitude: 3830, stade: null },
  { pays: 'Peru', villes: ['Cusco', 'Cuzco'], altitude: 3400, stade: 'Estadio Garcilaso de la Vega' },
  { pays: 'Peru', villes: ['Huancayo'], altitude: 3260, stade: 'Estadio Huancayo' },
  { pays: 'Peru', villes: ['Tarma'], altitude: 3050, stade: null },
  { pays: 'Peru', villes: ['Andahuaylas'], altitude: 2930, stade: null },
  { pays: 'Peru', villes: ['Ayacucho'], altitude: 2760, stade: null },
  { pays: 'Peru', villes: ['Cajamarca'], altitude: 2750, stade: 'Estadio Héroes de San Ramón' },
  { pays: 'Peru', villes: ['Arequipa'], altitude: 2335, stade: 'Estadio Monumental de la UNSA' },
  { pays: 'Peru', villes: ['Huánuco', 'Huanuco'], altitude: 1895, stade: null },
  { pays: 'Peru', villes: ['Cutervo'], altitude: 2650, stade: null },
  { pays: 'Mexico', villes: ['Toluca', 'Toluca de Lerdo'], altitude: 2660, stade: 'Estadio Nemesio Díez' },
  { pays: 'Mexico', villes: ['Pachuca', 'Pachuca de Soto'], altitude: 2430, stade: 'Estadio Hidalgo' },
  { pays: 'Mexico', villes: ['Mexico City', 'Ciudad de México', 'Ciudad de Mexico', 'Ciudad de México (D.F.)', 'Coyoacán', 'Coyoacan'], altitude: 2240, stade: 'Estadio Azteca ; Olímpico Universitario ; Ciudad de los Deportes' },
  { pays: 'Mexico', villes: ['Puebla'], altitude: 2135, stade: 'Estadio Cuauhtémoc' },
  { pays: 'Mexico', villes: ['Aguascalientes'], altitude: 1880, stade: 'Estadio Victoria' },
  { pays: 'Mexico', villes: ['San Luis Potosí', 'San Luis Potosi'], altitude: 1860, stade: 'Estadio Alfonso Lastras' },
  { pays: 'Mexico', villes: ['Querétaro', 'Queretaro', 'Santiago de Querétaro'], altitude: 1820, stade: 'Estadio La Corregidora' },
  { pays: 'Mexico', villes: ['León', 'Leon', 'León de los Aldamas'], altitude: 1815, stade: 'Estadio León (Nou Camp)' },
  { pays: 'Mexico', villes: ['Guadalajara', 'Zapopan'], altitude: 1560, stade: 'Estadio Akron ; Estadio Jalisco' },
  { pays: 'Venezuela', villes: ['Mérida', 'Merida'], altitude: 1630, stade: 'Estadio Metropolitano de Mérida' },
  { pays: 'Chile', villes: ['Calama'], altitude: 2260, stade: 'Estadio Zorros del Desierto' },
  { pays: 'Chile', villes: ['El Salvador'], altitude: 2300, stade: 'Estadio El Cobre (Cobresal)' },
  { pays: 'United States', villes: ['Commerce City', 'Commerce City, Colorado'], altitude: 1570, stade: 'Dick’s Sporting Goods Park (Colorado Rapids)' }
]);

export const SOURCE_ALTITUDE =
  'Liste faite à la main le 06/10/2026 (server/src/data/reference/altitudes.js) : altitude de la ville du stade, ou du stade quand il est connu à part, ' +
  'valeurs de référence connues, arrondies, non vérifiées en ligne (± 50 m). Seulement les villes à environ 1 500 m ou plus des compétitions du magasin ' +
  '(Bolivie, Équateur, Colombie, Pérou, Mexique, Venezuela, Chili, MLS). Ailleurs : null, jamais 0.';
