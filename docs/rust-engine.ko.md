# Rust 발성 엔진: 설계, 구현, 검증

[English original](rust-engine.md) · [MVS 연구 문서 지도](mvs/README.md) · [별도 먀용 작업실 사용법](mvs/STUDIO.md)

이 문서는 2026-11-05의 **CHIMERA 이식 설계와 완료 보고**를 한국어로 옮겨 읽기 쉽게 정리한 것이다. 원문과 그 이력·저작자 표기는 그대로 둔다. 설계에서 논의한 것, 원문이 출시 때 측정한 것, 현재 저장소 코드에서 확인한 것을 구분한다. 아래의 Rust/AudioWorklet은 상속한 경로다. 현재 먀용 작업실의 `studio/` 웹·Node 실험판이나 Ruby 템포 실험이 이 엔진과 통합되었다는 뜻이 아니다.

## 왜 Rust인가

1. 원본의 JDAW 구상은 웹 UI와 네이티브 Rust 오디오 엔진을 조합한다. CHIMERA를 연결하려면 브라우저 없이도 호출하는 라이브러리, 오프라인과 실시간 결과의 일치, 독립된 코어에서 병렬 처리할 수 있는 발성 인스턴스, macOS·Linux와 웹용 WASM이 필요했다. 이 요구사항은 통합이 완료됐다는 뜻이 아니다.
2. 기존 TypeScript 엔진은 2배 오버샘플링한 남성 음색을 AudioWorklet에서 돌릴 때 한 빠른 코어의 30–45%를 소모했다. 느린 장치에서는 여유가 적다. Chromium에서 관측한 해부학 뷰의 지연은 매 프레임 모든 채우기에 적용한 캔버스 `blur()`의 별도 문제였다.

## 무엇이 이동했나

TypeScript에서 물리 합성(FDTD 기도, 주파수 영역 비교 모델, 성문·밸브·명관 소스), 조음·발성기관, 제스처 시간표, 생물, 음성학(IPA, CMUdict 자소→음소, 음절·지속시간·가창·비트박스·데모), FFT/LPC/YIN 분석을 Rust로 옮겼다. 몸체·생물 교체, 비트 재생, 명령 순서처럼 호스트와 앱에서 공유해야 할 Worklet 상태도 엔진에 둔다. 기존 TS 합성기를 별도 유지하지 않는다.

React, 캔버스 렌더러, 생물 도형, Zustand, Web MIDI, 실시간 Sing 제어, 브라우저의 Web Audio 분석과 클로즈 마이크 효과는 TS/웹에 남긴다. UI는 Rust의 계획기를 호출한다.

| 위치 | 역할 |
| --- | --- |
| [crates/chimera](../crates/chimera/) | DSP·계획기 라이브러리. 엔진 자체는 I/O를 하지 않고 가변 전역 상태를 공유하지 않는다. 이식 설계가 말한 핵심 의존성은 `libm`, `serde`, `serde_json`이다. |
| [crates/chimera-wasm](../crates/chimera-wasm/) | `wasm32-unknown-unknown`용 C ABI. 브라우저 안에서 Rust 함수·메모리 경계를 제공한다. |
| [crates/chimera-cli](../crates/chimera-cli/) | 화면 없이 `chimera render …`로 WAV 생성, 계측과 교정. |
| [src/wasm](../src/wasm/) · [src/worklet](../src/worklet/) | 타입을 갖춘 브라우저 호출 계층과 실시간 오디오 출력. 설계에 나온 `src/engine/`이 아니라 실제 출시 경로다. |
| [studio](../studio/) | MVS의 로컬 악보·WAV·작업실 화면 실험판. 위 Rust 엔진과 다른 검증·출력 경로다. |

~~~mermaid
flowchart LR
  UI["React·브라우저 제어"] --> JS["src/wasm · JSON 계획·분석"]
  JS --> CORE["CHIMERA / Rust"]
  UI --> WA["AudioWorklet"]
  WA <-->|"버전 있는 C ABI / 고정 버퍼"| CORE
  WA --> SP["Web Audio 출력"]
  CLI["Native chimera CLI"] --> CORE
  UI2["MVS studio 악보 편집"] --> WK["독립 작업실 워커"]
  WK --> OUT["WAV · 로컬 화면/MP4"]
