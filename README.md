# YouTube GIF Recorder

YouTube에서 재생 중인 영상을 간편하게 **녹화, 스크린샷, GIF/WebP 움짤**로 저장할 수 있는 Tampermonkey UserScript입니다.

## ✨ 주요 기능

* 🎥 YouTube 영상 녹화
* 📸 영상 스크린샷 저장
* 🎞️ GIF 움짤 제작
* 🖼️ WebP 움짤 제작
* ⚙️ GIF/WebP 기본 설정 저장
* ⌨️ 단축키 커스터마이징
* 🎚️ FPS / 해상도 / 화질 설정
* ✂️ 움짤 시작·종료 구간 지정
* 💾 설정값 자동 저장

## 📥 설치

### 1. Tampermonkey 설치

먼저 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다.

### 2. UserScript 설치

아래 파일을 클릭한 뒤 **Raw** 버튼을 누르면 Tampermonkey에서 설치할 수 있습니다.

**[▶ YouTube GIF Recorder 설치](./youtube-gif-recorder.user.js)**

또는 GitHub의 `youtube-gif-recorder.user.js` 파일에서 **Raw**를 클릭하세요.

## ⌨️ 기본 단축키

| 기능        | 기본 단축키 |
| --------- | ------ |
| 🎥 녹화     | `F9`   |
| 📸 스크린샷   | `F10`  |
| 🎞️ 움짤 녹화 | `F8`   |

단축키는 설정 메뉴에서 원하는 키로 변경할 수 있습니다.

## ⚙️ 움짤 설정

움짤 제작 시 다음 항목을 설정할 수 있습니다.

* FPS
* 가로 크기
* 화질
* 저장 형식 (`GIF` / `WebP`)
* WebP 압축 방식 (`손실` / `무손실`)
* 시작 및 종료 구간

설정 메뉴에서 지정한 값은 다음 움짤 제작에도 자동으로 적용됩니다.

## 🖼️ GIF / WebP

### GIF

`gif.js`를 사용하여 GIF를 생성합니다.

### WebP

`wasm-webp`를 사용하여 WebP 애니메이션을 생성합니다.

WebP 무손실 모드에서는 화질 설정이 적용되지 않습니다.

## ⚠️ 주의사항

* GIF/WebP 변환은 영상의 길이, FPS, 해상도에 따라 많은 메모리를 사용할 수 있습니다.
* 특히 고해상도 + 높은 FPS + 긴 구간의 WebP 변환은 메모리 부족으로 실패할 수 있습니다.
* 변환이 실패하는 경우 FPS, 해상도 또는 구간을 낮춰 다시 시도하세요.
* 외부 라이브러리를 CDN에서 불러옵니다.
* YouTube의 변경에 따라 스크립트가 정상적으로 동작하지 않을 수 있습니다.

## 📄 라이선스

MIT License
