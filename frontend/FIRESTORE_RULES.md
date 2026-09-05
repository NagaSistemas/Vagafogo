# Regras do Firestore

Este diretório contém a política versionada em `firestore.rules`. O `firebase.json`
publica essa política e `firestore.indexes.json` em conjunto.

## Inventário do SDK web

O inventário abaixo foi obtido das chamadas diretas a `firebase/firestore` no
frontend e no backend legado. Ele descreve os fluxos que precisam continuar
funcionando depois do deploy das regras.

| Coleção | Frontend | Backend com Web SDK sem login | Política compatível |
| --- | --- | --- | --- |
| `pacotes` | leitura pública e CRUD no painel/serviço legado | lista e cria | leitura e criação públicas; atualização/exclusão com login |
| `tipos_clientes` | leitura pública e CRUD no painel | não usa | leitura pública; escrita com login |
| `combos` | leitura pública e CRUD no painel | não usa | leitura pública; escrita com login |
| `disponibilidade` | leitura pública e CRUD no painel | lê documento por data | leitura pública; escrita com login |
| `reservas` | consulta pública por data/CPF e CRUD no painel | lista, lê, cria, atualiza e exclui em reservas, pagamentos, webhooks, retenção e notificações | leitura e escrita públicas enquanto o backend não for migrado |
| `configuracoes` | lê `site`; painel lê/escreve `site`, `email`, `mensagens` e `whatsapp` | lê `email`, `mensagens`, `whatsapp` e lê/escreve `emailQuota` | `get` público somente nesses cinco IDs; escrita pública somente em `emailQuota`; painel autenticado mantém acesso |
| `mesas` | leitura no painel | não usa | leitura e escrita com login |
| `teste_conexao` | diagnóstico legado, atualmente não montado | não usa | leitura e escrita com login |

Coleções não listadas não recebem nenhuma permissão e, portanto, ficam negadas
por padrão.

## Coleções exclusivas dos formulários

O cliente web não pode ler nem escrever em nenhuma destas árvores, mesmo quando
há uma sessão Firebase autenticada:

- `formularios/{formId}`;
- `formularios/{formId}/respostas/{responseId}` e qualquer outra subcoleção;
- `_formularios_public_ids/{publicId}`;
- `_formularios_admin_idempotency/{requestHash}`;
- `respostas/{responseId}` e subcoleções, como proteção para uma eventual
  migração para coleção raiz.

Os fluxos público e administrativo de formulários passam pela API Express. O
Firebase Admin SDK do backend ignora Firestore Security Rules, portanto a
negação ao cliente não interrompe esses endpoints.

## Autenticação e limites conhecidos

O painel usa Firebase Authentication com e-mail/senha. A rota React considera
administrativa qualquer sessão autenticada. O backend, porém, tem dois modelos
de acesso ao Firestore: a feature de formulários usa Firebase Admin SDK, enquanto
reservas, pagamentos, e-mail, WhatsApp e parte da API antiga usam o Firebase Web
SDK sem login. Estas últimas chamadas são clientes anônimos para as Security
Rules; elas não recebem privilégio por estarem num processo Node.

Para manter o painel legado, as permissões administrativas restantes usam apenas
`request.auth != null`. Isso não equivale à política mais forte da API de
formulários, que verifica o ID token e exige custom claim `admin: true`, e-mail
verificado na allowlist ou o opt-in transitório configurado no servidor.

Há dois riscos legados que estas regras deixam explícitos:

1. `reservas` precisa continuar com leitura pública porque o site consulta a
   ocupação por data e busca uma reserva por CPF. Também precisa de escrita
   pública porque o backend sem login cria e altera reservas. As regras não
   conseguem distinguir esse processo Node de um atacante com a configuração
   pública do Firebase. Além da exposição de dados pessoais, há risco de criação,
   adulteração e exclusão direta. A correção definitiva é migrar essas operações
   para Firebase Admin SDK (ou outra credencial server-side) e expor endpoints
   públicos com validação e respostas mínimas.
2. A criação de `pacotes` e a atualização de `configuracoes/emailQuota` também
   permanecem anônimas pela mesma limitação. Os documentos `email`, `mensagens` e
   `whatsapp` precisam ser legíveis diretamente para o backend antigo; não devem
   conter segredos. Migre esses acessos para o SDK Admin antes de fechá-los.
3. Qualquer conta autenticada no mesmo projeto ainda pode alterar as demais
   coleções legadas. Para restringir isso sem quebrar o painel existente,
   primeiro atribua a claim `admin` às contas autorizadas (ou migre as operações
   para a API) e então substitua `isSignedIn()` por uma verificação dessa claim.

Esta política preserva os consumidores encontrados neste repositório. Antes de
publicá-la sobre um projeto que tenha outros clientes, compare as regras remotas
e teste esses clientes em staging, pois fluxos externos não inventariados ficarão
negados.

## Validação e publicação

O projeto não possui hoje `@firebase/rules-unit-testing`, `firebase-tools` nem
emulador versionado. Por isso, a validação local disponível é estrutural: ela
confere o JSON do Firebase, delimitadores básicos da linguagem e invariantes da
política (inclusive a ausência de wildcard global permissivo).

```powershell
cd frontend
npm run validate:firestore-rules
```

O compilador oficial ainda deve ser executado pelo Firebase CLI no pipeline ou
antes do deploy. Depois de validar em um projeto de staging:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

Uma futura suíte no Emulator Suite deve provar ao menos: negação anônima e
autenticada nas quatro árvores exclusivas; permissões públicas legadas apenas nas
operações inventariadas; escrita autenticada do painel permitida; listagem de
`configuracoes` anônima negada; e coleção desconhecida negada.
