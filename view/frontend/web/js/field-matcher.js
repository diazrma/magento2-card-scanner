/**
 * Classifica campos de formulário de cartão de qualquer método de pagamento
 * (cc-form do Magento, módulos de gateways com nomes próprios) e formata os valores
 * no formato que cada campo espera. Puro — testado em Test/Js/field-matcher.test.js.
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

    var AUTOCOMPLETE = {
        'cc-number': 'number',
        'cc-name': 'name',
        'cc-exp-month': 'expMonth',
        'cc-exp-year': 'expYear',
        'cc-exp': 'exp',
        'cc-csc': 'cvv'
    };

    // Ordem importa: cvv antes de tudo (ex.: "cc_cid"), mês/ano antes da validade combinada.
    var KEY_RULES = [
        ['cvv', /cvv|cvc|(^|[^a-z])cid([^a-z]|$)|csc|security|seguranca|cod(igo)?[_\- ]?(de[_\- ]?)?seg/],
        ['number', /(cc|card|cartao|credit)[_\- ]?(num|number|numero|no)\b|cardnumber|ccnumber|cc_number|card_number|numero[_\- ]?(do[_\- ]?)?cartao|\bpan\b/],
        ['expMonth', /(exp|expir\w*|valid\w*|venc\w*)[_\- ]?(month|mes|mm)\b|(month|mes)[_\- ]?(exp|valid|venc)|\bmonth\b|\bmes\b/],
        ['expYear', /(exp|expir\w*|valid\w*|venc\w*)[_\- ]?(year|ano|yy|yyyy)\b|(year|ano)[_\- ]?(exp|valid|venc)|\byear\b|\bano\b/],
        ['exp', /expir|exp[_\- ]?date|expiry|validade|vencimento|cc[_\- ]?exp\b|\bexp\b|due[_\- ]?date/],
        ['name', /holder|owner|titular|card[_\- ]?name|name[_\- ]?on[_\- ]?card|nome[_\- ]?(no[_\- ]?|do[_\- ]?|impresso[_\- ]?)?(cartao|titular)|nome[_\- ]?impresso|cc[_\- ]?name/]
    ];

    // Mesmo vocabulário, mas para placeholder/label/aria-label (texto humano).
    var LABEL_RULES = [
        ['cvv', /cvv|cvc|c[oó]digo de seguran|security code/i],
        ['number', /n[uú]mero do cart|card number|n[uú]mero/i],
        ['exp', /^\s*(mm|m[eê]s)\s*\/\s*(aa|yy|aaaa|yyyy)\s*$|validade|vencimento|expira|expiry|expiration/i],
        ['name', /nome (impresso|do titular|no cart)|titular|cardholder|name on card/i]
    ];

    var NOT_CARD = /firstname|lastname|middlename|street|city|postcode|zip|telephone|phone|company|email|region|country|vat|taxvat|cpf|cnpj|document|doc_number|installment|parcela|coupon|cupom/;

    function normKey(s) {
        return String(s || '').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[\[\]]/g, '_').replace(/([a-z])([A-Z])/g, '$1_$2');
    }

    /**
     * @param {Object} f {tag, type, autocomplete, name, id, dataKeys, placeholder, label, options}
     *   options: [{value, text}] para <select>
     * @returns {string|null} number|name|expMonth|expYear|exp|cvv
     */
    function classify(f) {
        var ac = String(f.autocomplete || '').toLowerCase().trim().split(/\s+/).pop(),
            key = normKey([f.name, f.id, f.dataKeys].join(' ')),
            label = String([f.placeholder, f.label].join(' ')),
            type = String(f.type || '').toLowerCase(),
            i;

        if (type === 'hidden' || type === 'radio' || type === 'checkbox' || type === 'submit' || type === 'button') {
            return null;
        }
        if (AUTOCOMPLETE[ac]) {
            return AUTOCOMPLETE[ac];
        }
        if (NOT_CARD.test(key)) {
            return null;
        }
        if (f.tag === 'select') {
            return classifySelect(key, f.options || []);
        }
        for (i = 0; i < KEY_RULES.length; i++) {
            if (KEY_RULES[i][1].test(key)) {
                return KEY_RULES[i][0];
            }
        }
        for (i = 0; i < LABEL_RULES.length; i++) {
            if (LABEL_RULES[i][1].test(label)) {
                return LABEL_RULES[i][0];
            }
        }

        return null;
    }

    function classifySelect(key, options) {
        var vals = options.map(function (o) {
                return parseInt(o.value, 10);
            }).filter(function (n) {
                return !isNaN(n);
            }),
            nowYear = new Date().getFullYear();

        if (/year|ano|yy/.test(key) || (vals.length && vals.every(function (n) {
            return (n >= nowYear && n <= nowYear + 30) || (n >= nowYear % 100 && n <= nowYear % 100 + 30);
        }) && vals.length !== 12)) {
            return 'expYear';
        }
        if (/month|mes|mm/.test(key) || (vals.length === 12 && vals.every(function (n) {
            return n >= 1 && n <= 12;
        }))) {
            return 'expMonth';
        }

        return null;
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    /** Valor de validade combinada, no formato sugerido pelo placeholder/maxlength do campo. */
    function formatExpiry(expiry, hint) {
        var placeholder = String(hint.placeholder || '').toUpperCase(),
            max = parseInt(hint.maxLength, 10),
            mm = pad2(expiry.month),
            yyyy = String(expiry.year),
            yy = yyyy.slice(-2),
            sep = /\s\/\s/.test(placeholder) ? ' / ' : (/-/.test(placeholder) ? '-' : '/');

        if (/AAAA|YYYY/.test(placeholder) || max === 7 || max === 9) {
            return mm + sep + yyyy;
        }
        if (max === 4) {
            return mm + yy;
        }

        return mm + sep + yy;
    }

    /** Escolhe o value da <option> que representa o mês/ano (aceita "1", "01", "2029", "29", "01 - Janeiro"). */
    function pickOption(options, kind, expiry) {
        var target = kind === 'expMonth' ? expiry.month : expiry.year,
            i,
            v,
            t;

        for (i = 0; i < options.length; i++) {
            v = parseInt(options[i].value, 10);
            if (v === target || (kind === 'expYear' && v === target % 100)) {
                return options[i].value;
            }
        }
        for (i = 0; i < options.length; i++) {
            t = parseInt(String(options[i].text || '').trim(), 10);
            if (t === target || (kind === 'expYear' && t === target % 100)) {
                return options[i].value;
            }
        }

        return null;
    }

    /** Valor do número: só dígitos, a menos que o maxlength deixe espaço para a máscara com espaços. */
    function formatNumber(number, hint) {
        var max = parseInt(hint.maxLength, 10);

        if (max && max >= number.length + 3 && /\s/.test(String(hint.placeholder || ''))) {
            return number.replace(/(\d{4})(?=\d)/g, '$1 ');
        }

        return number;
    }

    return {
        classify: classify,
        formatExpiry: formatExpiry,
        pickOption: pickOption,
        formatNumber: formatNumber
    };
}));
