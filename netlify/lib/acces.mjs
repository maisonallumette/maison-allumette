// Mot de passe et session de la page admin. Aucun secret ici : tout vient des variables d'environnement Netlify.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COOKIE = 'ma_session';
const DUREE = 30 * 24 * 3600; // 30 jours
const N = 2 ** 15, R = 8, P = 1, LONGUEUR = 32;

const calculer = (motDePasse, sel, n = N) => new Promise((ok, ko) => {
  scrypt(motDePasse, sel, LONGUEUR, { N: n, r: R, p: P, maxmem: 128 * n * R * 2 }, (e, k) => (e ? ko(e) : ok(k)));
});

export async function creerEmpreinte(motDePasse) {
  const sel = randomBytes(16);
  return `scrypt$${N}$${sel.toString('hex')}$${(await calculer(motDePasse, sel)).toString('hex')}`;
}

export async function verifierMotDePasse(motDePasse, empreinte) {
  const [algo, n, sel, attendu] = String(empreinte).split('$');
  if (algo !== 'scrypt' || !sel || !attendu) return false;
  const calcule = await calculer(motDePasse, Buffer.from(sel, 'hex'), Number(n));
  const cible = Buffer.from(attendu, 'hex');
  return cible.length === calcule.length && timingSafeEqual(calcule, cible);
}

// Comparaison à durée constante, quelle que soit la longueur : on compare des condensats
export function memesTextes(a, b) {
  const h = (t) => createHmac('sha256', 'comparaison').update(String(t)).digest();
  return timingSafeEqual(h(a), h(b));
}

const config = () => ({
  identifiant: process.env.ADMIN_IDENTIFIANT,
  empreinte: process.env.ADMIN_MOT_DE_PASSE_EMPREINTE,
  secret: process.env.ADMIN_SESSION_SECRET,
});

export function accesConfigure() {
  const c = config();
  return Boolean(c.identifiant && c.empreinte && c.secret && c.secret.length >= 32);
}

// La clé dépend de l'empreinte : changer le mot de passe déconnecte tous les appareils
const signer = (donnees) => {
  const c = config();
  return createHmac('sha256', `${c.secret}:${c.empreinte}`).update(donnees).digest('base64url');
};

export function creerSession(maintenant = Date.now()) {
  const donnees = Buffer.from(JSON.stringify({ exp: Math.floor(maintenant / 1000) + DUREE })).toString('base64url');
  return `${donnees}.${signer(donnees)}`;
}

export function sessionValide(req, maintenant = Date.now()) {
  if (!accesConfigure()) return false;
  const brut = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!brut) return false;
  const [donnees, signature] = brut.slice(COOKIE.length + 1).split('.');
  if (!donnees || !signature || !memesTextes(signature, signer(donnees))) return false;
  try {
    return JSON.parse(Buffer.from(donnees, 'base64url').toString()).exp > maintenant / 1000;
  } catch {
    return false;
  }
}

const cookie = (valeur, age) => `${COOKIE}=${valeur}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export const cookieSession = () => cookie(creerSession(), DUREE);
export const cookieEfface = () => cookie('', 0);

// Refuse les appels venus d'un autre site, en plus de SameSite=Strict
export function memeOrigine(req) {
  const origine = req.headers.get('origin');
  if (!origine) return false;
  let hote;
  try { hote = new URL(origine).host; } catch { return false; }
  return hote === req.headers.get('host') || hote === req.headers.get('x-forwarded-host');
}

export const reponse = (corps, status = 200, entetes = {}) => new Response(JSON.stringify(corps), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes },
});
