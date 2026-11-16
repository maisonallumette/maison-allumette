// Stripe prévient ici quand un paiement est réussi. Le message est signé : on vérifie la signature avant d'y croire.
// C'est seulement à ce moment que la commande passe à « payée », que les cartes cadeaux achetées reçoivent leur code
// et que la carte cadeau utilisée est débitée.
import Stripe from 'stripe';
import { ErreurBoutique, commandes, finaliserCommande } from '../lib/boutique.mjs';

const texte = (t, status = 200) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export default async (req) => {
  if (req.method !== 'POST') return texte('Méthode non autorisée.', 405);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return texte('Webhook non configuré.', 503);

  let evenement;
  try {
    evenement = await Stripe.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return texte('Signature invalide.', 400);
  }

  const session = evenement.data.object;
  const id = session?.metadata?.commande;
  try {
    if ((evenement.type === 'checkout.session.completed' && session.payment_status === 'paid') || evenement.type === 'checkout.session.async_payment_succeeded') {
      if (!id) return texte('Pas de commande liée.');
      await finaliserCommande(id, {
        paiement: 'stripe',
        montantPaye: session.amount_total,
        paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      });
    } else if (evenement.type === 'checkout.session.expired' && id) {
      // Paiement abandonné : on le note, la carte cadeau éventuelle n'a pas été débitée
      const lu = await commandes().getWithMetadata(id, { type: 'json' });
      if (lu?.data?.statut === 'en_attente') await commandes().setJSON(id, { ...lu.data, statut: 'abandonnee' }, { onlyIfMatch: lu.etag });
    }
    return texte('OK');
  } catch (e) {
    // Une erreur renvoie 500 : Stripe renverra le message plus tard, et la finalisation ne se fait qu'une fois
    console.error('Erreur webhook', e instanceof ErreurBoutique ? e.message : e?.name);
    return texte('Erreur, à réessayer.', 500);
  }
};

export const config = { path: '/api/stripe-webhook' };
