"""Playwright smoke test: serve build.mjs output first, then provide its local URL."""
import hashlib
import io
import os
from pathlib import Path
import sys
import tempfile
import wave

from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5847/"
shot = Path(sys.argv[2]) if len(sys.argv) > 2 else None
assert base.startswith(("http://127.0.0.1:", "http://localhost:"))
with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
    browser = p.chromium.launch(
        executable_path=os.environ.get("CHROMIUM_BIN"), args=["--no-sandbox"]
    )
    artifacts = Path(tmp)
    mr = artifacts / "반주.wav"
    with wave.open(str(mr), "wb") as w:
        w.setparams((1, 2, 16000, 0, "NONE", ""))
        w.writeframes((3200).to_bytes(2, "little", signed=True) * 64000)
    lrc = artifacts / "예제.lrc"
    lrc.write_text("[00:00.15]먀\n[00:00.66]용", encoding="utf-8")
    for width in [1440, 768, 375, 320]:
        page = browser.new_page(viewport={"width": width, "height": 1000}, accept_downloads=True)
        errors, http_errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: http_errors.append(response.url)
                if response.status >= 400 else None)
        page.goto(base)
        page.wait_for_function("document.querySelector('#notes').children.length === 5")
        assert page.evaluate("document.documentElement.scrollWidth") <= width
        if shot and width == 1440:
            shot.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(shot / "studio-desktop.png"), full_page=True)
        if shot and width == 375:
            page.screenshot(path=str(shot / "studio-mobile.png"), full_page=True)
        page.locator("#add-note").click()
        assert page.locator("#notes .note").count() == 6
        page.locator("#notes .remove").last.click()
        page.locator("#voice").select_option("cat")
        page.locator("#call").select_option("purr")
        page.locator("details.imports summary").click()
        page.locator("#lyric-file").set_input_files(lrc)
        assert page.locator("#lrc-preview li").count() == 2
        page.locator("#backing-file").set_input_files(mr)
        page.locator("#render").click()
        page.locator("#mix-download").wait_for(state="visible")
        assert "4초" in page.locator("#status").inner_text()
        with page.expect_download() as receive:
            page.locator("#mix-download").click()
        downloaded = receive.value.path().read_bytes()
        with wave.open(io.BytesIO(downloaded)) as audio:
            assert (audio.getframerate(), audio.getnframes(), audio.getnchannels()) == (44100, 176400, 1)
            assert int.from_bytes(audio.readframes(1), "little", signed=True) > 0
        print(width, "px WAV sha256", hashlib.sha256(downloaded).hexdigest())
        assert not errors, errors
        assert not http_errors, http_errors
        page.close()
    browser.close()
