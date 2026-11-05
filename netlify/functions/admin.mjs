// Actions de la page admin, réservées à une session valide. Le jeton GitHub reste ici, côté serveur.
// Seuls le catalogue et les photos de produits peuvent être écrits : jamais le code du site.
import { cookieEfface, memeOrigine, reponse, sessionValide } from '../lib/acces.mjs';

const API = 'https://api.github.com/repos/maisonallumette/maison-allumette';
const BRANCHE = 'main';
const CATALOGUE = 'src/data/catalogue.json';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PHOTO = /^\/images\/produits\/[a-z0-9]+(-[a-z0-9]+)*\.jpg$/;
const SHA = /^[0-9a-f]{40}$/;
const PHOTO_MAX = 6 * 1024 * 1024;

class ErreurHttp extends Error {
  constructor(status, texte) { super(texte); this.status = status; }
}

async function gh(chemin, init = {}) {
  const jeton = process.env.ADMIN_GITHUB_JETON;
  if (!jeton) throw new ErreurHttp(503, 'L’accès à GitHub n’est pas encore configuré sur Netlify.');
  let r;
  try {
    r = await fetch(API + chemin, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jeton}`, 'User-Agent': 'maison-allumette-admin', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  } catch {
    throw new ErreurHttp(502, 'Impossible de joindre GitHub. Vos brouillons sont conservés : réessayez.');
  }
  if (r.ok) return r.json();
  if (r.status === 401) throw new ErreurHttp(502, 'GitHub refuse le jeton enregistré sur Netlify : il est incorrect ou a expiré.');
  if (r.status === 403 || r.status === 404) throw new ErreurHttp(502, 'Le jeton enregistré sur Netlify n’a pas le droit de modifier le site (« Contents » en lecture et écriture sur maison-allumette).');
  const erreur = new ErreurHttp(502, `GitHub a répondu par une erreur (${r.status}).`);
  erreur.github = r.status;
  throw erreur;
}
const envoyer = (chemin, corps, method = 'POST') => gh(chemin, { method, body: JSON.stringify(corps) });

async function lireCatalogue(ref) {
  const f = await gh(`/contents/${CATALOGUE}?ref=${encodeURIComponent(ref)}`);
  return { catalogue: JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')), sha: f.sha };
}

const texte = (v, max = 5000) => {
  if (typeof v !== 'string' || v.length > max) throw new ErreurHttp(400, 'Catalogue invalide : un texte est incorrect ou trop long.');
  return v;
};

// Un catalogue incorrect casserait la construction du site : on le vérifie et on ne garde que les champs connus
export function nettoyerCatalogue(c) {
  if (!c || !Array.isArray(c.categories) || !Array.isArray(c.products)) throw new ErreurHttp(400, 'Catalogue invalide.');
  const slug = (s) => { if (typeof s !== 'string' || !SLUG.test(s)) throw new ErreurHttp(400, 'Catalogue invalide : adresse incorrecte.'); return s; };
  const uniques = (liste, quoi) => { if (new Set(liste).size !== liste.length) throw new ErreurHttp(400, `Catalogue invalide : ${quoi} en double.`); };
  const categories = c.categories.map((x) => ({
    slug: slug(x?.slug),
    name: texte(x?.name, 100),
    subcategories: (Array.isArray(x?.subcategories) ? x.subcategories : []).map((s) => ({ slug: slug(s?.slug), name: texte(s?.name, 100) })),
  }));
  uniques(categories.map((x) => x.slug), 'catégorie');
  categories.forEach((x) => uniques(x.subcategories.map((s) => s.slug), 'sous-catégorie'));
  const products = c.products.map((p) => {
    const cat = categories.find((x) => x.slug === p?.category);
    if (!cat) throw new ErreurHttp(400, `Catalogue invalide : catégorie inconnue pour « ${String(p?.name).slice(0, 80)} ».`);
    const sub = typeof p.subcategory === 'string' ? p.subcategory : '';
    if (sub && !cat.subcategories.some((s) => s.slug === sub)) throw new ErreurHttp(400, `Catalogue invalide : sous-catégorie inconnue pour « ${String(p.name).slice(0, 80)} ».`);
    if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0) throw new ErreurHttp(400, 'Catalogue invalide : prix incorrect.');
    const image = typeof p.image === 'string' ? p.image : '';
    if (image && !PHOTO.test(image)) throw new ErreurHttp(400, 'Catalogue invalide : photo incorrecte.');
    return {
      slug: slug(p.slug), name: texte(p.name, 200), category: cat.slug, subcategory: sub, price: p.price, image,
      short: texte(p.short ?? '', 300), description: texte(p.description ?? ''),
      notes: (Array.isArray(p.notes) ? p.notes : []).map((n) => texte(n, 300)),
      conseils: texte(p.conseils ?? ''), composition: texte(p.composition ?? ''),
    };
  });
  uniques(products.map((p) => p.slug), 'produit');
  return { categories, products };
}

async function envoyerPhoto(req) {
  const { contenu } = await req.json();
  // Uniquement des JPEG en base64 : le fichier commence par FF D8 FF, soit « /9j/ »
  if (typeof contenu !== 'string' || contenu.length > PHOTO_MAX || !contenu.startsWith('/9j/') || !/^[A-Za-z0-9+/]+={0,2}$/.test(contenu)) {
    throw new ErreurHttp(400, 'Photo refusée : elle doit être un JPEG de moins de 4 Mo.');
  }
  const { sha } = await envoyer('/git/blobs', { content: contenu, encoding: 'base64' });
  return reponse({ sha });
}

async function publier(req) {
  const { catalogue, files, baseSha, log } = await req.json();
  const propre = nettoyerCatalogue(catalogue);
  const fichiers = Object.entries(files && typeof files === 'object' ? files : {});
  for (const [chemin, sha] of fichiers) {
    if (!PHOTO.test(chemin) || !(sha === null || (typeof sha === 'string' && SHA.test(sha)))) throw new ErreurHttp(400, 'Fichier refusé : seules les photos de produits peuvent être modifiées.');
  }
  const journal = (Array.isArray(log) ? log : []).filter((l) => typeof l === 'string').slice(0, 300).map((l) => l.replace(/\s+/g, ' ').slice(0, 200));

  const tete = (await gh(`/git/ref/heads/${BRANCHE}`)).object.sha;
  const { sha } = await lireCatalogue(tete);
  if (sha !== baseSha) throw new ErreurHttp(409, 'Le catalogue a changé en ligne depuis le début de vos modifications (autre appareil ?). Rien n’a été publié. Abandonnez vos brouillons pour repartir de la version en ligne.');
  const base = (await gh(`/git/commits/${tete}`)).tree.sha;
  const arbre = await envoyer('/git/trees', {
    base_tree: base,
    tree: [
      { path: CATALOGUE, mode: '100644', type: 'blob', content: JSON.stringify(propre, null, 2) + '\n' },
      ...fichiers.map(([chemin, s]) => ({ path: `public${chemin}`, mode: '100644', type: 'blob', sha: s })),
    ],
  });
  const n = journal.length;
  const commit = await envoyer('/git/commits', {
    message: `Admin : met à jour le catalogue (${n} modification${n > 1 ? 's' : ''})\n\n${journal.map((l) => `- ${l}`).join('\n')}`,
    tree: arbre.sha,
    parents: [tete],
  });
  try {
    await envoyer(`/git/refs/heads/${BRANCHE}`, { sha: commit.sha }, 'PATCH');
  } catch (e) {
    if (e.github === 422) throw new ErreurHttp(409, 'Le site a changé pendant la publication. Rien n’a été publié : réessayez.');
    throw e;
  }
  return reponse(await lireCatalogue(commit.sha));
}

export default async (req) => {
  const action = new URL(req.url).pathname.split('/').pop();
  const ecriture = req.method === 'POST';
  if (!ecriture && !(req.method === 'GET' && action === 'catalogue')) return reponse({ erreur: 'Méthode non autorisée.' }, 405);
  if (ecriture && !memeOrigine(req)) return reponse({ erreur: 'Origine refusée.' }, 403);
  if (action === 'deconnexion') return reponse({ ok: true }, 200, { 'Set-Cookie': cookieEfface() });
  if (!sessionValide(req)) return reponse({ erreur: 'Session expirée : reconnectez-vous.' }, 401);
  try {
    if (action === 'catalogue') return reponse(await lireCatalogue(BRANCHE));
    if (action === 'photo') return await envoyerPhoto(req);
    if (action === 'publier') return await publier(req);
    return reponse({ erreur: 'Action inconnue.' }, 404);
  } catch (e) {
    if (e instanceof ErreurHttp) return reponse({ erreur: e.message }, e.status);
    if (e instanceof SyntaxError) return reponse({ erreur: 'Requête invalide.' }, 400);
    console.error('Erreur admin', e?.name);
    return reponse({ erreur: 'Erreur inattendue. Vos brouillons sont conservés.' }, 500);
  }
};

export const config = {
  path: ['/api/admin/deconnexion', '/api/admin/catalogue', '/api/admin/photo', '/api/admin/publier'],
};
