// Connexion à la page admin. Séparée du reste pour limiter les tentatives sur cette seule adresse.
import { accesConfigure, cookieSession, memeOrigine, memesTextes, reponse, verifierMotDePasse } from '../lib/acces.mjs';

export default async (req) => {
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée.' }, 405);
  if (!memeOrigine(req)) return reponse({ erreur: 'Origine refusée.' }, 403);
  if (!accesConfigure()) return reponse({ erreur: 'L’accès n’est pas encore configuré sur Netlify.' }, 503);

  let corps;
  try { corps = await req.json(); } catch { return reponse({ erreur: 'Requête invalide.' }, 400); }
  const identifiant = typeof corps?.identifiant === 'string' ? corps.identifiant.slice(0, 200) : '';
  const motDePasse = typeof corps?.motDePasse === 'string' ? corps.motDePasse.slice(0, 500) : '';

  // Le mot de passe est toujours vérifié, pour ne pas révéler par le temps de réponse si l'identifiant existe
  const bonMotDePasse = await verifierMotDePasse(motDePasse, process.env.ADMIN_MOT_DE_PASSE_EMPREINTE);
  if (!memesTextes(identifiant, process.env.ADMIN_IDENTIFIANT) || !bonMotDePasse) {
    return reponse({ erreur: 'Identifiant ou mot de passe incorrect.' }, 401);
  }
  return reponse({ ok: true }, 200, { 'Set-Cookie': cookieSession() });
};

// 10 essais toutes les 3 minutes par adresse IP
export const config = {
  path: '/api/admin/connexion',
  rateLimit: { windowLimit: 10, windowSize: 180, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
