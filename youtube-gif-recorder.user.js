// ==UserScript==
// @name         YouTube 녹화 · 스크린샷 · 움짤 생성
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  유튜브 플레이어 컨트롤바에 녹화/스크린샷/움짤 버튼 추가. 단축키 커스터마이징 가능 (기본값: 녹화 F9, 스크린샷 F10, 움짤 F8). 움짤 자동 생성 옵션 지원.
// @match        https://www.youtube.com/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @noframes
// @updateURL     https://raw.githubusercontent.com/wfwgwfwga/youtube-gif-recorder.user/main/youtube-gif-recorder.user.js
// @downloadURL   https://raw.githubusercontent.com/wfwgwfwga/youtube-gif-recorder.user/main/youtube-gif-recorder.user.js
// ==/UserScript==

const DEFAULT_SETTINGS = {
    fps: 10,
    width: 480,
    quality: 10,
    format: 'gif',
    webpLossless: false,
    autoGenerate: false,
    bitrateMbps: 2,
    keyRecord: 'F9',
    keyScreenshot: 'F10',
    keyGif: 'F8'
};

const FPS_PRESETS = [10, 15, 20, 25, 30, 40, 60];
const WIDTH_PRESETS = [640, 720, 960, 1280, 1440, 1600, 1920];
const QUALITY_PRESETS = [1, 5, 10, 15, 20];
const BITRATE_PRESETS = [1, 2, 3, 4, 8, 12, 20]; // Mbps, 'auto'는 해상도별 기존 로직 사용


// ===============================================================
// 설정 불러오기 / 저장
// ===============================================================

function loadSettings() {

    try {

        const raw =
            GM_getValue(
                'yt-gif-settings',
                null
            );

        if (!raw) {
            return { ...DEFAULT_SETTINGS };
        }

        const p =
            JSON.parse(raw);

        return {

            fps:
                Number(p.fps) > 0
                    ? Number(p.fps)
                    : DEFAULT_SETTINGS.fps,

            width:
                Number(p.width) >= 0
                    ? Number(p.width)
                    : DEFAULT_SETTINGS.width,

            quality:
                Number(p.quality) >= 1
                    ? Number(p.quality)
                    : DEFAULT_SETTINGS.quality,

            format:
                p.format === 'webp'
                    ? 'webp'
                    : 'gif',

            webpLossless:
                p.webpLossless === true,

            autoGenerate:
                p.autoGenerate === true,

            bitrateMbps:
                p.bitrateMbps === 'auto' || Number(p.bitrateMbps) > 0
                    ? (p.bitrateMbps === 'auto' ? 'auto' : Number(p.bitrateMbps))
                    : DEFAULT_SETTINGS.bitrateMbps,

            keyRecord:
                typeof p.keyRecord === 'string' && p.keyRecord
                    ? p.keyRecord
                    : DEFAULT_SETTINGS.keyRecord,

            keyScreenshot:
                typeof p.keyScreenshot === 'string' && p.keyScreenshot
                    ? p.keyScreenshot
                    : DEFAULT_SETTINGS.keyScreenshot,

            keyGif:
                typeof p.keyGif === 'string' && p.keyGif
                    ? p.keyGif
                    : DEFAULT_SETTINGS.keyGif
        };

    } catch (e) {

        return {
            ...DEFAULT_SETTINGS
        };
    }
}


function saveSettings(s) {

    GM_setValue(
        'yt-gif-settings',
        JSON.stringify(s)
    );
}


let gifSettings =
    loadSettings();


// ===============================================================
// Select 옵션 생성
// ===============================================================

function buildFpsOptionsHtml(selected) {

    let html = '';

    FPS_PRESETS.forEach(v => {

        html +=
            `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`;

    });

    html +=
        `<option value="custom"${FPS_PRESETS.includes(selected) ? '' : ' selected'}>직접 입력</option>`;

    return html;
}


function buildWidthOptionsHtml(selected) {

    let html = '';

    WIDTH_PRESETS.forEach(v => {

        html +=
            `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`;

    });

    html +=
        `<option value="0"${selected === 0 ? ' selected' : ''}>원본</option>`;

    html +=
        `<option value="custom"${(WIDTH_PRESETS.includes(selected) || selected === 0) ? '' : ' selected'}>직접 입력</option>`;

    return html;
}


function buildQualityOptionsHtml(selected) {

    let html = '';

    QUALITY_PRESETS.forEach(v => {

        html +=
            `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`;

    });

    html +=
        `<option value="custom"${QUALITY_PRESETS.includes(selected) ? '' : ' selected'}>직접 입력</option>`;

    return html;
}


function buildFormatOptionsHtml(selected) {

    return (
        `<option value="gif"${selected === 'gif' ? ' selected' : ''}>GIF</option>` +
        `<option value="webp"${selected === 'webp' ? ' selected' : ''}>WebP</option>`
    );
}


function buildBitrateOptionsHtml(selected) {

    let html = '';

    html +=
        `<option value="auto"${selected === 'auto' ? ' selected' : ''}>자동(해상도별)</option>`;

    BITRATE_PRESETS.forEach(v => {

        html +=
            `<option value="${v}"${v === selected ? ' selected' : ''}>${v} Mbps</option>`;

    });

    html +=
        `<option value="custom"${(selected !== 'auto' && !BITRATE_PRESETS.includes(selected)) ? ' selected' : ''}>직접 입력</option>`;

    return html;
}


function buildWebpCompressionOptionsHtml(lossless) {

    return (
        `<option value="lossy"${!lossless ? ' selected' : ''}>손실</option>` +
        `<option value="lossless"${lossless ? ' selected' : ''}>무손실</option>`
    );
}


// ===============================================================
// Trusted Types
// ===============================================================

const ttPolicySettings =
    (
        window.trustedTypes &&
        trustedTypes.createPolicy
    )
        ? trustedTypes.createPolicy(
            'yt-gif-settings',
            {
                createHTML: (s) => s
            }
        )
        : {
            createHTML: (s) => s
        };


// ===============================================================
// 설정창
// ===============================================================

