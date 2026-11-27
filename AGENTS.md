# MVS 프로젝트 작업 지침 🐾

MVS는 CHIMERA의 Rust 발성 엔진에서 출발한 독립 파생 프로젝트다. 먼저 [프로젝트 문서 지도](docs/mvs/README.md), [계보](docs/mvs/PROVENANCE.md), 요청에 해당하는 검증 명령을 읽는다. 애매한 작업을 무턱대고 밀지 않되, 사용자가 제공한 가사와 음정으로 재현할 수 있으면 설명에서 멈추지 말고 실제 산출물을 만든다.

## 가사와 음정을 받았을 때

- 파일·텍스트·타임스탬프·음정 등 받은 자료를 보존한다. 파일명, 곡 버전, 기준 시각, 템포, MR 유무와 최종 전달물(음악만 또는 화면 녹화 포함)을 확인한다. 이미 정해진 값은 다시 묻지 않는다.
- [MVS 작업실 스킬](.agents/skills/mvs-studio/SKILL.md)을 읽고 작업한다. 실행 명령은 현재 브랜치에서 확인한다. 다른 줄을 임의로 쓰거나 곡에 없던 선율을 마치 원래 음정처럼 덮어씌우지 않는다.
- 가사·음정·MR을 별도 자산으로 취급한다. 표시용 가사, 줄 시간표, 음절 정렬, 악보는 서로 대체되지 않는다. 반주만으로 원곡 보컬 선율을 확정했다고 말하지 않는다.
- 권리가 확인된 자료만 사용한다. 등록된 제공처의 공식 API·승인 계정만 사용하며, 차단된 본문·로그인·유료 구독을 우회하지 않는다. 환경 변수에 있는 토큰, 입력 가사·음원, 개인 패스, 다운로드 결과물은 저장소에 올리지 않는다.
- 렌더 자체와 렌더를 실제 확인하는 일은 별개다. 파일 존재, 길이, 음정·타이밍의 기준, 정지/재생, 샘플레이트·클리핑을 확인하고 누락된 실험을 분리한다. 화면을 내보낼 때는 실제 렌더 오디오와 화면이 맞는지 확인한다.
- 사용자가 “음악만”이라고 하면 오디오만 전달한다. 화면까지 요청하면 실제 앱 화면이 보이는 별도 영상이나 스틸을 만든다. 에셋 업로드·공개·외부 제공처 전송은 사용자가 승인한 범위만 수행한다.

## 문서와 화면

문서, 화면 라벨, 도움말은 한국어가 기본이다. 발표할 땐 자신 있게, 오류 설명은 담백하게. 한국어 한 숟갈 배워 오시면 작업실이 더 재미있습니다(진짜로 입장 시험은 없어요 😎). 코드 식별자, 스키마 키, 원문 인용, 라이선스와 제3자 고지는 원문을 유지한다. CHIMERA에서 상속된 기능을 MVS가 새로 개발했다고 기록하지 않는다. 해외 사용자가 요청한 결과물 언어는 그대로 존중한다.

갸루 테마에서 장식과 UI의 역할을 분리한다. 라벨·오류는 색에만 의존하지 않고, 키보드와 터치로 조작할 수 있어야 한다. 움직임 감소 설정에서 의미 없는 애니메이션을 끈다. 검증되지 않은 기능은 문서와 화면에서 ‘연구’로 표시한다.

## 엔진과 작업 지도

- `crates/chimera/`: I/O 없는 Rust 엔진. `crates/chimera-wasm/`: 브라우저 C ABI. `crates/chimera-cli/`: 오프라인 CLI. `crates/chimera-plugin/`: CLAP/VST3/AU.
- `src/wasm/`, `src/worklet/`: 엔진 경계 및 오디오 처리. `src/ui/`: React와 화면. `src/song/`: 가사·음절, 악보, 클립. `src/rig/`, `rig.html`: 리그 개발 화면. `src/rig/body.rig.bin`은 생성물이며 직접 편집하지 않는다.
- `tests/`, `tools/`: 검사, 계측, 재현. 기존 연구 평가기(`tools/asr/`, `tools/tsp/`)는 합성을 평가하는 기준이므로 변경을 정당화하려고 수정하지 않는다.
- 하나의 변경에 한 문제를 담는다. 되돌리거나 같은 시도를 반복하기 전에 `git log -- <경로>`와 `git log -S`를 확인한다. 재현 가능한 실패를 테스트로 남기고, 결과를 꾸미기 위해 기준을 재생성하지 않는다.

