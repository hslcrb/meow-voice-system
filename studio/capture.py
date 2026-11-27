"""Record the actual MVS editing/playback interface and its own rendered WAV."""
import argparse
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from threading import Thread
import wave

from playwright.sync_api import Error as BrowserError, sync_playwright

STUDIO = Path(__file__).resolve().parent


class StaticAssets(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript"}

    def log_message(self, *_args):
        pass


@contextmanager
def local_studio(directory):
    handler = partial(StaticAssets, directory=directory)
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


def capture(work, args):
    assets = work / "studio"
    subprocess.run(["node", str(STUDIO / "build.mjs"), str(assets)], check=True)
    sound = work / "sound.wav"
    with local_studio(assets) as origin, sync_playwright() as api:
        browser = api.chromium.launch(executable_path=os.environ.get("CHROMIUM_BIN"))
        try:
            context = browser.new_context(
                viewport={"width": args.width, "height": args.height}, device_scale_factor=1,
                reduced_motion="reduce", service_workers="block", accept_downloads=True,
            )
            context.route("**/*", lambda route: route.continue_()
                          if route.request.url.startswith(origin + "/") else route.abort())
            page = context.new_page()
            page.goto(origin + "/", wait_until="domcontentloaded")
            status = page.locator("#status")
            page.wait_for_function("""() => {
                const status = document.querySelector('#status');
                return status.hasAttribute('data-error') || status.textContent.startsWith('예제가 준비됐어요.');
            }""")
            if status.get_attribute("data-error") is not None:
                raise ValueError(status.inner_text())

            page.locator("#score-file").set_input_files(args.score)
            page.wait_for_function("""() => {
                const status = document.querySelector('#status');
                return status.hasAttribute('data-error') || status.textContent.endsWith('악보를 불러왔어요.');
            }""")
            if status.get_attribute("data-error") is not None:
                raise ValueError(status.inner_text())
            if args.backing is not None:
                page.locator("#backing-file").set_input_files(args.backing)

            page.locator("#render").click()
            page.wait_for_function("""() => {
                const status = document.querySelector('#status');
                return status.hasAttribute('data-error') || !document.querySelector('#downloads').hidden;
            }""")
            if status.get_attribute("data-error") is not None:
                raise ValueError(status.inner_text())

            with page.expect_download() as download:
                page.locator("#mix-download").click()
            download.value.save_as(sound)
            with wave.open(str(sound), "rb") as wav:
                total = wav.getnframes() / wav.getframerate()
            seconds = min(total, args.seconds) if args.seconds is not None else total
            if not 0 < seconds <= 30:
                raise ValueError("영상은 한 번에 30초까지. 긴 음원은 --seconds로 앞부분을 지정하세요.")

            player = page.locator("#player")
            player.evaluate("audio => { audio.preload = 'auto'; audio.load(); }")
            page.wait_for_function("document.querySelector('#player').readyState >= 2")
            player.scroll_into_view_if_needed()
            page.mouse.move(0, 0)
            for number in range(math.ceil(seconds * args.fps)):
                player.evaluate("(audio, time) => { audio.currentTime = time; }", number / args.fps)
                page.wait_for_function("!document.querySelector('#player').seeking")
                page.screenshot(path=work / f"{number:05}.png", animations="disabled")
        finally:
            browser.close()
    return seconds


def main():
    parser = argparse.ArgumentParser(description="실제 먀용 작업실의 편집·재생 화면과 믹스를 MP4로 저장")
    parser.add_argument("score", type=Path, help="작업실 악보 JSON")
    parser.add_argument("output", type=Path, help="아직 존재하지 않는 MP4")
    parser.add_argument("--backing", type=Path, help="선택: 로컬 PCM16 WAV")
    parser.add_argument("--seconds", type=float, help="전체 대신 앞부분, 최대 30초")
    parser.add_argument("--width", type=int, default=1200)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--fps", type=int, default=24, choices=range(6, 31), metavar="6..30")
    args = parser.parse_args()
    if (args.output.suffix.lower() != ".mp4" or args.output.exists()
            or not args.output.parent.is_dir() or not all(map(shutil.which, ("node", "ffmpeg")))):
        parser.error("Node·FFmpeg와, 존재하는 폴더 안의 새 .mp4 출력 경로가 필요합니다.")
    if any(value % 2 or not 320 <= value <= limit
           for value, limit in ((args.width, 1920), (args.height, 1200))):
        parser.error("너비 320–1920, 높이 320–1200 사이의 짝수를 입력하세요.")
    if args.seconds is not None and not 0 < args.seconds <= 30:
        parser.error("--seconds는 0초보다 크고 30초 이하여야 합니다.")

    try:
        with tempfile.TemporaryDirectory(prefix="mvs-capture-") as directory:
            work = Path(directory)
            seconds = capture(work, args)
            video = work / "capture.mp4"
            subprocess.run([
                "ffmpeg", "-n", "-v", "error", "-framerate", str(args.fps),
                "-i", str(work / "%05d.png"), "-i", str(work / "sound.wav"),
                "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium",
                "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
                "-b:a", "192k", "-af", f"atrim=duration={seconds:.9f}", "-movflags", "+faststart", str(video),
            ], check=True)
            with video.open("rb") as source, args.output.open("xb") as output:
                shutil.copyfileobj(source, output)
    except (BrowserError, OSError, ValueError, wave.Error, subprocess.CalledProcessError) as error:
        parser.exit(2, f"작업실 영상을 만들지 못했어요. {error}\n")
    print(f"{args.output}: 작업실 · {args.width}×{args.height} · {args.fps} fps · {seconds:g}초")


if __name__ == "__main__":
    main()
