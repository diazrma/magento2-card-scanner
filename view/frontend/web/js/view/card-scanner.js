/**
 * Observa a etapa de pagamento e, em todo método que renderiza campos de cartão no próprio
 * checkout (qualquer módulo), adiciona o botão "Escanear cartão" e preenche os campos lidos.
 * Campos dentro de iframe de outro domínio (hosted fields) não são acessíveis — por design do navegador.
 */
define([
    'uiComponent',
    'MagePanda_CardScanner/js/field-matcher',
    'mage/translate'
], function (Component, matcher, $t) {
    'use strict';

    var AUTOCOMPLETE = {number: 'cc-number', name: 'cc-name', expMonth: 'cc-exp-month',
            expYear: 'cc-exp-year', exp: 'cc-exp', cvv: 'cc-csc'},
        // Formulário de endereço de cobrança fica dentro do método de pagamento: não é cartão.
        SKIP_INSIDE = 'fieldset.address, .billing-address-form, .checkout-billing-address, .billing-address-details';

    function labelFor(field) {
        var label = field.id && document.querySelector('label[for="' + window.CSS.escape(field.id) + '"]');

        return [label ? label.textContent : '', field.getAttribute('aria-label') || ''].join(' ');
    }

    function dataKeys(field) {
        return Array.prototype.map.call(field.attributes, function (a) {
            return a.name.indexOf('data-') === 0 && a.name !== 'data-bind' && a.name !== 'data-validate'
                ? a.name + ' ' + a.value : '';
        }).join(' ');
    }

    function describe(field) {
        var tag = field.tagName.toLowerCase();

        return {
            tag: tag,
            type: field.getAttribute('type') || '',
            autocomplete: field.getAttribute('autocomplete') || '',
            name: field.getAttribute('name') || '',
            id: field.id || '',
            dataKeys: dataKeys(field),
            placeholder: field.getAttribute('placeholder') || '',
            label: labelFor(field),
            maxLength: field.maxLength > 0 ? field.maxLength : null,
            options: tag === 'select' ? Array.prototype.map.call(field.options, function (o) {
                return {value: o.value, text: o.text};
            }) : null
        };
    }

    /** Define o valor como se o cliente tivesse digitado (KO, jQuery, máscaras e React escutam esses eventos). */
    function setValue(field, value) {
        var proto = field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype,
            setter = Object.getOwnPropertyDescriptor(proto, 'value').set;

        field.focus({preventScroll: true});
        setter.call(field, value);
        ['input', 'change', 'keyup', 'blur'].forEach(function (type) {
            field.dispatchEvent(new Event(type, {bubbles: true}));
        });
    }

    return Component.extend({
        defaults: {
            config: window.checkoutConfig && window.checkoutConfig.magepandaCardScanner || {}
        },

        initialize: function () {
            this._super();

            if (!this.config.enabled) {
                return this;
            }
            this.scheduled = false;
            this.observer = new MutationObserver(this.schedule.bind(this));
            this.observer.observe(document.body, {childList: true, subtree: true});
            this.schedule();

            return this;
        },

        schedule: function () {
            if (this.scheduled) {
                return;
            }
            this.scheduled = true;
            window.setTimeout(function () {
                this.scheduled = false;
                this.scan();
            }.bind(this), 250);
        },

        isAllowed: function (code) {
            var methods = this.config.methods || [];

            return !methods.length || methods.indexOf(code) !== -1;
        },

        canShowButton: function () {
            return this.config.showOnDesktop || window.matchMedia('(pointer: coarse)').matches;
        },

        /** @returns {Object|null} mapa tipo => elemento dos campos de cartão deste método */
        findFields: function (container) {
            var found = {};

            container.querySelectorAll('input, select').forEach(function (field) {
                var kind;

                if (field.closest(SKIP_INSIDE)) {
                    return;
                }
                kind = matcher.classify(describe(field));
                if (kind && !found[kind]) {
                    found[kind] = field;
                }
            });

            return found.number ? found : null;
        },

        scan: function () {
            document.querySelectorAll('.payment-method').forEach(function (method) {
                var radio = method.querySelector('input[name="payment[method]"]'),
                    code = radio ? radio.value : '',
                    fields;

                if (!code || !this.isAllowed(code)) {
                    return;
                }
                fields = this.findFields(method);
                if (!fields) {
                    return;
                }
                if (this.config.nativeAutocomplete) {
                    // Habilita autofill/scan nativo do navegador (Safari iOS, Chrome Android).
                    Object.keys(fields).forEach(function (kind) {
                        fields[kind].setAttribute('autocomplete', AUTOCOMPLETE[kind]);
                    });
                }
                if (this.canShowButton() && !method.querySelector('.mp-cardscan-trigger')) {
                    this.injectButton(method, code, fields);
                }
            }.bind(this));
        },

        injectButton: function (method, code, fields) {
            var anchor = fields.number.closest('.field, .form-group, .control') || fields.number,
                wrap = document.createElement('div'),
                button = document.createElement('button'),
                note = document.createElement('p');

            wrap.className = 'field mp-cardscan-trigger';
            button.type = 'button';
            button.className = 'action secondary mp-cardscan-trigger__button';
            button.innerHTML = '<span class="mp-cardscan-trigger__icon" aria-hidden="true"></span>';
            button.appendChild(document.createTextNode(this.config.buttonLabel || $t('Scan card')));
            button.setAttribute('data-method', code);
            note.className = 'mp-cardscan-trigger__note';
            note.setAttribute('role', 'status');
            wrap.appendChild(button);
            wrap.appendChild(note);
            anchor.parentNode.insertBefore(wrap, anchor);

            button.addEventListener('click', function () {
                require(['MagePanda_CardScanner/js/scanner'], function (scanner) {
                    scanner.open().then(function (result) {
                        // Campos podem ter sido re-renderizados enquanto o scanner estava aberto.
                        var current = this.findFields(method) || fields;

                        if (result) {
                            this.fill(current, result);
                            note.textContent = current.cvv
                                ? $t('Card filled in. Now type the security code (CVV).')
                                : $t('Card filled in. Please check the data.');
                        }
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        },

        fill: function (fields, result) {
            var d;

            setValue(fields.number, matcher.formatNumber(result.number, describe(fields.number)));
            if (result.name && fields.name) {
                setValue(fields.name, result.name);
            }
            if (result.expiry) {
                ['expMonth', 'expYear'].forEach(function (kind) {
                    var value;

                    if (!fields[kind]) {
                        return;
                    }
                    d = describe(fields[kind]);
                    if (d.tag === 'select') {
                        value = matcher.pickOption(d.options, kind, result.expiry);
                    } else {
                        value = kind === 'expMonth'
                            ? ('0' + result.expiry.month).slice(-2)
                            : (d.maxLength === 2 ? String(result.expiry.year).slice(-2) : String(result.expiry.year));
                    }
                    if (value !== null) {
                        setValue(fields[kind], value);
                    }
                });
                if (fields.exp) {
                    setValue(fields.exp, matcher.formatExpiry(result.expiry, describe(fields.exp)));
                }
            }
            if (fields.cvv) {
                fields.cvv.focus();
            }
        }
    });
});
