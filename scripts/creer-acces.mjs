// Prépare l'accès à la page admin : lancer « npm run admin:acces » dans le terminal.
// Le mot de passe n'est ni affiché ni enregistré : seule son empreinte part sur Netlify.
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { creerEmpreinte } from '../netlify/lib/acces.mjs';

const MIN = 14;
const lignes = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
const suivantes = lignes[Symbol.asyncIterator]();
const lire = async (question, masque = false) => {
  process.stdout.write(question);
  if (masque && process.stdin.isTTY) lignes._writeToOutput = () => {};
  const { value } = await suivantes.next();
  if (masque && process.stdin.isTTY) { delete lignes._writeToOutput; process.stdout.write('\n'); }
  return (value ?? '').trim();
};

const identifiant = await lire('Identifiant de connexion : ');
if (!identifiant) { console.error('Il faut un identifiant.'); process.exit(1); }
const motDePasse = await lire(`Mot de passe (${MIN} caractères minimum, rien ne s'affiche) : `, true);
if (motDePasse.length < MIN) { console.error(`Mot de passe trop court : ${MIN} caractères minimum.`); process.exit(1); }
const confirmation = await lire('Retapez le mot de passe : ', true);
if (motDePasse !== confirmation) { console.error('Les deux mots de passe sont différents.'); process.exit(1); }
lignes.close();

console.log(`
Dans Netlify : Project configuration > Environment variables, créez ces variables :

ADMIN_IDENTIFIANT
${identifiant}

ADMIN_MOT_DE_PASSE_EMPREINTE
${await creerEmpreinte(motDePasse)}

ADMIN_SESSION_SECRET
${randomBytes(32).toString('hex')}

ADMIN_GITHUB_JETON
(le jeton GitHub, à créer une seule fois)

Ne mettez jamais ces valeurs dans le code ni dans un message.`);