~~~

## 실시간 계약

- `Engine`, `HumanVoice`, `CreatureVoice`는 `Send`이며 변경 가능한 상태를 서로 공유하지 않는다. 독립 인스턴스를 각 스레드에서 렌더할 수 있다.
- 렌더가 이미 안정 상태에 들어간 뒤에는 메모리를 할당하지 않는다. `render(&mut [f32])`, 제어·형상 단계, 노이즈 소스 목록, 비트 제스처, 상태 계측을 위한 스냅샷은 이미 준비한 버퍼를 사용한다.
- `GestureScore::CAPACITY`는 16,384개다. 초과분은 버리고 횟수를 센다. `schedule` 한 번은 최대 4,000개이며 기존 순서를 유지한다. 먼저 들어온 순서가 중첩 제스처의 부동소수점 합에도 관여한다.
- 몸체 교체, 생물 교체, 첫 `Engine::new`는 메모리를 할당한다. 새 기도나 데이터를 미리 준비하고, 실시간 스레드에서는 예약·릴리스·조음·발성·게이트·비트 제어만 실행한다. 전문/곡 계획 `plan_utterance`와 `plan_song`은 렌더 스레드 밖에서 실행한다. 원문 설계 때는 실시간 음표 계획도 할당됐으나, 완료 상태의 `control::singer`는 `plan_note_on_into` 등의 재사용 버퍼 경로를 쓴다.
- 128샘플 하위 블록의 경계는 호스트가 준 버퍼 크기가 아니라 **절대 샘플 위치**가 결정한다. 같은 절대 위치에서 같은 명령이 들어오면 호스트의 블록 크기가 달라도 결과가 일치한다. 즉시 적용하는 명령을 샘플 단위로 맞추려면 호스트가 해당 위치에서 블록을 나눈다.
- 설계는 `Ready`·`Planned`를 엔진의 이벤트 큐로 제안했다. 출시판 엔진은 예약 시각의 오프셋을 반환하고 Worklet이 `ready`·`planned`를 게시한다. 버퍼 크기가 고정된 텔레메트리는 호출자가 읽는다. RMS처럼 읽은 뒤 초기화되는 구간 값과 반복되는 스냅샷은 구별한다.
- 생물이 울리는 동안 인간 발성 시계는 예전과 같이 멈춘다.

## 결정성: 어떤 환경까지 같은가

동일 빌드에서는 같은 입력·같은 시각표를 반복하면 같은 샘플을 얻고, 블록 크기에 의존하지 않는 것이 계약이다. 초월 함수는 고정 버전의 순수 Rust `libm`을 감싼 `chimera::math`를 거친다. PRNG는 명시적 `u32` 래핑을 사용한다. 상태·제스처는 `f64`, 출력·텔레메트리는 `f32`다. `js_min`·`js_max`는 NaN을 전파하고 −0과 +0의 순서를 유지하며, `js_round`는 JS 반올림 규칙을 따른다. FMA를 암묵적으로 끼워 계산 순서를 바꾸지 않는다.

원문에서 네이티브/브라우저 WASM 동일성을 검증한 환경은 **x86-64 Linux**다. aarch64/macOS 동일성은 보장하지 않는다. 비정규 수를 0으로 처리하는 FTZ/DAZ는 브라우저와 비트 단위 맞춤이 필요할 때 켜지 않는다. [플러그인](plugin.md)은 nih-plug의 FTZ를 사용하므로 이 계약에서 다르다.

## 기존 TS와 맞춘 방법

수식·순서·상수·난수 시드·제스처와 노이즈 리스트 순서를 그대로 옮겼다. 이식 자체를 위해 프리셋을 재조율하지 않았다. [골든 기준](../crates/chimera/tests/golden/README.md)은 TS를 지우기 전 기록한 입력과 출력으로 비교한다.

