/* Export the trace slide's gateway-pulse animation to exports/gateway-pulse.gif
   and .mp4 (one full loop, real timing), e.g. for embedding in Google Slides.

   Usage:  node scripts/export-gateway-pulse.js
   Needs:  the revealjs skill's node_modules (puppeteer) and ffmpeg on PATH.

   How it works: puppeteer opens the deck at #/trace (no ?export, so the GSAP
   animation runs), restarts the master timeline at 0, and records one full
   loop via CDP Page.startScreencast. Chrome pushes a frame on every repaint
   with a wall-clock timestamp, so static holds keep their real length (the
   naive page.screencast() recorder compresses them). The timestamped frames
   are then encoded with ffmpeg's concat demuxer: a looping 15 fps GIF and a
   30 fps H.264 MP4, cropped to the .pdiag-panel. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const puppeteer = require(path.join(
  REPO,
  ".agents/skills/revealjs/node_modules/puppeteer"
));

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-pulse-"));
  const outDir = path.join(REPO, "exports");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  // 2x the deck's 1280x720 so Reveal scales up and the capture is crisp
  await page.setViewport({ width: 2560, height: 1440, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(
    "file://" + path.join(REPO, "presentation.html") + "#/trace",
    { waitUntil: "networkidle0" }
  );

  const info = await page.evaluate(async () => {
    let tl = null;
    for (let i = 0; i < 200 && !tl; i++) {
      if (typeof gsap !== "undefined") {
        tl = gsap.globalTimeline
          .getChildren(true, false, true)
          .find((t) => t.repeat && t.repeat() === -1);
      }
      if (!tl) await new Promise((r) => setTimeout(r, 50));
    }
    if (!tl) return { error: "master timeline not found" };
    window.__tl = tl;
    const r = document.querySelector(".pdiag-panel").getBoundingClientRect();
    return {
      duration: tl.duration(),
      repeatDelay: tl.repeatDelay ? tl.repeatDelay() : 0,
      clip: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });
  if (info.error) throw new Error(info.error);
  const period = info.duration + info.repeatDelay;
  console.log(`recording one ${period.toFixed(2)}s loop ...`);

  const cdp = await page.createCDPSession();
  const frames = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async (ev) => {
    const file = `f_${String(n++).padStart(5, "0")}.png`;
    fs.writeFileSync(path.join(work, file), Buffer.from(ev.data, "base64"));
    frames.push({ file, ts: ev.metadata.timestamp });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId });
    } catch (_) {}
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    everyNthFrame: 1,
    maxWidth: 2560,
    maxHeight: 1440,
  });
  await page.evaluate(() => {
    window.__tl.pause(0);
    window.__tl.play();
  });
  await new Promise((r) => setTimeout(r, period * 1000 + 200));
  await cdp.send("Page.stopScreencast");
  await new Promise((r) => setTimeout(r, 500));
  await browser.close();

  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < frames.length; i++) {
    const dur =
      i + 1 < frames.length
        ? frames[i + 1].ts - frames[i].ts
        : Math.max(0.04, period - (frames[i].ts - frames[0].ts));
    lines.push(`file ${frames[i].file}`);
    lines.push(`duration ${Math.max(dur, 0.001).toFixed(4)}`);
  }
  lines.push(`file ${frames[frames.length - 1].file}`);
  const concat = path.join(work, "frames.txt");
  fs.writeFileSync(concat, lines.join("\n") + "\n");
  console.log(`captured ${frames.length} frames; encoding ...`);

  const c = info.clip;
  const crop = `crop=${Math.floor(c.width / 2) * 2}:${Math.floor(c.height / 2) * 2}:${Math.floor(c.x)}:${Math.floor(c.y)}`;
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat,
    "-vf", `${crop},fps=15,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    "-loop", "0", path.join(outDir, "gateway-pulse.gif"),
  ]);
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat,
    "-vf", `${crop},fps=30`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21",
    "-preset", "slow", "-movflags", "+faststart",
    path.join(outDir, "gateway-pulse.mp4"),
  ]);
  fs.rmSync(work, { recursive: true, force: true });
  console.log("wrote exports/gateway-pulse.gif and exports/gateway-pulse.mp4");
})();
