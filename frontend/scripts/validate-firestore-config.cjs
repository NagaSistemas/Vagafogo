'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectDirectory = path.resolve(__dirname, '..');
const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectDirectory, relativePath), 'utf8');

const firebaseConfig = JSON.parse(readProjectFile('firebase.json'));
assert.equal(
  firebaseConfig.firestore?.rules,
  'firestore.rules',
  'firebase.json precisa publicar firestore.rules',
);
assert.equal(
  firebaseConfig.firestore?.indexes,
  'firestore.indexes.json',
  'firebase.json precisa publicar firestore.indexes.json',
);

const indexes = JSON.parse(readProjectFile(firebaseConfig.firestore.indexes));
assert.ok(Array.isArray(indexes.indexes), 'firestore.indexes.json: indexes deve ser uma lista');
assert.ok(
  Array.isArray(indexes.fieldOverrides),
  'firestore.indexes.json: fieldOverrides deve ser uma lista',
);

const rules = readProjectFile(firebaseConfig.firestore.rules);

const validateBalancedTokens = (source) => {
  const opening = new Map([
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ]);
  const closing = new Set(opening.values());
  const stack = [];
  let quote = null;
  let escaped = false;
  let lineComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }

    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (opening.has(character)) {
      stack.push({ character, index });
      continue;
    }

    if (closing.has(character)) {
      const last = stack.pop();
      assert.ok(last, `Token ${character} sem abertura na posicao ${index}`);
      assert.equal(
        opening.get(last.character),
        character,
        `Token ${character} fecha incorretamente ${last.character} na posicao ${index}`,
      );
    }
  }

  assert.equal(quote, null, 'String sem fechamento em firestore.rules');
  assert.equal(stack.length, 0, 'Delimitador sem fechamento em firestore.rules');
};

validateBalancedTokens(rules);
assert.match(rules, /^rules_version\s*=\s*'2';/m, 'Firestore Rules v2 e obrigatorio');
assert.match(rules, /service\s+cloud\.firestore\s*\{/, 'Servico cloud.firestore ausente');
assert.match(
  rules,
  /match\s+\/databases\/\{database\}\/documents\s*\{/,
  'Escopo de documentos do Firestore ausente',
);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchBody = (pathPattern) => {
  const expression = new RegExp(
    `match\\s+${escapeRegExp(pathPattern)}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    'm',
  );
  const found = expression.exec(rules);
  assert.ok(found, `Regra obrigatoria ausente: match ${pathPattern}`);
  return found[1];
};

for (const collectionName of [
  'formularios',
  '_formularios_public_ids',
  '_formularios_admin_idempotency',
  'respostas',
]) {
  const body = matchBody(`/${collectionName}/{document=**}`);
  assert.match(
    body,
    /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/,
    `${collectionName} precisa negar toda leitura e escrita do cliente`,
  );
}

const declaredMatchPaths = Array.from(
  rules.matchAll(/^\s*match\s+([^\s]+)\s*\{\s*$/gm),
  (result) => result[1],
);
for (const collectionName of [
  'formularios',
  '_formularios_public_ids',
  '_formularios_admin_idempotency',
  'respostas',
]) {
  assert.deepEqual(
    declaredMatchPaths.filter((matchPath) => matchPath.startsWith(`/${collectionName}/`)),
    [`/${collectionName}/{document=**}`],
    `Nao adicione regra sobreposta que reabra ${collectionName}`,
  );
}

for (const collectionName of [
  'tipos_clientes',
  'combos',
  'disponibilidade',
]) {
  const body = matchBody(`/${collectionName}/{documentId}`);
  assert.match(body, /allow\s+read\s*:\s*if\s+true\s*;/, `${collectionName} precisa manter leitura publica`);
  assert.match(
    body,
    /allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isSignedIn\(\)\s*;/,
    `${collectionName} precisa exigir login nas escritas`,
  );
}

const packagesBody = matchBody('/pacotes/{documentId}');
assert.match(
  packagesBody,
  /allow\s+read\s*,\s*create\s*:\s*if\s+true\s*;/,
  'pacotes precisa manter leitura e criacao anonimas para o backend legado',
);
assert.match(
  packagesBody,
  /allow\s+update\s*,\s*delete\s*:\s*if\s+isSignedIn\(\)\s*;/,
  'Atualizacao e exclusao de pacotes precisam exigir login',
);

const reservationsBody = matchBody('/reservas/{documentId}');
assert.match(
  reservationsBody,
  /allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/,
  'reservas precisa preservar o backend legado anonimo ate sua migracao',
);

for (const collectionName of ['mesas', 'teste_conexao']) {
  const body = matchBody(`/${collectionName}/{documentId}`);
  assert.match(
    body,
    /allow\s+read\s*,\s*create\s*,\s*update\s*,\s*delete\s*:\s*if\s+isSignedIn\(\)\s*;/,
    `${collectionName} precisa exigir login em toda operacao`,
  );
}

const configurationsBody = matchBody('/configuracoes/{configId}');
assert.match(
  configurationsBody,
  /allow\s+get\s*:\s*if\s+configId\s+in\s*\[[\s\S]*?'site'[\s\S]*?'email'[\s\S]*?'mensagens'[\s\S]*?'whatsapp'[\s\S]*?'emailQuota'[\s\S]*?\]\s*\|\|\s*isSignedIn\(\)\s*;/,
  'Leituras diretas de configuracao exigidas pelo backend legado precisam ser preservadas',
);
assert.match(
  configurationsBody,
  /allow\s+list\s*:\s*if\s+isSignedIn\(\)\s*;/,
  'Listagem de configuracoes precisa exigir login',
);
assert.match(
  configurationsBody,
  /allow\s+create\s*,\s*update\s*:\s*if\s+configId\s*==\s*'emailQuota'\s*\|\|\s*isSignedIn\(\)\s*;/,
  'Somente emailQuota pode preservar escrita anonima de configuracao',
);
assert.match(
  configurationsBody,
  /allow\s+delete\s*:\s*if\s+isSignedIn\(\)\s*;/,
  'Exclusao de configuracoes precisa exigir login',
);

assert.doesNotMatch(
  rules,
  /match\s+\/\{[^/}]+(?:=\*\*)?\}/,
  'Nao use um wildcard na raiz: colecoes desconhecidas devem permanecer negadas',
);

console.log('Configuracao e invariantes de seguranca do Firestore validadas.');
console.log('- formularios, respostas e registros internos: acesso cliente negado');
console.log('- colecoes legadas: politica explicita, sem wildcard global');
