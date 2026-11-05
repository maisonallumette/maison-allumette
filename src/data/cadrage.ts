// Cadrage d'une photo dans un carré : la photo d'origine n'est jamais recoupée, on peut donc le changer à tout moment.
// x et y vont de 0 à 100 (0 = bord gauche ou haut de la photo), zoom de 1 à 3.
export type Cadrage = { x: number; y: number; zoom: number };

export const CADRAGE_DEFAUT: Cadrage = { x: 50, y: 50, zoom: 1 };
export const ZOOM_MAX = 3;

// Le point (x, y) de la photo reste fixe pendant le zoom : la photo couvre donc toujours tout le carré
export const styleCadrage = ({ x, y, zoom }: Cadrage) =>
  `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${zoom})`;
