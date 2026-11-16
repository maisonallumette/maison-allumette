// Crée une commande et renvoie l'adresse de la page de paiement Stripe.
// Les prix ne viennent jamais du navigateur : ils sont recalculés depuis le catalogue.
// Une carte cadeau peut payer les créations (pas d'autres cartes cadeaux) ; si elle couvre tout, aucun paiement Stripe.
import { memeOrigine, reponse } from '../lib/acces.mjs';
import {
  CARTE, ErreurBoutique, MENTION_TVA, MINIMUM_STRIPE, cartes, centimes, commandes, debiterCarte, finaliserCommande, lieuRetrait,
  normaliserCode, nouvelId, produit, reference, stripe, texte, texteLieu, texteLong,
} from '../lib/boutique.mjs';

const MAX_LIGNES = 30, MAX_QTE = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function lireCommande(corps) {
  const articles = (Array.isArray(corps?.articles) ? corps.articles : []).map((a) => {
    const p = produit(typeof a?.slug === 'string' ? a.slug : '');
    if (!p) throw new ErreurBoutique(400, 'Un article du panier n’existe plus. Retirez-le puis réessayez.');
    if (!Number.isInteger(a.qte) || a.qte < 1 || a.qte > MAX_QTE) throw new ErreurBoutique(400, 'Quantité incorrecte.');
    return { slug: p.slug, nom: p.name, prix: centimes(p.price), qte: a.qte };
  });
  const cartesCadeaux = (Array.isArray(corps?.cartes) ? corps.cartes : []).map((c) => {
    if (!Number.isInteger(c?.montant) || c.montant < CARTE.min || c.montant > CARTE.max) {
      throw new ErreurBoutique(400, `Le montant d’une carte cadeau doit être entre ${CARTE.min} € et ${CARTE.max} €.`);
    }
    const remise = c.remise === 'poste' ? 'poste' : 'retrait';
    const carte = {
      montant: centimes(c.montant), remise, prenom: texte(c.prenom, 60), nom: texte(c.nom, 60), mot: texteLong(c.mot, 200), de: texte(c.de, 60),
    };
    if (remise === 'poste') {
      carte.adresse = texte(c.adresse, 120); carte.ville = texte(c.ville, 60); carte.cp = texte(c.cp, 5);
      if (!/^[0-9]{5}$/.test(carte.cp)) throw new ErreurBoutique(400, 'Le code postal doit contenir 5 chiffres.');
    }
    return carte;
  });
  if (!articles.length && !cartesCadeaux.length) throw new ErreurBoutique(400, 'Votre panier est vide.');
  if (articles.length + cartesCadeaux.length > MAX_LIGNES) throw new ErreurBoutique(400, 'Trop d’articles dans le panier.');
  const email = texte(corps?.client?.email, 120);
  if (!EMAIL.test(email)) throw new ErreurBoutique(400, 'L’adresse e-mail semble incorrecte.');
  const client = { nom: texte(corps?.client?.nom, 80), email, telephone: texte(corps?.client?.telephone, 30) };
  if (corps?.cgv !== true) throw new ErreurBoutique(400, 'Merci d’accepter les conditions générales de vente.');
  return { articles, cartes: cartesCadeaux, client };
}

