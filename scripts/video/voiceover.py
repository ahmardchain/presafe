#!/usr/bin/env python3
"""Adds a narrated voiceover to the Presafe demo video without cutting any speech.

1. Synthesises each script line as its own complete clip with Google Cloud Text-to-Speech
   (Chirp 3 HD voice). The API key is injected by the session's network proxy as the
   X-Goog-Api-Key header, so this script never holds it.
2. Fits the video to the voice: each scene keeps its own footage; if its line runs longer
   than the scene, the last frame is held; if the scene is much longer than its line, the
   scene plays faster (up to MAX_SPEEDUP) and any remainder stays as natural silence.
3. Muxes the result.

Usage: voiceover.py <silent video> <out.mp4> [--voice en-US-Chirp3-HD-Charon] [--dry]
"""
import base64, json, os, subprocess, sys, urllib.request

LINES = [
    "You pay upfront for festival tickets, tours, custom orders. And when the business doesn't deliver, your money's usually just gone.",
    "Presafe fixes that. The business posts a USDC bond on NEAR, and it keeps every payment the moment it arrives. So it's not escrow. Only the bond waits.",
    "Anyone can check that bond on a public badge, read live from the contract. No wallet needed.",
    "Here, a customer buys a two-dollar ticket. Before paying, they can see exactly what they'd get back. One tap. No wallet, no gas. It's signed right in the browser and relayed as a NEAR meta transaction.",
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

def main():
    args = sys.argv[1:]
    src, out = args[0], args[1]
    voice = args[args.index("--voice") + 1] if "--voice" in args else "en-US-Chirp3-HD-Charon"
    work = os.path.join(os.path.dirname(os.path.abspath(out)), "vo_work"); os.makedirs(work, exist_ok=True)
    clips = []
    for i, text in enumerate(LINES):
        p = os.path.join(work, f"line{i+1}.wav")
        if not os.path.exists(p):
            synth(text, voice, p)
        clips.append((p, duration(p)))
        print(f"line {i+1}: {clips[-1][1]:.2f}s")
    if "--dry" in args:
        return
    # Build per-scene video pieces and the audio timeline.
    vparts, delays, t = [], [], 0.0
    for i, (clip, adur) in enumerate(clips):
        s, e = SCENES[i], SCENES[i + 1]
        vdur = e - s
        need = LEAD + adur + TAIL
        if need >= vdur:          # voice is longer: keep footage, hold the last frame
            speed, hold, new = 1.0, need - vdur, need
        else:                     # footage is longer: speed up (bounded), rest stays silent
            speed = min(MAX_SPEEDUP, vdur / need)
            hold, new = 0.0, vdur / speed
        part = os.path.join(work, f"scene{i+1}.mp4")
        vf = f"trim=start={s}:end={e},setpts=(PTS-STARTPTS)/{speed:.4f}"
        if hold > 0:
            vf += f",tpad=stop_mode=clone:stop_duration={hold:.3f}"
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", vf + ",fps=30,format=yuv420p", "-an",
           "-c:v", "libx264", "-crf", "20", "-preset", "medium", part)
        vparts.append(part)
        delays.append(t + LEAD)
        print(f"scene {i+1}: video {vdur:.1f}s -> {new:.1f}s (speed {speed:.2f}, hold {hold:.1f}s), voice at {t + LEAD:.1f}s")
        t += new
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
       "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out)
    print(f"wrote {out} ({t:.1f}s)")

if __name__ == "__main__":
    main()
