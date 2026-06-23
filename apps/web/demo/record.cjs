const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
const OUT = path.join(__dirname, 'out');
const RAW_DIR = path.join(OUT, 'raw');
fs.mkdirSync(RAW_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  console.log('navigating…');
  await page.goto('http://localhost:3210/demo-record', { waitUntil: 'load', timeout: 120000 });
  console.log('recording walkthrough… (waiting for completion)');
  await page.waitForFunction(() => window.__demoDone === true, undefined, { timeout: 300000, polling: 500 });
  await page.waitForTimeout(600);
  const video = page.video();
  await ctx.close();           // finalizes the webm
  await browser.close();
  const webm = await video.path();
  console.log('raw webm:', webm, fs.statSync(webm).size, 'bytes');

  // transcode to mp4 (H.264)
  const FF = require('ffmpeg-static');
  const mp4 = path.join(OUT, 'blockbite-walkthrough.mp4');
  console.log('transcoding to mp4 with', FF);
  execFileSync(FF, [
    '-y', '-i', webm,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
    '-movflags', '+faststart', '-r', '30', mp4,
  ], { stdio: 'inherit' });
  console.log('MP4 READY:', mp4, fs.statSync(mp4).size, 'bytes');
})().catch(e => { console.error('RECORD ERROR:', e); process.exit(1); });
