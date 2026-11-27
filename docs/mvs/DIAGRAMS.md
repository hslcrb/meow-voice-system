# MVS Diagram Atlas — 연구 도식 모음

MVS의 발성기관, 가창, 개인화, 악기 및 오케스트라를 연결하는 개념도 모음이다. 기존 CHIMERA 엔진과 MVS 신규 연구를 구분하며, 신규 기능은 미구현이다. 도식은 GitHub Mermaid 렌더러용으로 작성했으며 개념 흐름이지 실제 해부학, 성능 측정 또는 구현 완료를 의미하지 않는다.

[기획 문서 홈](README.md)

## 1. 전체 연구 아키텍처

[상세 설계](README.md)

```mermaid
flowchart TD
 A["MVS · Meow Voice System"] --> B["FELIS · 고양이 발성"]
 A --> C["HYBRID · 가상 생물 발성"]
 A --> D["VOICE HOMAGE · 개인화 연구"]
 B --> E["SING · 가창"]
 C --> E
 D --> E
 A --> F["가상 악기 연구"]
 E --> G["공통 악보와 타임라인"]
 F --> G
 G --> H["합창 · 팝 · 오케스트라"]
 H --> I["믹싱 · 공간 음향 · 렌더"]
 J["선택적 AI 작곡·편곡·지휘"] -.-> G
```


## 2. 연구 비전

[상세 설계](VISION.md)

```mermaid
flowchart TD
 A["생체음향 연구"] --> B["발성기관 설계"]
 B --> C["새로운 가상 보컬"]
 D["인간의 발성 다양성"] --> C
 C --> E["음악 표현·자동 가창"]
 F["물리 가상 악기"] --> G["앙상블 및 공연장"]
 E --> G
 G --> H["독립적 음악 창작"]
```


## 3. 포유류 발성기관

[상세 설계](BIOACOUSTICS.md)

```mermaid
flowchart TD
 P["폐 · 호흡압"] --> T["기관"]
 T --> G["성문 소스 · 진동"]
 G --> F["인두 · 음파 전파"]
 F --> O["구강 · 혀와 턱"]
 F --> V["연구개 개폐"]
 V --> N["비강 공명"]
 O --> M["입 방사"]
 N --> R["콧구멍 방사"]
 M --> S["합성 음성"]
 R --> S
 F -.-> W["기도벽 운동 · 약한 방사"]
 W -.-> S
```


## 4. 고양이 호출 모델

[상세 설계](BIOACOUSTICS.md)

```mermaid
flowchart LR
 A["FELIS 호출 프리셋"] --> B["야옹: F0·구강 변화"]
 A --> C["골골송: 저주파·호흡"]
 A --> D["하악질: 난류"]
 A --> E["그르릉·트릴: 변조"]
 B --> F["포유류 기도 및 성문 모델"]
 C --> F
 D --> F
 E --> F
 F --> G["합성 파형"]
 G --> H["측정 및 청취"]
```


## 5. 인간·고양이 혼합 발성

[상세 설계](BIOACOUSTICS.md)

```mermaid
flowchart TD
 H["인간 모델"] --> A["인간 언어 · 조음 계획"]
 H --> B["인간 성문과 성도"]
 C["고양이 연구 모델"] --> D["고양이형 성문·공명 특성"]
 C --> E["야옹 · 골골송 · 거친 발성"]
 P["독립 제어값 · 혼합비"] --> M["제약된 파라미터 매핑"]
 B --> M
 D --> M
 E --> M
 A --> F["하이브리드 발성기"]
 M --> F
 F --> G["FDTD · 공명 · 방사"]
 G --> O["가상 보컬"]
 O --> Q["명료도 · 음색 · 안정성 검증"]
 Q -.-> M
```


## 6. 자동 가창 및 MR 재생

[상세 설계](SINGING.md)

```mermaid
sequenceDiagram
 participant U as 사용자
 participant P as 악보·가사 편집기
 participant T as 공통 샘플 타임라인
 participant V as 발성 엔진
 participant M as MR 플레이어
 participant X as 믹서
 U->>P: 가사·MIDI·MR 불러오기
 P->>P: 음절과 음표 정렬 및 검수
 P->>T: 정규화된 스코어
 U->>T: 재생
 T->>M: 공통 시작 프레임에서 MR 예약
 T->>V: 음표 및 선행 조음 예약
 V->>X: 보컬 PCM
 M->>X: 반주 PCM
 X-->>U: 동기화된 음원
 U->>T: 탐색 또는 정지
 T->>V: 예약 취소·상태 재구축
 T->>M: 반주 위치 갱신
```


