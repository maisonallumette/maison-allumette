// Boutique côté serveur : prix recalculés depuis le catalogue, lieu de retrait, cartes cadeaux et commandes stockées sur Netlify.
// Aucun secret ici : les clés Stripe viennent des variables d'environnement Netlify.
import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import catalogue from '../../src/data/catalogue.json' with { type: 'json' };
import site from '../../src/data/site.json' with { type: 'json' };

export const CARTE = site.carteCadeau;
export const MENTION_TVA = site.mentionTva;
export const MINIMUM_STRIPE = 50; // Stripe refuse un paiement de moins de 0,50 €

export class ErreurBoutique extends Error {
  constructor(status, texte) { super(texte); this.status = status; }
}

/* ---------- Stockage (Netlify Blobs). Les tests remplacent ce stockage par un stockage en mémoire. ---------- */
export const stockage = (nom) => globalThis.__MA_STOCKAGE__?.(nom) ?? getStore({ name: nom, consistency: 'strong' });
export const commandes = () => stockage('commandes');
export const cartes = () => stockage('cartes-cadeaux');

/* ---------- Stripe ---------- */
export function stripe() {
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) throw new ErreurBoutique(503, 'La vente en ligne n’est pas encore ouverte.');
  return new Stripe(cle, globalThis.__MA_STRIPE_OPTIONS__ ?? {});
}

/* ---------- Catalogue et prix (en centimes) ---------- */
export const centimes = (euros) => Math.round(euros * 100);
export const produit = (slug) => catalogue.products.find((p) => p.slug === slug);

/* ---------- Lieu de retrait : Pop-Up Store pendant son ouverture, Atelier Cruchon le reste de l'année ---------- */
export function lieuRetrait(maintenant = Date.now()) {
  const pendantPopup = maintenant >= Date.parse(site.popup.ouverture) && maintenant < Date.parse(site.popup.fermeture);
  return pendantPopup ? site.retrait.popup : site.retrait.atelier;
}
export const texteLieu = (l) => (l.adresse ? `${l.nom}, ${l.adresse}` : l.nom);

/* ---------- Codes de cartes cadeaux : MA-XXXX-XXXX, sans lettres ambiguës (0/O, 1/I) ---------- */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function nouveauCode() {
  const octets = randomBytes(8);
  const c = [...octets].map((o) => ALPHABET[o % 32]).join('');
  return `MA-${c.slice(0, 4)}-${c.slice(4)}`;
}
// Accepte « ma 2k7p 9xq3 », « MA2K7P9XQ3 »… et renvoie MA-2K7P-9XQ3, ou '' si le format est faux
export function normaliserCode(v) {
  const brut = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const corps = brut.startsWith('MA') ? brut.slice(2) : brut;
  if (corps.length !== 8 || [...corps].some((c) => !ALPHABET.includes(c))) return '';
  return `MA-${corps.slice(0, 4)}-${corps.slice(4)}`;
}

/* ---------- Petits contrôles ---------- */
export const texte = (v, max, requis = true) => {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if ((requis && !t) || t.length > max) throw new ErreurBoutique(400, 'Commande invalide : un champ est vide ou trop long.');
  return t;
};
export const texteLong = (v, max) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t || t.length > max) throw new ErreurBoutique(400, 'Le petit mot est vide ou trop long.');
  return t;
};

export const nouvelId = () => `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
export const reference = (id) => id.split('-').pop().toUpperCase();

/* ---------- Écritures prudentes sur une carte cadeau (deux paiements en même temps ne peuvent pas dépenser deux fois) ---------- */
export async function debiterCarte(code, montant, commandeId) {
  const store = cartes();
  for (let essai = 0; essai < 5; essai++) {
    const lu = await store.getWithMetadata(code, { type: 'json' });
    if (!lu?.data) return { ok: false, raison: 'introuvable' };
    const carte = lu.data;
    if (carte.mouvements?.some((m) => m.commande === commandeId)) return { ok: true, deja: true, solde: carte.solde };
    if (carte.solde < montant) return { ok: false, raison: 'solde insuffisant', solde: carte.solde };
    carte.solde -= montant;
    carte.mouvements = [...(carte.mouvements ?? []), { date: new Date().toISOString(), montant: -montant, commande: commandeId }];
    const r = await store.setJSON(code, carte, { onlyIfMatch: lu.etag });
    if (r.modified) return { ok: true, solde: carte.solde };
  }
  return { ok: false, raison: 'conflit' };
}

// Une commande passe à « payée » une seule fois : cartes cadeaux créées et carte utilisée débitée à ce moment-là
export async function finaliserCommande(id, infos = {}) {
  const store = commandes();
  for (let essai = 0; essai < 5; essai++) {
    const lu = await store.getWithMetadata(id, { type: 'json' });
    if (!lu?.data) throw new ErreurBoutique(404, 'Commande introuvable.');
    const c = lu.data;
    if (c.statut !== 'en_attente') return c;
    if (c.carteUtilisee) {
      const d = await debiterCarte(c.carteUtilisee.code, c.carteUtilisee.montant, id);
      if (!d.ok) c.alerte = `Carte cadeau ${c.carteUtilisee.code} non débitée (${d.raison}) : à vérifier.`;
    }
    for (const carte of c.cartes) {
      if (carte.code) continue;
      for (let i = 0; i < 5 && !carte.code; i++) {
        const code = nouveauCode();
        const r = await cartes().setJSON(code, {
          code, montant: carte.montant, solde: carte.montant, creeLe: new Date().toISOString(), commande: id,
          pour: `${carte.prenom} ${carte.nom}`, de: carte.de, remise: carte.remise, mouvements: [],
        }, { onlyIfNew: true });
        if (r.modified) carte.code = code;
      }
    }
    Object.assign(c, infos, { statut: 'payee', payeeLe: new Date().toISOString() });
    const r = await store.setJSON(id, c, { onlyIfMatch: lu.etag });
    if (r.modified) return c;
  }
  throw new ErreurBoutique(409, 'Commande modifiée en même temps : réessayer.');
}