function openSettingsPanel() {

    if (
        document.getElementById(
            'yt-gif-settings-overlay'
        )
    ) {
        return;
    }


    const overlay =
        document.createElement(
            'div'
        );

    overlay.id =
        'yt-gif-settings-overlay';

    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#fff;';


    const panel =
        document.createElement(
            'div'
        );

    panel.style.cssText =
        'background:#181818;border-radius:12px;padding:20px;width:min(360px,92vw);max-height:90vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.5);';


    overlay.appendChild(
        panel
    );


    panel.innerHTML =
        ttPolicySettings.createHTML(`

        <h2 style="margin:0 0 14px;font-size:16px;">
            움짤(GIF/WebP) 기본값 설정
        </h2>

        <label style="font-size:13px;display:block;margin-bottom:10px;">
            기본 FPS

            <input
                id="yt-gif-setting-fps"
                type="number"
                min="1"
                step="1"
                value="${gifSettings.fps}"
                style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;"
            />
        </label>

        <label style="font-size:13px;display:block;margin-bottom:16px;">
            기본 가로 크기(px, 0=원본)

            <input
                id="yt-gif-setting-width"
                type="number"
                min="0"
                step="10"
                value="${gifSettings.width}"
                style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;"
            />
        </label>

        <label style="font-size:13px;display:block;margin-bottom:16px;">
            화질(1=최고화질~느림, 20=저화질~빠름)

            <input
                id="yt-gif-setting-quality"
                type="number"
                min="1"
                max="20"
                step="1"
                value="${gifSettings.quality}"
                style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;"
            />
        </label>

        <label style="font-size:13px;display:block;margin-bottom:16px;">
            기본 저장 형식

            <select
                id="yt-gif-setting-format"
                style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;"
            >
                ${buildFormatOptionsHtml(gifSettings.format)}
            </select>
        </label>

        <div
            id="yt-gif-setting-webp-wrap"
            style="display:${gifSettings.format === 'webp' ? 'block' : 'none'};margin-bottom:16px;"
        >

            <label style="font-size:13px;display:block;">

                WebP 압축 방식

                <select
                    id="yt-gif-setting-webp"
                    style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;"
                >
                    ${buildWebpCompressionOptionsHtml(gifSettings.webpLossless)}
                </select>

            </label>

        </div>

        <label style="font-size:13px;display:block;margin-bottom:6px;">
            녹화 비트레이트 <span style="color:#888;font-weight:normal;">(움짤은 항상 원본 화질)</span>

            <select
                id="yt-gif-setting-bitrate"
                style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;"
            >
                ${buildBitrateOptionsHtml(gifSettings.bitrateMbps)}
            </select>
        </label>

        <input
            id="yt-gif-setting-bitrate-custom"
            type="number"
            min="1"
            step="1"
            placeholder="Mbps 직접 입력"
            value="${typeof gifSettings.bitrateMbps === 'number' ? gifSettings.bitrateMbps : 2}"
            style="display:${(gifSettings.bitrateMbps !== 'auto' && !BITRATE_PRESETS.includes(gifSettings.bitrateMbps)) ? 'block' : 'none'};margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;margin-bottom:16px;"
        />

        <label style="font-size:13px;display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer;">
            <input
                id="yt-gif-setting-auto"
                type="checkbox"
                ${gifSettings.autoGenerate ? 'checked' : ''}
                style="width:16px;height:16px;"
            />
            자동 생성 (편집창 없이 저장된 설정으로 바로 저장)
        </label>

        <div style="border-top:1px solid #333;margin:4px 0 16px;padding-top:14px;">

            <div style="font-size:13px;font-weight:bold;margin-bottom:10px;color:#aaa;">
                단축키 설정 (입력칸 클릭 후 원하는 키를 누르세요)
            </div>

            <label style="font-size:13px;display:block;margin-bottom:10px;">
                녹화 단축키

                <input
                    id="yt-gif-setting-key-record"
                    type="text"
                    readonly
                    value="${gifSettings.keyRecord}"
                    style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;cursor:pointer;text-align:center;"
                />
            </label>

            <label style="font-size:13px;display:block;margin-bottom:10px;">
                스크린샷 단축키

                <input
                    id="yt-gif-setting-key-screenshot"
                    type="text"
                    readonly
                    value="${gifSettings.keyScreenshot}"
                    style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;cursor:pointer;text-align:center;"
                />
            </label>

            <label style="font-size:13px;display:block;">
                움짤 단축키

                <input
                    id="yt-gif-setting-key-gif"
                    type="text"
                    readonly
                    value="${gifSettings.keyGif}"
                    style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;cursor:pointer;text-align:center;"
                />
            </label>

        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;">

            <button
                id="yt-gif-setting-cancel"
                style="border:none;border-radius:6px;padding:8px 18px;font-size:14px;color:#fff;cursor:pointer;font-weight:bold;background:#3d3d3d;"
            >
                취소
            </button>

            <button
                id="yt-gif-setting-save"
                style="border:none;border-radius:6px;padding:8px 18px;font-size:14px;color:#fff;cursor:pointer;font-weight:bold;background:#3ea6ff;"
            >
                저장
            </button>

        </div>

    `);


    document.body.appendChild(
        overlay
    );


    const formatSelect =
        panel.querySelector(
            '#yt-gif-setting-format'
        );

    const webpWrap =
        panel.querySelector(
            '#yt-gif-setting-webp-wrap'
        );


    function updateSettingsWebpUI() {

        webpWrap.style.display =
            formatSelect.value === 'webp'
                ? 'block'
                : 'none';
    }


    formatSelect.addEventListener(
        'change',
        updateSettingsWebpUI
    );


    const bitrateSelect =
        panel.querySelector(
            '#yt-gif-setting-bitrate'
        );

    const bitrateCustomInput =
        panel.querySelector(
            '#yt-gif-setting-bitrate-custom'
        );


    function updateBitrateCustomUI() {

        bitrateCustomInput.style.display =
            bitrateSelect.value === 'custom'
                ? 'block'
                : 'none';
    }


    bitrateSelect.addEventListener(
        'change',
        updateBitrateCustomUI
    );


    // -------------------------------------------------------
    // 단축키 캡처
    // -------------------------------------------------------

    function normalizeKeyLabel(e) {

        return e.key.length === 1
            ? e.key.toUpperCase()
            : e.key;
    }


    function bindKeyCapture(inputEl) {

        inputEl.addEventListener(
            'click',
            () => {

                if (
                    inputEl.dataset.capturing === '1'
                ) {
                    return;
                }

                inputEl.dataset.capturing =
                    '1';

                const original =
                    inputEl.value;

                inputEl.value =
                    '키를 눌러주세요... (Esc: 취소)';

                inputEl.style.color =
                    '#3ea6ff';


                function onKey(e) {

                    e.preventDefault();

                    e.stopPropagation();


                    if (e.key === 'Escape') {

                        inputEl.value =
                            original;

                    } else {

                        inputEl.value =
                            normalizeKeyLabel(e);
                    }


                    inputEl.style.color =
                        '#fff';


                    inputEl.dataset.capturing =
                        '';


                    document.removeEventListener(
                        'keydown',
                        onKey,
                        true
                    );
                }


                document.addEventListener(
                    'keydown',
                    onKey,
                    true
                );
            }
        );
    }


    const keyRecordInput =
        panel.querySelector(
            '#yt-gif-setting-key-record'
        );

    const keyScreenshotInput =
        panel.querySelector(
            '#yt-gif-setting-key-screenshot'
        );

    const keyGifInput =
        panel.querySelector(
            '#yt-gif-setting-key-gif'
        );


    bindKeyCapture(keyRecordInput);

    bindKeyCapture(keyScreenshotInput);

    bindKeyCapture(keyGifInput);


    overlay.addEventListener(
        'click',
        (e) => {

            if (
                e.target === overlay
            ) {
                overlay.remove();
            }

        }
    );


    panel
        .querySelector(
            '#yt-gif-setting-cancel'
        )
        .addEventListener(
            'click',
            () => overlay.remove()
        );


    panel
        .querySelector(
            '#yt-gif-setting-save'
        )
        .addEventListener(
            'click',
            () => {

                const fps =
                    parseInt(
                        panel.querySelector(
                            '#yt-gif-setting-fps'
                        ).value,
                        10
                    );


                const width =
                    parseInt(
                        panel.querySelector(
                            '#yt-gif-setting-width'
                        ).value,
                        10
                    );


                const quality =
                    parseInt(
                        panel.querySelector(
                            '#yt-gif-setting-quality'
                        ).value,
                        10
                    );


                const format =
                    formatSelect.value === 'webp'
                        ? 'webp'
                        : 'gif';


                const webpLossless =
                    panel.querySelector(
                        '#yt-gif-setting-webp'
                    ).value === 'lossless';


                const keyRecord =
                    keyRecordInput.value;

                const keyScreenshot =
                    keyScreenshotInput.value;

                const keyGif =
                    keyGifInput.value;

                const autoGenerate =
                    panel.querySelector(
                        '#yt-gif-setting-auto'
                    ).checked;


                const bitrateMbps =
                    bitrateSelect.value === 'auto'
                        ? 'auto'
                        : (
                            bitrateSelect.value === 'custom'
                                ? parseFloat(bitrateCustomInput.value)
                                : parseFloat(bitrateSelect.value)
                        );


                if (
                    bitrateMbps !== 'auto' &&
                    (
                        isNaN(bitrateMbps) ||
                        bitrateMbps <= 0
                    )
                ) {

                    alert(
                        '비트레이트를 올바르게 입력해주세요.'
                    );

                    return;
                }


                if (
                    isNaN(fps) ||
                    fps <= 0
                ) {

                    alert(
                        'FPS를 올바르게 입력해주세요.'
                    );

                    return;
                }


                if (
                    isNaN(width) ||
                    width < 0
                ) {

                    alert(
                        '가로 크기를 올바르게 입력해주세요.'
                    );

                    return;
                }


                if (
                    isNaN(quality) ||
                    quality < 1 ||
                    quality > 20
                ) {

                    alert(
                        '화질 값은 1~20 사이로 입력해주세요.'
                    );

                    return;
                }


                if (
                    !keyRecord ||
                    !keyScreenshot ||
                    !keyGif ||
                    keyRecord.includes('눌러주세요') ||
                    keyScreenshot.includes('눌러주세요') ||
                    keyGif.includes('눌러주세요')
                ) {

                    alert(
                        '단축키를 모두 설정해주세요.'
                    );

                    return;
                }


                if (
                    keyRecord === keyScreenshot ||
                    keyRecord === keyGif ||
                    keyScreenshot === keyGif
                ) {

                    alert(
                        '단축키는 서로 겹치지 않게 설정해주세요.'
                    );

                    return;
                }


                gifSettings = {
                    fps,
                    width,
                    quality,
                    format,
                    webpLossless,
                    autoGenerate,
                    bitrateMbps,
                    keyRecord,
                    keyScreenshot,
                    keyGif
                };


                saveSettings(
                    gifSettings
                );


                document.dispatchEvent(
                    new CustomEvent(
                        'yt-gif-settings-updated'
                    )
                );


                overlay.remove();

            }
        );
}


