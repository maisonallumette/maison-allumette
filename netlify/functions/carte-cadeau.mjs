// Consultation du solde d'une carte cadeau, depuis la page carte cadeau ou le panier.
// Ne renvoie que le solde : jamais le nom de la personne, le message ni l'historique.
import { memeOrigine, reponse } from '../lib/acces.mjs';
import { cartes, normaliserCode } from '../lib/boutique.mjs';

export default async (req) => {
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée.' }, 405);
  if (!memeOrigine(req)) return reponse({ erreur: 'Origine refusée.' }, 403);
  let corps;
  try { corps = await req.json(); } catch { return reponse({ erreur: 'Requête invalide.' }, 400); }
  const code = normaliserCode(corps?.code);
  const carte = code ? await cartes().get(code, { type: 'json' }) : null;
  if (!carte) return reponse({ erreur: 'Ce code ne correspond à aucune carte cadeau. Vérifiez-le (format MA-XXXX-XXXX).' }, 404);
  return reponse({ code, solde: carte.solde });
};

// 10 essais toutes les 3 minutes par adresse IP : impossible de deviner des codes en essayant au hasard
export const config = {
  path: '/api/carte-cadeau',
  rateLimit: { windowLimit: 10, windowSize: 180, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