1. 형상/단면적, 제스처 계획, 자소→음소 같은 수치 결과는 상대 오차 1e-9(0 근처에는 절대 하한)를 목표로 삼고, 구조 자체가 달라지면 실패로 본다.
2. 음원은 시작음만 비교하지 않는다. 몸체 변경·릴리스·음절·호출 등이 중간에 끼는 시나리오도 본다. 기존 설계의 기준은 연속 영역에서 피크 대비 약 1e-6 이하, V8/Rust의 마지막 비트 차이로 분기가 바뀐 뒤에는 10ms 단위 RMS가 0.05dB 안에 있느냐였다. 발음 시작·종료·쉼·음정·폐쇄의 행동 시험은 별개다.
3. 공진·FDTD의 행렬 비교·안정성·포먼트·폐쇄·가창을 Cargo 회귀로, UI와 Worklet을 `tools/e2e.ts`와 JS 테스트로 검증했다.
4. 인간 음성용 골든만 `CHIMERA_BLESS=1`로 다시 생성할 수 있다. 다른 골든은 원래 TS 동작을 기록한다. 구현을 바꿨다는 이유만으로 골든을 새로 쓰지 않는다.

## 브라우저와 ABI

메인 스레드가 WASM을 한 번 컴파일하고 `processorOptions`에 `WebAssembly.Module`을 넘긴다. 양쪽이 모듈을 인스턴스화한다. 빈 import object를 사용하는 경로라 WASI와 wasm-bindgen의 JS glue는 필요하지 않다. UI 모듈이 계획기를 일찍 부르므로 `main.tsx`는 WASM을 준비한 뒤 앱을 불러온다. 준비 실패를 사용자가 다시 시도할 수 있다.

Worklet은 숫자와 포인터로 고정 주소의 출력·작업 영역·텔레메트리 버퍼에 접근한다. 메모리가 커져 `memory.buffer`가 바뀌면 TS 뷰를 다시 만들고, 다음 호출에서 덮기 전에 텔레메트리를 복사한다. 출력 요청 상한은 4,096프레임이다. 메인 스레드의 가창/음소 계획, 발성기관의 투영 및 단면/전달함수/포먼트, 카탈로그처럼 실시간이 아닌 호출은 `serde_json` 입출력을 사용한다.

**원문 초안의 256바이트와 현재 코드는 다르다.** 현재 [Rust ABI](../crates/chimera-wasm/src/lib.rs)와 [TS 코덱](../src/wasm/wire.ts)의 버전은 1, 제스처 레코드는 272바이트 리틀엔디언이다. 통합할 때 원문의 초안 크기를 하드코딩하지 않는다.

| 바이트 위치 | 현재 제스처 레코드 |
| --- | --- |
| 0–63 | 시간·램프·강도·속도·릴리스·태그 등 `f64` 8개 |
| 64–239 | 엔진의 `ControlKey` 순서로 목표값 `f64` 22개 |
| 240 | UTF-8 레이블의 길이 1바이트(255는 레이블 없음) |
| 241–264 | 최대 24바이트의 UTF-8, 글자 경계에서 자름 |
| 265–271 | 패딩 |

부재는 `NaN` 또는 지정된 표식으로 표현한다. Worklet의 UTF-8 변환기는 이 실행 문맥의 문자 변환기 제약을 감안한다. 비트 스텝은 별도의 48바이트 레코드다. `panic = "abort"`에서는 오디오 콜백의 트랩을 잠그고, 무음을 출력하며 오류를 한 번 알린다. 메인 스레드에서 노드를 교체할 수는 있으나 악보·시계·비트 상태의 무중단 복구를 제공하지 않는다.

## 빌드와 재현 명령

~~~sh
bun run wasm
bun run test
bun run typecheck
cargo test -p chimera --test engine --test singer_alloc
~~~

`bun run wasm`은 `cargo build -p chimera-wasm --release --target wasm32-unknown-unknown`의 산출물을 `src/wasm/chimera.wasm`에 둔다. Vite는 이를 `?url`로 가져온다. 저장소의 래퍼를 사용하면 테스트가 오래된 WASM을 잘못 검사하지 않도록 준비 단계부터 실행할 수 있다. 정확한 현재 명령은 [프로젝트 작업 지침](../AGENTS.md)과 [package.json](../package.json)을 함께 본다.

## JDAW가 이용할 접점

