/**
 * OCR no navegador com Tesseract.js hospedado no próprio módulo (nada sai do aparelho).
 * O worker e o modelo (~7 MB) só são baixados no primeiro scan e ficam em cache (IndexedDB).
 */
define([
    'require'
], function (require) {
    'use strict';

    var base = require.toUrl('MagePanda_CardScanner/vendor/tesseract/'),
        workerPromise = null;

    function absolute(url) {
        return new URL(url, window.location.href).href;
    }

    function loadTesseract() {
        return new Promise(function (resolve, reject) {
            require(['MagePanda_CardScanner/vendor/tesseract/tesseract.min'], function (T) {
                resolve(T || window.Tesseract);
            }, reject);
        });
    }

    function getWorker(onProgress) {
        if (!workerPromise) {
            workerPromise = loadTesseract().then(function (Tesseract) {
                return Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
                    // Worker servido como arquivo estático (não blob:) para funcionar com a CSP do checkout.
                    workerPath: absolute(base + 'worker.min.js'),
                    workerBlobURL: false,
                    corePath: absolute(base),
                    langPath: absolute(base),
                    gzip: true,
                    logger: function (m) {
                        if (onProgress && m.status && m.status.indexOf('loading') !== -1) {
                            onProgress(m.progress || 0);
                        }
                    }
                });
            }).then(function (worker) {
                return worker.setParameters({
                    // Texto esparso: o cartão tem blocos soltos (número, validade, nome).
                    tessedit_pageseg_mode: '11',
                    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/ ',
                    preserve_interword_spaces: '1'
                }).then(function () {
                    return worker;
                });
            });
            workerPromise.catch(function () {
                workerPromise = null;
            });
        }

        return workerPromise;
    }

    /**
     * Escala para ~1400px de largura e aplica tons de cinza + contraste.
     * @param {CanvasImageSource} source
     * @param {{x:number,y:number,w:number,h:number}} [crop]
     */
    function preprocess(source, crop) {
        var sw = crop ? crop.w : (source.videoWidth || source.naturalWidth || source.width),
            sh = crop ? crop.h : (source.videoHeight || source.naturalHeight || source.height),
            scale = Math.min(2.5, 1400 / sw),
            canvas = document.createElement('canvas'),
            ctx,
            img,
            d,
            i,
            g,
            min = 255,
            max = 0,
            range;

        canvas.width = Math.round(sw * scale);
        canvas.height = Math.round(sh * scale);
        ctx = canvas.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(source, crop ? crop.x : 0, crop ? crop.y : 0, sw, sh, 0, 0, canvas.width, canvas.height);
        img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        d = img.data;

        for (i = 0; i < d.length; i += 4) {
            g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            d[i] = g;
            min = Math.min(min, g);
            max = Math.max(max, g);
        }
        range = Math.max(1, max - min);
        for (i = 0; i < d.length; i += 4) {
            g = (d[i] - min) * 255 / range;
            d[i] = d[i + 1] = d[i + 2] = g;
        }
        ctx.putImageData(img, 0, 0);

        return canvas;
    }

    return {
        /** Baixa o motor antes de precisar (ex.: quando o modal abre). */
        warmUp: function (onProgress) {
            return getWorker(onProgress);
        },

        /** @returns {Promise<string>} texto reconhecido */
        recognize: function (source, crop, onProgress) {
            return getWorker(onProgress).then(function (worker) {
                return worker.recognize(preprocess(source, crop));
            }).then(function (res) {
                return res.data.text || '';
            });
        },

        terminate: function () {
            if (workerPromise) {
                workerPromise.then(function (w) {
                    w.terminate();
                });
                workerPromise = null;
            }
        }
    };
});
