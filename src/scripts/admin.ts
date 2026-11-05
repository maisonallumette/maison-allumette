// Page /admin/ : modifie le catalogue.
// Les changements restent dans un brouillon (IndexedDB) ; « Publier » les envoie en UN SEUL commit sur GitHub,
// donc une seule publication Netlify, car ces publications sont comptées.
// La connexion et l'écriture sur GitHub passent par les fonctions de netlify/functions : le navigateur ne voit aucun secret.
import { CADRAGE_DEFAUT, ZOOM_MAX, styleCadrage, type Cadrage } from '../data/cadrage';

const API = '/api/admin';
const RAW = 'https://raw.githubusercontent.com/maisonallumette/maison-allumette/main/public';
const DOSSIER_PHOTOS = '/images/produits/';
const PHOTO_MAX = 1600;

type Sub = { slug: string; name: string };
type Category = { slug: string; name: string; subcategories: Sub[] };
type Product = { slug: string; name: string; category: string; subcategory: string; price: number; short: string; description: string; notes: string[]; conseils: string; composition: string; image: string; cadrage?: Cadrage };
type Catalogue = { categories: Category[]; products: Product[] };
// files : chemin dans public/ -> contenu base64 à envoyer, ou null pour supprimer le fichier
type Draft = { catalogue: Catalogue; files: Record<string, string | null>; baseSha: string; log: string[] };

const racine = document.getElementById('admin')!;
let enLigne: Catalogue | null = null;
let draft: Draft | null = null;
let onglet: 'produits' | 'categories' = 'produits';
let edition: string | null = null; // slug du produit modifié, 'nouveau', ou null pour la liste
let occupe = false;
let message: { texte: string; erreur: boolean } | null = null;

/* ---------- Petits outils ---------- */

type Enfant = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...enfants: Enfant[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') (el as HTMLInputElement).value = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const e of enfants) if (e) el.append(e);
  return el;
}

