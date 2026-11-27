# 먀용 작업실 사용법 🐾

## 시작하기

저장소 루트에서 `python3 -m http.server 8000`을 실행한 뒤 [작업실](http://localhost:8000/studio/)을 엽니다. Node.js는 터미널 경로에만 필요합니다. 외부 가사 제공처가 없어도 자기 가사와 음정 파일로 시작할 수 있습니다. 이 작업실은 브라우저·CLI가 같은 자바스크립트 음원-필터 합성기를 쓰는 독립 실험판이며, 원본 CHIMERA의 Rust 기도 엔진은 건드리지 않습니다.

별도의 배포용 정적 파일만 필요하면 `node studio/build.mjs`를 실행하세요. `out/mvs-studio/`를 웹 서버의 루트로 사용할 수 있습니다. 새 작업실은 기존 CHIMERA의 Rust 빌드나 서버용 키가 필요하지 않습니다. 로컬 서버는 내 컴퓨터에서만 쓰려면 `--bind 127.0.0.1`을 붙이세요.

## 입력: 가사와 음정을 정확히 묶기

아래는 직접 만든 두 음절 예제입니다. `score.json` 이름으로 UTF-8 저장하세요. 가사만 있는 파일은 음정을 정하지 못하며, 일반 LRC의 줄별 시간표는 음절·악보 파일이 아닙니다.

```json
{
  "version": 1,
  "title": "첫 먀용",
  "sampleRate": 44100,
  "voice": "hybrid",
  "notes": [
    {"start": 0.25, "duration": 0.5, "midi": 69, "lyric": "먀", "velocity": 0.7},
    {"start": 1, "duration": 0.5, "midi": 72, "lyric": "용", "velocity": 0.75}
  ]
}
```

- `start`·`duration`은 초 단위입니다. 0.25초까지 전주, 0.75–1초는 음표가 비어 있는 구간입니다.
- `midi`는 MIDI 음높이 번호입니다. 69는 A4(440 Hz), 72는 C5입니다. 철자·가사만으로 원곡 음정을 추정하지 않습니다.
- `voice`는 `cat`, `human`, `hybrid` 중 하나입니다. 고양이풍·인간풍·혼합의 실험적 음색이며, 여기서 ‘인간풍’은 실제 화자나 완전한 한국어 가창이 아니라 모음 위주의 근사입니다.
- 선택 사항인 `call`은 `meow`, `purr`, `hiss`, `growl`, `chirp` 중 하나입니다. `meow`를 제외한 호출은 고양이풍 음색용입니다. 실제 고양이의 음향을 그대로 재현한 것은 아닙니다.
- 반주는 권리가 확인된 PCM16 WAV를 사용합니다. 악보 시각과 맞는 편곡인지 먼저 비교하세요. 반주에서 원곡 보컬의 정확한 음절과 선율을 자동으로 복원한다고 가정하지 않습니다.
- [가창 설계](SINGING.md)의 별도 마이크로초 스키마와 이 JSON은 서로 다릅니다. 이 페이지의 예제만 현재 작업실 계약으로 사용합니다.

## 명령

```sh
# (1) 검증만
node studio/cli.mjs validate score.json

# (2) 보컬 WAV
node studio/cli.mjs render score.json --out meow.wav

# (3) 로컬 반주 함께
node studio/cli.mjs render score.json --out mix.wav --backing backing.wav --vocal vocal.wav

# (4) 오디오를 담은 독립 무대 HTML
node studio/cli.mjs show score.json --out stage.html --backing backing.wav

# (5) 직접 제공한 LRC의 줄 타임스탬프 읽기
node studio/cli.mjs lrc lyrics.lrc

# (6) LRCLIB의 공개 곡 메타데이터 조회 점검
node studio/cli.mjs provider-check "Daisy Bell"
```

명령이 실패하면 보고된 입력 문제부터 고칩니다. 샘플레이트·재생 시간·첫 음표·쉼표를 확인한 후 전달합니다. 출력 WAV와 사용자의 원본 가사·악보·MR은 예제 커밋에 섞지 않습니다.

## 결과물 두 가지

**음악만:** 요청한 보컬 WAV, 반주가 포함된 믹스 WAV 또는 둘 다 전달합니다. 화면 자료가 필요하지 않다면 만들지 않습니다.

**무대 화면과 음악:** `show`로 같은 악보와 보컬 프리셋을 담은 재생용 독립 HTML을 생성합니다. MP4가 필요하면 선택 도구로 무대를 1280×720에 렌더합니다. Playwright의 Chromium과 FFmpeg가 필요하며, 원본 작업실 조작 화면 전체가 아닌 재생 무대와 가사 강조를 녹화합니다. 조작 화면 자체는 [데스크톱](assets/studio-desktop.webp)·[모바일](assets/studio-mobile.webp) 스틸처럼 별도로 캡처하세요.

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 studio/film.py stage.html stage.mp4 --fps 24
```

영상은 최대 30초입니다. 더 긴 악보는 `--seconds 15` 같은 미리보기 구간을 지정하세요. WAV와 HTML에는 그 제한이 없습니다(악보는 5분까지).

## 외부 가사

`provider-check`는 LRCLIB 공개 메타데이터 응답의 연결과 곡 식별을 점검합니다. 가사 본문은 반환하지 않습니다. `lrc`는 직접 받은 파일의 시간표를 읽을 뿐 음절별 정렬·MIDI를 생성하지 않습니다. 제공처의 메타데이터 조회, 가사 본문 이용, 파일 재배포는 다릅니다. 공식 API와 계약 범위를 확인한 경로만 사용하고, 그 사실만으로 상업곡을 예제에 넣지는 않습니다. 권한이 없거나 제공처 연결이 검증되지 않았으면 사용자 제공 TXT·악보를 로컬에서 유지합니다. [제공처별 확인 결과](LYRICS_PROVIDERS.md)를 참고하세요.

[프로젝트 문서 지도](README.md) · [작업실 에이전트 지침](../../.agents/skills/mvs-studio/SKILL.md)