## 바꾸면 꼭 확인할 것

- [Rust 엔진 계약](docs/rust-engine.md): 초월 함수는 `chimera::math`를 거치고, 렌더 중 동적 할당·I/O를 하지 않으며 블록 크기에 따라 결과가 바뀌지 않는다. 16 kHz 장치에서도 `cargo test -p chimera --test engine the_voice_holds`로 유한성을 검증한다.
- 음향·조음 계획 변경으로 골든이 달라지면 이유, 전후 듣기, 수치를 검토한다. 의도한 차이만 `CHIMERA_BLESS=1 cargo test --workspace --no-fail-fast`로 갱신한 후 플래그 없이 재실행한다. [골든 기준](crates/chimera/tests/golden/README.md). `*.generated.json`은 생성 도구로만 갱신한다.
- `src/wasm/chimera.wasm`은 Git 관리 대상이 아니다. Rust 변경 뒤 `bun test tests`로만 검증하면 오래된 WASM을 시험할 수 있다. `bun run test`를 사용하고 체크아웃 사이 Cargo `target/`을 공유하지 않는다.
- 제스처 레코드를 바꾸면 `crates/chimera-wasm/src/lib.rs`와 `src/wasm/wire.ts`를 같이 바꾸고 `LAYOUT_VERSION`을 올린다. 엔진 초기화 전 호출하는 모듈을 `src/main.tsx` 정적 가져오기에 연결하지 않는다.
- 기존 화면은 `.screen-body` 안에서 흐르게 배치한다. 휴대폰에서는 조작부를 관측부보다 앞에 놓는다(기존 머리 화면 예외). 기존 벡터 표시의 11px 이상·저대비 문자 금지 검사도 유지한다.
- 원본 연구 비교용 CSD 음원이나 여기서 파생한 음원은 커밋하지 않는다. 소리 조율은 [기존 기준](docs/hill-climb/README.md)을 따른다.

| 바뀐 곳 | 기존 로컬 검증 |
| --- | --- |
| 코드 변경 일반 | `bun run test`, `bun run typecheck` |
| Rust 합성 | 골든·회귀 및 `cargo run --release -q -p chimera --example bench` 전후 |
| WASM·Worklet·앱 진입점 | `bun run build`, 미리보기 서버에서 `bun tools/e2e.ts` |
| 화면·CSS | `bun run lint:layout`, 모바일·데스크톱에서 핵심 화면 확인 |
| 리그 | `bun test tests/rig.test.ts`, 개발 서버의 `/rig.html` |
| 플러그인·오디오·공용 화면 상태 | `bun run build`, `cargo build -p chimera-plugin --release --example ui_harness`, `bun tools/plugin-e2e.ts`; 플러그인 레이아웃은 `bun tools/layout-lint.ts --plugin --url http://127.0.0.1:8549/` |
| 문서만 | 링크, 예시와 실제 명령 일치, 라이선스 고지 보존 확인 |

이 저장소에서는 GitHub Actions를 새로 추가하지 않는다. CI가 있는 원본의 문서는 원본 환경을 설명한다. [기여 안내](CONTRIBUTING.md)에 따라 검증 명령, 결과, 미확인 범위를 남긴다.

작은 커밋과 PR, 최신 head 직접 검토 및 병합 기준은 [기여 안내의 커밋 규칙](CONTRIBUTING.md#커밋은-작게-근거는-크게)을 적용한다. 실패를 숨기거나 검사·브랜치 보호를 우회하지 않는다.
