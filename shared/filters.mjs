// Colour filters ("looks") for Cupkata, designed for the project. Each filter is a small set of
// grading settings turned into a 3D lookup table (LUT): the preview applies it on the GPU and the
// export writes the very same table to a .cube file for FFmpeg's lut3d, so both match.

export const LUT_SIZE = 33;

export const FILTER_CATEGORIES = [
  'Naturel', 'Chaleureux', 'Froid', 'Ciné', 'Vintage', 'Noir et blanc', 'Pastel', 'Vif', 'Nuit',
  'Voyage', 'Cuisine', 'Saisons', 'Couleur sélective', 'Duotone', 'Créatif',
];

const warm = [1, 0.62, 0.3];
const orange = [1, 0.55, 0.2];
const teal = [0.15, 0.55, 0.6];
const blue = [0.25, 0.4, 0.75];
const cyan = [0.3, 0.75, 0.8];
const pink = [1, 0.55, 0.7];
const purple = [0.6, 0.35, 0.75];
const green = [0.4, 0.62, 0.45];
const cream = [1, 0.9, 0.7];
const magenta = [0.85, 0.3, 0.75];
const gold = [1, 0.8, 0.35];

// Settings: exp (stops), temp, tint, hue (deg), bw (channel weights), sat, vib, con, curve,
// gamma, sh/hl ([r, g, b, strength] split toning), fade (lifted blacks); and mix (channel mixer),
// invert, keep (selective colour), duo (duotone) and post (posterize), described in gradeColor.
export const PRESETS = [
  { id: 'doux', name: 'Doux', cat: 'Naturel', p: { con: 0.05, sat: 0.05, fade: 0.03 } },
  { id: 'clair', name: 'Clair', cat: 'Naturel', p: { exp: 0.18, con: 0.05, sat: 0.08 } },
  { id: 'net', name: 'Net', cat: 'Naturel', p: { con: 0.18, curve: 0.25, vib: 0.2 } },
  { id: 'lumineux', name: 'Lumineux', cat: 'Naturel', p: { exp: 0.25, temp: 0.05, sat: 0.05, fade: 0.03 } },
  { id: 'portrait', name: 'Portrait', cat: 'Naturel', p: { temp: 0.12, tint: 0.05, sat: -0.05, curve: 0.15, fade: 0.02 } },

  { id: 'miel', name: 'Miel', cat: 'Chaleureux', p: { temp: 0.5, sat: 0.1, sh: [...warm, 0.08] } },
  { id: 'coucher', name: 'Coucher de soleil', cat: 'Chaleureux', p: { temp: 0.7, tint: 0.15, hl: [...orange, 0.15], con: 0.08 } },
  { id: 'ambre', name: 'Ambre', cat: 'Chaleureux', p: { temp: 0.45, con: 0.12, hl: [...gold, 0.12] } },
  { id: 'cannelle', name: 'Cannelle', cat: 'Chaleureux', p: { temp: 0.35, sat: -0.12, fade: 0.06, sh: [...warm, 0.06] } },
  { id: 'ete', name: 'Été', cat: 'Chaleureux', p: { temp: 0.3, vib: 0.3, exp: 0.1 } },

  { id: 'glacier', name: 'Glacier', cat: 'Froid', p: { temp: -0.5, sat: -0.1, hl: [...cyan, 0.1] } },
  { id: 'nordique', name: 'Nordique', cat: 'Froid', p: { temp: -0.3, sat: -0.3, fade: 0.08 } },
  { id: 'brume', name: 'Brume bleue', cat: 'Froid', p: { temp: -0.4, fade: 0.12, con: -0.1 } },
  { id: 'minuit', name: 'Minuit', cat: 'Froid', p: { temp: -0.6, exp: -0.2, con: 0.15 } },
  { id: 'menthe', name: 'Menthe', cat: 'Froid', p: { temp: -0.2, tint: -0.3, sh: [...teal, 0.1] } },

  { id: 'sarcelle', name: 'Sarcelle et orange', cat: 'Ciné', p: { sh: [...teal, 0.18], hl: [...orange, 0.14], con: 0.15, sat: 0.1 } },
  { id: 'blockbuster', name: 'Blockbuster', cat: 'Ciné', p: { sh: [...blue, 0.2], hl: [...warm, 0.12], con: 0.25, curve: 0.3 } },
  { id: 'western', name: 'Western', cat: 'Ciné', p: { temp: 0.5, sat: -0.25, con: 0.2, fade: 0.04 } },
  { id: 'thriller', name: 'Thriller', cat: 'Ciné', p: { temp: -0.25, tint: -0.15, sat: -0.35, con: 0.3 } },
  { id: 'desature', name: 'Désaturé ciné', cat: 'Ciné', p: { sat: -0.45, con: 0.2, fade: 0.05 } },
  { id: 'polar', name: 'Polar', cat: 'Ciné', p: { sat: -0.6, temp: -0.1, con: 0.3, curve: 0.2 } },

  { id: 'retro70', name: 'Rétro 70', cat: 'Vintage', p: { temp: 0.35, fade: 0.12, sat: -0.1, sh: [...purple, 0.1], hl: [...gold, 0.1] } },
  { id: 'instantane', name: 'Instantané', cat: 'Vintage', p: { fade: 0.1, temp: 0.2, tint: 0.1, con: -0.1, hl: [...cream, 0.12] } },
  { id: 'pellicule', name: 'Pellicule', cat: 'Vintage', p: { fade: 0.08, curve: 0.25, sat: -0.15, sh: [...green, 0.1] } },
  { id: 'sepiadoux', name: 'Sépia doux', cat: 'Vintage', p: { bw: [0.3, 0.59, 0.11], sh: [0.55, 0.4, 0.3, 0.15], hl: [...cream, 0.15], fade: 0.05 } },
  { id: 'delave', name: 'Délavé', cat: 'Vintage', p: { fade: 0.2, sat: -0.3, con: -0.15 } },
  { id: 'cartepostale', name: 'Carte postale', cat: 'Vintage', p: { sat: 0.2, fade: 0.1, hl: [...pink, 0.1] } },

  { id: 'nbclassique', name: 'N&B classique', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], con: 0.1 } },
  { id: 'nbcontraste', name: 'N&B contrasté', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], con: 0.45, curve: 0.4 } },
  { id: 'nbdoux', name: 'N&B doux', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], fade: 0.1, con: -0.1 } },
  { id: 'argentique', name: 'Argentique', cat: 'Noir et blanc', p: { bw: [0.5, 0.4, 0.1], fade: 0.04, curve: 0.2 } },
  { id: 'selenium', name: 'Sélénium', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], sh: [...blue, 0.12], con: 0.12 } },
  { id: 'nbchaud', name: 'N&B chaud', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], hl: [...warm, 0.12], sh: [0.6, 0.45, 0.35, 0.08] } },

  { id: 'pastel', name: 'Pastel', cat: 'Pastel', p: { fade: 0.15, sat: -0.15, exp: 0.15 } },
  { id: 'barbe', name: 'Barbe à papa', cat: 'Pastel', p: { tint: 0.25, fade: 0.12, hl: [...pink, 0.12], sh: [...blue, 0.08] } },
  { id: 'lavande', name: 'Lavande', cat: 'Pastel', p: { tint: 0.2, temp: -0.15, fade: 0.1 } },
  { id: 'peche', name: 'Pêche', cat: 'Pastel', p: { temp: 0.25, tint: 0.12, fade: 0.1, exp: 0.1 } },

  { id: 'eclatant', name: 'Éclatant', cat: 'Vif', p: { sat: 0.35, vib: 0.3, con: 0.15 } },
  { id: 'tropical', name: 'Tropical', cat: 'Vif', p: { hue: -8, sat: 0.4, temp: 0.15 } },
  { id: 'neon', name: 'Néon', cat: 'Vif', p: { sat: 0.5, con: 0.3, sh: [...magenta, 0.12], hl: [...cyan, 0.12] } },
  { id: 'popcolor', name: 'Pop', cat: 'Vif', p: { sat: 0.45, curve: 0.3 } },

  { id: 'nuitamericaine', name: 'Nuit américaine', cat: 'Nuit', p: { exp: -0.6, temp: -0.6, sat: -0.4 } },
  { id: 'neonnuit', name: 'Néon nocturne', cat: 'Nuit', p: { sh: [...purple, 0.15], hl: [...cyan, 0.12], con: 0.3, exp: -0.15 } },
  { id: 'clairdelune', name: 'Clair de lune', cat: 'Nuit', p: { temp: -0.45, sat: -0.5, fade: 0.06, exp: -0.1 } },

  // — Second collection —
  { id: 'naturelvif', name: 'Naturel vif', cat: 'Naturel', p: { vib: 0.35, con: 0.08, curve: 0.1 } },
  { id: 'matin', name: 'Matin', cat: 'Naturel', p: { exp: 0.15, temp: 0.08, fade: 0.04, con: -0.05 } },
  { id: 'peau', name: 'Peau douce', cat: 'Naturel', p: { temp: 0.1, tint: 0.08, con: -0.08, sat: -0.08, hl: [...cream, 0.06] } },
  { id: 'nature', name: 'Nature', cat: 'Naturel', p: { tint: -0.12, vib: 0.3, con: 0.1 } },
  { id: 'studio', name: 'Studio', cat: 'Naturel', p: { con: 0.12, curve: 0.18, sat: -0.05, exp: 0.05 } },
  { id: 'ombresdouces', name: 'Ombres douces', cat: 'Naturel', p: { fade: 0.06, con: -0.12, vib: 0.1 } },

  { id: 'heuredoree', name: 'Heure dorée', cat: 'Chaleureux', p: { temp: 0.55, exp: 0.1, hl: [...gold, 0.18], vib: 0.15 } },
  { id: 'caramel', name: 'Caramel', cat: 'Chaleureux', p: { temp: 0.4, tint: 0.08, con: 0.1, sh: [0.55, 0.35, 0.2, 0.12] } },
  { id: 'terracotta', name: 'Terracotta', cat: 'Chaleureux', p: { temp: 0.45, hue: 6, sat: -0.05, fade: 0.05, sh: [...orange, 0.1] } },
  { id: 'feudecamp', name: 'Feu de camp', cat: 'Chaleureux', p: { temp: 0.75, exp: -0.15, con: 0.2, hl: [...orange, 0.15] } },
  { id: 'cuivre', name: 'Cuivre', cat: 'Chaleureux', p: { temp: 0.5, sat: -0.2, con: 0.18, hl: [1, 0.6, 0.35, 0.15] } },
  { id: 'abricot', name: 'Abricot', cat: 'Chaleureux', p: { temp: 0.3, tint: 0.15, exp: 0.08, fade: 0.05 } },

  { id: 'arctique', name: 'Arctique', cat: 'Froid', p: { temp: -0.55, exp: 0.15, sat: -0.2, hl: [0.85, 0.95, 1, 0.12] } },
  { id: 'acier', name: 'Acier', cat: 'Froid', p: { temp: -0.3, sat: -0.55, con: 0.2, curve: 0.15 } },
  { id: 'ocean', name: 'Océan', cat: 'Froid', p: { temp: -0.35, tint: -0.1, vib: 0.25, sh: [...blue, 0.12] } },
  { id: 'givre', name: 'Givre', cat: 'Froid', p: { temp: -0.4, fade: 0.1, exp: 0.12, sat: -0.25 } },
  { id: 'lagon', name: 'Lagon', cat: 'Froid', p: { temp: -0.2, tint: -0.2, sat: 0.2, hl: [...cyan, 0.12] } },

  { id: 'dune', name: 'Dune', cat: 'Ciné', p: { temp: 0.55, sat: -0.3, con: 0.2, sh: [0.45, 0.35, 0.25, 0.15], fade: 0.03 } },
  { id: 'matrice', name: 'Matrice', cat: 'Ciné', p: { tint: -0.5, sat: -0.3, con: 0.25, sh: [0.2, 0.5, 0.3, 0.15] } },
  { id: 'noirfilm', name: 'Film noir', cat: 'Ciné', p: { bw: [0.3, 0.59, 0.11], con: 0.5, curve: 0.45, exp: -0.15 } },
  { id: 'apocalypse', name: 'Apocalypse', cat: 'Ciné', p: { temp: 0.35, sat: -0.5, con: 0.35, hl: [...orange, 0.1], sh: [0.3, 0.3, 0.25, 0.1] } },
  { id: 'aventure', name: 'Aventure', cat: 'Ciné', p: { sh: [...teal, 0.14], hl: [...gold, 0.12], con: 0.18, vib: 0.15 } },
  { id: 'scifi', name: 'Science-fiction', cat: 'Ciné', p: { temp: -0.35, sat: -0.2, con: 0.25, sh: [0.2, 0.35, 0.6, 0.15], hl: [...cyan, 0.08] } },
  { id: 'drame', name: 'Drame', cat: 'Ciné', p: { sat: -0.35, con: 0.25, exp: -0.1, fade: 0.04, sh: [...blue, 0.08] } },
  { id: 'bleacher', name: 'Sans blanchiment', cat: 'Ciné', p: { sat: -0.5, con: 0.4, curve: 0.3 } },

  { id: 'kodaque', name: 'Pellicule chaude', cat: 'Vintage', p: { temp: 0.3, fade: 0.06, curve: 0.2, sh: [...teal, 0.06], hl: [...gold, 0.1] } },
  { id: 'retro80', name: 'Rétro 80', cat: 'Vintage', p: { tint: 0.2, sat: 0.15, fade: 0.08, sh: [...purple, 0.12], hl: [...pink, 0.08] } },
  { id: 'annees50', name: 'Années 50', cat: 'Vintage', p: { sat: -0.2, fade: 0.1, hl: [...cream, 0.15], sh: [...teal, 0.08] } },
  { id: 'jauni', name: 'Photo jaunie', cat: 'Vintage', p: { temp: 0.4, sat: -0.4, fade: 0.12, hl: [1, 0.92, 0.6, 0.15] } },
  { id: 'vhs', name: 'Cassette VHS', cat: 'Vintage', p: { sat: 0.1, con: -0.1, fade: 0.1, tint: -0.1, hl: [...cyan, 0.06], sh: [...magenta, 0.06] } },
  { id: 'croise', name: 'Traitement croisé', cat: 'Vintage', p: { mix: [[1.1, 0, -0.1], [0, 1.05, 0.05], [0.1, 0, 0.75]], con: 0.2, hl: [1, 1, 0.6, 0.12] } },

  { id: 'nbdramatique', name: 'N&B dramatique', cat: 'Noir et blanc', p: { bw: [0.2, 0.3, 0.5], con: 0.5, curve: 0.4, exp: -0.1 } },
  { id: 'nbfiltrerouge', name: 'N&B filtre rouge', cat: 'Noir et blanc', p: { bw: [0.8, 0.2, 0], con: 0.25 } },
  { id: 'nbfiltrevert', name: 'N&B filtre vert', cat: 'Noir et blanc', p: { bw: [0.2, 0.75, 0.05], con: 0.15 } },
  { id: 'nbdelave', name: 'N&B délavé', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], fade: 0.18, con: -0.15 } },
  { id: 'cyanotype', name: 'Cyanotype', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], sh: [0.05, 0.2, 0.55, 0.3], hl: [0.85, 0.95, 1, 0.1] } },
  { id: 'platine', name: 'Platine', cat: 'Noir et blanc', p: { bw: [0.3, 0.59, 0.11], exp: 0.1, curve: 0.25, hl: [0.95, 0.93, 0.9, 0.08] } },

  { id: 'menthealeau', name: 'Menthe à l’eau', cat: 'Pastel', p: { tint: -0.2, fade: 0.14, exp: 0.12, sat: -0.1 } },
  { id: 'rosepoudre', name: 'Rose poudré', cat: 'Pastel', p: { tint: 0.18, temp: 0.08, fade: 0.14, hl: [...pink, 0.1] } },
  { id: 'nuage', name: 'Nuage', cat: 'Pastel', p: { exp: 0.25, fade: 0.18, con: -0.2, sat: -0.2 } },
  { id: 'dragee', name: 'Dragée', cat: 'Pastel', p: { fade: 0.12, sat: -0.05, sh: [...blue, 0.08], hl: [...pink, 0.12], exp: 0.1 } },
  { id: 'citronnade', name: 'Citronnade', cat: 'Pastel', p: { temp: 0.15, tint: -0.1, fade: 0.12, exp: 0.12, hl: [1, 1, 0.7, 0.1] } },

  { id: 'saturation', name: 'Saturé', cat: 'Vif', p: { sat: 0.7, con: 0.1 } },
  { id: 'arcenciel', name: 'Arc-en-ciel', cat: 'Vif', p: { vib: 0.6, sat: 0.2, curve: 0.2 } },
  { id: 'fluo', name: 'Fluo', cat: 'Vif', p: { sat: 0.6, con: 0.35, tint: -0.15, hl: [0.7, 1, 0.4, 0.1] } },
  { id: 'bonbon', name: 'Bonbon', cat: 'Vif', p: { sat: 0.45, tint: 0.2, exp: 0.08, hl: [...pink, 0.08] } },
  { id: 'hdr', name: 'Effet HDR', cat: 'Vif', p: { vib: 0.45, curve: 0.45, con: 0.1, sh: [0.5, 0.5, 0.5, 0] } },

  { id: 'ville', name: 'Ville la nuit', cat: 'Nuit', p: { temp: -0.2, con: 0.25, sh: [...blue, 0.15], hl: [...orange, 0.15] } },
  { id: 'cyberpunk', name: 'Cyberpunk', cat: 'Nuit', p: { sat: 0.3, con: 0.3, sh: [...magenta, 0.2], hl: [...cyan, 0.18], exp: -0.1 } },
  { id: 'vision', name: 'Vision nocturne', cat: 'Nuit', p: { bw: [0.3, 0.59, 0.11], duo: [[0, 0.06, 0], [0.55, 1, 0.45]], con: 0.2 } },
  { id: 'lanterne', name: 'Lanterne', cat: 'Nuit', p: { temp: 0.6, exp: -0.3, con: 0.3, sh: [0.15, 0.15, 0.35, 0.15] } },
  { id: 'aurore', name: 'Aurore boréale', cat: 'Nuit', p: { exp: -0.08, tint: -0.15, vib: 0.35, con: 0.18, sh: [0.1, 0.6, 0.45, 0.16], hl: [0.7, 0.45, 1, 0.12] } },

  { id: 'plage', name: 'Plage', cat: 'Voyage', p: { exp: 0.15, temp: 0.12, tint: -0.08, vib: 0.35, hl: [...cyan, 0.06] } },
  { id: 'montagne', name: 'Montagne', cat: 'Voyage', p: { temp: -0.15, con: 0.18, vib: 0.25, curve: 0.15 } },
  { id: 'desert', name: 'Désert', cat: 'Voyage', p: { temp: 0.5, exp: 0.1, sat: -0.1, con: 0.12, hl: [...gold, 0.1] } },
  { id: 'tokyo', name: 'Tokyo', cat: 'Voyage', p: { temp: -0.15, tint: 0.1, fade: 0.06, sh: [...teal, 0.1], hl: [...pink, 0.08] } },
  { id: 'paris', name: 'Paris', cat: 'Voyage', p: { temp: 0.12, sat: -0.12, fade: 0.08, hl: [...cream, 0.12], curve: 0.1 } },
  { id: 'jungle', name: 'Jungle', cat: 'Voyage', p: { tint: -0.25, vib: 0.4, con: 0.15, sh: [...green, 0.1] } },
  { id: 'mediterranee', name: 'Méditerranée', cat: 'Voyage', p: { exp: 0.12, vib: 0.4, temp: 0.08, sh: [...blue, 0.08] } },

  { id: 'gourmand', name: 'Gourmand', cat: 'Cuisine', p: { temp: 0.2, vib: 0.35, con: 0.1, exp: 0.08 } },
  { id: 'frais', name: 'Frais', cat: 'Cuisine', p: { exp: 0.15, tint: -0.1, vib: 0.3, temp: -0.05 } },
  { id: 'cafe', name: 'Café', cat: 'Cuisine', p: { temp: 0.35, sat: -0.1, con: 0.18, sh: [0.45, 0.3, 0.2, 0.15] } },
  { id: 'patisserie', name: 'Pâtisserie', cat: 'Cuisine', p: { exp: 0.15, tint: 0.1, fade: 0.06, sat: 0.1, hl: [...cream, 0.08] } },
  { id: 'grill', name: 'Grillade', cat: 'Cuisine', p: { temp: 0.45, con: 0.2, sat: 0.15, curve: 0.15 } },

  { id: 'printemps', name: 'Printemps', cat: 'Saisons', p: { exp: 0.1, tint: -0.08, vib: 0.3, hl: [...pink, 0.06] } },
  { id: 'automne', name: 'Automne', cat: 'Saisons', p: { temp: 0.45, hue: -6, sat: 0.1, con: 0.1, sh: [0.45, 0.25, 0.15, 0.1] } },
  { id: 'hiver', name: 'Hiver', cat: 'Saisons', p: { temp: -0.45, exp: 0.12, sat: -0.3, fade: 0.05 } },
  { id: 'canicule', name: 'Canicule', cat: 'Saisons', p: { temp: 0.6, exp: 0.2, con: 0.1, sat: -0.05, hl: [1, 0.9, 0.6, 0.15] } },
  { id: 'pluie', name: 'Jour de pluie', cat: 'Saisons', p: { temp: -0.25, sat: -0.35, con: -0.05, fade: 0.08, exp: -0.08 } },

  { id: 'rougeseul', name: 'Rouge seul', cat: 'Couleur sélective', p: { keep: [0, 40], con: 0.1 } },
  { id: 'orangeseul', name: 'Orange seul', cat: 'Couleur sélective', p: { keep: [30, 30], con: 0.1 } },
  { id: 'jauneseul', name: 'Jaune seul', cat: 'Couleur sélective', p: { keep: [58, 30], con: 0.1 } },
  { id: 'vertseul', name: 'Vert seul', cat: 'Couleur sélective', p: { keep: [120, 50], con: 0.1 } },
  { id: 'bleuseul', name: 'Bleu seul', cat: 'Couleur sélective', p: { keep: [215, 45], con: 0.1 } },
  { id: 'roseseul', name: 'Rose seul', cat: 'Couleur sélective', p: { keep: [320, 40], con: 0.1 } },

  { id: 'duobleuorange', name: 'Bleu et orange', cat: 'Duotone', p: { duo: [[0.05, 0.12, 0.35], [1, 0.7, 0.35]], con: 0.1 } },
  { id: 'duorose', name: 'Rose et violet', cat: 'Duotone', p: { duo: [[0.2, 0.05, 0.35], [1, 0.6, 0.75]], con: 0.1 } },
  { id: 'duovert', name: 'Vert forêt', cat: 'Duotone', p: { duo: [[0.02, 0.15, 0.1], [0.8, 0.95, 0.7]], con: 0.1 } },
  { id: 'duorouge', name: 'Rouge et noir', cat: 'Duotone', p: { duo: [[0.05, 0, 0.02], [1, 0.25, 0.2]], con: 0.25 } },
  { id: 'duocyan', name: 'Cyan et magenta', cat: 'Duotone', p: { duo: [[0.3, 0, 0.35], [0.4, 1, 0.95]], con: 0.1 } },
  { id: 'duoor', name: 'Or et nuit', cat: 'Duotone', p: { duo: [[0.04, 0.05, 0.15], [1, 0.85, 0.45]], con: 0.15 } },

  { id: 'infrarouge', name: 'Infrarouge', cat: 'Créatif', p: { mix: [[0.1, 0.9, 0], [0.9, 0.1, 0], [0, 0, 1]], con: 0.15 } },
  { id: 'inverse', name: 'Couleurs inversées', cat: 'Créatif', p: { invert: true, con: 0.05 } },
  { id: 'bd', name: 'Bande dessinée', cat: 'Créatif', p: { post: 5, sat: 0.35, con: 0.2 } },
  { id: 'affiche', name: 'Affiche', cat: 'Créatif', p: { post: 3, sat: 0.4, con: 0.25 } },
  { id: 'echange', name: 'Couleurs échangées', cat: 'Créatif', p: { mix: [[0, 0, 1], [0, 1, 0], [1, 0, 0]] } },
  { id: 'arcade', name: 'Arcade', cat: 'Créatif', p: { post: 4, sat: 0.5, sh: [...purple, 0.15], hl: [...cyan, 0.1] } },
  { id: 'thermique', name: 'Caméra thermique', cat: 'Créatif', p: { bw: [0.3, 0.59, 0.11], duo: [[0.1, 0, 0.45], [1, 0.85, 0.1]], con: 0.3 } },
];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function hueRotate([r, g, b], deg) {
  const a = (deg * Math.PI) / 180;
  const C = Math.cos(a);
  const S = Math.sin(a);
  return [
    r * (0.213 + C * 0.787 - S * 0.213) + g * (0.715 - C * 0.715 - S * 0.715) + b * (0.072 - C * 0.072 + S * 0.928),
    r * (0.213 - C * 0.213 + S * 0.143) + g * (0.715 + C * 0.285 + S * 0.14) + b * (0.072 - C * 0.072 - S * 0.283),
    r * (0.213 - C * 0.213 - S * 0.787) + g * (0.715 - C * 0.715 + S * 0.715) + b * (0.072 + C * 0.928 + S * 0.072),
  ];
}

