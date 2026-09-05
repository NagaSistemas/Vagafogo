'use strict';

// Execute apos compilar: npm run build && node --test test/formularios.validation.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FormularioValidationError,
  normalizarChaveIdempotencia,
  normalizarFormularioPublico,
  normalizarSchemaVersionSubmissao,
  normalizarVersaoSchemaArmazenada,
  stringifyCanonico,
  validarENormalizarRespostas,
} = require('../dist/validation/formularios.js');

const PUBLIC_ID = 'form_publico_1234';

const field = (id, type, overrides = {}) => ({
  id,
  type,
  label: `Campo ${id}`,
  required: false,
  ...overrides,
});

const rawForm = (fields, overrides = {}) => ({
  publicId: PUBLIC_ID,
  title: ' Pesquisa de satisfacao ',
  description: ' Conte como foi sua experiencia. ',
  status: 'published',
  fields,
  privacyMessage: 'Dados usados somente nesta pesquisa.',
  ...overrides,
});

const expectValidationError = (operation, expected) => {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof FormularioValidationError);
    assert.equal(error.code, expected.code);
    assert.equal(error.status, expected.status);
    if (expected.detailCodes) {
      assert.deepEqual(
        error.details?.map((detail) => detail.code),
        expected.detailCodes,
      );
    }
    return true;
  });
};

test('normaliza a configuracao publica e aplica defaults seguros', () => {
  const form = normalizarFormularioPublico(
    rawForm([
      field('nome', 'short_text', {
        label: ' Nome completo ',
        required: true,
      }),
      field('preferencia', 'single_choice', {
        options: [' Trilha ', 'Brunch'],
      }),
      field('aceite', 'consent', { required: false }),
    ]),
    PUBLIC_ID,
  );

  assert.equal(form.title, 'Pesquisa de satisfacao');
  assert.equal(form.schemaVersion, 1, 'documentos legados comecam na versao 1');
  assert.equal(form.description, 'Conte como foi sua experiencia.');
  assert.equal(form.confirmationTitle, 'Resposta enviada!');
  assert.equal(form.confirmationMessage, 'Obrigado por responder.');
  assert.equal(form.submitButtonLabel, 'Enviar resposta');
  assert.equal(form.fields[0].maxLength, 300);
  assert.deepEqual(form.fields[1].options, ['Trilha', 'Brunch']);
  assert.equal(form.fields[2].required, true, 'consentimento deve ser sempre obrigatorio');
});

test('valida a versao de schema enviada com cada resposta', () => {
  assert.equal(normalizarVersaoSchemaArmazenada(undefined), 1);
  assert.equal(normalizarVersaoSchemaArmazenada(4), 4);
  assert.equal(
    normalizarFormularioPublico(rawForm([], { status: 'draft', formVersion: 5 }), PUBLIC_ID)
      .schemaVersion,
    5,
  );
  assert.equal(normalizarSchemaVersionSubmissao({ schemaVersion: 4 }), 4);
  expectValidationError(
    () => normalizarSchemaVersionSubmissao({ answers: {} }),
    { code: 'SCHEMA_VERSION_REQUIRED', status: 400 },
  );
  expectValidationError(
    () => normalizarSchemaVersionSubmissao({ schemaVersion: 0 }),
    { code: 'SCHEMA_VERSION_REQUIRED', status: 400 },
  );
});

test('rejeita configuracoes publicadas inconsistentes', () => {
  expectValidationError(
    () => normalizarFormularioPublico(rawForm([]), PUBLIC_ID),
    { code: 'FORM_CONFIGURATION_INVALID', status: 500 },
  );

  expectValidationError(
    () =>
      normalizarFormularioPublico(
        rawForm([
          field('duplicado', 'short_text'),
          field('duplicado', 'email'),
        ]),
        PUBLIC_ID,
      ),
    { code: 'FORM_CONFIGURATION_INVALID', status: 500 },
  );

  expectValidationError(
    () =>
      normalizarFormularioPublico(
        rawForm([field('escolha', 'single_choice', { options: ['Sim', ' sim '] })]),
        PUBLIC_ID,
      ),
    { code: 'FORM_CONFIGURATION_INVALID', status: 500 },
  );
});

test('rejeita identificadores de campo que colidem com propriedades de objeto', () => {
  for (const unsafeId of ['__proto__', 'constructor', 'prototype']) {
    expectValidationError(
      () =>
        normalizarFormularioPublico(
          rawForm([field(unsafeId, 'short_text')]),
          PUBLIC_ID,
        ),
      { code: 'FORM_CONFIGURATION_INVALID', status: 500 },
    );
  }
});

