// node --test app/code/MagePanda/CardScanner/Test/Js/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../../view/frontend/web/js/card-parser.js');

const NOW = new Date(2026, 9, 9); // 09/10/2026

test('luhn', () => {
    assert.equal(parser.luhn('4111111111111111'), true);
    assert.equal(parser.luhn('5555555555554444'), true);
    assert.equal(parser.luhn('378282246310005'), true);
    assert.equal(parser.luhn('4111111111111112'), false);
    assert.equal(parser.luhn('1234'), false);
});

test('bandeiras', () => {
    assert.equal(parser.detectBrand('4111111111111111'), 'VI');
    assert.equal(parser.detectBrand('5555555555554444'), 'MC');
    assert.equal(parser.detectBrand('2223000048400011'), 'MC');
    assert.equal(parser.detectBrand('378282246310005'), 'AE');
    assert.equal(parser.detectBrand('6362970000457013'), 'ELO');
    assert.equal(parser.detectBrand('6062825624254001'), 'HC');
});

test('número em grupos limpos', () => {
    assert.equal(parser.extractNumber('VISA\n4111 1111 1111 1111\nVALID THRU 12/29'), '4111111111111111');
});

test('número com trocas típicas do OCR (O->0, l->1, S->5)', () => {
    assert.equal(parser.extractNumber('5S55 5555 5SS5 4444'), '5555555555554444');
    assert.equal(parser.extractNumber('4l11 1111 llll 1111'), '4111111111111111');
    assert.equal(parser.extractNumber('5555 S555 5555 4O44'), null); // 4O44 -> 4044 não passa no Luhn
});

test('amex 4-6-5', () => {
    assert.equal(parser.extractNumber('AMERICAN EXPRESS\n3782 822463 10005'), '378282246310005');
});

test('número com ruído grudado e quebrado em linhas', () => {
    assert.equal(parser.extractNumber('xx 4111 1111\n1111 1111 12/29'), '4111111111111111');
});

test('não inventa número a partir de texto', () => {
    assert.equal(parser.extractNumber('JOAO DA SILVA\nBANCO EXEMPLO S.A.'), null);
    assert.equal(parser.extractNumber('tel 1234 5678'), null);
});

test('validade: escolhe a data futura mais distante, ignora "membro desde"', () => {
    assert.deepEqual(parser.extractExpiry('MEMBER SINCE 03/19  VALID THRU 08/31', NOW), {month: 8, year: 2031});
    assert.deepEqual(parser.extractExpiry('VALIDO ATE 11/2028', NOW), {month: 11, year: 2028});
    assert.deepEqual(parser.extractExpiry('12-30', NOW), {month: 12, year: 2030});
    assert.equal(parser.extractExpiry('VALID THRU 09/26', NOW), null); // já venceu
    assert.equal(parser.extractExpiry('13/29', NOW), null); // mês inválido
    assert.equal(parser.extractExpiry('4111 1111 1111 1111', NOW), null);
});

test('validade com barra lida como l/I', () => {
    assert.deepEqual(parser.extractExpiry('VALID THRU 05l29', NOW), {month: 5, year: 2029});
});

test('nome: ignora bandeira, banco e rótulos', () => {
    const text = 'NUBANK\nPLATINUM\n4111 1111 1111 1111\nVALID THRU 12/29\nMARIA S OLIVEIRA\nVISA';
    assert.equal(parser.extractName(text), 'MARIA S OLIVEIRA');
    assert.equal(parser.extractName('BANCO DO BRASIL\nVISA INFINITE'), null);
    assert.equal(parser.extractName('Pague com seu cartao aqui'), null);
});

test('parse completo', () => {
    const r = parser.parse('ITAU\n5555 5555 5555 4444\n07/30\nJOSE CARLOS PEREIRA\nmastercard', NOW);
    assert.deepEqual(r, {
        number: '5555555555554444',
        brand: 'MC',
        expiry: {month: 7, year: 2030},
        name: 'JOSE CARLOS PEREIRA'
    });
});

test('acumulador exige votos repetidos', () => {
    const acc = new parser.Accumulator(2);
    acc.add(parser.parse('4111 1111 1111 1111 12/29', NOW));
    assert.equal(acc.result(), null);
    acc.add(parser.parse('4111 1111 1111 1111\nANA LIMA', NOW));
    assert.deepEqual(acc.result(), {
        number: '4111111111111111', brand: 'VI', expiry: {month: 12, year: 2029}, name: 'ANA LIMA'
    });
});
