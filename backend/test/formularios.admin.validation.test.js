'use strict';

// Execute apos compilar: npm run build && node --test test/*.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const { FormularioValidationError } = require('../dist/validation/formularios.js');
const {
  garantirPublicIdImutavel,
  codificarCursorRespostas,
  normalizarCursorRespostas,
  normalizarFormularioAdminPayload,
  normalizarExpectedRevision,
  normalizarIdDocumentoFormulario,
  normalizarLimitePaginaRespostas,
  normalizarPublicIdAdministravel,
  normalizarStatusFormulario,
} = require('../dist/validation/formulariosAdmin.js');
const {
  politicaAdminFormularioConfigurada,
  usuarioPodeAdministrarFormulario,
} = require('../dist/middleware/formulariosAdminAuth.js');
const {
  calcularVersaoSchemaSeguinte,
  serializarTimestampIso,
} = require('../dist/services/formulariosAdmin.js');

const baseForm = {
  publicId: 'form_publico_admin_1234',
  title: 'Formulario administrativo',
  description: '',
  status: 'draft',
  fields: [],
  confirmationTitle: 'Resposta enviada!',
  confirmationMessage: 'Obrigado por responder.',
  privacyMessage: '',
  submitButtonLabel: 'Enviar resposta',
};

const expectCode = (operation, code, status) => {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof FormularioValidationError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
};

test('aceita somente os tres status administrativos suportados', () => {
  assert.equal(normalizarStatusFormulario('draft'), 'draft');
  assert.equal(normalizarStatusFormulario('published'), 'published');
  assert.equal(normalizarStatusFormulario('closed'), 'closed');
  expectCode(() => normalizarStatusFormulario('archived'), 'INVALID_FORM_STATUS', 422);
});

test('valida IDs publicos e IDs de documentos antes de consultar o Firestore', () => {
  assert.equal(normalizarPublicIdAdministravel(baseForm.publicId), baseForm.publicId);
  assert.equal(normalizarIdDocumentoFormulario('AbC123_-'), 'AbC123_-');
  expectCode(() => normalizarPublicIdAdministravel('../outro'), 'INVALID_PUBLIC_ID', 422);
  expectCode(() => normalizarIdDocumentoFormulario('a/b'), 'FORM_NOT_FOUND', 404);
});

test('publicId pode ser omitido no update, mas nunca trocado', () => {
  assert.doesNotThrow(() => garantirPublicIdImutavel({ title: 'Novo titulo' }, baseForm.publicId));
  assert.doesNotThrow(() => garantirPublicIdImutavel({ publicId: baseForm.publicId }, baseForm.publicId));
  expectCode(
    () => garantirPublicIdImutavel({ publicId: 'outro_public_id_1234' }, baseForm.publicId),
    'IMMUTABLE_PUBLIC_ID',
    409,
  );
});

test('normaliza rascunho administrativo e rejeita publicacao sem campos', () => {
  const draft = normalizarFormularioAdminPayload(baseForm, baseForm.publicId);
  assert.equal(draft.publicId, baseForm.publicId);
  assert.equal(draft.status, 'draft');

  expectCode(
    () => normalizarFormularioAdminPayload({ ...baseForm, status: 'published' }, baseForm.publicId),
    'INVALID_FORM_SCHEMA',
    422,
  );
});

test('autorizacao administrativa e fail-closed por padrao', () => {
  assert.equal(usuarioPodeAdministrarFormulario({}, ''), false);
  assert.equal(politicaAdminFormularioConfigurada(''), false);
  assert.equal(
    usuarioPodeAdministrarFormulario(
      {},
      '',
      { nodeEnv: 'development', allowAnyAuthenticated: 'true' },
    ),
    true,
  );
  assert.equal(
    politicaAdminFormularioConfigurada(
      '',
      { nodeEnv: 'test', allowAnyAuthenticated: 'true' },
    ),
    true,
  );
  assert.equal(
    usuarioPodeAdministrarFormulario(
      {},
      '',
      { nodeEnv: 'production', allowAnyAuthenticated: 'true' },
    ),
    false,
  );
  assert.equal(
    usuarioPodeAdministrarFormulario(
      {},
      '',
      { nodeEnv: undefined, allowAnyAuthenticated: 'true' },
    ),
    false,
  );
  assert.equal(
    usuarioPodeAdministrarFormulario(
      { email: 'ADMIN@EXEMPLO.COM', email_verified: true },
      'outro@exemplo.com, admin@exemplo.com',
    ),
    true,
  );
  assert.equal(
    usuarioPodeAdministrarFormulario(
      { email: 'admin@exemplo.com', email_verified: false },
      'admin@exemplo.com',
    ),
    false,
  );
  assert.equal(
    usuarioPodeAdministrarFormulario({ admin: true }, 'admin@exemplo.com'),
    true,
  );
});

