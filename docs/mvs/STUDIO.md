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
- 끝 쉼표까지 보존하려면 최상위 `end`에 악보 끝 시각(초)을 적으세요. 위 예제에 `"end": 2`를 넣으면 마지막 음 1.5초 뒤에 0.5초가 더 남습니다. 작업실의 **악보 끝 시각 (초)**에서 같은 값을 수정할 수 있습니다. 비우면 이전처럼 마지막 음표가 끝나는 시각을 사용합니다. `end`는 마지막 음표보다 빠르거나 300초보다 클 수 없으며 반주가 더 길면 반주는 잘리지 않습니다.
- `midi`는 MIDI 음높이 번호입니다. 69는 A4(440 Hz), 72는 C5입니다. 철자·가사만으로 원곡 음정을 추정하지 않습니다.
- `voice`는 `cat`, `human`, `hybrid` 중 하나입니다. 고양이풍·인간풍·혼합의 실험적 음색이며, 여기서 ‘인간풍’은 실제 화자나 완전한 한국어 가창이 아니라 모음 위주의 근사입니다.
- 사람풍·혼합 보컬에서 **한국어 끝소리 → 비음 받침 실험**을 켜거나 JSON에 `"articulation": "nasal"`을 추가할 수 있습니다. ㄴ·ㅁ·ㅇ 받침을 가진 한글 한 음절이고, 다음 음과 0.03초 이상 떨어져 있거나 마지막 음일 때만 끝에 짧은 비음 느낌을 더합니다. 가사나 음정·타이밍은 바뀌지 않습니다. 다른 받침, 이어지는 발음, 받침별 조음 위치 및 듣기 검증은 아직 범위 밖입니다.
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

**음악만:** 요청한 보컬 WAV, 반주가 포함된 믹스 WAV 또는 둘 다 전달합니다. 화면 자료가 필요하지 않다면 만들지 않습니다. 악보나 반주를 바꾸면 이전 재생·다운로드가 닫힙니다. 현재 입력으로 **목소리 만들기**를 다시 눌러 새 WAV를 받으세요.

