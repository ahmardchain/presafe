#!/usr/bin/env python3
"""Adds a narrated voiceover to the Presafe demo video without cutting any speech.

1. Synthesises each script line as its own complete clip with Google Cloud Text-to-Speech
   (Chirp 3 HD voice). The API key is injected by the session's network proxy as the
   X-Goog-Api-Key header, so this script never holds it.
2. Fits the video to the voice: each scene keeps its own footage; if its line runs longer
   than the scene, the last frame is held; if the scene is much longer than its line, the
   scene plays faster (up to MAX_SPEEDUP) and any remainder stays as natural silence.
3. Muxes the result.

Engines:
  --engine edge (default): Microsoft Edge read-aloud neural voices via edge-tts, no key
                 (pip install edge-tts==7.2.3; default voice en-US-AndrewNeural). Uses HTTPS_PROXY if set.
  --engine google: Google Cloud Text-to-Speech, needs the X-Goog-Api-Key network secret.
  --engine gtts: Google Translate's voice via the gTTS library, no API key (pip install gTTS==2.5.4);
                 --tld picks the accent (com = US, co.uk = UK, com.ng = Nigeria, ...).

  --pitch F: shift the voice's pitch by factor F with ffmpeg's rubberband filter (formants shifted
             too), e.g. 0.72 turns gTTS's ~195 Hz voice into a ~140 Hz male-range voice.
  --nospeed 1,2: scenes that always play at normal speed (timed animations); spare time stays silent.
  --scenes a,b,...: scene boundaries in seconds when the video differs from the default cut
             (one more value than there are lines).

Usage: voiceover.py <silent video> <out.mp4> [--engine edge|google|gtts] [--voice en-US-AndrewNeural] [--tld com]
                    [--pitch 0.72] [--scenes 0,12.1,...] [--dry]
"""
import base64, json, os, subprocess, sys, urllib.request

LINES = [
    "You pay upfront for festival tickets, tours, custom orders. And when the business doesn't deliver, your money's usually just gone.",
    "Presafe fixes that. The business posts a USDC bond on NEAR, and gets a public badge. You pay, and the money goes straight to the business. It's not escrow. Only the bond waits. If they miss the date, you tap Claim, and you're paid back from the bond. No wallet. No gas.",
    "Here's the real app, live on NEAR testnet.",
    "Anyone can check that bond on a public badge, read live from the contract. No wallet needed.",
    "Here, a customer buys a two-dollar ticket. Before paying, they can see exactly what they'd get back. One tap. It's signed right in the browser and relayed as a NEAR meta transaction.",
    "They can also pay from Base, Arbitrum or Solana, through NEAR Intents. We've tested that route on mainnet.",
    "And the business? It already has the money.",
    "Then the deadline passes. No show.",
    "Once the grace period's over, anyone can open claims. The customer taps Claim, and gets paid back from the bond, without spending any gas.",
    "And the badge now shows the claim paid. Every number, on chain.",
    "Presafe. Paid upfront. Protected anyway.",
]
# Scene boundaries in the silent demo video (seconds), one scene per line, from ffmpeg scene detection.
SCENES = [0.0, 7.7, 22.8, 34.6, 54.7, 62.8, 69.5, 74.3, 99.1, 106.4, 112.73]
LEAD, TAIL, MAX_SPEEDUP = 0.4, 0.7, 1.8

def sh(*cmd):
    subprocess.run(cmd, check=True)

def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout)

def synth(text, voice, path):
    body = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": voice[:5], "name": voice},
        "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 48000},
    }).encode()
    req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize", data=body,
                                 headers={"Content-Type": "application/json", "X-Goog-Api-Key": "proxy-injected"})
    with urllib.request.urlopen(req, timeout=60) as r:
        audio = base64.b64decode(json.load(r)["audioContent"])
    open(path, "wb").write(audio)

def synth_gtts(text, tld, path):
    from gtts import gTTS  # pinned: gTTS==2.5.4
    mp3 = path[:-4] + ".mp3"
    gTTS(text=text, lang="en", tld=tld).save(mp3)
    trim_to_wav(mp3, path)

def trim_to_wav(mp3, path):
    # Trim leading/trailing silence so placement is exact.
    sh("ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-af",
       "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
       "-ar", "48000", path)