test('normaliza revisao otimista no header ou corpo e rejeita ambiguidades', () => {
  assert.equal(normalizarExpectedRevision('"7"', undefined), 7);
  assert.equal(normalizarExpectedRevision('W/"8"', 8), 8);
  assert.equal(normalizarExpectedRevision(undefined, '9'), 9);
  expectCode(
    () => normalizarExpectedRevision(undefined, undefined),
    'FORM_REVISION_REQUIRED',
    428,
  );
  expectCode(
    () => normalizarExpectedRevision('2', 3),
    'FORM_REVISION_MISMATCH',
    400,
  );
  expectCode(
    () => normalizarExpectedRevision('invalida', undefined),
    'INVALID_FORM_REVISION',
    422,
  );
});

test('incrementa schemaVersion somente quando a definicao dos campos muda', () => {
  const fields = [{ id: 'nome', type: 'short_text', label: 'Nome', required: true }];
  assert.equal(calcularVersaoSchemaSeguinte(fields, [...fields], 3), 3);
  assert.equal(
    calcularVersaoSchemaSeguinte(
      fields,
      [{ ...fields[0], label: 'Nome completo' }],
      3,
    ),
    4,
  );
});

test('normaliza limite da pagina de respostas', () => {
  assert.equal(normalizarLimitePaginaRespostas(undefined), 50);
  assert.equal(normalizarLimitePaginaRespostas('1'), 1);
  assert.equal(normalizarLimitePaginaRespostas(' 200 '), 200);
  assert.equal(normalizarLimitePaginaRespostas(75), 75);

  for (const invalid of ['', '0', '201', '1.5', '-1', [], {}]) {
    expectCode(
      () => normalizarLimitePaginaRespostas(invalid),
      'INVALID_RESPONSES_LIMIT',
      400,
    );
  }
});

test('codifica e valida cursor opaco, estavel e vinculado ao formulario', () => {
  const position = {
    formId: 'form_doc_123',
    responseId: 'response_doc_456',
    seconds: 1_788_624_000,
    nanoseconds: 123_456_789,
  };
  const cursor = codificarCursorRespostas(position);
  assert.match(cursor, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(normalizarCursorRespostas(cursor, position.formId), position);
  assert.equal(normalizarCursorRespostas(undefined, position.formId), undefined);

  expectCode(
    () => normalizarCursorRespostas(cursor, 'outro_form_789'),
    'INVALID_RESPONSES_CURSOR',
    400,
  );
  for (const invalid of [
    '',
    'cursor com espaco',
    `${cursor}=`,
    'a'.repeat(769),
    Buffer.from(JSON.stringify({ v: 2, f: position.formId, i: position.responseId, s: 1, n: 0 }))
      .toString('base64url'),
    Buffer.from(JSON.stringify({ f: position.formId, i: position.responseId, n: 0, s: 1, v: 1 }))
      .toString('base64url'),
  ]) {
    expectCode(
      () => normalizarCursorRespostas(invalid, position.formId),
      'INVALID_RESPONSES_CURSOR',
      400,
    );
  }
});

test('rejeita timestamps fora das faixas do cursor Firestore', () => {
  expectCode(
    () => codificarCursorRespostas({
      formId: 'form_doc_123',
      responseId: 'response_doc_456',
      seconds: 1,
      nanoseconds: 1_000_000_000,
    }),
    'INVALID_RESPONSES_CURSOR',
    400,
  );
});

test('serializa timestamps administrativos como ISO strings', () => {
  assert.equal(
    serializarTimestampIso(new Date('2026-09-05T12:34:56.000Z')),
    '2026-09-05T12:34:56.000Z',
  );
  assert.equal(serializarTimestampIso(null), undefined);
});