export function slugify(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function slugLibre(nom: string, pris: string[]) {
  const base = slugify(nom);
  if (!base) return '';
  let s = base, i = 2;
  while (pris.includes(s)) s = `${base}-${i++}`;
  return s;
}

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const cn = {
  champ: 'mt-1 w-full border border-lin bg-white px-3 py-2 text-base',
  label: 'mt-4 block text-xs font-semibold uppercase tracking-wider',
  btn: 'border border-olive bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-40',
  btnPlein: 'bg-olive px-4 py-3 text-xs font-semibold uppercase tracking-wider text-creme disabled:opacity-40',
  btnDanger: 'border border-terracotta px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#a83c14]',
};

// replaceChildren écrirait « null » ou « false » à l'écran : on retire d'abord les enfants vides
const remplacer = (...enfants: Enfant[]) => racine.replaceChildren(...enfants.filter((e): e is Node | string => Boolean(e)));

function dire(texte: string, erreur = false) {
  message = { texte, erreur };
  afficher();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Échanges avec le serveur ---------- */

class ErreurApi extends Error { constructor(public status: number, texte: string) { super(texte); } }

async function api(chemin: string, corps?: unknown) {
  let r: Response;
  try {
    r = await fetch(API + chemin, corps === undefined ? { cache: 'no-store' } : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  } catch {
    throw new ErreurApi(0, 'Impossible de joindre le serveur. Vérifiez votre connexion : vos brouillons sont conservés.');
  }
  const donnees = await r.json().catch(() => null);
  if (r.ok && donnees) return donnees;
  if (r.status === 429) throw new ErreurApi(429, 'Trop de tentatives : réessayez dans quelques minutes.');
  throw new ErreurApi(r.status, donnees?.erreur || `Le serveur a répondu par une erreur (${r.status}).`);
}

const lireCatalogue = (): Promise<{ catalogue: Catalogue; sha: string }> => api('/catalogue');

async function publier() {
  if (!draft || occupe) return;
  occupe = true; message = { texte: 'Publication en cours…', erreur: false }; afficher();
  try {
    const envois = Object.entries(draft.files);
    const photos = envois.filter(([, contenu]) => contenu !== null);
    const files: Record<string, string | null> = {};
    let i = 0;
    for (const [chemin, contenu] of envois) {
      if (contenu === null) { files[chemin] = null; continue; }
      message = { texte: `Envoi de la photo ${++i} sur ${photos.length}…`, erreur: false }; afficher();
      files[chemin] = (await api('/photo', { contenu })).sha;
    }
    message = { texte: 'Publication en cours…', erreur: false }; afficher();
    const frais = await api('/publier', { catalogue: draft.catalogue, files, baseSha: draft.baseSha, log: draft.log });
    enLigne = frais.catalogue;
    draft = { catalogue: JSON.parse(JSON.stringify(frais.catalogue)), files: {}, baseSha: frais.sha, log: [] };
    await viderBrouillon();
    edition = null;
    message = { texte: 'C’est publié ! Le site sera à jour dans une à deux minutes.', erreur: false };
  } catch (e) {
    occupe = false;
    if (e instanceof ErreurApi && e.status === 401) { sessionPerdue(); return; }
    message = { texte: e instanceof ErreurApi ? e.message : 'Erreur inattendue pendant la publication. Vos brouillons sont conservés.', erreur: true };
  }
  occupe = false; afficher(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Brouillon conservé dans le navigateur ---------- */

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('ma-admin', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function base<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const r = fn(db.transaction('kv', mode).objectStore('kv'));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
const viderBrouillon = () => base('readwrite', (s) => s.delete('brouillon'));
const lireBrouillon = () => base<Draft | undefined>('readonly', (s) => s.get('brouillon'));

// Toute modification passe par ici : on l'applique, on la note, on la sauvegarde
function modifier(journal: string, fn: (c: Catalogue, d: Draft) => void) {
  fn(draft!.catalogue, draft!);
  draft!.log.push(journal);
  base('readwrite', (s) => s.put(JSON.parse(JSON.stringify(draft)), 'brouillon')).catch(() => {
    dire('Impossible de sauvegarder le brouillon dans ce navigateur : publiez avant de fermer la page.', true);
  });
}

async function abandonner() {
  if (!confirm('Abandonner toutes les modifications non publiées ?')) return;
  occupe = true; afficher();
  try {
    await viderBrouillon();
    const frais = await lireCatalogue();
    enLigne = frais.catalogue;
    draft = { catalogue: JSON.parse(JSON.stringify(frais.catalogue)), files: {}, baseSha: frais.sha, log: [] };
    edition = null; message = { texte: 'Brouillons abandonnés : vous voyez la version en ligne.', erreur: false };
  } catch (e) {
    message = { texte: (e as Error).message, erreur: true };
  }
  occupe = false; afficher();
}

/* ---------- Photos ---------- */

async function preparerPhoto(fichier: File): Promise<string> {
  let image: ImageBitmap;
  try { image = await createImageBitmap(fichier); }
  catch { throw new Error('Ce format de photo n’est pas lu par ce navigateur. Utilisez un JPEG ou un PNG.'); }
  const k = Math.min(1, PHOTO_MAX / Math.max(image.width, image.height));
  const c = document.createElement('canvas');
  c.width = Math.round(image.width * k); c.height = Math.round(image.height * k);
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(image, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

function apercu(p: Product) {
  if (!p.image) return '/placeholder.svg';
  const attente = draft!.files[p.image];
  return attente ? `data:image/jpeg;base64,${attente}` : RAW + p.image;
}

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Petite photo de la liste, avec le cadrage du produit
function vignette(p: Product) {
  return h('div', { class: 'relative size-14 flex-none overflow-hidden bg-lin' },
    h('img', { src: apercu(p), alt: '', loading: 'lazy', style: styleCadrage(p.cadrage ?? CADRAGE_DEFAUT), class: 'absolute inset-0 size-full object-cover' }));
}

// Choix du cadrage : on fait glisser la photo dans le carré, le curseur règle le zoom
function outilCadrage(depart: Cadrage) {
  let cadrage = { ...depart };
  const image = h('img', { alt: 'Aperçu de la photo dans son cadre carré', class: 'pointer-events-none absolute inset-0 size-full select-none object-cover' });
  const zoom = h('input', { id: 'p-zoom', type: 'range', min: '1', max: String(ZOOM_MAX), step: '0.01', class: 'mt-1 block w-full accent-olive' });
  const appliquer = () => {
    image.style.cssText = styleCadrage(cadrage);
    zoom.value = String(cadrage.zoom);
  };
  // Décalage en pixels -> position en % : tout dépend de ce qui dépasse du carré sur cet axe
  const deplacer = (dx: number, dy: number) => {
    const cote = cadre.clientWidth;
    const petit = Math.min(image.naturalWidth, image.naturalHeight);
    if (!cote || !petit) return;
    const depasse = (dim: number) => (dim / petit) * cote * cadrage.zoom - cote;
    const position = (p: number, d: number, dim: number) => (depasse(dim) > 0.5 ? borner(p - (d / depasse(dim)) * 100, 0, 100) : p);
    cadrage.x = Math.round(position(cadrage.x, dx, image.naturalWidth) * 10) / 10;
    cadrage.y = Math.round(position(cadrage.y, dy, image.naturalHeight) * 10) / 10;
    appliquer();
  };
  let precedent: { x: number; y: number } | null = null;
  const cadre = h('div', {
    tabindex: '0', role: 'group', 'aria-label': 'Cadrage de la photo : faites glisser la photo, ou utilisez les flèches du clavier',
    class: 'relative mt-2 aspect-square w-full max-w-xs cursor-grab touch-none select-none overflow-hidden border border-olive bg-lin active:cursor-grabbing',
    onpointerdown: (e: PointerEvent) => { cadre.setPointerCapture(e.pointerId); precedent = { x: e.clientX, y: e.clientY }; },
    onpointermove: (e: PointerEvent) => {
      if (!precedent) return;
      const avant = precedent; precedent = { x: e.clientX, y: e.clientY };
      deplacer(e.clientX - avant.x, e.clientY - avant.y);
    },
    onpointerup: () => { precedent = null; },
    onpointercancel: () => { precedent = null; },
    onkeydown: (e: KeyboardEvent) => {
      const sens: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const s = sens[e.key];
      if (!s) return;
      e.preventDefault();
      deplacer(s[0] * 8, s[1] * 8);
    },
  }, image,
    // Sur téléphone, le bouton des listes couvre environ un cinquième de la photo
    h('p', { class: 'pointer-events-none absolute inset-x-0 bottom-0 flex h-1/5 items-center justify-center bg-creme/80 text-center text-[10px] uppercase tracking-wider' }, 'Zone du bouton « Ajouter au panier »'));
  zoom.addEventListener('input', () => { cadrage.zoom = Number(zoom.value); appliquer(); });
  const recentrer = h('button', { type: 'button', class: `${cn.btn} mt-2`, onclick: () => { cadrage = { ...CADRAGE_DEFAUT }; appliquer(); } }, 'Recentrer');
  const bloc = h('div', { class: 'mt-3' },
    h('p', { class: 'text-xs/5' }, 'Faites glisser la photo pour choisir ce qui apparaît dans le carré.'),
    cadre,
    h('label', { for: 'p-zoom', class: cn.label }, 'Zoom'), zoom,
    recentrer);
  appliquer();
  return {
    bloc,
    valeur: () => ({ ...cadrage }),
    // Une nouvelle photo repart d'un cadrage centré ; sans photo, il n'y a rien à cadrer
    montrer: (src: string, neuf: Cadrage) => { cadrage = { ...neuf }; image.src = src; bloc.hidden = false; appliquer(); },
    cacher: () => { image.removeAttribute('src'); bloc.hidden = true; },
  };
}

// Une photo déjà en ligne doit être supprimée du dépôt ; une photo jamais publiée sort juste du brouillon
function oublierPhoto(chemin: string, d: Draft) {
  if (!chemin.startsWith(DOSSIER_PHOTOS)) return;
  if (enLigne!.products.some((p) => p.image === chemin)) d.files[chemin] = null;
  else delete d.files[chemin];
}

/* ---------- Écrans ---------- */

function ecranConnexion(erreur = '') {
  const identifiant = h('input', { id: 'identifiant', required: true, autocomplete: 'username', autocapitalize: 'none', class: cn.champ });
  const motDePasse = h('input', { id: 'mot-de-passe', type: 'password', required: true, autocomplete: 'current-password', class: cn.champ });
  const bouton = h('button', { class: `${cn.btnPlein} mt-6 w-full` }, 'Se connecter');
  const seConnecter = async (e: Event) => {
    e.preventDefault();
    bouton.disabled = true;
    try {
      await api('/connexion', { identifiant: identifiant.value.trim(), motDePasse: motDePasse.value });
      await charger();
    } catch (err) {
      ecranConnexion((err as Error).message);
    }
  };
  remplacer(
    h('h1', { class: 'h-title text-2xl' }, 'Administration'),
    erreur && h('p', { role: 'alert', class: 'mt-4 border border-terracotta bg-white p-3 text-sm' }, erreur),
    h('form', { class: 'mt-4', onsubmit: seConnecter },
      h('label', { for: 'identifiant', class: cn.label }, 'Identifiant'), identifiant,
      h('label', { for: 'mot-de-passe', class: cn.label }, 'Mot de passe'), motDePasse,
      bouton),
  );
}

// Charge le catalogue : le serveur répond 401 s'il n'y a pas de session valide
async function charger() {
  remplacer(h('p', { class: 'py-10 text-center text-sm' }, 'Chargement du catalogue…'));
  try {
    const frais = await lireCatalogue();
    enLigne = frais.catalogue;
    const garde = await lireBrouillon().catch(() => undefined);
    draft = garde && garde.log.length ? garde : { catalogue: JSON.parse(JSON.stringify(frais.catalogue)), files: {}, baseSha: frais.sha, log: [] };
    if (garde && garde.log.length) message = { texte: 'Vos modifications non publiées ont été retrouvées.', erreur: false };
    afficher();
  } catch (e) {
    ecranConnexion(e instanceof ErreurApi && e.status === 401 ? '' : (e as Error).message);
  }
}

// Le brouillon est déjà sauvegardé : il sera retrouvé après la reconnexion
function sessionPerdue() {
  draft = null; enLigne = null; message = null; edition = null;
  ecranConnexion('Votre session a expiré : reconnectez-vous. Vos brouillons sont conservés.');
}

async function deconnexion() {
  const reste = draft && draft.log.length ? ' Vos brouillons restent sur cet appareil.' : '';
  if (!confirm(`Se déconnecter ?${reste}`)) return;
  try {
    await api('/deconnexion', {});
    draft = null; enLigne = null; message = null; edition = null;
    ecranConnexion();
  } catch (e) {
    dire((e as Error).message, true);
  }
}

function afficher() {
  if (!draft) return;
  const n = draft.log.length;
  const bouton = (id: typeof onglet, texte: string) => h('button', { type: 'button', 'aria-pressed': onglet === id ? 'true' : 'false', class: `flex-1 border-b-2 py-3 text-xs font-semibold uppercase tracking-wider ${onglet === id ? 'border-terracotta' : 'border-transparent'}`, onclick: () => { onglet = id; edition = null; message = null; afficher(); } }, texte);
  remplacer(
    h('header', { class: 'flex items-center justify-between gap-4' },
      h('h1', { class: 'h-title text-xl' }, 'Administration'),
      h('button', { type: 'button', class: 'text-xs underline', onclick: deconnexion }, 'Se déconnecter')),
    message && h('p', { role: message.erreur ? 'alert' : 'status', class: `mt-4 border bg-white p-3 text-sm ${message.erreur ? 'border-terracotta' : 'border-olive'}` }, message.texte),
    h('section', { class: 'mt-4 border border-lin bg-white p-4' },
      h('p', { class: 'text-sm font-semibold' }, n ? `${n} modification${n > 1 ? 's' : ''} non publiée${n > 1 ? 's' : ''}` : 'Aucune modification en attente'),
      n > 0 && h('details', { class: 'mt-1 text-sm' }, h('summary', { class: 'cursor-pointer' }, 'Voir le détail'), h('ul', { class: 'mt-1 list-disc pl-5' }, ...draft.log.map((l) => h('li', {}, l)))),
      h('p', { class: 'mt-1 text-xs/5' }, 'Faites toutes vos modifications, puis publiez une seule fois : chaque publication est comptée par Netlify.'),
      h('div', { class: 'mt-3 flex flex-wrap gap-2' },
        h('button', { type: 'button', class: cn.btnPlein, disabled: !n || occupe, onclick: publier }, 'Publier sur le site'),
        n > 0 && h('button', { type: 'button', class: cn.btn, disabled: occupe, onclick: abandonner }, 'Tout abandonner'))),
    h('nav', { class: 'mt-6 flex border-b border-lin' }, bouton('produits', 'Produits'), bouton('categories', 'Catégories')),
    onglet === 'categories' ? ecranCategories() : edition ? ecranProduit(edition) : ecranListe(),
  );
}

function ecranListe() {
  const c = draft!.catalogue;
  const nomCat = (s: string) => c.categories.find((x) => x.slug === s)?.name ?? '';
  const nomSub = (p: Product) => c.categories.find((x) => x.slug === p.category)?.subcategories.find((s) => s.slug === p.subcategory)?.name ?? '';
  return h('section', { class: 'mt-4' },
    h('button', { type: 'button', class: `${cn.btnPlein} w-full`, onclick: () => { edition = 'nouveau'; message = null; afficher(); window.scrollTo(0, 0); } }, 'Nouveau produit'),
    c.products.length === 0 && h('p', { class: 'mt-6 text-sm' }, 'Aucun produit pour le moment.'),
    h('ul', { class: 'mt-4 divide-y divide-lin' }, ...c.products.map((p) => h('li', { class: 'flex items-center gap-3 py-3' },
      vignette(p),
      h('div', { class: 'min-w-0 flex-1' },
        h('p', { class: 'truncate text-sm font-semibold' }, p.name),
        h('p', { class: 'truncate text-xs' }, [nomCat(p.category), nomSub(p)].filter(Boolean).join(' › '), ' · ', eur(p.price))),
      h('button', { type: 'button', class: cn.btn, onclick: () => { edition = p.slug; message = null; afficher(); window.scrollTo(0, 0); } }, 'Modifier')))),
  );
}

function ecranProduit(slug: string) {
  const c = draft!.catalogue;
  const existant = slug === 'nouveau' ? null : c.products.find((p) => p.slug === slug) ?? null;
  let photo: string | null = null;
  let retirerPhoto = false;
  if (c.categories.length === 0) return h('p', { class: 'mt-6 text-sm' }, 'Créez d’abord une catégorie dans l’onglet Catégories.');

  const champ = (id: string, texte: string, el: HTMLElement) => h('div', {}, h('label', { for: id, class: cn.label }, texte), el);
  const nom = h('input', { id: 'p-nom', required: true, maxlength: 120, class: cn.champ, value: existant?.name ?? '' });
  const prix = h('input', { id: 'p-prix', required: true, inputmode: 'decimal', class: cn.champ, value: existant ? String(existant.price).replace('.', ',') : '' });
  const cat = h('select', { id: 'p-cat', required: true, class: cn.champ }, ...c.categories.map((x) => h('option', { value: x.slug }, x.name)));
  const sub = h('select', { id: 'p-sub', class: cn.champ });
  const remplirSous = (voulue = '') => {
    const liste = c.categories.find((x) => x.slug === cat.value)?.subcategories ?? [];
    sub.replaceChildren(h('option', { value: '' }, liste.length ? 'Aucune' : 'Aucune sous-catégorie disponible'), ...liste.map((s) => h('option', { value: s.slug }, s.name)));
    sub.disabled = liste.length === 0;
    sub.value = liste.some((s) => s.slug === voulue) ? voulue : '';
  };
  cat.value = existant?.category ?? c.categories[0].slug;
  remplirSous(existant?.subcategory);
  cat.addEventListener('change', () => remplirSous());
  const court = h('input', { id: 'p-court', maxlength: 160, class: cn.champ, value: existant?.short ?? '' });
  const texte = (id: string, v: string) => { const t = h('textarea', { id, rows: 4, class: cn.champ }); t.value = v; return t; };
  const desc = texte('p-desc', existant?.description ?? '');
  const notes = texte('p-notes', (existant?.notes ?? []).join('\n'));
  const conseils = texte('p-conseils', existant?.conseils ?? '');
  const compo = texte('p-compo', existant?.composition ?? '');
  const outil = outilCadrage(existant?.cadrage ?? CADRAGE_DEFAUT);
  if (existant?.image) outil.montrer(apercu(existant), existant.cadrage ?? CADRAGE_DEFAUT);
  else outil.cacher();
  const fichier = h('input', { id: 'p-photo', type: 'file', accept: 'image/*', class: 'mt-1 block w-full text-sm', onchange: async () => {
    const f = fichier.files?.[0];
    if (!f) return;
    try {
      photo = await preparerPhoto(f); retirerPhoto = false;
      outil.montrer(`data:image/jpeg;base64,${photo}`, CADRAGE_DEFAUT);
    } catch (e) { fichier.value = ''; alert((e as Error).message); }
  } });

  const enregistrer = (e: Event) => {
    e.preventDefault();
    const prixNb = Number(prix.value.trim().replace(',', '.').replace(/\s*€$/, ''));
    if (!Number.isFinite(prixNb) || prixNb < 0 || prix.value.trim() === '') { alert('Le prix doit être un nombre, par exemple 18 ou 12,50.'); prix.focus(); return; }
    const nomV = nom.value.trim();
    const slugNeuf = existant ? existant.slug : slugLibre(nomV, c.products.map((p) => p.slug));
    if (!slugNeuf) { alert('Le nom doit contenir au moins une lettre ou un chiffre.'); nom.focus(); return; }
    const chemin = `${DOSSIER_PHOTOS}${slugNeuf}.jpg`;
    const donnees: Product = {
      slug: slugNeuf, name: nomV, category: cat.value, subcategory: sub.value, price: Math.round(prixNb * 100) / 100, image: photo ? chemin : retirerPhoto ? '' : existant?.image ?? '', cadrage: outil.valeur(),
      short: court.value.trim(), description: desc.value.trim(), notes: notes.value.split('\n').map((l) => l.trim()).filter(Boolean), conseils: conseils.value.trim(), composition: compo.value.trim(),
    };
    modifier(`${existant ? 'Produit modifié' : 'Produit ajouté'} : ${nomV}`, (cat2, d) => {
      if (existant?.image && (retirerPhoto || (photo && existant.image !== chemin))) oublierPhoto(existant.image, d);
      if (photo) d.files[chemin] = photo;
      if (existant) cat2.products[cat2.products.findIndex((p) => p.slug === existant.slug)] = donnees;
      else cat2.products.push(donnees);
    });
    edition = null;
    dire(`« ${nomV} » est enregistré en brouillon. Pensez à publier quand vous avez fini.`);
  };
  const supprimer = () => {
    if (!existant || !confirm(`Supprimer « ${existant.name} » ?`)) return;
    modifier(`Produit supprimé : ${existant.name}`, (cat2, d) => {
      if (existant.image) oublierPhoto(existant.image, d);
      cat2.products = cat2.products.filter((p) => p.slug !== existant.slug);
    });
    edition = null;
    dire(`« ${existant.name} » est supprimé du brouillon.`);
  };

  return h('form', { class: 'mt-4', onsubmit: enregistrer },
    h('h2', { class: 'h-title text-lg' }, existant ? `Modifier : ${existant.name}` : 'Nouveau produit'),
    champ('p-nom', 'Nom *', nom),
    champ('p-prix', 'Prix en euros *', prix),
    champ('p-cat', 'Catégorie *', cat),
    champ('p-sub', 'Sous-catégorie', sub),
    champ('p-court', 'Accroche (sous le nom)', court),
    champ('p-desc', 'Description', desc),
    champ('p-notes', 'Points clés (un par ligne)', notes),
    champ('p-conseils', 'Conseils d’utilisation', conseils),
    champ('p-compo', 'Composition', compo),
    h('div', {}, h('label', { for: 'p-photo', class: cn.label }, 'Photo'), fichier, outil.bloc,
      existant?.image && h('button', { type: 'button', class: `${cn.btn} mt-2 block`, onclick: () => { retirerPhoto = true; photo = null; fichier.value = ''; outil.cacher(); } }, 'Retirer la photo')),
    h('div', { class: 'mt-6 flex flex-wrap gap-2' },
      h('button', { class: cn.btnPlein }, 'Enregistrer'),
      h('button', { type: 'button', class: cn.btn, onclick: () => { edition = null; afficher(); } }, 'Annuler'),
      existant && h('button', { type: 'button', class: `${cn.btnDanger} ml-auto`, onclick: supprimer }, 'Supprimer')),
  );
}

function ecranCategories() {
  const c = draft!.catalogue;
  const ajout = (id: string, texte: string, valider: (nom: string) => void) => {
    const champ = h('input', { id, required: true, maxlength: 60, placeholder: texte, 'aria-label': texte, class: 'min-w-0 flex-1 border border-lin bg-white px-3 py-2 text-base' });
    return h('form', { class: 'flex gap-2', onsubmit: (e: Event) => { e.preventDefault(); valider(champ.value.trim()); } }, champ, h('button', { class: cn.btn }, 'Ajouter'));
  };
  const nbCat = (slug: string) => c.products.filter((p) => p.category === slug).length;
  const nbSub = (cat: string, sub: string) => c.products.filter((p) => p.category === cat && p.subcategory === sub).length;

  const ajouterCat = (nom: string) => {
    const slug = slugify(nom);
    if (!slug) return alert('Le nom doit contenir au moins une lettre ou un chiffre.');
    if (c.categories.some((x) => x.slug === slug)) return alert(`La catégorie « ${nom} » existe déjà.`);
    modifier(`Catégorie ajoutée : ${nom}`, (k) => k.categories.push({ slug, name: nom, subcategories: [] }));
    dire(`Catégorie « ${nom} » ajoutée au brouillon.`);
  };
  const renommerCat = (x: Category) => {
    const nom = prompt('Nouveau nom de la catégorie :', x.name)?.trim();
    if (!nom || nom === x.name) return;
    modifier(`Catégorie renommée : ${x.name} → ${nom}`, (k) => { k.categories.find((y) => y.slug === x.slug)!.name = nom; });
    afficher();
  };
  const supprimerCat = (x: Category) => {
    const n = nbCat(x.slug);
    if (n) return alert(`Impossible : ${n} produit${n > 1 ? 's utilisent' : ' utilise'} encore « ${x.name} ». Changez-les de catégorie d’abord.`);
    if (!confirm(`Supprimer la catégorie « ${x.name} » et ses sous-catégories ?`)) return;
    modifier(`Catégorie supprimée : ${x.name}`, (k) => { k.categories = k.categories.filter((y) => y.slug !== x.slug); });
    afficher();
  };
  const ajouterSub = (x: Category, nom: string) => {
    const slug = slugify(nom);
    if (!slug) return alert('Le nom doit contenir au moins une lettre ou un chiffre.');
    if (x.subcategories.some((s) => s.slug === slug)) return alert(`La sous-catégorie « ${nom} » existe déjà dans ${x.name}.`);
    modifier(`Sous-catégorie ajoutée : ${x.name} › ${nom}`, (k) => k.categories.find((y) => y.slug === x.slug)!.subcategories.push({ slug, name: nom }));
    dire(`Sous-catégorie « ${nom} » ajoutée au brouillon.`);
  };
  const renommerSub = (x: Category, s: Sub) => {
    const nom = prompt('Nouveau nom de la sous-catégorie :', s.name)?.trim();
    if (!nom || nom === s.name) return;
    modifier(`Sous-catégorie renommée : ${s.name} → ${nom}`, (k) => { k.categories.find((y) => y.slug === x.slug)!.subcategories.find((z) => z.slug === s.slug)!.name = nom; });
    afficher();
  };
  const supprimerSub = (x: Category, s: Sub) => {
    const n = nbSub(x.slug, s.slug);
    if (n) return alert(`Impossible : ${n} produit${n > 1 ? 's utilisent' : ' utilise'} encore « ${s.name} ».`);
    if (!confirm(`Supprimer la sous-catégorie « ${s.name} » ?`)) return;
    modifier(`Sous-catégorie supprimée : ${x.name} › ${s.name}`, (k) => { const y = k.categories.find((v) => v.slug === x.slug)!; y.subcategories = y.subcategories.filter((z) => z.slug !== s.slug); });
    afficher();
  };

  return h('section', { class: 'mt-4' },
    ajout('nouvelle-cat', 'Nouvelle catégorie', ajouterCat),
    h('ul', { class: 'mt-4 space-y-3' }, ...c.categories.map((x) => h('li', { class: 'border border-lin bg-white p-4' },
      h('div', { class: 'flex flex-wrap items-center gap-2' },
        h('p', { class: 'min-w-0 flex-1 font-semibold' }, x.name, h('span', { class: 'block text-xs font-normal' }, `${nbCat(x.slug)} produit${nbCat(x.slug) > 1 ? 's' : ''}`)),
        h('button', { type: 'button', class: cn.btn, 'aria-label': `Renommer ${x.name}`, onclick: () => renommerCat(x) }, 'Renommer'),
        h('button', { type: 'button', class: cn.btnDanger, 'aria-label': `Supprimer ${x.name}`, onclick: () => supprimerCat(x) }, 'Supprimer')),
      x.subcategories.length > 0 && h('ul', { class: 'mt-3 divide-y divide-lin border-t border-lin' }, ...x.subcategories.map((s) => h('li', { class: 'flex flex-wrap items-center gap-2 py-2 pl-3' },
        h('p', { class: 'min-w-0 flex-1 text-sm' }, s.name, h('span', { class: 'block text-xs' }, `${nbSub(x.slug, s.slug)} produit${nbSub(x.slug, s.slug) > 1 ? 's' : ''}`)),
        h('button', { type: 'button', class: cn.btn, 'aria-label': `Renommer ${s.name}`, onclick: () => renommerSub(x, s) }, 'Renommer'),
        h('button', { type: 'button', class: cn.btnDanger, 'aria-label': `Supprimer ${s.name}`, onclick: () => supprimerSub(x, s) }, 'Supprimer')))),
      h('div', { class: 'mt-3' }, ajout(`nouvelle-sous-${x.slug}`, 'Nouvelle sous-catégorie', (nom) => ajouterSub(x, nom)))))),
  );
}

/* ---------- Démarrage ---------- */

localStorage.removeItem('ma-admin-jeton'); // ancien jeton de la première version de cette page
charger();
