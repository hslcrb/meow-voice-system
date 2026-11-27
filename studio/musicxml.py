"""오프라인 MusicXML 가창 파트 → MVS 작업실 악보 변환기(표준 라이브러리만)."""
import argparse
from decimal import Decimal, localcontext
import json
from pathlib import Path
import re
import stat
import sys
from xml.etree import ElementTree as ET

BYTE_LIMIT = 2_000_000
PITCH_STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
SOUND_PARAMS = {"tempo", "dynamics", "id", "pan", "elevation"}
UNSUPPORTED_DIRECTION = {"octave-shift", "segno", "coda", "harp-pedals"}


def read_score(path):
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError("일반 MusicXML 파일을 선택해 주세요.")
    with path.open("rb") as file:
        payload = file.read(BYTE_LIMIT + 1)
    if len(payload) > BYTE_LIMIT:
        raise ValueError("MusicXML 파일 크기는 2,000,000바이트까지 지원합니다.")
    if payload.startswith(b"PK"):
        raise ValueError("압축 MXL 대신 압축하지 않은 MusicXML을 저장해 주세요.")
    source = payload.decode("utf-8-sig")
    if "\x00" in source:
        raise ValueError("UTF-8 MusicXML만 열 수 있습니다.")
    if "<!DOCTYPE" in source or "<!ENTITY" in source:
        raise ValueError("DOCTYPE과 ENTITY 선언을 읽지 않습니다. DTD 없는 UTF-8 MusicXML로 저장해 주세요.")
    return ET.fromstring(source)


def decimal(raw, label, lo, hi):
    if not re.fullmatch(r"[+-]?(?:[0-9]{1,9}(?:\.[0-9]{0,9})?|\.[0-9]{1,9})", raw or ""):
        raise ValueError(f"{label}에 유한한 십진수를 적어 주세요.")
    result = Decimal(raw)
    if not lo <= result <= hi:
        raise ValueError(f"{label}은 {lo}~{hi} 범위여야 합니다.")
    return result


def integer(raw, label, lo, hi):
    value = decimal(raw, label, lo, hi)
    if value != int(value):
        raise ValueError(f"{label}은 정수여야 합니다.")
    return int(value)


def midi_value(note):
    pitch = note.find("pitch")
    if pitch is None or pitch.findtext("step") not in PITCH_STEPS:
        raise ValueError("음표에 C~B의 표준 음높이가 필요합니다.")
    step = PITCH_STEPS[pitch.findtext("step")]
    octave = integer(pitch.findtext("octave"), "옥타브", 0, 9)
    alter = integer(pitch.findtext("alter", "0"), "정수 음정 변화", -12, 12)
    value = (octave + 1) * 12 + step + alter
    if not 0 <= value <= 127:
        raise ValueError("MIDI 0~127 범위의 음높이만 지원합니다.")
    return value


def selected_lyric(note, verse):
    entries = [entry for entry in note.findall("lyric")
               if verse is None or entry.get("number", "1") == verse]
    if len(entries) > 1:
        raise ValueError("가사 절이 여러 개입니다. 번호를 확인하고 --verse를 지정해 주세요.")
    if not entries:
        return None
    entry = entries[0]
    words = entry.findall("text")
    if len(words) != 1 or len(words[0]) or any(
        item.tag not in {"text", "syllabic"} for item in entry
    ):
        raise ValueError("한 음표에 단일 <text>만 지원합니다. 멜리스마·엘리전은 검수한 JSON을 사용해 주세요.")
    result = (words[0].text or "").strip()
    if not result or len(result) > 32:
        raise ValueError("가사는 음표당 양끝 공백을 제외하고 1~32자로 넣어 주세요.")
    return result


def new_tempo(node, current):
    sound = node if node.tag == "sound" else node.find("sound")
    if node.tag == "direction":
        directions = list(node.iter("direction-type"))
        if any(item.tag in UNSUPPORTED_DIRECTION for types in directions for item in types):
            raise ValueError("옥타브 이동이나 재생 순서 표시는 지원하지 않습니다.")
        if node.find(".//metronome") is not None and (sound is None or "tempo" not in sound.attrib):
            raise ValueError("메트로놈 기호와 함께 템포(sound tempo)의 4분음표 BPM을 적어 주세요.")
    if sound is None:
        return current
    if len(node.findall("sound")) > 1 or set(sound.attrib) - SOUND_PARAMS or len(sound):
        raise ValueError("오프셋·재생 순서·스윙 없는 sound tempo만 지원합니다.")
    if node.find("offset") is not None:
        raise ValueError("오프셋이 있는 템포 대신 경계 위치에 sound tempo를 적어 주세요.")
    raw = sound.get("tempo")
    return current if raw is None else decimal(raw, "4분음표 템포", Decimal("0.001"), 9999)


