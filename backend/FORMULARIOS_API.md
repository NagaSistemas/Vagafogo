# API de formularios

Todas as rotas dependem do Firebase Admin (`FIREBASE_SERVICE_ACCOUNT`). Quando o
Admin SDK nao esta disponivel, a API responde `503 FIREBASE_ADMIN_UNAVAILABLE`.

## Autenticacao administrativa

As rotas em `/api/formularios/admin` exigem `Authorization: Bearer <Firebase ID
token>`. O token precisa ter custom claim `admin: true` ou e-mail verificado
presente em `FORMULARIOS_ADMIN_EMAILS`.

O fallback para qualquer usuario autenticado e desativado por padrao. Ele so e
aceito com `FORMULARIOS_ALLOW_ANY_AUTHENTICATED_ADMIN=true` **e**
`NODE_ENV=development|test`; nunca e aceito em producao ou com `NODE_ENV`
ausente. Sem claim, allowlist ou esse opt-in restrito, a API responde
`503 ADMIN_AUTH_POLICY_NOT_CONFIGURED`.

## Rotas administrativas

- `GET /api/formularios/admin`: retorna `ManagedForm[]`.
- `POST /api/formularios/admin`: cria e retorna o formulario. Exige
  `Idempotency-Key` (8 a 128 caracteres); responde `201` na primeira criacao e
  `200` + `Idempotent-Replayed: true` em um retry identico.
- `PUT /api/formularios/admin/:id`: substitui os campos editaveis. Exige a
  revisao atual em `If-Match: <revision>` ou `body.expectedRevision`.
- `PATCH /api/formularios/admin/:id/status`: recebe `{ status,
  expectedRevision? }` e tambem aceita/exige `If-Match`.
- `DELETE /api/formularios/admin/:id`: exige a revisao em `If-Match` ou
  `?expectedRevision=N`; exclui respostas e preserva um tombstone do `publicId`.
- `GET /api/formularios/admin/:id/respostas?limit=50&cursor=...`: retorna
  `{ items, nextCursor }`. `limit` usa 50 por padrao e aceita 1 a 200. Os itens
  sao ordenados por `submittedAt desc` e, em empate, pelo ID do documento em
  ordem decrescente. `nextCursor` e uma string opaca ou `null`; passe-a sem
  alteracoes na pagina seguinte. O cursor inclui a posicao temporal e o ID, e
  continua valido caso a resposta que delimitou a pagina seja excluida.
- `DELETE /api/formularios/admin/:id/respostas/:responseId`: exclui a resposta
  e recalcula `responseCount` e `lastResponseAt` em transacao.

`revision` comeca em 1 e aumenta em todo `PUT` e `PATCH`. Revisao divergente
responde `409 FORM_EDIT_CONFLICT` com `currentRevision`; revisao ausente responde
`428 FORM_REVISION_REQUIRED`. `publicId` e imutavel. `schemaVersion` comeca em 1
e aumenta quando qualquer definicao em `fields` muda. Documentos legados sem
versoes sao lidos como versao/revisao 1.

Datas (`createdAt`, `updatedAt`, `publishedAt`, `lastResponseAt` e `submittedAt`)
sao sempre serializadas como strings ISO 8601. Cada resposta administrativa
inclui `schemaVersion`; o campo legado `formVersion` e normalizado para esse
nome.

`limit` invalido responde `400 INVALID_RESPONSES_LIMIT`. Cursor malformado,
nao canonico ou pertencente a outro formulario responde o mesmo erro generico
`400 INVALID_RESPONSES_CURSOR`, sem consultar ou revelar dados do outro
formulario. Uma resposta alcancada pelo indice com `submittedAt` que nao seja um
`Timestamp` Firestore valido responde `500 INVALID_STORED_RESPONSE` e e
registrada no log do servidor. Todas as
respostas criadas por esta API gravam esse campo; documentos externos sem o
campo nao pertencem ao indice ordenado e precisam ser migrados antes do uso.

## Rotas publicas

- `GET /api/formularios/publico/:publicId`: retorna diretamente a configuracao
  publica, incluindo `schemaVersion`.
- `POST /api/formularios/publico/:publicId/respostas`: exige
  `Idempotency-Key` e body `{ schemaVersion, answers, _website? }`. Responde
  `201` ou, em retry identico, `200` com `{ success, responseId, duplicate,
  confirmationTitle, confirmationMessage, schemaVersion }`.
- `GET /api/formularios/publico/:publicId/qrcode`: aceita `format=png|svg`,
  `download=1` e `url=<URL exata exibida ao usuario>`.

Se a versao enviada nao for a atual, o POST responde
`409 FORM_SCHEMA_CHANGED` com `currentSchemaVersion`. A resposta nao e gravada.

Em producao, `PUBLIC_FORM_BASE_URL` e obrigatoria, deve conter apenas uma origem
HTTPS canonica e nao pode apontar para loopback. Se `url` for informada no QR,
ela precisa ter a mesma origem e o path `/formulario/:publicId`; a URL informada
e codificada sem substituicao silenciosa. HTTP/localhost so sao permitidos em
`development|test`.

As submissoes e a geracao de QR possuem limites em memoria por formulario/IP e
globais por IP. Os limites sao configurados pelas variaveis
`FORMULARIOS_*_RATE_LIMIT_*` documentadas em `.env.example`. Em varias replicas,
cada processo mantem seu proprio contador; use um storage compartilhado se for
necessario um limite global forte.

## Persistencia

- Formularios: `formularios/{id}`.
- Respostas: `formularios/{id}/respostas/{responseId}`.
- Registro permanente de IDs: `_formularios_public_ids/{publicId}`.
- Idempotencia de criacao: `_formularios_admin_idempotency/{hash}`.

Registros internos e tombstones nao devem ser gravados pelo cliente Firebase.