test('normaliza respostas validas de todos os tipos e cria snapshot historico', () => {
  const form = normalizarFormularioPublico(
    rawForm([
      field('nome', 'short_text', { required: true, maxLength: 40 }),
      field('comentario', 'long_text'),
      field('email', 'email', { required: true }),
      field('telefone', 'phone'),
      field('nota', 'number', { min: 1, max: 10 }),
      field('data_visita', 'date'),
      field('preferencia', 'single_choice', { options: ['Trilha', 'Brunch'] }),
      field('atividades', 'multiple_choice', { options: ['Trilha', 'Brunch', 'Loja'] }),
      field('aceite', 'consent'),
    ]),
    PUBLIC_ID,
  );

  const result = validarENormalizarRespostas(form, {
    answers: {
      nome: '  Ana Silva  ',
      comentario: '  Excelente atendimento.  ',
      email: '  ANA@EXEMPLO.COM  ',
      telefone: ' (62) 99999-0000 ',
      nota: '9,5',
      data_visita: '2026-09-05',
      preferencia: 'Trilha',
      atividades: ['Trilha', ' Loja '],
      aceite: true,
    },
  });

  assert.deepEqual(result.answers, {
    nome: 'Ana Silva',
    comentario: 'Excelente atendimento.',
    email: 'ana@exemplo.com',
    telefone: '(62) 99999-0000',
    nota: 9.5,
    data_visita: '2026-09-05',
    preferencia: 'Trilha',
    atividades: ['Trilha', 'Loja'],
    aceite: true,
  });
  assert.deepEqual(
    result.answerSnapshot.map(({ fieldId, type, value }) => ({ fieldId, type, value })),
    [
      { fieldId: 'nome', type: 'short_text', value: 'Ana Silva' },
      { fieldId: 'comentario', type: 'long_text', value: 'Excelente atendimento.' },
      { fieldId: 'email', type: 'email', value: 'ana@exemplo.com' },
      { fieldId: 'telefone', type: 'phone', value: '(62) 99999-0000' },
      { fieldId: 'nota', type: 'number', value: 9.5 },
      { fieldId: 'data_visita', type: 'date', value: '2026-09-05' },
      { fieldId: 'preferencia', type: 'single_choice', value: 'Trilha' },
      { fieldId: 'atividades', type: 'multiple_choice', value: ['Trilha', 'Loja'] },
      { fieldId: 'aceite', type: 'consent', value: true },
    ],
  );
});

test('omite respostas opcionais vazias', () => {
  const form = normalizarFormularioPublico(
    rawForm([
      field('apelido', 'short_text'),
      field('atividades', 'multiple_choice', { options: ['Trilha', 'Brunch'] }),
    ]),
    PUBLIC_ID,
  );

  const result = validarENormalizarRespostas(form, {
    answers: { apelido: '   ', atividades: [] },
  });

  assert.deepEqual(result, { answers: {}, answerSnapshot: [] });
});

test('agrega erros de campos sem persistir uma resposta parcial', () => {
  const form = normalizarFormularioPublico(
    rawForm([
      field('nome', 'short_text', { required: true }),
      field('email', 'email'),
      field('telefone', 'phone'),
      field('nota', 'number', { min: 1, max: 10 }),
      field('data_visita', 'date'),
      field('preferencia', 'single_choice', { options: ['Trilha', 'Brunch'] }),
      field('atividades', 'multiple_choice', { options: ['Trilha', 'Brunch'] }),
      field('aceite', 'consent'),
    ]),
    PUBLIC_ID,
  );

  expectValidationError(
    () =>
      validarENormalizarRespostas(form, {
        answers: {
          nome: ' ',
          email: 'email-invalido',
          telefone: 'abc',
          nota: 0,
          data_visita: '2026-02-30',
          preferencia: 'Opcao forjada',
          atividades: ['Trilha', 'Trilha'],
          aceite: false,
        },
      }),
    {
      code: 'INVALID_ANSWERS',
      status: 422,
      detailCodes: [
        'REQUIRED',
        'INVALID_EMAIL',
        'INVALID_PHONE',
        'MIN_VALUE',
        'INVALID_DATE',
        'INVALID_OPTION',
        'INVALID_OPTIONS',
        'CONSENT_REQUIRED',
      ],
    },
  );
});

test('rejeita payload malformado e respostas para campos desconhecidos', () => {
  const form = normalizarFormularioPublico(
    rawForm([field('nome', 'short_text')]),
    PUBLIC_ID,
  );

  expectValidationError(
    () => validarENormalizarRespostas(form, null),
    { code: 'INVALID_PAYLOAD', status: 400 },
  );
  expectValidationError(
    () => validarENormalizarRespostas(form, { answers: { invasor: 'valor' } }),
    {
      code: 'UNKNOWN_FIELDS',
      status: 400,
      detailCodes: ['UNKNOWN_FIELD'],
    },
  );
});

test('normaliza e limita a chave de idempotencia', () => {
  assert.equal(
    normalizarChaveIdempotencia('  resposta:cliente-1234  '),
    'resposta:cliente-1234',
  );

  for (const invalid of [undefined, '', 'curta', 'possui espaco', 'a'.repeat(129)]) {
    assert.throws(
      () => normalizarChaveIdempotencia(invalid),
      (error) =>
        error instanceof FormularioValidationError &&
        error.status === 400 &&
        ['IDEMPOTENCY_KEY_REQUIRED', 'INVALID_IDEMPOTENCY_KEY'].includes(error.code),
    );
  }
});

test('serializacao canonica independe da ordem das propriedades', () => {
  const first = stringifyCanonico({ z: 1, nested: { b: true, a: 'texto' }, a: [2, 1] });
  const second = stringifyCanonico({ a: [2, 1], nested: { a: 'texto', b: true }, z: 1 });

  assert.equal(first, second);
  assert.equal(first, '{"a":[2,1],"nested":{"a":"texto","b":true},"z":1}');
  expectValidationError(
    () => stringifyCanonico(Number.POSITIVE_INFINITY),
    { code: 'INVALID_PAYLOAD', status: 400 },
  );
});

test('rejeita respostas que excederiam o limite seguro de documento do Firestore', () => {
  const fields = Array.from({ length: 50 }, (_, index) =>
    field(`texto_${index}`, 'long_text', { maxLength: 5000 }),
  );
  const form = normalizarFormularioPublico(rawForm(fields), PUBLIC_ID);
  const answers = Object.fromEntries(
    fields.map((item) => [item.id, 'á'.repeat(5000)]),
  );

  expectValidationError(
    () => validarENormalizarRespostas(form, { answers }),
    { code: 'ANSWERS_TOO_LARGE', status: 413 },
  );
});