// Hue of a colour in degrees (0 = red, 120 = green, 240 = blue) and how colourful it is (0..1).
function hueOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 1e-6) return [0, 0];
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, d / Math.max(max, 1e-6)];
}

export function gradeColor(rgb, p) {
  let c = [...rgb];
  if (p.exp) c = c.map((v) => v * 2 ** p.exp);
  if (p.temp) {
    c[0] += 0.1 * p.temp;
    c[2] -= 0.1 * p.temp;
  }
  if (p.tint) c[1] -= 0.08 * p.tint;
  if (p.hue) c = hueRotate(c, p.hue);
  // mix: channel mixer, each output channel = a weighted sum of the input r, g, b.
  if (p.mix) c = p.mix.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2]);
  // invert: negative picture.
  if (p.invert) c = c.map((v) => 1 - clamp01(v));
  if (p.bw) {
    const l = c[0] * p.bw[0] + c[1] * p.bw[1] + c[2] * p.bw[2];
    c = [l, l, l];
  }
  // keep: [hue, width] — colours near that hue stay, everything else turns black and white.
  if (p.keep) {
    const [h, s] = hueOf(c);
    const dist = Math.min(Math.abs(h - p.keep[0]), 360 - Math.abs(h - p.keep[0]));
    const t = clamp01(1 - dist / p.keep[1]);
    const w = t * t * (3 - 2 * t) * clamp01(s * 3);
    const l = luma(c);
    c = c.map((v) => l + (v - l) * w);
  }
  if (p.sat || p.vib) {
    const l = luma(c);
    const spread = Math.max(...c) - Math.min(...c);
    const k = 1 + (p.sat || 0) + (p.vib || 0) * (1 - clamp01(spread));
    c = c.map((v) => l + (v - l) * k);
  }
  if (p.con) c = c.map((v) => (v - 0.5) * (1 + p.con) + 0.5);
  if (p.curve) {
    c = c.map((v) => {
      const x = clamp01(v);
      return v + (x * x * (3 - 2 * x) - x) * p.curve;
    });
  }
  if (p.gamma) c = c.map((v) => clamp01(v) ** (1 / p.gamma));
  // duo: [dark colour, light colour] — the picture's brightness redrawn between two colours.
  if (p.duo) {
    const l = clamp01(luma(c));
    c = p.duo[0].map((d, i) => d + (p.duo[1][i] - d) * l);
  }
  // post: number of levels per channel (poster / comic look). The steps are slightly rounded so video
  // noise doesn't make colours flicker between two levels (and so the 3D table can follow them).
  if (p.post) {
    c = c.map((v) => {
      const x = clamp01(v) * (p.post - 1);
      const k = Math.min(Math.floor(x), p.post - 2);
      const t = clamp01((x - k - 0.25) / 0.5);
      return (k + t * t * (3 - 2 * t)) / (p.post - 1);
    });
  }
  const l = clamp01(luma(c));
  if (p.sh) c = c.map((v, i) => v + (p.sh[i] - 0.5) * 2 * p.sh[3] * (1 - l) ** 2);
  if (p.hl) c = c.map((v, i) => v + (p.hl[i] - 0.5) * 2 * p.hl[3] * l ** 2);
  if (p.fade) c = c.map((v) => p.fade + clamp01(v) * (1 - p.fade));
  return c.map(clamp01);
}

// Table layout follows the .cube convention: red changes fastest, then green, then blue.
export function buildLut(p, size = LUT_SIZE) {
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = gradeColor([r / (size - 1), g / (size - 1), b / (size - 1)], p);
        data[i++] = out[0];
        data[i++] = out[1];
        data[i++] = out[2];
      }
    }
  }
  return data;
}