if (
    typeof GM_registerMenuCommand ===
    'function'
) {

    GM_registerMenuCommand(
        '움짤(GIF/WebP) 기본값 설정',
        openSettingsPanel
    );

}


// ===============================================================
// 메인
// ===============================================================

(function () {

    'use strict';


    const ttPolicy =
        (
            window.trustedTypes &&
            trustedTypes.createPolicy
        )
            ? trustedTypes.createPolicy(
                'yt-gif-editor',
                {
                    createHTML: (s) => s,
                    createScriptURL: (s) => s
                }
            )
            : {
                createHTML: (s) => s,
                createScriptURL: (s) => s
            };


    // ===========================================================
    // 파일명 관련
    // ===========================================================

    function getYouTubeVideoTitle() {

        let title = '';


        // 플레이어 제목 우선
        const playerTitle =
            document.querySelector(
                '.ytp-title-link'
            );


        if (
            playerTitle &&
            playerTitle.textContent.trim()
        ) {

            title =
                playerTitle.textContent.trim();
        }


        // 플레이어 제목을 못 찾으면 document.title 사용
        if (!title) {

            title =
                document.title
                    .replace(
                        /\s*-\s*YouTube\s*$/i,
                        ''
                    )
                    .trim();
        }


        if (!title) {
            title = 'YouTube';
        }


        /*
         * Windows 파일명에서 사용할 수 없는 문자 제거
         *
         * < > : " / \ | ? *
         * 제어문자도 제거
         */
        title =
            title.replace(
                /[<>:"/\\|?*\x00-\x1F]/g,
                ''
            );


        /*
         * 파일명 앞뒤 공백 제거
         * Windows에서 문제가 될 수 있는 끝의 점 제거
         */
        title =
            title
                .replace(
                    /^\s+|\s+$/g,
                    ''
                )
                .replace(
                    /\.+$/g,
                    ''
                )
                .trim();


        if (!title) {
            title = 'YouTube';
        }


        /*
         * Windows 예약 파일명 방지
         */
        if (
            /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(title)
        ) {

            title =
                '_' + title;
        }


        return title;
    }


    function getFileTimestamp() {

        const now =
            new Date();


        const pad =
            (n, length = 2) =>
                String(n).padStart(
                    length,
                    '0'
                );


        return (
            now.getFullYear() +
            '-' +
            pad(now.getMonth() + 1) +
            '-' +
            pad(now.getDate()) +
            '_' +
            pad(now.getHours()) +
            '-' +
            pad(now.getMinutes()) +
            '-' +
            pad(now.getSeconds()) +
            '-' +
            pad(now.getMilliseconds(), 3)
        );
    }


    function makeVideoFileName(
        type,
        extension,
        title = null
    ) {

        const videoTitle =
            title ||
            getYouTubeVideoTitle();


        const timestamp =
            getFileTimestamp();


        return (
            videoTitle +
            '_' +
            type +
            '_' +
            timestamp +
            '.' +
            extension
        );
    }


    // ===========================================================
    // F9 녹화
    // ===========================================================

    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let captureStream = null;


    // ===========================================================
    // F8 움짤 녹화
    // ===========================================================

    let gifMediaRecorder = null;
    let gifRecordedChunks = [];
    let isGifRecording = false;
    let gifCaptureStream = null;
    let gifRecordingBlob = null;

    // 녹화 시작 당시 영상 제목 저장
    let gifVideoTitle = '';


    // ===========================================================
    // Video 찾기
    // ===========================================================

    function findVideoElement() {

        return (

            document.querySelector(
                '.html5-video-container video'
            )

            ||

            document.querySelector(
                'video.html5-main-video'
            )

            ||

            document.querySelector(
                'video'
            )

        );
    }


    // ===========================================================
    // 일반 녹화 MIME
    // ===========================================================

    function pickMimeType() {

        const candidates = [

            'video/webm;codecs=vp9,opus',

            'video/webm',

            'video/mp4;codecs=avc1,mp4a',

            'video/mp4'

        ];


        for (
            const type of candidates
        ) {

            if (
                window.MediaRecorder &&
                MediaRecorder.isTypeSupported(
                    type
                )
            ) {

                return type;

            }
        }


        return '';
    }


    function extFromMime(mime) {

        return mime.includes('mp4')
            ? 'mp4'
            : 'webm';
    }


    function getBitrateForVideo(video, forceAuto = false) {

        if (!forceAuto && gifSettings.bitrateMbps !== 'auto') {

            return Math.round(
                gifSettings.bitrateMbps * 1000000
            );
        }


        const h =
            video.videoHeight || 0;


        if (h >= 2160) {

            return 40000000;

        } else if (h >= 1440) {

            return 20000000;

        } else if (h >= 1080) {

            return 12000000;

        } else if (h >= 720) {

            return 8000000;

        } else {

            return 4000000;

        }
    }


    // ===========================================================
    // 다운로드
    // ===========================================================

    function downloadBlob(
        blob,
        filename
    ) {

        const url =
            URL.createObjectURL(
                blob
            );


        const a =
            document.createElement(
                'a'
            );


        a.href =
            url;

        a.download =
            filename;


        document.body.appendChild(
            a
        );


        a.click();


        a.remove();


        setTimeout(
            () => {
                URL.revokeObjectURL(
                    url
                );
            },
            5000
        );
    }


    // ===========================================================
    // 스크린샷
    // ===========================================================

    function takeScreenshot() {

        const video =
            findVideoElement();


        if (
            !video ||
            !video.videoWidth
        ) {

            alert(
                '영상을 찾을 수 없습니다.'
            );

            return;
        }


        const canvas =
            document.createElement(
                'canvas'
            );


        canvas.width =
            video.videoWidth;

        canvas.height =
            video.videoHeight;


        const ctx =
            canvas.getContext(
                '2d'
            );


        try {

            ctx.drawImage(
                video,
                0,
                0,
                canvas.width,
                canvas.height
            );

        } catch (err) {

            alert(
                '스크린샷 캡처에 실패했습니다: ' +
                err.message
            );

            return;
        }


        canvas.toBlob(
            (blob) => {

                if (!blob) {

                    alert(
                        '스크린샷 캡처에 실패했습니다.'
                    );

                    return;
                }


                downloadBlob(
                    blob,
                    makeVideoFileName(
                        '스크린샷',
                        'png'
                    )
                );

            },
            'image/png'
        );
    }


    // ===========================================================
    // F9 녹화 시작
    // ===========================================================

    async function startRecording() {

        const video =
            findVideoElement();


        if (!video) {

            alert(
                '영상을 찾을 수 없습니다.'
            );

            return;
        }


        if (
            typeof video.captureStream !==
            'function'
        ) {

            alert(
                '이 브라우저는 video.captureStream()을 지원하지 않습니다.'
            );

            return;
        }


        try {

            captureStream =
                video.captureStream();

        } catch (err) {

            alert(
                '영상 캡처에 실패했습니다: ' +
                err.message
            );

            return;
        }


        if (
            captureStream.getVideoTracks()
                .length === 0
        ) {

            alert(
                '비디오 트랙을 가져오지 못했습니다.'
            );

            return;
        }


        const mimeType =
            pickMimeType();


        if (!mimeType) {

            alert(
                '이 브라우저는 MediaRecorder를 지원하지 않습니다.'
            );

            return;
        }


        recordedChunks = [];


        /*
         * 일반 녹화도 녹화 시작 시점의 제목을 기억한다.
         * 녹화 도중 페이지 제목이 바뀌어도 파일명은 동일하게 유지.
         */
        const recordingVideoTitle =
            getYouTubeVideoTitle();


        mediaRecorder =
            new MediaRecorder(
                captureStream,
                {
                    mimeType,
                    videoBitsPerSecond:
                        getBitrateForVideo(video)
                }
            );


        mediaRecorder.ondataavailable =
            (e) => {

                if (
                    e.data &&
                    e.data.size > 0
                ) {

                    recordedChunks.push(
                        e.data
                    );

                }
            };


        mediaRecorder.onstop =
            () => {

                const ext =
                    extFromMime(
                        mimeType
                    );


                const blob =
                    new Blob(
                        recordedChunks,
                        {
                            type: mimeType
                        }
                    );


                downloadBlob(
                    blob,
                    makeVideoFileName(
                        '녹화',
                        ext,
                        recordingVideoTitle
                    )
                );


                captureStream = null;

            };


        mediaRecorder.start();


        isRecording =
            true;


        updateButtonUI();
    }


    // ===========================================================
    // F9 녹화 종료
    // ===========================================================

    function stopRecording() {

        if (
            mediaRecorder &&
            mediaRecorder.state !==
            'inactive'
        ) {

            mediaRecorder.stop();

        }


        isRecording =
            false;


        updateButtonUI();
    }


    function toggleRecording() {

        if (isRecording) {

            stopRecording();

        } else {

            startRecording();

        }
    }


    // ===========================================================
    // F8 움짤 녹화 시작
    // ===========================================================

    async function startGifRecording() {

        const video =
            findVideoElement();


        if (!video) {

            alert(
                '영상을 찾을 수 없습니다.'
            );

            return;
        }


        /*
         * 움짤 녹화 시작 순간의 제목을 저장.
         * 편집창을 나중에 저장해도 당시 제목을 사용한다.
         */
        gifVideoTitle =
            getYouTubeVideoTitle();


        if (
            typeof video.captureStream !==
            'function'
        ) {

            alert(
                '이 브라우저는 video.captureStream()을 지원하지 않습니다.'
            );

            return;
        }


        try {

            gifCaptureStream =
                video.captureStream();

        } catch (err) {

            alert(
                '영상 캡처에 실패했습니다: ' +
                err.message
            );

            return;
        }


        if (
            gifCaptureStream
                .getVideoTracks()
                .length === 0
        ) {

            alert(
                '비디오 트랙을 가져오지 못했습니다.'
            );

            return;
        }


        const mimeType =
            pickMimeType();


        if (!mimeType) {

            alert(
                '이 브라우저는 MediaRecorder를 지원하지 않습니다.'
            );

            return;
        }


        gifRecordedChunks = [];


        gifMediaRecorder =
            new MediaRecorder(
                gifCaptureStream,
                {
                    mimeType,
                    videoBitsPerSecond:
                        getBitrateForVideo(video, true)
                }
            );


        gifMediaRecorder.ondataavailable =
            (e) => {

                if (
                    e.data &&
                    e.data.size > 0
                ) {

                    gifRecordedChunks.push(
                        e.data
                    );

                }
            };


        gifMediaRecorder.onstop =
            () => {

                gifRecordingBlob =
                    new Blob(
                        gifRecordedChunks,
                        {
                            type: mimeType
                        }
                    );


                gifCaptureStream = null;


                openGifEditorInNewTab(
                    gifRecordingBlob,
                    gifVideoTitle,
                    gifSettings.autoGenerate
                );

            };


        gifMediaRecorder.start();


        isGifRecording =
            true;


        updateGifButtonUI();
    }


    // ===========================================================
    // F8 움짤 녹화 종료
    // ===========================================================

    function stopGifRecording() {

        if (
            gifMediaRecorder &&
            gifMediaRecorder.state !==
            'inactive'
        ) {

            gifMediaRecorder.stop();

        }


        isGifRecording =
            false;


        updateGifButtonUI();
    }


    function toggleGifRecording() {

        if (isGifRecording) {

            stopGifRecording();

        } else {

            startGifRecording();

        }
    }


    // ===========================================================
    // F8 종료 후 새 탭 편집창
    // ===========================================================

    function openGifEditorInNewTab(
        blob,
        videoTitle,
        autoGenerate = false
    ) {

        const reader =
            new FileReader();


        reader.onload =
            () => {

                const dataUrl =
                    reader.result;


                const safeVideoTitle =
                    videoTitle || 'YouTube';


                const html =
                    '<!DOCTYPE html>' +

                    '<html>' +

                    '<head>' +

                    '<meta charset="UTF-8">' +

                    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +

                    '<title>움짤(GIF/WebP) 만들기</title>' +


                    '<style>' +

                    'html,body{margin:0;padding:0;}' +

                    'body{' +
                    'background:#181818;' +
                    'color:#fff;' +
                    'font-family:Arial,sans-serif;' +
                    'padding:20px;' +
                    'box-sizing:border-box;' +
                    '}' +

                    'video{' +
                    'width:100%;' +
                    'max-width:800px;' +
                    'background:#000;' +
                    'border-radius:6px;' +
                    'display:block;' +
                    '}' +

                    '.mini{' +
                    'background:#2c2c2c;' +
                    'color:#fff;' +
                    'border:1px solid #444;' +
                    'border-radius:6px;' +
                    'padding:5px 10px;' +
                    'font-size:12px;' +
                    'cursor:pointer;' +
                    'margin:4px;' +
                    '}' +

                    '.mainbtn{' +
                    'border:none;' +
                    'border-radius:6px;' +
                    'padding:8px 18px;' +
                    'font-size:14px;' +
                    'color:#fff;' +
                    'cursor:pointer;' +
                    'font-weight:bold;' +
                    'margin:4px;' +
                    '}' +

                    '.mainbtn:disabled{' +
                    'opacity:.5;' +
                    'cursor:not-allowed;' +
                    '}' +

                    'input,select{' +
                    'background:#111;' +
                    'color:#fff;' +
                    'border:1px solid #444;' +
                    'border-radius:4px;' +
                    'padding:4px 6px;' +
                    '}' +

                    '#bar{' +
                    'background:#333;' +
                    'border-radius:6px;' +
                    'overflow:hidden;' +
                    'height:10px;' +
                    'margin-top:6px;' +
                    '}' +

                    '#fill{' +
                    'background:#3ea6ff;' +
                    'height:100%;' +
                    'width:0%;' +
                    '}' +

                    '</style>' +

                    '</head>' +

                    '<body>' +


                    '<h2>움짤(GIF/WebP) 만들기</h2>' +


                    '<video id="v" controls></video>' +


                    '<div style="margin-top:14px;">' +

                    '구간 선택(초) 시작 ' +

                    '<input id="s" type="number" step="0.1" value="0"> ' +

                    '<button class="mini" id="setS">' +
                    '현재 위치' +
                    '</button> ' +

                    '끝 ' +

                    '<input id="e" type="number" step="0.1"> ' +

                    '<button class="mini" id="setE">' +
                    '현재 위치' +
                    '</button> ' +

                    '<button class="mini" id="resetR">' +
                    '전체 구간' +
                    '</button>' +

                    '</div>' +


                    '<div style="margin-top:12px;">' +


                    'FPS ' +

                    '<select id="fps">' +

                    buildFpsOptionsHtml(
                        gifSettings.fps
                    ) +

                    '</select> ' +


                    '<input id="fpsCustom" type="number" min="1" step="1" placeholder="직접입력" style="display:none;width:70px;" value="' +

                    gifSettings.fps +

                    '"> ' +


                    '가로(px) ' +

                    '<select id="w">' +

                    buildWidthOptionsHtml(
                        gifSettings.width
                    ) +

                    '</select> ' +


                    '<input id="wCustom" type="number" min="1" step="10" placeholder="직접입력" style="display:none;width:80px;" value="' +

                    gifSettings.width +

                    '"> ' +


                    '<span id="qualityWrap">' +

                    '화질 ' +

                    '<select id="q">' +

                    buildQualityOptionsHtml(
                        gifSettings.quality
                    ) +

                    '</select> ' +

                    '<input id="qCustom" type="number" min="1" max="20" step="1" placeholder="직접입력" style="display:none;width:70px;" value="' +

                    gifSettings.quality +

                    '">' +

                    '</span> ' +


                    '저장 형식 ' +

                    '<select id="format">' +

                    buildFormatOptionsHtml(
                        gifSettings.format
                    ) +

                    '</select> ' +


                    '<span id="webpCompressionWrap" style="display:' +

                    (
                        gifSettings.format === 'webp'
                            ? 'inline'
                            : 'none'
                    ) +

                    ';">' +

                    ' WebP 압축 ' +

                    '<select id="webpCompression">' +

                    buildWebpCompressionOptionsHtml(
                        gifSettings.webpLossless
                    ) +

                    '</select>' +

                    '</span>' +


                    '</div>' +


                    '<div id="memoryWarning" style="display:none;margin-top:12px;padding:10px;background:#3a2525;border:1px solid #744444;border-radius:6px;font-size:12px;line-height:1.5;"></div>' +


                    '<div id="pw" style="display:none;">' +

                    '<div id="lbl">변환 중...</div>' +

                    '<div id="bar">' +

                    '<div id="fill"></div>' +

                    '</div>' +

                    '</div>' +


                    '<button class="mainbtn" id="cancel" style="background:#3d3d3d;">' +

                    '닫기' +

                    '</button>' +


                    '<button class="mainbtn" id="save" style="background:#3ea6ff;">' +

                    '저장' +

                    '</button>' +


                    '<script>' +

                    'const v=document.getElementById("v");' +

                    'v.src=' +

                    JSON.stringify(dataUrl) +

                    ';' +

                    'const videoTitle=' +

                    JSON.stringify(safeVideoTitle) +

                    ';' +

                    'const autoGenerate=' +

                    JSON.stringify(!!autoGenerate) +

                    ';' +

                    'if(autoGenerate){document.body.style.display="none";}' +


                    // ------------------------------------------------
                    // 파일명
                    // ------------------------------------------------

                    'function getFileTimestamp(){' +

                    'const now=new Date();' +

                    'const pad=(n,length=2)=>String(n).padStart(length,"0");' +

                    'return now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate())+"_"+pad(now.getHours())+"-"+pad(now.getMinutes())+"-"+pad(now.getSeconds())+"-"+pad(now.getMilliseconds(),3);' +

                    '}' +


                    'function makeFileName(type,extension){' +

                    'let title=videoTitle||"YouTube";' +

                    'title=title.replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g,"");' +

                    'title=title.replace(/^\\s+|\\s+$/g,"").replace(/\\.+$/g,"").trim();' +

                    'if(!title)title="YouTube";' +

                    'if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(title))title="_"+title;' +

                    'return title+"_"+type+"_"+getFileTimestamp()+"."+extension;' +

                    '}' +


                    'let dur=0;' +


                    'v.addEventListener("loadedmetadata",()=>{' +

                    'const fix=()=>{' +

                    'if(isFinite(v.duration)&&v.duration>0){' +

                    'dur=v.duration;' +

                    'document.getElementById("e").value=dur.toFixed(1);' +

                    'v.currentTime=0;' +

                    'if(autoGenerate){document.getElementById("save").click();}' +

                    '}else{' +

                    'v.currentTime=1e101;' +

                    'v.addEventListener("durationchange",fix,{once:true});' +

                    '}' +

                    '};' +

                    'fix();' +

                    '});' +


                    // ------------------------------------------------
                    // 커스텀 입력
                    // ------------------------------------------------

                    'function syncCustom(sel,inp){' +

                    'inp.style.display=sel.value==="custom"?"inline-block":"none";' +

                    '}' +


                    'const fpsSel=document.getElementById("fps"),fpsCustom=document.getElementById("fpsCustom");' +

                    'const wSel=document.getElementById("w"),wCustom=document.getElementById("wCustom");' +

                    'const qSel=document.getElementById("q"),qCustom=document.getElementById("qCustom");' +

                    'const formatSel=document.getElementById("format");' +

                    'const webpCompressionWrap=document.getElementById("webpCompressionWrap");' +

                    'const webpCompression=document.getElementById("webpCompression");' +

                    'const qualityWrap=document.getElementById("qualityWrap");' +

                    'const memoryWarning=document.getElementById("memoryWarning");' +


                    'syncCustom(fpsSel,fpsCustom);' +

                    'syncCustom(wSel,wCustom);' +

                    'syncCustom(qSel,qCustom);' +


                    'fpsSel.addEventListener("change",()=>syncCustom(fpsSel,fpsCustom));' +

                    'wSel.addEventListener("change",()=>syncCustom(wSel,wCustom));' +

                    'qSel.addEventListener("change",()=>syncCustom(qSel,qCustom));' +


                    'qCustom.addEventListener("input",()=>{' +

                    'if(qCustom.value==="")return;' +

                    'const qv=parseInt(qCustom.value,10);' +

                    'if(!isNaN(qv)&&qv>20)qCustom.value="20";' +

                    'if(!isNaN(qv)&&qv<1)qCustom.value="1";' +

                    '});' +


                    // ------------------------------------------------
                    // GIF / WebP UI
                    // ------------------------------------------------

                    'function updateFormatUI(){' +

                    'const isWebp=formatSel.value==="webp";' +

                    'const isLossless=webpCompression.value==="lossless";' +

                    'webpCompressionWrap.style.display=isWebp?"inline":"none";' +

                    'qualityWrap.style.display=(!isWebp||!isLossless)?"inline":"none";' +

                    'updateMemoryWarning();' +

                    '}' +


                    'formatSel.addEventListener("change",updateFormatUI);' +

                    'webpCompression.addEventListener("change",updateFormatUI);' +


                    // ------------------------------------------------
                    // 현재 위치
                    // ------------------------------------------------

                    'document.getElementById("setS").onclick=()=>document.getElementById("s").value=v.currentTime.toFixed(1);' +

                    'document.getElementById("setE").onclick=()=>document.getElementById("e").value=v.currentTime.toFixed(1);' +


                    'document.getElementById("resetR").onclick=()=>{' +

                    'document.getElementById("s").value=0;' +

                    'document.getElementById("e").value=dur.toFixed(1);' +

                    'updateMemoryWarning();' +

                    '};' +


                    // ------------------------------------------------
                    // 구간 입력 변화
                    // ------------------------------------------------

                    'document.getElementById("s").addEventListener("input",updateMemoryWarning);' +

                    'document.getElementById("e").addEventListener("input",updateMemoryWarning);' +

                    'fpsSel.addEventListener("change",updateMemoryWarning);' +

                    'fpsCustom.addEventListener("input",updateMemoryWarning);' +

                    'wSel.addEventListener("change",updateMemoryWarning);' +

                    'wCustom.addEventListener("input",updateMemoryWarning);' +


                    // ------------------------------------------------
                    // 메모리 예상
                    // ------------------------------------------------

                    'function getCurrentFps(){' +

                    'return fpsSel.value==="custom"?parseInt(fpsCustom.value,10):parseInt(fpsSel.value,10);' +

                    '}' +


                    'function getCurrentWidth(){' +

                    'return wSel.value==="custom"?parseInt(wCustom.value,10):parseInt(wSel.value,10);' +

                    '}' +


                    'function updateMemoryWarning(){' +

                    'if(formatSel.value!=="webp"){' +

                    'memoryWarning.style.display="none";' +

                    'return;' +

                    '}' +


                    'const start=parseFloat(document.getElementById("s").value);' +

                    'const end=parseFloat(document.getElementById("e").value);' +

                    'const fps=getCurrentFps();' +

                    'const targetWidth=getCurrentWidth();' +


                    'if(!isFinite(start)||!isFinite(end)||end<=start||!isFinite(fps)||fps<=0||!isFinite(targetWidth)||targetWidth<0||!v.videoWidth){' +

                    'memoryWarning.style.display="none";' +

                    'return;' +

                    '}' +


                    'const srcW=v.videoWidth;' +

                    'const srcH=v.videoHeight;' +

                    'const scale=targetWidth>0?targetWidth/srcW:1;' +

                    'const outW=Math.max(1,Math.round(srcW*scale));' +

                    'const outH=Math.max(1,Math.round(srcH*scale));' +

                    'const total=Math.max(1,Math.floor((end-start)*fps));' +

                    'const rawBytes=outW*outH*4*total;' +

                    'const estimated=rawBytes*1.5;' +


                    'if(estimated>=512*1024*1024){' +

                    'memoryWarning.style.display="block";' +

                    'memoryWarning.innerHTML="⚠️ 예상 메모리 사용량이 약 <b>"+formatBytes(estimated)+"</b>입니다.<br>WebP는 변환 중 모든 프레임을 메모리에 보관하기 때문에 높은 FPS/해상도/긴 구간에서는 변환이 실패할 수 있습니다.<br><br>FPS, 가로 크기 또는 구간을 줄이는 것을 권장합니다.";'+

                    '}else if(estimated>=256*1024*1024){' +

                    'memoryWarning.style.display="block";' +

                    'memoryWarning.innerHTML="⚠️ 예상 메모리 사용량이 약 <b>"+formatBytes(estimated)+"</b>입니다.<br>현재 설정은 상당히 무거운 편입니다. 변환 실패를 피하려면 FPS나 가로 크기를 낮추는 것을 권장합니다.";'+

                    '}else{' +

                    'memoryWarning.style.display="none";' +

                    '}' +

                    '}' +


                    'function formatBytes(bytes){' +

                    'if(bytes<1024)return bytes.toFixed(0)+" B";' +

                    'if(bytes<1024*1024)return (bytes/1024).toFixed(1)+" KB";' +

                    'if(bytes<1024*1024*1024)return (bytes/(1024*1024)).toFixed(1)+" MB";' +

                    'return (bytes/(1024*1024*1024)).toFixed(2)+" GB";' +

                    '}' +


                    // ------------------------------------------------
                    // 초기 UI
                    // ------------------------------------------------

                    'document.getElementById("cancel").onclick=()=>window.close();' +


                    // ------------------------------------------------
                    // seek
                    // ------------------------------------------------

                    'function seekTo(video,t){' +

                    'return new Promise((resolve,reject)=>{' +

                    'let done=false;' +

                    'const cleanup=()=>{' +

                    'video.removeEventListener("seeked",onSeeked);' +

                    'clearTimeout(timer);' +

                    '};' +


                    'const onSeeked=()=>{' +

                    'if(done)return;' +

                    'done=true;' +

                    'cleanup();' +

                    'resolve();' +

                    '};' +


                    'const timer=setTimeout(()=>{' +

                    'if(done)return;' +

                    'done=true;' +

                    'cleanup();' +

                    'resolve();' +

                    '},3000);' +


                    'video.addEventListener("seeked",onSeeked);' +

                    'video.currentTime=t;' +

                    '});' +

                    '}' +


                    // ------------------------------------------------
                    // 외부 스크립트
                    // ------------------------------------------------

                    'function loadScript(src){' +

                    'return new Promise((res,rej)=>{' +

                    'const s=document.createElement("script");' +

                    's.src=src;' +

                    's.onload=res;' +

                    's.onerror=rej;' +

                    'document.head.appendChild(s);' +

                    '});' +

                    '}' +


                    // ------------------------------------------------
                    // 저장
                    // ------------------------------------------------

                    'document.getElementById("save").onclick=async()=>{' +


                    'const start=parseFloat(document.getElementById("s").value);' +

                    'const end=parseFloat(document.getElementById("e").value);' +


                    'if(isNaN(start)||isNaN(end)||end<=start){' +

                    'alert("구간을 올바르게 입력해주세요.");' +

                    'return;' +

                    '}' +


                    'const fps=fpsSel.value==="custom"?parseInt(fpsCustom.value,10):parseInt(fpsSel.value,10);' +

                    'const targetWidth=wSel.value==="custom"?parseInt(wCustom.value,10):parseInt(wSel.value,10);' +

                    'const quality=qSel.value==="custom"?parseInt(qCustom.value,10):parseInt(qSel.value,10);' +

                    'const format=formatSel.value==="webp"?"webp":"gif";' +

                    'const webpLossless=format==="webp"&&webpCompression.value==="lossless";' +


                    'if(isNaN(fps)||fps<=0){alert("FPS를 올바르게 입력해주세요.");return;}' +

                    'if(isNaN(targetWidth)||targetWidth<0){alert("가로 크기를 올바르게 입력해주세요.");return;}' +

                    'if(isNaN(quality)||quality<1||quality>20){alert("화질 값은 1~20 사이로 입력해주세요.");return;}' +


                    // ------------------------------------------------
                    // WebP 메모리 사전 검사
                    // ------------------------------------------------

                    'if(format==="webp"){' +

                    'const srcW=v.videoWidth,srcH=v.videoHeight;' +

                    'const scale=targetWidth>0?targetWidth/srcW:1;' +

                    'const outW=Math.max(1,Math.round(srcW*scale));' +

                    'const outH=Math.max(1,Math.round(srcH*scale));' +

                    'const total=Math.max(1,Math.floor((end-start)*fps));' +

                    'const estimated=outW*outH*4*total*1.5;' +


                    'if(estimated>=768*1024*1024&&!autoGenerate){' +

                    'if(!confirm("현재 WebP 설정은 매우 무겁습니다.\\n\\n예상 메모리 사용량: "+formatBytes(estimated)+"\\n\\n변환이 실패하거나 브라우저가 느려질 수 있습니다.\\n그래도 진행하시겠습니까?")){' +

                    'return;' +

                    '}' +

                    '}' +

                    '}' +


                    'document.getElementById("save").disabled=true;' +

                    'document.getElementById("pw").style.display="block";' +

                    'document.getElementById("lbl").textContent="라이브러리 로딩 중...";' +

                    'document.getElementById("fill").style.width="0%";' +


                    'try{' +


                    'const srcW=v.videoWidth,srcH=v.videoHeight;' +

                    'const scale=targetWidth>0?targetWidth/srcW:1;' +

                    'const outW=Math.max(1,Math.round(srcW*scale));' +

                    'const outH=Math.max(1,Math.round(srcH*scale));' +


                    'const canvas=document.createElement("canvas");' +

                    'canvas.width=outW;' +

                    'canvas.height=outH;' +


                    'const ctx=canvas.getContext("2d",{willReadFrequently:true});' +


                    'if(!ctx){' +

                    'throw new Error("Canvas를 생성할 수 없습니다.");' +

                    '}' +


                    'const delay=Math.max(20,Math.round(1000/fps));' +

                    'const total=Math.max(1,Math.floor((end-start)*fps));' +


                    // =================================================
                    // WebP
                    // =================================================

                    'if(format==="webp"){' +


                    'document.getElementById("lbl").textContent="WebP 라이브러리 로딩 중...";' +


                    'const mod=await import("https://cdn.jsdelivr.net/npm/wasm-webp@0.1.0/+esm");' +


                    'if(!mod||typeof mod.encodeAnimation!=="function"){' +

                    'throw new Error("WebP 라이브러리에서 encodeAnimation을 찾을 수 없습니다.");' +

                    '}' +


                    'const frames=[];' +


                    'const webpQuality=Math.max(10,Math.min(100,Math.round(100-((quality-1)/19)*90)));' +


                    'for(let i=0;i<total;i++){' +


                    'await seekTo(v,Math.min(start+i/fps,end));' +


                    'ctx.drawImage(v,0,0,outW,outH);' +


                    'const imageData=ctx.getImageData(0,0,outW,outH);' +

                    'const rgba=new Uint8Array(imageData.data);' +


                    'const frame={' +

                    'data:rgba,' +

                    'duration:delay,' +

                    'config:{' +

                    'lossless:webpLossless?1:0' +

                    '}' +

                    '};' +


                    'if(!webpLossless){' +

                    'frame.config.quality=webpQuality;' +

                    '}' +


                    'frames.push(frame);' +


                    'document.getElementById("lbl").textContent="프레임 추출 중... "+Math.round((i+1)/total*100)+"%";' +

                    'document.getElementById("fill").style.width=Math.round((i+1)/total*50)+"%";' +


                    '}' +


                    'document.getElementById("lbl").textContent=webpLossless?"WebP 무손실 인코딩 중...":"WebP 인코딩 중...";' +

                    'document.getElementById("fill").style.width="75%";' +


                    'let data;' +


                    'try{' +

                    'data=await mod.encodeAnimation(outW,outH,true,frames);' +

                    '}catch(webpErr){' +

                    'console.error("WebP encodeAnimation error:",webpErr);' +

                    'throw new Error("WebP 인코딩 중 메모리 또는 WASM 오류가 발생했습니다. FPS/해상도/구간을 줄여 다시 시도해주세요. ("+(webpErr&&webpErr.message?webpErr.message:webpErr)+")");' +

                    '}' +


                    'if(!data){' +

                    'throw new Error("WebP 인코딩 결과가 없습니다.");' +

                    '}' +


                    'const webpBlob=new Blob([data],{type:"image/webp"});' +


                    'const webpUrl=URL.createObjectURL(webpBlob);' +


                    'const a=document.createElement("a");' +


                    'a.href=webpUrl;' +

                    'a.download=makeFileName("움짤","webp");' +


                    'document.body.appendChild(a);' +

                    'a.click();' +

                    'a.remove();' +


                    'setTimeout(()=>URL.revokeObjectURL(webpUrl),10000);' +


                    'frames.length=0;' +


                    'document.getElementById("fill").style.width="100%";' +

                    'document.getElementById("lbl").textContent="완료! 다운로드 폴더를 확인하세요.";'+


                    'document.getElementById("save").disabled=false;' +

                    'if(autoGenerate){setTimeout(()=>window.close(),1200);}' +


                    // =================================================
                    // GIF
                    // =================================================

                    '}else{' +


                    'if(typeof window.GIF!=="function"){' +

                    'document.getElementById("lbl").textContent="GIF 라이브러리 로딩 중...";' +

                    'await loadScript("https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js");' +

                    '}' +


                    'if(typeof window.GIF!=="function"){' +

                    'throw new Error("GIF 라이브러리를 불러오지 못했습니다.");' +

                    '}' +


                    'const workerText=await(await fetch("https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js")).text();' +


                    'const workerUrl=URL.createObjectURL(new Blob([workerText],{type:"application/javascript"}));' +


                    'const gif=new window.GIF({' +

                    'workers:2,' +

                    'quality:quality,' +

                    'width:outW,' +

                    'height:outH,' +

                    'workerScript:workerUrl' +

                    '});' +


                    'for(let i=0;i<total;i++){' +


                    'await seekTo(v,Math.min(start+i/fps,end));' +


                    'ctx.drawImage(v,0,0,outW,outH);' +


                    'gif.addFrame(ctx,{copy:true,delay:delay});' +


                    'document.getElementById("lbl").textContent="프레임 추출 중... "+Math.round((i+1)/total*100)+"%";' +


                    'document.getElementById("fill").style.width=Math.round((i+1)/total*50)+"%";' +


                    '}' +


                    'gif.on("progress",(r)=>{' +


                    'document.getElementById("lbl").textContent="GIF 인코딩 중... "+Math.round(r*100)+"%";' +

                    'document.getElementById("fill").style.width=(50+Math.round(r*50))+"%";' +

                    '});' +


                    'gif.on("finished",(blob)=>{' +


                    'const a=document.createElement("a");' +

                    'const url=URL.createObjectURL(blob);' +


                    'a.href=url;' +

                    'a.download=makeFileName("움짤","gif");' +


                    'document.body.appendChild(a);' +

                    'a.click();' +

                    'a.remove();' +


                    'setTimeout(()=>URL.revokeObjectURL(url),10000);' +


                    'URL.revokeObjectURL(workerUrl);' +


                    'document.getElementById("lbl").textContent="완료! 다운로드 폴더를 확인하세요.";'+


                    'document.getElementById("save").disabled=false;' +

                    'if(autoGenerate){setTimeout(()=>window.close(),1200);}' +

                    '});' +


                    'gif.on("abort",()=>{' +

                    'URL.revokeObjectURL(workerUrl);' +

                    'document.getElementById("save").disabled=false;' +

                    'document.getElementById("lbl").textContent="GIF 변환이 중단되었습니다.";'+

                    '});' +


                    'gif.render();' +


                    '}' +


                    '}catch(err){' +


                    'console.error("움짤 변환 오류:",err);' +

                    'alert("변환 실패: "+(err&&err.message?err.message:err));' +

                    'document.getElementById("save").disabled=false;' +

                    'document.getElementById("lbl").textContent="변환 실패";' +


                    '}' +


                    '};' +


                    'updateFormatUI();' +

                    'updateMemoryWarning();' +


                    '</script>' +


                    '</body>' +

                    '</html>';


                const blobUrl =
                    URL.createObjectURL(
                        new Blob(
                            [html],
                            {
                                type:
                                    'text/html;charset=utf-8'
                            }
                        )
                    );


                GM_openInTab(
                    blobUrl,
                    {
                        active: !autoGenerate,
                        insert: true,
                        setParent: true
                    }
                );

            };


        reader.readAsDataURL(
            blob
        );
    }


    // ===========================================================
    // 아이콘
    // ===========================================================

    function buildRecordIcon(
        recording
    ) {

        const svgNS =
            'http://www.w3.org/2000/svg';


        let shape;


        if (recording) {

            shape =
                document.createElementNS(
                    svgNS,
                    'polygon'
                );


            shape.setAttribute(
                'points',
                '8,5 19,12 8,19'
            );


            shape.setAttribute(
                'fill',
                '#ff0000'
            );

        } else {

            shape =
                document.createElementNS(
                    svgNS,
                    'circle'
                );


            shape.setAttribute(
                'cx',
                '12'
            );


            shape.setAttribute(
                'cy',
                '12'
            );


            shape.setAttribute(
                'r',
                '8'
            );


            shape.setAttribute(
                'fill',
                '#ffffff'
            );
        }


        return makeSvgIcon(
            shape
        );
    }


    function updateButtonUI() {

        const btn =
            document.getElementById(
                'yt-record-btn'
            );


        if (!btn) return;


        btn.title =
            isRecording
                ? `녹화 중지 (클릭 시 저장) (${gifSettings.keyRecord})`
                : `녹화 시작 (${gifSettings.keyRecord})`;


        const oldSvg =
            btn.querySelector(
                'svg'
            );


        if (oldSvg) {
            oldSvg.remove();
        }


        btn.appendChild(
            buildRecordIcon(
                isRecording
            )
        );
    }


    function updateGifButtonUI() {

        const btn =
            document.getElementById(
                'yt-gif-btn'
            );


        if (!btn) return;


        btn.title =
            isGifRecording
                ? `움짤 녹화 중지 (클릭 시 편집창 열림) (${gifSettings.keyGif})`
                : `움짤(GIF/WebP) 녹화 시작 (${gifSettings.keyGif})`;


        const oldSvg =
            btn.querySelector(
                'svg'
            );


        if (oldSvg) {
            oldSvg.remove();
        }


        btn.appendChild(
            buildGifIcon(
                isGifRecording
            )
        );
    }


    function updateScreenshotButtonUI() {

        const btn =
            document.getElementById(
                'yt-screenshot-btn'
            );


        if (!btn) return;


        btn.title =
            `스크린샷 (${gifSettings.keyScreenshot})`;
    }


    function makeSvgIcon(
        pathOrCircleOrGroup
    ) {

        const svgNS =
            'http://www.w3.org/2000/svg';


        const svg =
            document.createElementNS(
                svgNS,
                'svg'
            );


        svg.setAttribute(
            'height',
            '24'
        );


        svg.setAttribute(
            'viewBox',
            '0 0 24 24'
        );


        svg.setAttribute(
            'width',
            '24'
        );


        svg.appendChild(
            pathOrCircleOrGroup
        );


        return svg;
    }


    function buildGifIcon(
        recording
    ) {

        const svgNS =
            'http://www.w3.org/2000/svg';


        const g =
            document.createElementNS(
                svgNS,
                'g'
            );


        const rect =
            document.createElementNS(
                svgNS,
                'rect'
            );


        rect.setAttribute(
            'x',
            '2.5'
        );


        rect.setAttribute(
            'y',
            '6'
        );


        rect.setAttribute(
            'width',
            '19'
        );


        rect.setAttribute(
            'height',
            '12'
        );


        rect.setAttribute(
            'rx',
            '2'
        );


        rect.setAttribute(
            'fill',
            'none'
        );


        rect.setAttribute(
            'stroke',
            recording
                ? '#ff0000'
                : 'currentColor'
        );


        rect.setAttribute(
            'stroke-width',
            '1.6'
        );


        g.appendChild(
            rect
        );


        const text =
            document.createElementNS(
                svgNS,
                'text'
            );


        text.setAttribute(
            'x',
            '12'
        );


        text.setAttribute(
            'y',
            '15.2'
        );


        text.setAttribute(
            'text-anchor',
            'middle'
        );


        text.setAttribute(
            'font-size',
            '7.5'
        );


        text.setAttribute(
            'font-weight',
            'bold'
        );


        text.setAttribute(
            'fill',
            recording
                ? '#ff0000'
                : 'currentColor'
        );


        text.setAttribute(
            'font-family',
            'Arial, sans-serif'
        );


        text.textContent =
            'GIF';


        g.appendChild(
            text
        );


        return makeSvgIcon(
            g
        );
    }


    // ===========================================================
    // 버튼 생성
    // ===========================================================

    function createButton() {

        const controls =
            document.querySelector(
                '.ytp-right-controls'
            );


        if (!controls) return;


        const svgNS =
            'http://www.w3.org/2000/svg';


        // -------------------------------------------------------
        // 녹화 버튼
        // -------------------------------------------------------

        if (
            !document.getElementById(
                'yt-record-btn'
            )
        ) {

            const recordBtn =
                document.createElement(
                    'button'
                );


            recordBtn.id =
                'yt-record-btn';


            recordBtn.className =
                'ytp-button';


            recordBtn.title =
                `녹화 시작 (${gifSettings.keyRecord})`;


            recordBtn.style.cssText =
                'width:48px;height:100%;display:inline-flex;align-items:center;justify-content:center;opacity:1;visibility:visible;';


            recordBtn.appendChild(
                buildRecordIcon(
                    false
                )
            );


            recordBtn.addEventListener(
                'click',
                (e) => {

                    e.stopPropagation();

                    toggleRecording();

                }
            );


            controls.insertBefore(
                recordBtn,
                controls.firstChild
            );
        }


        // -------------------------------------------------------
        // 스크린샷 버튼
        // -------------------------------------------------------

        if (
            !document.getElementById(
                'yt-screenshot-btn'
            )
        ) {

            const shotBtn =
                document.createElement(
                    'button'
                );


            shotBtn.id =
                'yt-screenshot-btn';


            shotBtn.className =
                'ytp-button';


            shotBtn.title =
                `스크린샷 (${gifSettings.keyScreenshot})`;


            shotBtn.style.cssText =
                'color:#ffffff;width:48px;height:100%;display:inline-flex;align-items:center;justify-content:center;opacity:1;visibility:visible;';


            const rect =
                document.createElementNS(
                    svgNS,
                    'rect'
                );


            rect.setAttribute(
                'x',
                '3'
            );


            rect.setAttribute(
                'y',
                '5'
            );


            rect.setAttribute(
                'width',
                '18'
            );


            rect.setAttribute(
                'height',
                '14'
            );


            rect.setAttribute(
                'rx',
                '2'
            );


            rect.setAttribute(
                'fill',
                'none'
            );


            rect.setAttribute(
                'stroke',
                'currentColor'
            );


            rect.setAttribute(
                'stroke-width',
                '1.8'
            );


            const lens =
                document.createElementNS(
                    svgNS,
                    'circle'
                );


            lens.setAttribute(
                'cx',
                '12'
            );


            lens.setAttribute(
                'cy',
                '12'
            );


            lens.setAttribute(
                'r',
                '3.5'
            );


            lens.setAttribute(
                'fill',
                'none'
            );


            lens.setAttribute(
                'stroke',
                'currentColor'
            );


            lens.setAttribute(
                'stroke-width',
                '1.8'
            );


            const g =
                document.createElementNS(
                    svgNS,
                    'g'
                );


            g.appendChild(
                rect
            );


            g.appendChild(
                lens
            );


            shotBtn.appendChild(
                makeSvgIcon(
                    g
                )
            );


            shotBtn.addEventListener(
                'click',
                (e) => {

                    e.stopPropagation();

                    takeScreenshot();

                }
            );


            const recordBtn =
                document.getElementById(
                    'yt-record-btn'
                );


            controls.insertBefore(
                shotBtn,
                recordBtn.nextSibling
            );
        }


        // -------------------------------------------------------
        // GIF 버튼
        // -------------------------------------------------------

        if (
            !document.getElementById(
                'yt-gif-btn'
            )
        ) {

            const gifBtn =
                document.createElement(
                    'button'
                );


            gifBtn.id =
                'yt-gif-btn';


            gifBtn.className =
                'ytp-button';


            gifBtn.title =
                `움짤(GIF/WebP) 녹화 시작 (${gifSettings.keyGif})`;


            gifBtn.style.cssText =
                'color:#ffffff;width:48px;height:100%;display:inline-flex;align-items:center;justify-content:center;opacity:1;visibility:visible;';


            gifBtn.appendChild(
                buildGifIcon(
                    false
                )
            );


            gifBtn.addEventListener(
                'click',
                (e) => {

                    e.stopPropagation();

                    toggleGifRecording();

                }
            );


            const shotBtn =
                document.getElementById(
                    'yt-screenshot-btn'
                );


            controls.insertBefore(
                gifBtn,
                shotBtn.nextSibling
            );
        }
    }


    // ===========================================================
    // 설정 변경 시 버튼 title 즉시 갱신
    // ===========================================================

    document.addEventListener(
        'yt-gif-settings-updated',
        () => {

            updateButtonUI();

            updateGifButtonUI();

            updateScreenshotButtonUI();
        }
    );


    // ===========================================================
    // 단축키
    // ===========================================================

    document.addEventListener(
        'keydown',
        (e) => {

            const tag =
                document.activeElement &&
                document.activeElement.tagName;


            const isTyping =
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                (
                    document.activeElement &&
                    document.activeElement.isContentEditable
                );


            if (isTyping) return;


            const pressedKey =
                e.key.length === 1
                    ? e.key.toUpperCase()
                    : e.key;


            if (pressedKey === gifSettings.keyRecord) {

                e.preventDefault();

                toggleRecording();

            } else if (pressedKey === gifSettings.keyScreenshot) {

                e.preventDefault();

                takeScreenshot();

            } else if (pressedKey === gifSettings.keyGif) {

                e.preventDefault();

                toggleGifRecording();

            }

        }
    );


    // ===========================================================
    // YouTube SPA 감시
    // ===========================================================

    const observer =
        new MutationObserver(
            () => createButton()
        );


    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );


    createButton();


})();
