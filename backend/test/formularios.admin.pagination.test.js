'use strict';

// Execute apos compilar: npm run build && npm run test:formularios

const test = require('node:test');
const assert = require('node:assert/strict');
const { FieldPath, Timestamp } = require('firebase-admin/firestore');

const firebaseAdmin = require('../dist/services/firebaseAdmin.js');
const {
  FormularioAdminServiceError,
  listarRespostasFormularioAdmin,
} = require('../dist/services/formulariosAdmin.js');
const {
  codificarCursorRespostas,
  normalizarCursorRespostas,
} = require('../dist/validation/formulariosAdmin.js');

const originalObterFirestoreAdmin = firebaseAdmin.obterFirestoreAdmin;

test.after(() => {
  firebaseAdmin.obterFirestoreAdmin = originalObterFirestoreAdmin;
});

const responseDocument = (id, submittedAt, value = id) => ({
  id,
  data: () => ({
    submittedAt,
    schemaVersion: 3,
    answers: { nome: value },
    answerSnapshot: [{
      fieldId: 'nome',
      label: 'Nome',
      type: 'short_text',
      value,
    }],
  }),
});

const installFakeFirestore = ({ documents, formExists = true }) => {
  const calls = {
    collections: [],
    orderBy: [],
    startAfter: [],
    limits: [],
    queryGets: 0,
  };

  const query = {
    orderBy(field, direction) {
      calls.orderBy.push({ field, direction });
      return this;
    },
    startAfter(...values) {
      calls.startAfter.push(values);
      return this;
    },
    limit(value) {
      calls.limits.push(value);
      return this;
    },
    async get() {
      calls.queryGets += 1;
      return { docs: documents, size: documents.length };
    },
  };

  const formRef = {
    id: 'form_doc_123',
    async get() {
      return { exists: formExists };
    },
    collection(name) {
      calls.collections.push(name);
      assert.equal(name, 'respostas');
      return query;
    },
  };

  firebaseAdmin.obterFirestoreAdmin = () => ({
    collection(name) {
      calls.collections.push(name);
      assert.equal(name, 'formularios');
      return {
        doc(id) {
          assert.equal(id, formRef.id);
          return formRef;
        },
      };
    },
  });

  return calls;
};

test('pagina respostas com limit+1 e cursor baseado no ultimo item retornado', async () => {
  const first = new Timestamp(1_788_624_003, 900_000_001);
  const second = new Timestamp(1_788_624_003, 900_000_001);
  const third = new Timestamp(1_788_624_002, 5);
  const calls = installFakeFirestore({
    documents: [
      responseDocument('resp_c', first, 'C'),
      responseDocument('resp_b', second, 'B'),
      responseDocument('resp_a', third, 'A'),
    ],
  });

  const page = await listarRespostasFormularioAdmin('form_doc_123', '2');

  assert.deepEqual(page.items.map((item) => item.id), ['resp_c', 'resp_b']);
  assert.equal(page.items[0].submittedAt, first.toDate().toISOString());
  assert.equal(page.nextCursor === null, false);
  assert.deepEqual(normalizarCursorRespostas(page.nextCursor, 'form_doc_123'), {
    formId: 'form_doc_123',
    responseId: 'resp_b',
    seconds: second.seconds,
    nanoseconds: second.nanoseconds,
  });
  assert.deepEqual(calls.limits, [3]);
  assert.equal(calls.queryGets, 1);
  assert.equal(calls.orderBy.length, 2);
  assert.equal(calls.orderBy[0].field, 'submittedAt');
  assert.equal(calls.orderBy[0].direction, 'desc');
  assert.equal(calls.orderBy[1].field.isEqual(FieldPath.documentId()), true);
  assert.equal(calls.orderBy[1].direction, 'desc');
  assert.deepEqual(calls.startAfter, []);
});

test('retoma pela posicao temporal e ID sem reler o documento da borda', async () => {
  const boundary = new Timestamp(1_788_624_000, 123_456_789);
  const cursor = codificarCursorRespostas({
    formId: 'form_doc_123',
    responseId: 'resp_boundary',
    seconds: boundary.seconds,
    nanoseconds: boundary.nanoseconds,
  });
  const calls = installFakeFirestore({
    documents: [responseDocument('resp_older', new Timestamp(1_788_623_999, 0))],
  });

  const page = await listarRespostasFormularioAdmin('form_doc_123', 2, cursor);

  assert.deepEqual(page.items.map((item) => item.id), ['resp_older']);
  assert.equal(page.nextCursor, null);
  assert.equal(calls.startAfter.length, 1);
  assert.equal(calls.startAfter[0].length, 2);
  assert.equal(calls.startAfter[0][0].isEqual(boundary), true);
  assert.equal(calls.startAfter[0][1], 'resp_boundary');
  assert.deepEqual(calls.limits, [3]);
});

test('nao consulta respostas quando o formulario nao existe', async () => {
  const calls = installFakeFirestore({ documents: [], formExists: false });

  await assert.rejects(
    listarRespostasFormularioAdmin('form_doc_123', 50),
    (error) => {
      assert.ok(error instanceof FormularioAdminServiceError);
      assert.equal(error.code, 'FORM_NOT_FOUND');
      assert.equal(error.status, 404);
      return true;
    },
  );
  assert.equal(calls.queryGets, 0);
});

test('trata metadado de paginacao persistido invalido como erro interno', async () => {
  installFakeFirestore({
    documents: [responseDocument('resp_invalid', '2026-09-05T12:00:00.000Z')],
  });

  await assert.rejects(
    listarRespostasFormularioAdmin('form_doc_123', 1),
    (error) => {
      assert.ok(error instanceof FormularioAdminServiceError);
      assert.equal(error.code, 'INVALID_STORED_RESPONSE');
      assert.equal(error.status, 500);
      return true;
    },
  );
});