## 7. Voice Homage 데이터 및 권한

[상세 설계](VOICE_HOMAGE.md)

```mermaid
flowchart TD
 A["연구 자료"] --> B{"사용 범위와 권한 확인"}
 B -->|확인되지 않음| C["분석·저장 중단"]
 B -->|확인됨| D["로컬 음향 특성 관찰"]
 D --> E["독립 가상 보컬 설계"]
 E --> F["가창·표현 평가"]
 F --> G{"공개 권한과 합성 표시 확인"}
 G -->|비공개| H["로컬 프리셋"]
 G -->|공개 가능| I["가상 보컬 창작물"]
 H -.-> J["참여자 확인·삭제·철회"]
```


## 8. 가상 악기의 물리 원리

[상세 설계](VIRTUAL_INSTRUMENTS.md)

```mermaid
flowchart LR
 A["연주 제스처"] --> B["여진원: 활·해머·리드·호흡"]
 B --> C["진동체 및 공명기"]
 C --> D["감쇠·재질·결합"]
 D --> E["방사 음향"]
 E --> F["악기 PCM"]
 P["물리 파라미터"] --> B & C & D
```


## 9. IRIS 가상 오케스트라

[상세 설계](VIRTUAL_INSTRUMENTS.md)

```mermaid
flowchart TD
 S["악보 · MIDI · MusicXML"] --> C["공통 스코어 · 연주 해석"]
 AI["선택적 AI 작곡·편곡·지휘"] -.-> C
 subgraph EN["가상 앙상블"]
 direction LR
 ST["현악기"]
 WW["목관악기"]
 BR["금관악기"]
 PE["타악기"]
 KE["건반·전자악기"]
 VO["MVS 보컬·합창"]
 end
 C --> ST & WW & BR & PE & KE & VO
 ST & WW & BR & PE & KE & VO --> MX["트랙 믹서"]
 MX --> R["공연장 위치·반사·잔향"]
 R --> O["스테레오 / 오프라인 렌더"]
 MX --> STEM["독립 Stem 출력"]
```


## 10. 스레드 및 렌더 경계

[상세 설계](ARCHITECTURE.md)

```mermaid
flowchart TB
 subgraph MAIN["UI / 제어 스레드"]
 U["React 편집기"]
 Q["스코어·프리셋 검증"]
 U --> Q
 end
 subgraph WORK["오디오 스레드"]
 E["사전 준비된 이벤트 큐"]
 V["WASM / Rust 발성 DSP"]
 I["장기: 별도 악기 DSP"]
 M["믹서"]
 E --> V & I
 V & I --> M
 end
 Q --> E
 M --> O["오디오 출력"]
 V -.-> T["텔레메트리 · 제한된 갱신"]
 T -.-> U
 subgraph OFF["오프라인 연구"]
 R["음향 관찰 · 대규모 합주 렌더"]
 end
 R -.-> Q
```


## 11. 연구 로드맵

[상세 설계](ROADMAP.md)

```mermaid
flowchart TD
 P0["P0 설계 문서"] --> P1["P1 먀용 악보·MR PoC"]
 P1 --> P2["P2 FELIS"]
 P1 --> P3["P3 FELINE-01"]
 P2 & P3 --> P4["P4 자동 가창 스튜디오"]
 P4 --> P5["P5 정밀 음향"]
 P4 --> PV["P5-V Voice Homage"]
 P5 & PV --> P6["P6 3D·합창·IRIS"]
 P1 -.-> I0["I0 공통 악보 규격"]
 I0 --> I1["I1 물리 악기 PoC"]
 I1 --> I2["I2 악기 모델 확장"]
 I2 --> I3["I3 소규모 합주"]
 I3 --> I4["I4 오케스트라·공간 음향"]
 I4 --> I5["I5 AI 지휘·신종 악기"]
```


## 12. 포크 분리 및 출처

[상세 설계](PROVENANCE.md)

```mermaid
flowchart TD
 A["CHIMERA · Jameson Hodge · MIT"] --> B["초기 GitHub Fork"]
 B --> C["Leave Fork Network"]
 C --> D["MVS · 독립 파생 저장소"]
 A -.-> E["원본 저작권 · 라이선스 · 기술 계보"]
 E -.-> D
 D --> F["MVS 신규 연구 구상"]
 F --> G["고양이 · 하이브리드 · 가창 · 가상 악기"]
```

