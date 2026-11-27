"""Record the MVS playback stage as a fixed-size MP4, without a network connection."""
import argparse
import base64
import io
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import wave

from playwright.sync_api import sync_playwright

def main():
    parser = argparse.ArgumentParser(description="먀용 무대 HTML을 WAV와 동기화한 MP4로 변환")
    parser.add_argument("stage", type=Path, help="CLI show 명령으로 생성한 HTML")
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=int, default=24, choices=range(6, 31), metavar="6..30")
    parser.add_argument("--seconds", type=float, help="전체 대신 앞 구간만, 0~30초")
    args = parser.parse_args()

    if args.output.suffix.lower() != ".mp4" or args.output.exists() or not shutil.which("ffmpeg"):
        parser.error("아직 없는 .mp4 출력 경로와 FFmpeg가 필요합니다.")
    if args.stage.stat().st_size > 100_000_000:
        parser.error("무대 HTML이 너무 큽니다.")
    html = args.stage.read_text(encoding="utf-8")
    if "MVS ★ OFFLINE SHOW" not in html:
        parser.error("MVS show 명령으로 만든 무대 HTML만 사용하세요.")
    audio = re.search(r'src="data:audio/wav;base64,([A-Za-z0-9+/=]+)"', html)
    if not audio:
        parser.error("무대에서 내장 WAV를 찾지 못했습니다.")
    pcm = base64.b64decode(audio[1], validate=True)
    with wave.open(io.BytesIO(pcm)) as wav:
        total = wav.getnframes() / wav.getframerate()
    seconds = min(total, args.seconds) if args.seconds is not None else total
    if not math.isfinite(seconds) or not 0 < seconds <= 30:
        parser.error("영상 렌더는 한 번에 30초까지. 긴 무대는 --seconds로 지정하세요.")
    frames = math.ceil(seconds * args.fps)
    with tempfile.TemporaryDirectory(prefix="mvs-film-") as directory:
        work = Path(directory)
        (work / "sound.wav").write_bytes(pcm)
        with sync_playwright() as browser_api:
            browser = browser_api.chromium.launch(executable_path=os.environ.get("CHROMIUM_BIN"))
            page = browser.new_page(viewport={"width": 1280, "height": 720}, offline=True)
            page.set_content(html, wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('audio')?.readyState >= 1")
            for i in range(frames):
                page.evaluate("""t => {
                    const a = document.querySelector('audio');
                    a.currentTime = t;
                    a.dispatchEvent(new Event('timeupdate'));
                    const lit = document.querySelector('li.active');
                    if (lit && (lit.getBoundingClientRect().bottom > innerHeight - 12 ||
                               lit.getBoundingClientRect().top < 0)) {
                        lit.scrollIntoView({block:'center', behavior:'instant'});
                    }
                }""", i / args.fps)
                page.screenshot(path=str(work / f"{i:05}.png"), animations="disabled")
            browser.close()
        subprocess.run([
            "ffmpeg", "-n", "-v", "error", "-framerate", str(args.fps),
            "-i", str(work / "%05d.png"), "-i", str(work / "sound.wav"),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-t", str(seconds),
            "-movflags", "+faststart", str(args.output),
        ], check=True)
    print(f"{args.output}: 1280×720 · {args.fps} fps · {seconds:g}초")

if __name__ == "__main__":
    main()
