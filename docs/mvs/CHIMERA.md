# 원본 CHIMERA 기술 안내

아래는 **원본 계보**에서 온 엔진과 문서입니다. 이 저장소에서 새로 만든 가창 스튜디오의 명령은 [먀용 작업실 사용법](STUDIO.md)에 있습니다. [영문 원본 README(포크 분리 전 스냅샷)](https://github.com/hslcrb/meow-voice-system/blob/720b2412a8bd7bef329e9a6408f6fde0c2cab8b7/README.md)에는 당시의 배포 안내와 전체 설명이 남아 있습니다.

## 기본 엔진

Rust 엔진을 WebAssembly로 빌드해 브라우저 AudioWorklet에서 실행합니다. 폐·성대 또는 명관·성도·입술·비강을 수치적으로 모델링합니다. 원본의 연주, 발화, 자동 곡조 가창 및 악보의 쉼표, 비트박스, 동물 호출, 듀엣 화면 기능과 MVS의 신규 실험은 별개입니다. 원본 가창 입력은 한글·가나·러시아어와 영문 계열 일부를 각 전처리기로 다룹니다. 각 언어의 한계는 아래 기술 문서를 확인합니다.

## 성대 실험실

브라우저 기본 화면 `/`에서 상단의 **Play**를 선택하면 **Vocal folds**와 움직이는 성도 단면을 같은 화면에서 볼 수 있습니다. **Breathe**로 진동을 시작하고, **3D**로 단면을 입체 보기로 바꾸거나 **Bestiary**에서 원본 동물 발성 모델을 탐색할 수 있습니다. 원본의 색·기하·조음 제스처·오디오 코드는 그대로이고, 갸루 테마는 바깥 패널과 상단 탐색에만 적용됩니다. `/?theme=original`은 대조용 원본 테마입니다. 원본의 플러그인 및 `?show=` 듀엣에는 이 테마를 적용하지 않습니다.

## 기존 앱 개발

Rust, WASM 타깃, Bun이 필요합니다. 아래는 원본 앱에 대한 명령이며 MVS 정적 작업실에는 필요하지 않습니다.

```sh
rustup target add wasm32-unknown-unknown
bun install
bun run dev
bun run test
bun run typecheck
```

AudioWorklet은 로컬호스트 또는 HTTPS 보안 컨텍스트에서 실행합니다. 원본 플러그인 설치 URL은 MVS 배포가 아닙니다. 네이티브 렌더 범위는 `cargo run -p chimera-cli -- --help`에서 확인합니다.

## 한국어 기술 문서 길잡이

아래 연결에는 동작 계약과 역사적 연구 기록 원문이 남아 있습니다. 명령·벤치마크·연구 인용을 갱신하지 않은 곳은 새 MVS 버전의 실측으로 해석하지 않습니다.

| 관심사 | 요지와 원문 |
| --- | --- |
| 발성 물리 | [음향 구조](../architecture.md): 기도 FDTD, 발성원, 해부학·제스처. [Rust 엔진](../rust-engine.md): 할당 없는 오디오 콜백, 결정성, WASM 경계. |
| 발음 | [언어별 프런트엔드](../language-front-ends.md): 발음·음절·제스처의 연결. [러시아어](../russian.md), [튀르키예어](../turkish.md): 규칙과 근사 한계. |
| 음향 검수 | [가창 기준 CSD](../csd-comparison.md), [발화 기준 TSP](../speech-comparison.md): 자연 녹음에 대한 비교 범위. [음색 개선 방법](../hill-climb/README.md)과 [역사적 실험 로그](../hill-climb/log.md). |
| UI와 리그 | [원본 UI 벡터 디자인](../ui-redesign.md), [시안](../mockups/README.md), [3D 신체 리그](../rig.md). |
| 플러그인 | [CLAP/VST3/AU 안내](../plugin.md): 호스트와 플랫폼별 구현; CI·릴리즈 문장은 원본 기준. |

고지: [MIT](../../LICENSE), [CMU 사전](../../public/data/CMUDICT-LICENSE.txt), [글꼴](../../public/fonts/), [신체 리그](../rig.md#provenance).
