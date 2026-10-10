/**
 * Extrai número, validade e nome do texto bruto do OCR de um cartão.
 * Funções puras (sem DOM) — testadas em Test/Js/card-parser.test.js.
 */
(function (factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    }
}(function () {
    'use strict';

    // Trocas típicas do OCR dentro de blocos que deveriam ser só dígitos.
    var DIGIT_FIXES = {O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '1', '|': '1', '!': '1',
        Z: '2', S: '5', B: '8', G: '6', A: '4'};

    // Palavras que aparecem impressas no cartão e não são o nome do titular.
    var NOT_NAME = ['VISA', 'MASTERCARD', 'MASTER', 'CARD', 'CARTAO', 'CREDIT', 'CREDITO', 'DEBIT', 'DEBITO',
        'BANK', 'BANCO', 'PLATINUM', 'GOLD', 'BLACK', 'INFINITE', 'SIGNATURE', 'CLASSIC', 'INTERNATIONAL',
        'INTERNACIONAL', 'NACIONAL', 'BUSINESS', 'EMPRESARIAL', 'VALID', 'THRU', 'VALIDO', 'ATE', 'VALIDADE',
        'VENCIMENTO', 'MEMBER', 'SINCE', 'MONTH', 'YEAR', 'ELO', 'HIPERCARD', 'AMEX', 'AMERICAN', 'EXPRESS',
        'DINERS', 'CLUB', 'DISCOVER', 'JCB', 'MAESTRO', 'ELECTRON', 'NUBANK', 'ITAU', 'BRADESCO', 'SANTANDER',
        'CAIXA', 'INTER', 'NEON', 'ORIGINAL', 'SICREDI', 'SICOOB', 'C6', 'PICPAY', 'MERCADO', 'PAGO',
        'CONTACTLESS', 'PREPAID', 'PRE', 'PAGO', 'GOOD', 'MULTIPLO', 'MULTIPLE', 'WORLD', 'ELITE', 'NANQUIM',
        'UNIQUE', 'PERSONNALITE', 'PRIME', 'SELECT', 'ULTRAVIOLETA', 'EXPIRES', 'EXP', 'END', 'FROM'];

    var BRANDS = [
        {code: 'ELO', re: /^(4011(78|79)|43(1274|8935)|45(1416|7393|763(1|2))|50(4175|6699|67[0-7][0-9]|9000)|627780|63(6297|6368)|650(03([^4])|04([0-9])|05(0|1)|4(0[5-9]|3[0-9]|8[5-9]|9[0-9])|5([0-2][0-9]|3[0-8])|9([2-6][0-9]|7[0-8])|541|700|720|901)|651652|655000|655021)/},
        {code: 'HC', re: /^(606282|3841)/},
        {code: 'AE', re: /^3[47]/},
        {code: 'DN', re: /^3(0[0-5]|[68])/},
        {code: 'JCB', re: /^35(2[89]|[3-8])/},
        {code: 'DI', re: /^(6011|65|64[4-9]|622)/},
        {code: 'MC', re: /^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/},
        {code: 'VI', re: /^4/}
    ];

    function luhn(number) {
        var sum = 0, alt = false, i, d;

        if (!/^\d{12,19}$/.test(number)) {
            return false;
        }
        for (i = number.length - 1; i >= 0; i--) {
            d = number.charCodeAt(i) - 48;
            if (alt) {
                d *= 2;
                if (d > 9) {
                    d -= 9;
                }
            }
            sum += d;
            alt = !alt;
        }

        return sum % 10 === 0;
    }

    function detectBrand(number) {
        var i;

        for (i = 0; i < BRANDS.length; i++) {
            if (BRANDS[i].re.test(number)) {
                return BRANDS[i].code;
            }
        }

        return null;
    }

    function fixDigits(chunk) {
        return chunk.toUpperCase().replace(/[OQDUILT|!ZSBGA]/g, function (c) {
            return DIGIT_FIXES[c];
        });
    }

    /**
     * O número vem impresso em grupos (4-4-4-4, 4-6-5…). Quebra o texto em "tokens" que parecem
     * dígitos e junta só grupos consecutivos inteiros que somem 13–19 dígitos — recortar janelas
     * arbitrárias de uma leitura errada gera falsos positivos no Luhn.
     * Ordem: Luhn válido, bandeira conhecida, 16 dígitos, mais longo.
     */
    function extractNumber(text) {
        var tokens = String(text || '').split(/[\s\-.]+/),
            candidates = [],
            i,
            j,
            raw,
            digits;

        for (i = 0; i < tokens.length; i++) {
            raw = '';
            for (j = i; j < tokens.length && /^[0-9OQDUILTZSBGA|!]{1,19}$/i.test(tokens[j]); j++) {
                raw += tokens[j];
                if (raw.length > 19) {
                    break;
                }
                // Exige pelo menos 60% de dígitos reais para não transformar palavras em número.
                if (raw.length >= 13 && (raw.match(/\d/g) || []).length / raw.length >= 0.6) {
                    digits = fixDigits(raw);
                    if (luhn(digits)) {
                        candidates.push(digits);
                    }
                }
            }
        }

        if (!candidates.length) {
            return null;
        }

        candidates.sort(function (a, b) {
            var ba = !!detectBrand(a), bb = !!detectBrand(b);

            if (ba !== bb) {
                return ba ? -1 : 1;
            }
            if ((a.length === 16) !== (b.length === 16)) {
                return a.length === 16 ? -1 : 1;
            }

            return b.length - a.length;
        });

        return candidates[0];
    }

    /**
     * Validade MM/AA ou MM/AAAA. Cartões podem ter "membro desde" e "válido até":
     * fica com a maior data ainda não vencida (até 20 anos à frente).
     */
    function extractExpiry(text, now) {
        var ref = now || new Date(),
            curYear = ref.getFullYear(),
            curMonth = ref.getMonth() + 1,
            src = fixSlashes(String(text || '')),
            re = /(?:^|[^\d])(0[1-9]|1[0-2])\s?[\/\\\-]\s?(\d{4}|\d{2})(?!\d)/g,
            best = null,
            m,
            year;

        while ((m = re.exec(src)) !== null) {
            year = m[2].length === 2 ? 2000 + parseInt(m[2], 10) : parseInt(m[2], 10);
            if (year < curYear || year > curYear + 20 || (year === curYear && parseInt(m[1], 10) < curMonth)) {
                continue;
            }
            if (!best || year > best.year || (year === best.year && parseInt(m[1], 10) > best.month)) {
                best = {month: parseInt(m[1], 10), year: year};
            }
            re.lastIndex = m.index + 1;
        }

        return best;
    }

    // OCR costuma ler "1" e "7" como "/" e vice-versa em "MM/AA"; só corrigimos letras óbvias.
    function fixSlashes(s) {
        return s.replace(/(\d)\s*[|lI]\s*(\d)/g, '$1/$2').replace(/[Oo](?=\d\s?\/)/g, '0');
    }

    function extractName(text) {
        var best = null;

        String(text || '').split(/\n/).forEach(function (rawLine) {
            var line = rawLine.toUpperCase().replace(/[^A-ZÀ-Ý\s.]/g, ' ').replace(/\s+/g, ' ').trim(),
                words,
                score;

            if (line.length < 5 || line.length > 30) {
                return;
            }
            words = line.split(' ').filter(function (w) {
                return w.replace('.', '').length > 0;
            });
            if (words.length < 2 || words.length > 5) {
                return;
            }
            if (words.some(function (w) {
                return NOT_NAME.indexOf(w.replace(/\./g, '')) !== -1;
            })) {
                return;
            }
            // Cada palavra precisa parecer nome: ≥2 letras ou inicial com ponto.
            if (!words.every(function (w) {
                return /^[A-ZÀ-Ý]{2,}$/.test(w) || /^[A-Z]\.?$/.test(w);
            })) {
                return;
            }
            // Original precisa estar majoritariamente em maiúsculas (nome impresso no cartão).
            if ((rawLine.match(/[a-z]/g) || []).length > (rawLine.match(/[A-Z]/g) || []).length) {
                return;
            }
            score = words.length * 10 + line.length;
            if (!best || score > best.score) {
                best = {name: line, score: score};
            }
        });

        return best ? best.name : null;
    }

    function parse(text, now) {
        var number = extractNumber(text);

        return {
            number: number,
            brand: number ? detectBrand(number) : null,
            expiry: extractExpiry(text, now),
            name: extractName(text)
        };
    }

    /**
     * Acumula leituras de vários quadros da câmera. O número só é aceito quando
     * aparece igual em `minVotes` quadros (ou uma vez, se for leitura de foto).
     */
    function Accumulator(minVotes) {
        this.minVotes = minVotes || 2;
        this.votes = {number: {}, expiry: {}, name: {}};
    }

    Accumulator.prototype.add = function (result) {
        var v = this.votes;

        if (result.number) {
            v.number[result.number] = (v.number[result.number] || 0) + 1;
        }
        if (result.expiry) {
            var k = result.expiry.month + '/' + result.expiry.year;

            v.expiry[k] = (v.expiry[k] || 0) + 1;
        }
        if (result.name) {
            v.name[result.name] = (v.name[result.name] || 0) + 1;
        }
    };

    function top(map) {
        var best = null, k;

        for (k in map) {
            if (map.hasOwnProperty(k) && (!best || map[k] > map[best])) {
                best = k;
            }
        }

        return best ? {value: best, votes: map[best]} : null;
    }

    Accumulator.prototype.result = function () {
        var n = top(this.votes.number), e = top(this.votes.expiry), nm = top(this.votes.name), parts;

        if (!n || n.votes < this.minVotes) {
            return null;
        }
        parts = e ? e.value.split('/') : null;

        return {
            number: n.value,
            brand: detectBrand(n.value),
            expiry: parts ? {month: parseInt(parts[0], 10), year: parseInt(parts[1], 10)} : null,
            name: nm ? nm.value : null
        };
    };

    return {
        luhn: luhn,
        detectBrand: detectBrand,
        extractNumber: extractNumber,
        extractExpiry: extractExpiry,
        extractName: extractName,
        parse: parse,
        Accumulator: Accumulator
    };
}));
