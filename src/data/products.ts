export const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export type Product = { slug: string; name: string; category: string; price: number; short: string; description: string; notes: string[]; image: string };
const img = '/placeholder.svg';
export const products: Product[] = [
  { slug: 'bougie-fleurie', name: 'Bougie fleurie', category: 'Bougies', price: 18, image: img,
    short: 'Cire végétale et fleurs séchées des Landes.',
    description: 'Une bougie coulée à la main, parée de fleurs séchées locales et de paillettes biodégradables. Elle parfume la pièce en douceur et se garde ensuite comme un joli objet.',
    notes: ['Cire végétale', 'Fragrance de Grasse', 'Fleurs séchées locales', 'Fait main dans les Landes'] },
  { slug: 'fondants-parfumes', name: 'Fondants parfumés', category: 'Fondants', price: 7, image: img,
    short: 'Pour parfumer la maison sans flamme.',
    description: 'Des fondants à faire fondre dans un brûle-parfum, pour une odeur généreuse sans flamme.',
    notes: ['Sans flamme', 'Fragrance de Grasse', 'Fait main dans les Landes'] },
  { slug: 'suspension-parfumee', name: 'Suspension parfumée', category: 'Suspensions', price: 9, image: img,
    short: 'À glisser dans un placard ou un tiroir.',
    description: 'Une suspension parfumée pour les armoires, les dressings et les petits recoins de la maison.',
    notes: ['Format 50 g', 'Fragrance de Grasse', 'Cornet kraft'] },
  { slug: 'diffuseur-voiture', name: 'Diffuseur voiture', category: 'Voiture', price: 12, image: img,
    short: 'Un parfum doux pour chaque trajet.',
    description: 'Un diffuseur à accrocher au rétroviseur ou à glisser dans l’habitacle, pour des trajets qui sentent bon.',
    notes: ['14 ml', 'Fragrance de Grasse', 'Fait main dans les Landes'] },
  { slug: 'tablettes-parfumees', name: 'Tablettes parfumées', category: 'Tablettes', price: 8, image: img,
    short: 'De petites attentions à offrir.',
    description: 'Des tablettes parfumées en cire végétale, à poser dans un meuble ou à offrir en petit cadeau.',
    notes: ['Cire végétale', 'Idée cadeau', 'Fait main dans les Landes'] },
];
