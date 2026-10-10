/**
 * Tela do scanner: câmera ao vivo com moldura do cartão + opção de enviar foto.
 * Lê quadros em sequência até o número aparecer igual em 2 leituras, então pede confirmação.
 * Resolve com {number, brand, expiry, name} ou null se o cliente cancelar.
 */
define([
    'MagePanda_CardScanner/js/ocr',
    'MagePanda_CardScanner/js/card-parser',
    'mage/translate'
], function (ocr, parser, $t) {
    'use strict';

    var CARD_RATIO = 85.6 / 53.98; // ISO/IEC 7810 ID-1

    function el(tag, cls, text) {
        var e = document.createElement(tag);

        if (cls) {
            e.className = cls;
        }
        if (text) {
            e.textContent = text;
        }

        return e;
    }

    function formatNumber(n) {
        return n.length === 15 ? n.replace(/^(\d{4})(\d{6})(\d{5})$/, '$1 $2 $3') : n.replace(/(\d{4})(?=\d)/g, '$1 ');
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    /**
     * Decodifica a foto sem <img src="blob:">: a CSP do checkout (img-src sem blob:) bloquearia
     * e o onload nunca dispararia. createImageBitmap não passa pela CSP; data: é permitido no img-src.
     * @param {File} file
     * @returns {Promise<CanvasImageSource>}
     */
    function decodePhoto(file) {
        if (window.createImageBitmap) {
            return window.createImageBitmap(file).catch(function () {
                return decodeAsDataUrl(file);
            });
        }

        return decodeAsDataUrl(file);
    }

    function decodeAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();

            reader.onerror = reject;
            reader.onload = function () {
                var img = new Image();

                img.onload = function () {
                    resolve(img);
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    /** Área da moldura em coordenadas do vídeo (a moldura é 86% da largura visível, centralizada). */
    function guideCrop(video) {
        var vw = video.videoWidth,
            vh = video.videoHeight,
            box = video.getBoundingClientRect(),
            // object-fit: cover → parte do vídeo fica fora da tela
            scale = Math.max(box.width / vw, box.height / vh),
            visW = box.width / scale,
            visH = box.height / scale,
            w = visW * 0.86,
            h = w / CARD_RATIO;

        if (h > visH * 0.9) {
            h = visH * 0.9;
            w = h * CARD_RATIO;
        }

        // Folga de 12% em volta: o cliente raramente alinha o cartão exatamente na moldura.
        w = Math.min(vw, w * 1.24);
        h = Math.min(vh, h * 1.24);

        return {x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w: Math.round(w), h: Math.round(h)};
    }

    function open(options) {
        var opts = options || {},
            root = el('div', 'mp-cardscan'),
            stage = el('div', 'mp-cardscan__stage'),
            video = el('video', 'mp-cardscan__video'),
            guide = el('div', 'mp-cardscan__guide'),
            status = el('p', 'mp-cardscan__status', $t('Preparing camera...')),
            bar = el('div', 'mp-cardscan__actions'),
            fileLabel = el('label', 'action secondary mp-cardscan__file', $t('Upload a photo')),
            fileInput = el('input'),
            cancelBtn = el('button', 'action secondary mp-cardscan__cancel', $t('Cancel')),
            privacy = el('p', 'mp-cardscan__privacy',
                $t('The image is read on your device and is never sent or stored.')),
            stream = null,
            frame = 0,
            closed = false,
            busy = false,
            acc = new parser.Accumulator(2),
            startedAt = 0,
            resolveFn;

        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.setAttribute('capture', 'environment');
        fileInput.className = 'mp-cardscan__file-input';
        fileLabel.appendChild(fileInput);
        cancelBtn.type = 'button';
        video.setAttribute('playsinline', '');
        video.muted = true;
        guide.innerHTML = '<span></span><span></span><span></span><span></span>';
        stage.appendChild(video);
        stage.appendChild(guide);
        bar.appendChild(fileLabel);
        bar.appendChild(cancelBtn);
        root.appendChild(stage);
        root.appendChild(status);
        root.appendChild(bar);
        root.appendChild(privacy);
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', $t('Scan card'));
        document.body.appendChild(root);
        document.body.classList.add('mp-cardscan-open');

        function setStatus(text) {
            status.textContent = text;
        }

        function stopCamera() {
            if (stream) {
                stream.getTracks().forEach(function (t) {
                    t.stop();
                });
                stream = null;
            }
        }

        function close(result) {
            if (closed) {
                return;
            }
            closed = true;
            stopCamera();
            document.removeEventListener('keydown', onKey);
            root.remove();
            document.body.classList.remove('mp-cardscan-open');
            resolveFn(result || null);
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                close(null);
            }
        }

        function confirm(result) {
            var box = el('div', 'mp-cardscan__confirm'),
                list = el('dl'),
                ok = el('button', 'action primary', $t('Use this card')),
                retry = el('button', 'action secondary', $t('Scan again'));

            stopCamera();
            stage.style.display = 'none';
            bar.style.display = 'none';
            setStatus($t('Check the data read from the card:'));

            [[$t('Number'), formatNumber(result.number)],
                [$t('Expiration'), result.expiry ? pad2(result.expiry.month) + '/' + result.expiry.year : '—'],
                [$t('Name'), result.name || '—']].forEach(function (row) {
                list.appendChild(el('dt', '', row[0]));
                list.appendChild(el('dd', '', row[1]));
            });
            ok.type = retry.type = 'button';
            ok.addEventListener('click', function () {
                close(result);
            });
            retry.addEventListener('click', function () {
                box.remove();
                stage.style.display = '';
                bar.style.display = '';
                acc = new parser.Accumulator(2);
                startCamera();
            });
            box.appendChild(list);
            box.appendChild(el('p', 'mp-cardscan__hint', $t('Security code (CVV) is not read. Type it manually.')));
            box.appendChild(ok);
            box.appendChild(retry);
            root.insertBefore(box, privacy);
            ok.focus();
        }

        function loop() {
            if (closed || !stream) {
                return;
            }
            if (busy || video.readyState < 2) {
                window.setTimeout(loop, 150);

                return;
            }
            busy = true;
            frame++;
            // Alterna recorte da moldura e quadro inteiro (cartão maior que a moldura ou fora do centro).
            ocr.recognize(video, frame % 2 ? guideCrop(video) : null).then(function (text) {
                var res;

                busy = false;
                if (closed || !stream) {
                    return;
                }
                acc.add(parser.parse(text));
                res = acc.result();
                if (res) {
                    confirm(res);

                    return;
                }
                setStatus(Date.now() - startedAt > 15000
                    ? $t('Still trying... Improve the light, avoid reflections or upload a photo.')
                    : $t('Align the card inside the frame'));
                window.setTimeout(loop, 60);
            }, function (e) {
                busy = false;
                setStatus($t('Could not read the card.') + ' ' + (e && e.message ? e.message : ''));
            });
        }

        function startCamera() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                stage.style.display = 'none';
                setStatus($t('Camera not available here. Upload a photo of the card.'));

                return;
            }
            setStatus($t('Preparing camera...'));
            navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}
            }).then(function (s) {
                if (closed) {
                    s.getTracks().forEach(function (t) {
                        t.stop();
                    });

                    return;
                }
                stream = s;
                video.srcObject = s;

                return video.play();
            }).then(function () {
                if (!stream) {
                    return;
                }
                setStatus($t('Loading card reader...'));

                return ocr.warmUp(function (p) {
                    setStatus($t('Loading card reader...') + ' ' + Math.round(p * 100) + '%');
                });
            }).then(function () {
                if (!stream) {
                    return;
                }
                startedAt = Date.now();
                setStatus($t('Align the card inside the frame'));
                loop();
            }).catch(function (e) {
                stopCamera();
                stage.style.display = 'none';
                setStatus((e && e.name === 'NotAllowedError'
                    ? $t('Camera permission denied.')
                    : $t('Could not open the camera.')) + ' ' + $t('Upload a photo of the card.'));
            });
        }

        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];

            if (!file) {
                return;
            }
            stopCamera();
            setStatus($t('Reading photo...'));
            fileInput.value = '';
            decodePhoto(file).then(function (img) {
                return ocr.recognize(img, null, function (p) {
                    setStatus($t('Loading card reader...') + ' ' + Math.round(p * 100) + '%');
                });
            }).then(function (text) {
                var single = new parser.Accumulator(1),
                    res;

                single.add(parser.parse(text));
                res = single.result();
                if (res) {
                    confirm(res);
                } else {
                    setStatus($t('No valid card number found in the photo. Try another photo, closer and without reflections.'));
                }
            }, function () {
                setStatus($t('Could not read the card.'));
            });
        });
        cancelBtn.addEventListener('click', function () {
            close(null);
        });
        document.addEventListener('keydown', onKey);

        return new Promise(function (resolve) {
            resolveFn = resolve;
            if (opts.camera === false) {
                stage.style.display = 'none';
                setStatus($t('Upload a photo of the card.'));
            } else {
                startCamera();
            }
        });
    }

    return {open: open};
});
