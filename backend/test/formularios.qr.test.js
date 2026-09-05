'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FormularioValidationError } = require('../dist/validation/formularios.js');
const { resolverDestinoQr } = require('../dist/server/formulariosPublicos.js');

const PUBLIC_ID = 'form_publico_1234';

const expectError = (operation, code, status) => {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof FormularioValidationError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
};

test('deriva URL canonica HTTPS em producao', () => {
  assert.equal(
    resolverDestinoQr(undefined, PUBLIC_ID, {
      configuredBase: 'https://formularios.exemplo.com',
      nodeEnv: 'production',
    }),
    `https://formularios.exemplo.com/formulario/${PUBLIC_ID}`,
  );
  assert.equal(
    resolverDestinoQr(`https://formularios.exemplo.com/formulario/${PUBLIC_ID}`, PUBLIC_ID, {
      configuredBase: 'https://formularios.exemplo.com',
      nodeEnv: 'production',
    }),
    `https://formularios.exemplo.com/formulario/${PUBLIC_ID}`,
  );
});

test('falha fechado sem base HTTPS fora de development/test', () => {
  expectError(
    () => resolverDestinoQr(undefined, PUBLIC_ID, { nodeEnv: 'production' }),
    'PUBLIC_FORM_BASE_URL_REQUIRED',
    503,
  );
  expectError(
    () => resolverDestinoQr(undefined, PUBLIC_ID, {
      configuredBase: 'http://formularios.exemplo.com',
      nodeEnv: 'production',
    }),
    'PUBLIC_FORM_BASE_URL_HTTPS_REQUIRED',
    503,
  );
  expectError(
    () => resolverDestinoQr(undefined, PUBLIC_ID, { nodeEnv: undefined }),
    'PUBLIC_FORM_BASE_URL_REQUIRED',
    503,
  );
});

test('URL informada precisa manter origem e path canonicos', () => {
  expectError(
    () => resolverDestinoQr(`https://malicioso.exemplo/formulario/${PUBLIC_ID}`, PUBLIC_ID, {
      configuredBase: 'https://formularios.exemplo.com',
      nodeEnv: 'production',
    }),
    'QR_ORIGIN_MISMATCH',
    400,
  );
  expectError(
    () => resolverDestinoQr('http://localhost:5173/formulario/outro_form', PUBLIC_ID, {
      nodeEnv: 'development',
    }),
    'INVALID_QR_URL',
    400,
  );
  assert.equal(
    resolverDestinoQr(`http://localhost:5173/formulario/${PUBLIC_ID}`, PUBLIC_ID, {
      nodeEnv: 'development',
    }),
    `http://localhost:5173/formulario/${PUBLIC_ID}`,
  );
});
