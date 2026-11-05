// Le catalogue vit dans catalogue.json, modifié depuis la page /admin/
import catalogue from './catalogue.json';
import { CADRAGE_DEFAUT, type Cadrage } from './cadrage';

export const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export type Subcategory = { slug: string; name: string };
export type Category = { slug: string; name: string; subcategories: Subcategory[] };
export type Product = { slug: string; name: string; category: string; subcategory: string; price: number; short: string; description: string; notes: string[]; conseils: string; composition: string; image: string; cadrage: Cadrage };

export const categories: Category[] = catalogue.categories;
export const products: Product[] = catalogue.products.map((p) => ({ ...p, image: p.image || '/placeholder.svg', cadrage: (p as { cadrage?: Cadrage }).cadrage ?? CADRAGE_DEFAUT }));
export const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? '';
export const subcategoryName = (cat: string, sub: string) => categories.find((c) => c.slug === cat)?.subcategories.find((s) => s.slug === sub)?.name ?? '';
