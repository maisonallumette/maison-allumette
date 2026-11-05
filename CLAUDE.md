# Maison Allumette : site marchand (Astro + Tailwind v4)

Marque artisanale française de bougies fleuries, fondants, suspensions, diffuseurs voiture et tablettes parfumées, faits main dans les Landes. Accroche : « Réchauffez vos intérieurs ». Ton : chaleureux, cottage. Réponds en français.

## Technique
- Astro 5, Tailwind 4 (via @tailwindcss/vite), site 100 % statique.
- Dépôt GitHub : maisonallumette/maison-allumette (compte « maisonallumette », pas « Laregence »). Hébergement : Netlify (adresse .netlify.app).
- Commandes : `npm run dev` (http://localhost:4321), `npm run build`. Windows + VS Code.
- Le dossier du projet est `C:\Users\user\maison-allumette`. Ne jamais mélanger avec le site La Régence.

## Fichiers clés
- `src/styles/global.css` : thème provisoire (couleurs, polices), `.h-title`, `.vichy` (motif vichy), `.papier-peint` (larges bandes beiges sur crème), comportement de l'en-tête.
- `src/layouts/Base.astro` : en-tête (transparent en haut, bandeau blanc après 90 px de défilement), tiroir mobile, newsletter, pied de page, panier en localStorage.
- `src/pages/index.astro` (accueil, prop `overlay`), `boutique.astro` (filtre par `?q=`), `produits/[slug].astro` (fiche produit, barre d'achat fixe).
- `src/components/ProductCard.astro`, `Seal.astro` (sceau provisoire).
- `src/data/products.ts` : produits (noms, prix, descriptions d'exemple à remplacer).

## Direction artistique
- Inspiration de structure : fragonard.com (en-tête 3 zones, bandeau d'accueil coupé en deux, grille produits, fiche produit mobile avec barre d'achat fixe). Ne jamais copier leurs textes, images, logo ni code.
- Identité de la marque par Camille Lacroix Design : logo « maison » en script + ALLUMETTE en capitales espacées, sceau rond à l'hortensia « Homemade in Landes », badge maison, sceau orange, motif vichy, vert olive, sauge, beige, terracotta.
- Palette officielle (relevée sur les sceaux fournis par la graphiste) :
  crème #f1e7db · lin #ddd4c3 · sauge #92917d · olive #3b402c · cuivre #a07d5f · or #d9ae79 · orange #d85624.
  Remplacer les valeurs provisoires de `@theme` dans `src/styles/global.css` (olive, sauge, lin, creme, terracotta, cuivre).
- Logos fournis : sceau rond « Maison Allumette · Homemade in Landes 2021 » (hortensia), écusson ovale avec la maison (« maison » en script + ALLUMETTE + « Réchauffez vos intérieurs »), fleur seule dans un rond (pastille). Versions SVG noires dans `public/brand/` : `ma-tampon-ronde.svg`, `ma-tampon-ovale.svg` (à recolorer en CSS ou à demander à la graphiste en couleurs).
- Planches d'ambiance : forêt sous la pluie, bougie sur rebord de fenêtre, bottes vertes, bruyère, boiseries sauge, vichy beige, lin sauge/olive. Ton : cottage, brumeux, chaud.
- Polices : le script « maison » et les capitales fines d'ALLUMETTE sont dans le logo. Pour le texte du site, Cormorant Garamond + Montserrat restent un choix provisoire tant que la graphiste n'a pas confirmé.

## À faire
- Intégrer logos, polices, photos de la DA et photos produits.
- Vrais produits, prix, variantes, numéros de lot, conseils d'utilisation et composition.
- Pages manquantes : Notre histoire, Contact, CGV, mentions légales, livraison et retours, confidentialité.
- Paiement : relier « Valider ma commande » (SumUp ou Stripe). Le panier actuel ne passe pas de vraie commande.
- Newsletter : brancher un service d'e-mailing.

## Règles
- Mobile first. Textes en français. Pas d'avis clients inventés.
- Le domaine maisonallumette.fr pointe aujourd'hui vers la boutique SumUp (DNS OVH) : ne pas toucher au DNS sans demander.
- Ne jamais écrire de mots de passe ni de clés dans le code.
