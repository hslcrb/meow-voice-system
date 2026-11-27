"""실제 작업실 화면과 믹스가 한 MP4에 들어가는지 검증."""
import array
import json
import math
import struct
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import wave

ROOT = Path(__file__).resolve().parents[2]


def command(*args):
    return subprocess.check_output(list(map(str, args)), cwd=ROOT)


def probe(path):
    return json.loads(command("ffprobe", "-v", "error", "-show_streams", "-of", "json", path))["streams"]


def exercise(directory):
    work = Path(directory)
    score = work / "나의 악보.json"
    score.write_text(json.dumps({
        "version": 1, "title": "야옹 검증", "voice": "human", "sampleRate": 16000,
        "end": 4, "notes": [{"start": 0.5, "duration": 0.5, "midi": 57, "lyric": "야옹"},
                            {"start": 2, "duration": 0.5, "midi": 60, "lyric": "안녕"}],
    }, ensure_ascii=False), encoding="utf-8")
    backing = work / "나의 반주.wav"
    with wave.open(str(backing), "wb") as wav:
        wav.setparams((2, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(b"".join(struct.pack("<hh", *([int(2000 * math.sin(i * 0.11))] * 2))
                                 for i in range(64000)))
    wav = work / "기준.wav"
    command("node", "studio/cli.mjs", "render", score, "--backing", backing, "--out", wav)
    score_before, backing_before = score.read_bytes(), backing.read_bytes()
    cli = [sys.executable, "studio/capture.py", score, work / "작업실.mp4",
           "--backing", backing, "--fps", 8, "--width", 1200, "--height", 900]
    output = cli[3]
    command(*cli)
    video, audio = probe(output)
    assert (video["codec_name"], video["width"], video["height"], video["nb_frames"]) == ("h264", 1200, 900, "32"), video
    assert (audio["codec_name"], audio["sample_rate"], audio["channels"]) == ("aac", "16000", 1), audio
    assert abs(float(video["duration"]) - 4) < 0.002
    assert abs(float(audio["duration"]) - 4) < 0.002
    assert float(video["start_time"]) == float(audio["start_time"]) == 0, (video, audio)

    def pcm(path):
        return array.array("h", command("ffmpeg", "-v", "error", "-i", path, "-vn", "-f", "s16le", "-"))

    expected, rendered = pcm(wav)[2048:-2048], pcm(output)[2048:61952]
    dot = sum(a*b for a, b in zip(expected, rendered))
    ratio = dot / math.sqrt(sum(x*x for x in expected) * sum(x*x for x in rendered))
    assert ratio > 0.97, ratio
    samples = command("ffmpeg", "-v", "error", "-i", output, "-an", "-vf",
                      "select=eq(n\\,0)+eq(n\\,16)", "-f", "framemd5", "-").decode().splitlines()
    hashes = [line.rsplit(",", 1)[-1].strip() for line in samples if line.startswith("0,")]
    assert len(hashes) == 2 and len(set(hashes)) == 2, hashes
    first = output.read_bytes()
    retry = subprocess.run(list(map(str, cli)), capture_output=True, cwd=ROOT)
    assert retry.returncode and output.read_bytes() == first
    assert score.read_bytes() == score_before and backing.read_bytes() == backing_before
    mobile = work / "모바일.mp4"
    command(sys.executable, "studio/capture.py", score, mobile,
            "--seconds", 1.03, "--fps", 6, "--width", 376, "--height", 720)
    mobile_video, mobile_audio = probe(mobile)
    assert (mobile_video["width"], mobile_video["height"], mobile_video["nb_frames"]) == (376, 720, "7"), mobile_video
    assert 0 <= float(mobile_video["duration"]) - 1.03 < 1 / 6
    assert abs(float(mobile_audio["duration"]) - 1.03) < 0.002, mobile_audio
    invalid = work / "잘못된 악보.json"
    invalid.write_text("{}", encoding="utf-8")
    bad = work / "not-created.mp4"
    failed = subprocess.run([sys.executable, "studio/capture.py", invalid, bad],
                            cwd=ROOT, capture_output=True)
    assert failed.returncode == 2 and not bad.exists()
    print(f"studio capture: 32 frames, H.264/AAC, 4s, PCM correlation {ratio:.5f}, differing frames, inputs preserved")


if __name__ == "__main__":
    with TemporaryDirectory(prefix="mvs-capture-test-") as directory:
        exercise(directory)