def synth_edge(text, voice, path):
    import asyncio, edge_tts  # pinned: edge-tts==7.2.3 (Microsoft Edge read-aloud neural voices, no key)
    mp3 = path[:-4] + ".mp3"
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    asyncio.run(edge_tts.Communicate(text, voice, proxy=proxy).save(mp3))
    trim_to_wav(mp3, path)

def main():
    args = sys.argv[1:]
    src, out = args[0], args[1]
    engine = args[args.index("--engine") + 1] if "--engine" in args else "edge"
    voice = args[args.index("--voice") + 1] if "--voice" in args else ("en-US-AndrewNeural" if engine == "edge" else "en-US-Chirp3-HD-Charon")
    tld = args[args.index("--tld") + 1] if "--tld" in args else "com"
    pitch = float(args[args.index("--pitch") + 1]) if "--pitch" in args else None
    scenes = [float(x) for x in args[args.index("--scenes") + 1].split(",")] if "--scenes" in args else SCENES
    # Scenes (1-based) that must play at normal speed, e.g. the timed stick-figure animations.
    nospeed = {int(x) for x in args[args.index("--nospeed") + 1].split(",")} if "--nospeed" in args else set()
    assert len(scenes) == len(LINES) + 1, "need one scene boundary more than there are lines"
    tag = (f"gtts-{tld}" if engine == "gtts" else voice) + (f"-p{pitch}" if pitch else "")
    work = os.path.join(os.path.dirname(os.path.abspath(out)), f"vo_work_{tag}"); os.makedirs(work, exist_ok=True)
    clips = []
    for i, text in enumerate(LINES):
        p = os.path.join(work, f"line{i+1}.wav")
        if not os.path.exists(p):
            raw = p[:-4] + ".raw.wav" if pitch else p
            if engine == "gtts":
                synth_gtts(text, tld, raw)
            elif engine == "edge":
                synth_edge(text, voice, raw)
            else:
                synth(text, voice, raw)
            if pitch:
                sh("ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af",
                   f"rubberband=pitch={pitch}:formant=shifted:pitchq=quality", "-ar", "48000", p)
        clips.append((p, duration(p)))
        print(f"line {i+1}: {clips[-1][1]:.2f}s")
    if "--dry" in args:
        return
    # Build per-scene video pieces and the audio timeline.
    vparts, delays, t = [], [], 0.0
    for i, (clip, adur) in enumerate(clips):
        s, e = scenes[i], scenes[i + 1]
        vdur = e - s
        need = LEAD + adur + TAIL + (1.0 if i == len(clips) - 1 else 0.0)
        if need >= vdur:          # voice is longer: keep footage, hold the last frame
            speed, hold, new = 1.0, need - vdur, need
        else:                     # footage is longer: speed up (bounded), rest stays silent
            speed = 1.0 if (i + 1) in nospeed else min(MAX_SPEEDUP, vdur / need)
            hold, new = 0.0, vdur / speed
        part = os.path.join(work, f"scene{i+1}.mp4")
        vf = f"trim=start={s}:end={e},setpts=(PTS-STARTPTS)/{speed:.4f}"
        if hold > 0:
            vf += f",tpad=stop_mode=clone:stop_duration={hold:.3f}"
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", vf + ",fps=30,format=yuv420p", "-an",
           "-c:v", "libx264", "-crf", "20", "-preset", "medium", part)
        vparts.append(part)
        delays.append(t + LEAD)
        actual = duration(part)  # frame rounding makes this differ slightly from `new`; use the real length
        print(f"scene {i+1}: video {vdur:.1f}s -> {actual:.2f}s (speed {speed:.2f}, hold {hold:.1f}s), voice at {t + LEAD:.1f}s")
        t += actual
    lst = os.path.join(work, "parts.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in vparts))
    video = os.path.join(work, "video.mp4")
    sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video)
    inputs, filt = [], []
    for i, ((clip, _), d) in enumerate(zip(clips, delays)):
        inputs += ["-i", clip]
        ms = int(d * 1000)
        filt.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(clips)))
    fc = ";".join(filt) + f";{mix}amix=inputs={len(clips)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
    audio = os.path.join(work, "voice.wav")
    sh("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, "-map", "[aout]", "-t", f"{t:.2f}", "-ar", "48000", audio)
    sh("ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
       "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out)
    print(f"wrote {out} ({t:.1f}s)")

if __name__ == "__main__":
    main()