def parse_score(root, voice, verse):
    parts = root.findall("part")
    if root.tag != "score-partwise" or len(parts) != 1:
        raise ValueError("score-partwise 형식의 보컬 파트 하나만 지원합니다.")
    title = (root.findtext("movement-title") or root.findtext("work/work-title") or "MusicXML 가창").strip()
    notes, elapsed, divisions, tempo, open_tie = [], Decimal(0), None, None, None
    voices, staffs = set(), set()
    trailing_rest = False
    all_verses = {entry.get("number", "1") for entry in parts[0].iter("lyric")}
    if verse is None and len(all_verses) > 1:
        raise ValueError("가사 절이 여러 개입니다. --verse로 절 번호를 지정해 주세요.")
    for measure in parts[0].findall("measure"):
        for node in measure:
            if node.tag == "attributes":
                if node.find("transpose") is not None or node.find("for-part") is not None:
                    raise ValueError("이조가 있는 파트는 실제 울리는 음높이 악보로 먼저 변환해 주세요.")
                raw = node.findtext("divisions")
                if raw is not None:
                    divisions = decimal(raw, "4분음표 divisions", Decimal("0.001"), 999_999)
            elif node.tag in {"direction", "sound"}:
                tempo = new_tempo(node, tempo)
            elif node.tag in {"backup", "forward"}:
                raise ValueError("다성이나 backup·forward를 사용한 파일은 지원하지 않습니다. 쉼표 노트를 사용해 주세요.")
            elif node.tag == "barline" and (node.find("repeat") is not None or node.find("ending") is not None):
                raise ValueError("반복 기호나 1·2번 괄호는 펼친 단선율로 저장해 주세요.")
            elif node.tag == "note":
                voices.add(node.findtext("voice", "1"))
                staffs.add(node.findtext("staff", "1"))
                if len(voices) > 1 or len(staffs) > 1 or any(
                    node.find(item) is not None for item in ("chord", "grace", "cue", "unpitched")
                ):
                    raise ValueError("한 성부의 표준 음정·쉼표만 지원합니다. 화음·꾸밈음·타악기를 확인해 주세요.")
                if {"attack", "release", "time-only"} & set(node.attrib):
                    raise ValueError("어택·릴리즈 시각 변경이나 횟수별 재생 기능은 지원하지 않습니다.")
                if divisions is None or tempo is None:
                    raise ValueError("첫 음표나 쉼표 전에 divisions와 명시적 템포(sound tempo)를 적어 주세요.")
                duration = decimal(node.findtext("duration"), "음표 duration", Decimal("0.000001"), 999_999)
                start = elapsed
                elapsed += duration / divisions * 60 / tempo
                if elapsed > 300:
                    raise ValueError("작업실 악보는 5분까지 지원합니다.")
                is_rest = node.find("rest") is not None
                trailing_rest = is_rest
                ties = node.findall("tie")
                tie = {edge.get("type") for edge in ties}
                if tie - {"start", "stop"} or len(tie) != len(ties) or any(
                    set(edge.attrib) != {"type"} for edge in ties
                ) or (node.find(".//tied") is not None and not tie):
                    raise ValueError("지원하지 않는 붙임줄입니다. 소리용 tie 시작·끝을 확인해 주세요.")
                if any(node.find(f".//{tag}") is not None for tag in ("ornaments", "glissando", "slide", "bend", "fermata")):
                    raise ValueError("실연 시 음정이나 시각을 바꾸는 기호는 미리 악보에 풀어 써 주세요.")
                words = selected_lyric(node, verse)
                if is_rest:
                    if open_tie is not None or tie or words is not None:
                        raise ValueError("쉼표를 가사나 붙임줄에 연결할 수 없습니다.")
                    continue
                midi = midi_value(node)
                if "stop" in tie:
                    if open_tie is None or open_tie[1] != midi or (words is not None and words != open_tie[2]):
                        raise ValueError("붙임줄의 음정이나 가사가 시작 음표와 다릅니다.")
                    start, midi, words = open_tie
                elif open_tie is not None:
                    raise ValueError("붙임줄이 끝나기 전에 다른 음표가 나왔습니다.")
                elif words is None:
                    raise ValueError("음표의 내장 가사가 비어 있습니다. 가사 절 또는 원본 악보를 확인해 주세요.")
                if "start" in tie:
                    open_tie = (start, midi, words)
                    continue
                open_tie = None
                length = float(elapsed - start)
                if length < 0.02:
                    raise ValueError("붙임줄을 포함한 한 음표는 0.02초 이상이어야 합니다.")
                notes.append({"start": float(start), "duration": length, "midi": midi, "lyric": words})
                if len(notes) > 5000:
                    raise ValueError("악보 한 개에 최대 5,000개 음표를 지원합니다.")
    if open_tie is not None or not notes:
        raise ValueError("음표가 없거나 마지막 붙임줄이 닫히지 않았습니다.")
    result = {"version": 1, "title": title[:120], "voice": voice, "notes": notes}
    if trailing_rest:
        result["end"] = float(elapsed)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="DTD 없는 UTF-8 단선율 악보")
    parser.add_argument("--out", type=Path, required=True, help="새 작업실 .json 파일")
    parser.add_argument("--voice", choices=("cat", "human", "hybrid"), default="hybrid")
    parser.add_argument("--verse", help="내장 가사의 number 속성. 없으면 1.")
    args = parser.parse_args(argv)
    try:
        if args.out.suffix.lower() != ".json":
            raise ValueError("출력은 새 .json 파일이어야 합니다.")
        with localcontext() as ctx:
            ctx.prec = 40
            result = parse_score(read_score(args.input), args.voice, args.verse)
        encoded = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        with args.out.open("x", encoding="utf-8") as file:
            file.write(encoded)
    except (ValueError, OSError, ET.ParseError) as error:
        print(f"MusicXML 가져오기 실패: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"out": str(args.out), "notes": len(result["notes"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
