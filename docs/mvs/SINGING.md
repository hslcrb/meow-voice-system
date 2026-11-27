# 자동 가창 및 MR 동기화

상태: 설계 계약 v0.1. 예시는 신규 MVS 포맷이며 기존 CLI 입력 스키마와 동일하다고 가정하지 않는다.

## 1. 입력과 신뢰도

| 입력 | 형식 | 역할 |
|---|---|---|
| 가사 | TXT, LRC, enhanced LRC, JSON | 가창 문자열 및 문장/음절 시간 |
| 음정 | MIDI, MusicXML, JSON, F0 CSV | 멜로디, 음높이, 음표 길이, 쉼표 |
| 반주 | WAV, MP3 등 브라우저 지원 포맷 | MR/노래방 반주, 전주·간주·후주 |
| 참고 보컬(선택) | 사용자 제공 음원 | 음절 정렬과 F0 추출용, 합성에 직접 샘플 재생하지 않음 |
| 메타데이터 | JSON | 언어, 버전, BPM/템포 맵, 조성, offset, 권리/출처 |

동일한 곡이라도 편곡과 MR 버전이 다르면 시간축이 달라진다. MR의 실제 파일 길이, 시작 오프셋, 해시와 악보 버전을 고정한다. 행 단위 LRC만으로 음절 타이밍은 확정되지 않고, MR만으로 원래 보컬 멜로디를 유일하게 복원할 수도 없다. 명시 악보/음절 타임스탬프 우선, 부족할 때 선택적 분석(모노 보컬 F0 추정, forced alignment), 마지막으로 수동 편집. 불확실 구간은 confidence와 경고를 표시한다.

## 2. 파이프라인

~~~mermaid
flowchart TD
 L[가사 TXT/LRC] --> P[언어별 G2P 및 음절 분리]
 N[MIDI/MusicXML/F0] --> T[템포 맵과 노트 정규화]
 M[MR 오디오] --> S[기준 오디오 시간축]
 P --> A[음절과 음표 정렬]
 T --> A
 S --> A
 R[선택적 참고 보컬 분석] --> A
 A --> E[피아노 롤 검수]
 E --> G[음소 및 조음 제스처 스케줄]
 V[가상 발성기관 프리셋] --> G
 G --> F[Rust 물리 합성]
 F --> X[보컬 MR 믹서]
 S --> X
 X --> O[실시간 재생 또는 WAV]
~~~

MIDI는 템포 이벤트와 PPQ를 초로 변환하고 다중 트랙 중 보컬 라인을 선택한다. MusicXML은 반복, 붙임줄, 쉼표 및 멜리스마를 정규화한다. LRC offset을 적용하되 원본과 정규화 값을 보관한다. 기준 시각은 반주 PCM의 sample 0이다. 입력 타임스탬프를 canonical microseconds로 표현하고 렌더 시 정수 샘플 프레임으로 변환한다.

## 3. 데이터 예시

다음은 대화에서 만든 독자적인 '먀용' 테스트 문구와 임의 멜로디다. 상업곡 가사/악보가 아니다.

~~~json
{
  "schemaVersion": 1,
  "songId": "meow-original-demo",
  "language": "ko",
  "timeUnit": "us",
  "sampleRate": 48000,
  "accompaniment": {
    "assetId": "local-demo-mr",
    "offsetUs": 0,
    "rights": "user-owned-or-permitted"
  },
  "tempoMap": [{"atUs": 0, "bpm": 120}],
  "voice": {
    "profile": "human-feline",
    "felineRatio": 0.35,
    "purr": 0.15,
    "vibrato": 0.25,
    "breathiness": 0.45
  },
  "syllables": [
    {"id": "s1", "text": "먀", "startUs": 1000000, "endUs": 1500000},
    {"id": "s2", "text": "용", "startUs": 1500000, "endUs": 2500000}
  ],
  "notes": [
    {"id": "n1", "syllableId": "s1", "startUs": 1000000, "durationUs": 500000, "midi": 72, "velocity": 0.7},
    {"id": "n2", "syllableId": "s2", "startUs": 1500000, "durationUs": 1000000, "midi": 76, "velocity": 0.75}
  ]
}
~~~

MIDI 69 = A4 = 440 Hz. F0 = 440 * 2^((midi-69)/12). 시간은 정수 마이크로초, 음량/스타일은 0..1, MIDI 음표는 0..127. 멜리스마는 동일 syllableId의 여러 노트로 표현한다. 쉼표는 음표 없음으로 표현한다. 추후 phonemes[], pitchCurve[], breathEvents[], confidence 및 provenance를 추가한다. polyphony는 여러 트랙으로 표현하고 한 성대 트랙에 충돌하는 노트는 오류로 처리한다.

검증: 유한한 숫자, 양의 지속시간, 시간 정렬, 고유 ID, 참조 무결성, 보컬과 MR 길이, 프리셋의 음역, 허용 포맷/용량. 무리한 음정은 자동으로 숨기지 말고 표시하여 키 이동 또는 명시적 보정 선택을 받는다.

## 4. 가사부터 소리까지

한국어 초성/중성/종성과 발음 규칙을 기존 프런트엔드에 맡기고, 음표 시작에 모음 핵이 도달하도록 초성 제스처를 선행한다. 장음/멜리스마는 모음 유지, 종성은 적절한 종료 시간에 배치한다. 받침과 연음은 실제 다음 음절을 고려한다. 숨을 쉴 위치를 쉼표 및 호흡 이벤트로 설정하고, 짧은 음표에서 자음이 모음을 과도하게 침범하지 않게 한다. 피치 벤드/비브라토/강세/호흡감은 노트 타이밍과 별도 제어 곡선이다.

기존 `phonetics/sing.rs`의 SungNote, plan_song, melisma 계획 및 `control/singer.rs`의 라이브 제어를 재사용한다. `tools/musicxml-to-notes.ts`와 CLI `render notes`를 첫 렌더 경로로 삼되, MVS 포맷을 실제 기존 스키마로 변환하는 어댑터를 만든다. 임의 멜로디를 생성하는 기존 Sing 경로와 외부 정확한 악보 재현 모드를 구분한다.

## 5. 반주 믹싱과 출력

AudioContext.currentTime/정수 샘플 프레임을 기준으로 MR과 보컬을 동일한 시작점에서 예약한다. UI 시계나 setTimeout을 음표 발음 기준으로 사용하지 않는다. seek 시 기존 노트/이벤트를 취소하고 발성 상태를 재구축하며, 필요하면 앞 구간을 프리롤한다. pause/resume, 반복구간, 재시작 및 기기 샘플레이트 전환을 검증한다. 처리 지연/출력 지연을 구분하고 필요 시 보정 오프셋을 적용한다.

MR과 보컬 개별 게인/팬, 선택적 EQ/컴프레서, 리미터와 클리핑 표시. 오프라인에서는 동일 악보·프리셋·시드로 보컬을 렌더한 뒤 동일 기준 샘플레이트로 MR과 합성한다. 보컬 stem, MR stem, mix WAV와 프로젝트 JSON을 별도 출력한다. 피치만 이동하는 경우 MR도 동일 키로 변경하거나 불일치를 표시한다. 템포 변경은 반주의 타임 스트레치와 악보 시간 맵을 함께 갱신한다.

권리가 확인되지 않은 실제 가사/악보/MR/참고 음원은 저장소에 넣지 않는다. 테스트는 직접 만든 짧은 멜로디와 합성 반주로 한다.
