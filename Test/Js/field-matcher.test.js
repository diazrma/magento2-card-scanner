// node --test app/code/MagePanda/CardScanner/Test/Js/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../../view/frontend/web/js/field-matcher.js');

const months = Array.from({length: 12}, (_, i) => ({value: String(i + 1), text: String(i + 1).padStart(2, '0')}));
const yearNow = new Date().getFullYear();
const years = Array.from({length: 11}, (_, i) => ({value: String(yearNow + i), text: String(yearNow + i)}));

test('cc-form padrão do Magento (name="payment[cc_*]")', () => {
    assert.equal(m.classify({tag: 'input', type: 'number', name: 'payment[cc_number]'}), 'number');
    assert.equal(m.classify({tag: 'select', name: 'payment[cc_exp_month]', options: months}), 'expMonth');
    assert.equal(m.classify({tag: 'select', name: 'payment[cc_exp_year]', options: years}), 'expYear');
    assert.equal(m.classify({tag: 'input', type: 'number', name: 'payment[cc_cid]'}), 'cvv');
    assert.equal(m.classify({tag: 'input', type: 'text', name: 'payment[cc_owner]'}), 'name');
});

test('autocomplete tem prioridade', () => {
    assert.equal(m.classify({tag: 'input', autocomplete: 'cc-number', name: 'x1'}), 'number');
    assert.equal(m.classify({tag: 'input', autocomplete: 'billing cc-exp', name: 'x2'}), 'exp');
});

test('nomes de gateways variados', () => {
    assert.equal(m.classify({tag: 'input', id: 'cardNumber'}), 'number');
    assert.equal(m.classify({tag: 'input', name: 'numero_cartao'}), 'number');
    assert.equal(m.classify({tag: 'input', id: 'mp-card-holder-name'}), 'name');
    assert.equal(m.classify({tag: 'input', name: 'nome_titular'}), 'name');
    assert.equal(m.classify({tag: 'input', id: 'card_expiration_date'}), 'exp');
    assert.equal(m.classify({tag: 'input', name: 'validade'}), 'exp');
    assert.equal(m.classify({tag: 'input', id: 'securityCode'}), 'cvv');
    assert.equal(m.classify({tag: 'select', id: 'cardExpirationMonth', options: months}), 'expMonth');
});

test('placeholder quando nome não ajuda', () => {
    assert.equal(m.classify({tag: 'input', name: 'f1', placeholder: 'Número do cartão'}), 'number');
    assert.equal(m.classify({tag: 'input', name: 'f2', placeholder: 'MM/AA'}), 'exp');
    assert.equal(m.classify({tag: 'input', name: 'f3', placeholder: 'Nome impresso no cartão'}), 'name');
});

test('selects sem nome reconhecível, pelo conteúdo', () => {
    assert.equal(m.classify({tag: 'select', name: 's1', options: months}), 'expMonth');
    assert.equal(m.classify({tag: 'select', name: 's2', options: years}), 'expYear');
});

test('ignora campos que não são do cartão', () => {
    assert.equal(m.classify({tag: 'input', name: 'firstname'}), null);
    assert.equal(m.classify({tag: 'input', name: 'billing[telephone]'}), null);
    assert.equal(m.classify({tag: 'input', name: 'payment[cpf_titular]'}), null);
    assert.equal(m.classify({tag: 'select', name: 'installments', options: months}), null);
    assert.equal(m.classify({tag: 'input', type: 'hidden', name: 'payment[cc_number]'}), null);
    assert.equal(m.classify({tag: 'input', type: 'radio', name: 'payment[method]'}), null);
});

test('formata validade combinada', () => {
    const e = {month: 3, year: 2031};
    assert.equal(m.formatExpiry(e, {placeholder: 'MM/AA'}), '03/31');
    assert.equal(m.formatExpiry(e, {placeholder: 'MM/AAAA'}), '03/2031');
    assert.equal(m.formatExpiry(e, {placeholder: 'MM / YY'}), '03 / 31');
    assert.equal(m.formatExpiry(e, {maxLength: 7}), '03/2031');
    assert.equal(m.formatExpiry(e, {maxLength: 4}), '0331');
});

test('escolhe option de mês/ano', () => {
    const e = {month: 3, year: 2031};
    assert.equal(m.pickOption(months, 'expMonth', e), '3');
    assert.equal(m.pickOption([{value: '', text: 'Mês'}, {value: '03', text: 'Março'}], 'expMonth', e), '03');
    assert.equal(m.pickOption([{value: 'a', text: '2030'}, {value: 'b', text: '2031'}], 'expYear', e), 'b');
    assert.equal(m.pickOption([{value: '30', text: '30'}, {value: '31', text: '31'}], 'expYear', e), '31');
    assert.equal(m.pickOption(months, 'expYear', {month: 1, year: 2099}), null);
});

test('formata número', () => {
    assert.equal(m.formatNumber('4111111111111111', {maxLength: 16}), '4111111111111111');
    assert.equal(m.formatNumber('4111111111111111', {maxLength: 19, placeholder: '0000 0000 0000 0000'}), '4111 1111 1111 1111');
});