네이티브 모듈에서 `Engine::new(sample_rate)`, `set_body`, `set_artic`, `set_source`, `set_gate`, `schedule`, `release`, `stop_speech`, `set_beat_*`, `beat_hit`, `set_creature`, `set_creature_params`, `play_call`, `stop_call`, `render(&mut [f32])`와 텔레메트리를 사용할 수 있다. `HumanVoice`와 `CreatureVoice`에도 직접 접근할 수 있다. `plan_phrases`, `plan_song`, `plan_note_on/off`, `lyrics_to_syllables` 및 문자열 사전을 받는 `EnglishG2P`는 별도 계획 경로다. 호스트의 실제 모듈 타입은 JDAW 인터페이스가 생길 때 쓰기로 한 계획이다.

## 도구가 이동한 곳

- 이전 독립 speech/text/song/beatbox/creature/vowels 도구는 `chimera render <kind> …`로, 모음/자음 교정은 `chimera calibrate vowels|consonants`로 옮겼다. 누설·포먼트·대역폭·음정의 계측은 `chimera diagnose`로 옮겼다.
- 스펙트로그램은 `tools/spectrogram.ts`에, 명관·IPA NFC 데이터 생성은 TypeScript에 남겼다. 한 번 쓴 원형 실험과 도식은 신규 실행 도구로 유지하기보다 코드와 이력으로 남겼다.

## 설계 검토에서 바뀐 판단

원문은 Codex 검토로 블록 크기 독립성, 제스처 용량, 할당 명령, 고장 시 침묵, 결정성의 검증 범위, 이벤트·텔레메트리·ABI 및 시작 순서를 보강했다고 기록한다. G2P·계획·노래를 TS에 유지하자는 제안은 비트 시퀀서도 발음과 모음 제어를 소유하고 헤드리스 JDAW도 가사로 노래해야 하며, 두 언어 구현이 어긋날 수 있어 거절했다. 호출 순서대로 명령을 즉시 적용하므로 Worklet의 블록별 명령 재생 한도와 대기 큐도 출시 경로에서 사라졌다.

## 출시 시점의 검증과 수치

아래는 **원문에서 보고한 역사적 값**이며 MVS 실험판에서 이번에 새로 측정한 것이 아니다.

| 이식 완료 검증 | 원문 보고 |
| --- | --- |
| 골든 음성 | 사람은 피크 대비 1e-9 이내, 생물은 2e-10 이내. 계획/시퀀스는 일부 `f0`의 1 ULP 차이를 제외하고 비트 일치. |
| 언어와 분석 | G2P·IPA·음절 약 3,200건 일치. 형상 상대 오차 8e-14 이내, 분석 1e-10 이내. UI dB 곡선 9.7e-11, 포먼트 1.1e-12. |
| 시간 결정성 | x86-64에서 네이티브와 WASM 비트 일치. 예제 세션은 블록 1–48,000샘플에서 일치. 발화·비트·생물 ABI 구간의 할당 0. CLI는 이전 TS 대비 피크 1e-6 미만. |
| 속도(Ryzen 7 8745HS) | 남성 2배 오버샘플링 오프라인 렌더에서 TS Chromium 코어 46%, WASM Chromium 32%, 네이티브 19–21%. 실행 앱의 사람은 40→29%, 물개 예시는 56→28%. |

출시판은 `Command` enum과 이벤트 큐 대신 바로 적용하는 메서드와 Worklet 보고를 택했다. FDTD의 검증된 인덱싱은 유지했다. `get_unchecked`로 바꿔도 계측상 이득이 없었으며 안전한 호출자가 지키기 어려운 가정을 만들었다. 모음 교정은 마지막 비트 차이와 평평한 최솟값의 탐색 때문에 일부 자세가 ±0.001–0.002 바뀔 수 있어, 실제 프리셋은 기존 테이블을 보존했다.

남은 과제는 aarch64/macOS의 결정성 검증, TS와 같은 결과를 전제로 보류한 FDTD 성능 실험, 할당이 있는 장문·곡 계획을 뒷단 편집 스레드에 배치하거나 별도 방법으로 줄이는 일이다. 원본의 실시간 엔진 고민과 MVS 작업실의 고양이풍·한국어 실험을 구분하는 것이 이후 통합의 전제다.
