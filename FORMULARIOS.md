# Módulo de formulários

O painel administrativo possui a aba **Formulários**. Cada formulário recebe um `publicId` aleatório e imutável; o link e o QR Code continuam iguais depois de editar, pausar ou reabrir a coleta. Somente uma duplicação cria outro identificador.

## Configuração

Frontend:

```env
VITE_API_BASE=https://seu-backend.exemplo.com
VITE_PUBLIC_SITE_URL=https://seu-site.exemplo.com
```

Backend:

```env
FIREBASE_SERVICE_ACCOUNT={...}
PUBLIC_FORM_BASE_URL=https://seu-site.exemplo.com
FORMULARIOS_ADMIN_EMAILS=admin1@exemplo.com,admin2@exemplo.com
FORMULARIOS_ALLOW_ANY_AUTHENTICATED_ADMIN=false
FORMULARIOS_RATE_LIMIT_WINDOW_MS=60000
FORMULARIOS_RATE_LIMIT_MAX=10
FORMULARIOS_GLOBAL_RATE_LIMIT_MAX=60
FORMULARIOS_QR_RATE_LIMIT_WINDOW_MS=60000
FORMULARIOS_QR_RATE_LIMIT_MAX=30
FORMULARIOS_QR_GLOBAL_RATE_LIMIT_MAX=60
```

`VITE_PUBLIC_SITE_URL` e `PUBLIC_FORM_BASE_URL` devem usar a mesma origem HTTPS controlada pela empresa. O backend exige o Firebase Admin configurado e retorna `503` sem a credencial. Em produção, uma allowlist vazia falha de modo seguro com `ADMIN_AUTH_POLICY_NOT_CONFIGURED`, salvo para tokens com custom claim `admin: true`. A allowlist só aceita e-mails verificados.

`FORMULARIOS_ALLOW_ANY_AUTHENTICATED_ADMIN=true` é um opt-in transitório de alto risco: ele só funciona quando `NODE_ENV` é exatamente `development` ou `test`, é ignorado em produção ou quando `NODE_ENV` está ausente e deve permanecer `false` fora do desenvolvimento local.

## Dados

```text
formularios/{formId}
formularios/{formId}/respostas/{responseId}
_formularios_public_ids/{publicId}
_formularios_admin_idempotency/{requestHash}
```

As respostas guardam um snapshot do rótulo e do tipo de cada pergunta. Assim, o histórico permanece legível mesmo depois de o formulário ser alterado. A criação da resposta e a atualização do contador acontecem na mesma transação.

Cada formulário possui `revision`, usada com `If-Match` para impedir que duas sessões administrativas sobrescrevam alterações, e `schemaVersion`, incrementada quando as perguntas mudam. Uma página pública aberta em uma versão antiga recebe `FORM_SCHEMA_CHANGED`, recarrega as perguntas e preserva somente as respostas ainda compatíveis.

## Rotas públicas

- `GET /api/formularios/publico/:publicId`
- `POST /api/formularios/publico/:publicId/respostas`
- `GET /api/formularios/publico/:publicId/qrcode?format=png|svg&download=1`

O envio público usa `Idempotency-Key`, validação integral no servidor, honeypot e rate limit por formulário/IP.

## Rotas administrativas

Todas exigem `Authorization: Bearer <Firebase ID token>`:

- `GET|POST /api/formularios/admin`
- `PUT|DELETE /api/formularios/admin/:id`
- `PATCH /api/formularios/admin/:id/status`
- `GET /api/formularios/admin/:id/respostas?limit=50&cursor=<cursor-opaco>`
- `DELETE /api/formularios/admin/:id/respostas/:responseId`

A exclusão preserva um tombstone do `publicId`, impedindo que um QR antigo seja reutilizado por outro formulário.

A listagem de respostas usa paginação estável por data e identificador. O painel
carrega 50 registros por vez; a busca atua sobre os registros carregados e a
exportação CSV percorre todas as páginas em lotes conservadores, com progresso,
cancelamento, deduplicação e sem gerar arquivo parcial em caso de falha.

Criações administrativas e envios públicos são idempotentes. Atualizações, mudanças de status e exclusões administrativas exigem a revisão atual, evitando duplicação após timeout e perda silenciosa de alterações concorrentes.

## Regras do Firestore

O SDK web não acessa diretamente os dados dos formulários. `frontend/firestore.rules` nega leitura e escrita do cliente em toda a árvore `formularios`, nos registros `_formularios_public_ids` e `_formularios_admin_idempotency`, e em uma eventual coleção raiz `respostas`; somente a API, via Firebase Admin SDK, opera esses documentos.

O inventário das coleções legadas, as permissões mantidas para compatibilidade e os riscos conhecidos estão em [`frontend/FIRESTORE_RULES.md`](frontend/FIRESTORE_RULES.md). As variáveis de ambiente não controlam Firestore Security Rules: a política precisa ser publicada separadamente pelo Firebase CLI.

## Ordem de publicação

Compare e valide primeiro as regras do Firestore em staging; o projeto ainda
possui fluxos legados documentados em `frontend/FIRESTORE_RULES.md`. Depois,
publique o backend com as variáveis obrigatórias e faça um smoke test das rotas.
Publique o frontend por último, evitando que a nova interface chame endpoints
ainda ausentes. O SDK Admin ignora as regras do Firestore, mas elas devem estar
ativas antes de inserir dados reais para impedir acesso direto pelo cliente.

## Verificação

```powershell
cd backend
npm ci
npm run test:formularios

cd ../frontend
npm ci
npm run validate:firestore-rules
npm run build
```