**무대 화면과 음악:** `show`로 같은 악보와 보컬 프리셋을 담은 재생용 독립 HTML을 생성합니다. MP4가 필요하면 선택 도구로 무대를 1280×720에 렌더합니다. Playwright의 Chromium과 FFmpeg가 필요하며, 원본 작업실 조작 화면 전체가 아닌 재생 무대와 가사 강조를 녹화합니다.

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 studio/film.py stage.html stage.mp4 --fps 24
```

영상은 최대 30초입니다. 더 긴 악보는 `--seconds 15` 같은 미리보기 구간을 지정하세요. WAV와 HTML에는 그 제한이 없습니다(악보는 5분까지).

**실제 작업실 화면과 음악:** 무대 대신 악보 입력과 보컬 설정, 렌더 결과와 플레이어가 있는 웹 작업실을 캡처합니다. JSON을 실제 파일 입력으로 불러오고 **목소리 만들기** 버튼을 누른 뒤, 작업실이 제공하는 믹스 WAV와 플레이어의 각 시각을 묶습니다. 원본 화면의 조작 상태를 보여 주는 재생 영상이지, 사람이 클릭하거나 입력하는 과정 전체를 기록하는 튜토리얼은 아닙니다.

~~~sh
python3 studio/capture.py studio/examples/meow.json studio.mp4 --width 1440 --height 1200 --fps 12
python3 studio/capture.py 내-악보.json 내-작업실.mp4 --backing 내-반주.wav --seconds 12
python3 studio/tests/capture.py
~~~

앞부분을 고르는 옵션은 30초 이하이며, 미지정 시 WAV 전체가 30초 이하여야 합니다. 너비 320–1920px, 높이 320–1200px의 **짝수**와 6–30fps를 지원합니다. 작은 화면에서는 실제 플레이어가 보이도록 이동하므로 편집부 일부는 화면 밖에 있을 수 있습니다. H.264 영상의 마지막 프레임은 한 프레임 미만으로 오디오보다 길 수 있고, AAC 오디오는 손실 압축입니다. 음원 보존이 필요하다면 WAV를 따로 전달하세요. 반주나 악보를 외부로 보내지 않고, 기존 MP4를 덮어쓰지 않습니다. 공개 전에는 영상 속 곡명·가사·파일명도 공개 가능한지 따로 확인하세요.

[실제 작업실 영상의 2초 스틸](assets/studio-capture-desktop.webp) · [작업실 MP4 구현과 검증 기록](DEVLOG.md#밤샘-15-재생-무대가-아닌-실제-작업실을-mp4에)

## 외부 가사

`provider-check`는 LRCLIB 공개 메타데이터 응답의 연결과 곡 식별을 점검합니다. 가사 본문은 반환하지 않습니다. `lrc`는 직접 받은 파일의 시간표를 읽을 뿐 음절별 정렬·MIDI를 생성하지 않습니다. 제공처의 메타데이터 조회, 가사 본문 이용, 파일 재배포는 다릅니다. 공식 API와 계약 범위를 확인한 경로만 사용하고, 그 사실만으로 상업곡을 예제에 넣지는 않습니다. 권한이 없거나 제공처 연결이 검증되지 않았으면 사용자 제공 TXT·악보를 로컬에서 유지합니다. [제공처별 확인 결과](LYRICS_PROVIDERS.md)를 참고하세요.

[프로젝트 문서 지도](README.md) · [작업실 에이전트 지침](../../.agents/skills/mvs-studio/SKILL.md)

## MIDI 음정 + 가사 목록 넣기

[표준 MIDI 파일](https://midi.org/standard-midi-files) 형식 0·1과 PPQ를 지원합니다. 음정이 있는 **단선율 트랙 하나**를 고르고, 자기 가사를 음표당 문자열 하나인 JSON 배열로 저장하세요. 예: `["먀","용"]`. 0번은 첫 트랙입니다. 템포 트랙만 있는 경우에는 그 뒤를 선택합니다.

```sh
node studio/cli.mjs midi-list melody.mid
node studio/cli.mjs midi-import melody.mid --track 1 --lyrics syllables.json --out score.json
node studio/cli.mjs render score.json --out meow.wav
```

가사 개수가 다르거나 화음이 겹치면 임의로 단순화하지 않고 중단합니다. 선택한 트랙의 마지막 음표 뒤에 종료 시각이 있으면 그 사이 템포로 끝 쉼표를 계산해 악보 `end`에 보존합니다. 지휘(템포) 트랙이나 다른 악기 트랙의 재생 길이를 선택 트랙에 덧붙이지 않습니다. MIDI의 시간·정수 음높이·세기를 읽으며, 페달·피치벤드·가사 내장 메타 이벤트는 재현하지 않습니다. 브라우저에서도 **파일에서 가져오기 → MIDI 선율 가져오기**로 파일을 열고 트랙을 고를 수 있습니다. 음표마다 가사를 한 줄씩 입력한 뒤 적용하세요. 개수가 틀리면 기존 악보를 보존하며 파일은 브라우저 밖으로 전송하지 않습니다. 브라우저에서는 MusicXML 파일을 바로 열지 않고 아래의 변환기로 만든 JSON을 가져옵니다.

## MusicXML의 단선율과 내장 가사 가져오기

[직접 작성한 악보 예제](../../studio/examples/meow.musicxml)를 복사해 시작할 수 있어요. Python 표준 라이브러리만 사용하며 가사나 파일을 외부에 보내지 않습니다.

```sh
python3 studio/musicxml.py studio/examples/meow.musicxml --out score.json --voice human
node studio/cli.mjs validate score.json
node studio/cli.mjs render score.json --out voice.wav
```

- 압축하지 않은 UTF-8 `score-partwise`의 **보컬 파트 하나**를 사용합니다. 첫 음표나 쉼표 앞에 `divisions`와 4분음표 BPM인 `sound tempo`가 필요해요. 현재 템포와 분해능은 변경 지점 이후부터 적용됩니다. 전주·중간 및 끝 쉼표, 실제 울리는 음높이, 같은 음의 연결된 붙임줄, 각 음표의 내장 가사를 보존합니다. 끝의 연속 쉼표는 음표나 가사를 추가하는 대신 악보 `end`에 반영합니다.
- 가사가 여러 절이면 예를 들어 `--verse 2`로 선택하세요. 번호가 없는 가사는 1로 취급합니다. 시작하는 모든 가창 음표에 선택한 절의 `<text>` 하나가 필요해요. 붙임줄의 후속 음표는 새 가사를 만들지 않습니다.
- 다성·다중 파트·반복·박자 오프셋·이조·꾸밈음·멜리스마·`.mxl`·DTD를 포함한 XML은 아직 지원하지 않습니다. 정수 MIDI 음정과 기보 시간만 옮기며, 다이내믹·조음 표시나 실연의 뉘앙스는 번역하지 않습니다. 입력을 바꿔야 하면 원본이 아닌 사본을 작업하고, 바뀐 시간과 가사를 검수하세요. 기존 출력 파일도 덮어쓰지 않습니다.
- 생성된 JSON은 브라우저 **파일에서 가져오기 → 악보 JSON**에서도 열 수 있습니다. MusicXML 직접 업로드는 아직 지원하지 않습니다.

## LRC와 악보 시작 시각을 검수하기

```sh
node studio/cli.mjs lrc-audit score.json --lyrics lyrics.lrc --tolerance-ms 120
```

입력 두 파일은 로컬에서 읽기만 합니다. LRC의 보정을 적용한 각 줄에 가장 가까운 **음 시작**을 찾습니다. 같은 거리면 앞선 음을 고릅니다. `noteNumber`는 악보의 1부터 세는 음표 번호, `deltaMs`는 음 시작에서 LRC 시작을 뺀 밀리초(반올림)입니다. 양수는 음이 늦고 음수는 음이 먼저 시작했다는 뜻입니다. `soundingNoteNumber`는 그 시점에 실제로 울리는 악보 음표이며, 없으면 `null`입니다. 가까운 음의 시작과 현재 울리는 음은 다를 수 있습니다.

허용 범위는 0–1,000ms, 기본 120ms입니다. `withinTolerance`는 반올림 전 값 기준입니다. 허용 범위 안의 결과도 문장이나 음절의 일치를 뜻하지 않습니다. 이 명령은 가사를 악보에 끼워 넣거나 반주·음정·렌더를 자동 조정하지 않습니다. 결과를 로컬 파일에 보관하려면 다른 새 파일로 표준출력을 저장하세요.

브라우저에서는 **파일에서 가져오기 → 가사 LRC 미리보기 → 현재 악보와 시각 비교**를 누릅니다. 기본 120ms이며 최대 100줄을 화면에 보여 주고 전체 범위 밖 줄 수를 알립니다. 음 시작을 바꾸면 이전 결과는 사라지며 버튼을 다시 누르면 현재 값으로 비교합니다. [모바일 예제](assets/studio-lrc-audit-mobile.webp).

## 편집한 악보를 JSON으로 저장하기

음표 목록 아래 **악보 JSON 저장**을 누르면 현재 편집 값이 `곡 제목-악보.json`으로 내려받아집니다. 다시 **악보 JSON**에서 열거나 CLI의 `validate`·`render`·`show`에 바로 넘길 수 있습니다. 합성에 쓰이는 보컬, 프리셋, 샘플레이트, 끝 시각, 음표·세기·가사는 포함하지만 원본 파일, LRC·반주·WAV는 포함하지 않습니다. 이 파일에는 가사 원문이 있으므로 공유 전에 확인하세요. 불완전하거나 2MB를 넘는 악보는 저장하지 않습니다.