async function creer(req) {
  const corps = await req.json();
  const { articles, cartes: cartesCadeaux, client } = lireCommande(corps);
  const sousTotal = articles.reduce((s, a) => s + a.prix * a.qte, 0);
  const totalCartes = cartesCadeaux.reduce((s, c) => s + c.montant, 0);
  const envoi = cartesCadeaux.filter((c) => c.remise === 'poste').length * centimes(CARTE.envoiPostal);
  let aPayer = sousTotal + totalCartes + envoi;

  // Carte cadeau utilisée : seulement sur les créations, et Stripe exige au moins 0,50 € s'il reste quelque chose à payer
  let carteUtilisee = null;
  if (corps?.code) {
    const code = normaliserCode(corps.code);
    const carte = code && await cartes().get(code, { type: 'json' });
    if (!carte || carte.solde <= 0) throw new ErreurBoutique(400, 'Cette carte cadeau est inconnue ou déjà entièrement utilisée.');
    let montant = Math.min(carte.solde, sousTotal);
    const reste = aPayer - montant;
    if (reste > 0 && reste < MINIMUM_STRIPE) montant -= MINIMUM_STRIPE - reste;
    if (montant > 0) { carteUtilisee = { code, montant }; aPayer -= montant; }
  }

  const id = nouvelId();
  const lieu = lieuRetrait();
  const commande = {
    id, ref: reference(id), creeLe: new Date().toISOString(), statut: 'en_attente', lieu, client,
    articles, cartes: cartesCadeaux, envoi, sousTotal, totalCartes, carteUtilisee, aPayer,
  };
  await commandes().setJSON(id, commande);
  const origine = new URL(req.url).origin;
  const merci = `${origine}/commande/merci?ref=${commande.ref}`;

  // Entièrement payée par la carte cadeau : pas de passage par Stripe
  if (aPayer === 0) {
    // On débite d'abord la carte : si une autre commande vient de l'utiliser, rien n'est validé
    const debit = await debiterCarte(carteUtilisee.code, carteUtilisee.montant, id);
    if (!debit.ok) {
      await commandes().setJSON(id, { ...commande, statut: 'abandonnee' });
      throw new ErreurBoutique(409, 'Le solde de la carte cadeau vient de changer. Vérifiez-le puis réessayez.');
    }
    await finaliserCommande(id, { paiement: 'carte cadeau', montantPaye: 0 });
    return reponse({ url: merci });
  }

  const s = stripe();
  const lignes = [
    ...articles.map((a) => ({ quantity: a.qte, price_data: { currency: 'eur', unit_amount: a.prix, product_data: { name: a.nom } } })),
    ...cartesCadeaux.map((c) => ({ quantity: 1, price_data: { currency: 'eur', unit_amount: c.montant, product_data: { name: `Carte cadeau pour ${c.prenom}` } } })),
    ...(envoi ? [{ quantity: 1, price_data: { currency: 'eur', unit_amount: envoi, product_data: { name: 'Envoi postal de la carte cadeau' } } }] : []),
  ];
  const remise = carteUtilisee
    ? [{ coupon: (await s.coupons.create({ amount_off: carteUtilisee.montant, currency: 'eur', duration: 'once', max_redemptions: 1, name: `Carte cadeau ${carteUtilisee.code}` })).id }]
    : undefined;
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    line_items: lignes,
    discounts: remise,
    customer_email: client.email,
    client_reference_id: id,
    metadata: { commande: id },
    payment_intent_data: { description: `Commande ${commande.ref}`, metadata: { commande: id } },
    custom_text: { submit: { message: `Retrait gratuit : ${texteLieu(lieu)}. Nous vous prévenons dès que votre commande est prête. ${MENTION_TVA}.` } },
    success_url: merci,
    cancel_url: `${origine}/panier`,
  });
  commande.sessionId = session.id;
  await commandes().setJSON(id, commande);
  return reponse({ url: session.url });
}

export default async (req) => {
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée.' }, 405);
  if (!memeOrigine(req)) return reponse({ erreur: 'Origine refusée.' }, 403);
  try {
    return await creer(req);
  } catch (e) {
    if (e instanceof ErreurBoutique) return reponse({ erreur: e.message }, e.status);
    if (e instanceof SyntaxError) return reponse({ erreur: 'Requête invalide.' }, 400);
    console.error('Erreur commande', e?.type ?? e?.name, e?.message);
    return reponse({ erreur: 'Le paiement n’a pas pu être préparé. Réessayez dans un instant.' }, 502);
  }
};

// 20 commandes par minute et par adresse IP au maximum
export const config = {
  path: '/api/commande',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
