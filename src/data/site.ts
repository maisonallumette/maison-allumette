// Réglages généraux du site. Les valeurs partagées avec le serveur (retrait, Pop-Up, carte cadeau) sont dans site.json.
import site from './site.json';

// Site vitrine tant que la vente n'est pas ouverte : pas de panier ni de bouton « Ajouter au panier », les prix restent affichés.
// Pour ouvrir la vente : variable Netlify PUBLIC_VENTE_EN_LIGNE = true, puis redéployer (rien à changer dans le code).
// Le paiement passe par Stripe (variables STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET).
export const VENTE_EN_LIGNE = import.meta.env.PUBLIC_VENTE_EN_LIGNE === 'true';

// Pop-Up Store de Noël à Mont-de-Marsan (association Pop-Up Store MDM).
// Le lien de l'en-tête disparaît tout seul après la fermeture.
export const POPUP = site.popup;

// Retrait gratuit : au Pop-Up Store pendant son ouverture, chez Atelier Cruchon le reste de l'année.
export const RETRAIT = site.retrait;
export const CARTE_CADEAU = site.carteCadeau;
export const MENTION_TVA = site.mentionTva;
