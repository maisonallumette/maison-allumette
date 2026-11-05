// Réglages généraux du site.

// Site vitrine tant que le paiement n'est pas branché : pas de panier ni de bouton « Ajouter au panier », les prix restent affichés.
// Passer à true pour réactiver le panier (il faudra aussi brancher le paiement : SumUp ou Stripe).
export const VENTE_EN_LIGNE = false;

// Pop-Up Store de Noël à Mont-de-Marsan (association Pop-Up Store MDM).
// Le lien de l'en-tête disparaît tout seul après la fermeture.
export const POPUP = {
  ouverture: '2026-11-20T10:00:00+01:00',
  fermeture: '2026-12-24T18:00:00+01:00',
  adresse: '43, rue Léon Gambetta',
  ville: 'Mont-de-Marsan',
  instagram: 'https://www.instagram.com/pop.up.store.mdm/',
  carte: 'https://www.google.com/maps/search/?api=1&query=43+rue+L%C3%A9on+Gambetta+40000+Mont-de-Marsan',
};
