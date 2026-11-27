"""Playwright smoke test: serve build.mjs output first, then provide its local URL."""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

from playwright.sync_api import expect, sync_playwright

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
    midi = artifacts / "선율.mid"
    midi.write_bytes(bytes.fromhex(
        "4d546864 00000006 0000 0001 01e0 4d54726b 00000015 "
        "00 90 45 64 83 60 45 00 81 70 48 7f 83 60 80 48 00 00 ff 2f 00"
    ))
    studio = Path(__file__).resolve().parents[1]
    xml_score, xml_wav = artifacts / "MusicXML 악보.json", artifacts / "CLI 보컬.wav"
    subprocess.run([sys.executable, studio / "musicxml.py", studio / "examples/meow.musicxml",
                    "--voice", "human", "--out", xml_score], check=True, capture_output=True)
    subprocess.run(["node", studio / "cli.mjs", "render", xml_score, "--out", xml_wav],
                   check=True, capture_output=True)
    expected_xml = xml_wav.read_bytes()
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
        expect(page.locator("#lrc-preview li")).to_have_count(2)
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
        page.locator("#midi-file").set_input_files(midi)
        page.wait_for_function("document.querySelector('#midi-track').length === 1")
        page.locator("#midi-lyrics").fill("먀")
        page.locator("#midi-apply").click()
        assert "개수" in page.locator("#status").inner_text()
        assert page.locator("#notes .note").count() == 5
        page.locator("#midi-lyrics").fill("먀\n용")
        page.locator("#midi-apply").click()
        assert page.locator("#notes .note").count() == 2
        assert page.locator('#notes .note input[name="midi"]').last.input_value() == "72"
        assert page.locator('#notes .note input[name="start"]').last.input_value() == "0.75"
        page.locator("#backing-file").set_input_files([])
        page.locator("#render").click()
        page.wait_for_function("document.querySelector('#status').textContent.includes('1.25')")
        with page.expect_download() as midi_wav:
            page.locator("#mix-download").click()
        with wave.open(str(midi_wav.value.path())) as audio:
            assert (audio.getframerate(), audio.getnframes()) == (44100, 55125)
        page.locator("#score-file").set_input_files(xml_score)
        expect(page.locator("#notes .note input[name=lyric]").first).to_have_value("먀")
        expect(page.locator("#notes .note input[name=midi]").last).to_have_value("61")
        expect(page.locator("#notes .note input[name=start]").last).to_have_value("1.5")
        page.locator("#render").click()
        expect(page.locator("#status")).to_contain_text("2.25")
        with page.expect_download() as xml_output:
            page.locator("#mix-download").click()
        xml_download = xml_output.value.path().read_bytes()
        assert xml_download == expected_xml, "MusicXML 변환 악보의 브라우저와 CLI WAV가 서로 다릅니다."
        if shot and width == 375:
            page.screenshot(path=str(shot / "studio-musicxml-mobile.png"), full_page=True)
        print(width, "px existing WAV SHA-256", hashlib.sha256(downloaded).hexdigest(),
              "MusicXML WAV SHA-256", hashlib.sha256(xml_download).hexdigest())
        assert not errors, errors
        assert not http_errors, http_errors
        page.close()
    browser.close()
