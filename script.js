const game = document.getElementById("game");
const tempReadout = document.getElementById("tempReadout");
const statusText = document.getElementById("statusText");
const doctorNote = document.getElementById("doctorNote");
const mercury = document.getElementById("mercury");
const powerFill = document.getElementById("powerFill");
const timerText = document.getElementById("timer");
const maxTempText = document.getElementById("maxTemp");
const finishModal = document.getElementById("finishModal");
const finishTemp = document.getElementById("finishTemp");
const finishCopy = document.getElementById("finishCopy");
const restartButton = document.getElementById("restartButton");
const countdownBox = document.getElementById("countdownBox");
const countdownText = document.getElementById("countdownText");
const introOverlay = document.getElementById("introOverlay");
const GAME_VERSION = "1.0.4";
const INTERSTITIAL_SECONDS = 3;
const introVoiceFiles = [
  "voice/仮病だ.mp3",
  "voice/体温計を.mp3",
  "voice/こすれ！.mp3",
  "voice/スタート！.mp3"
];
const introCueTimings = {
  step2: 1200,
  step3: 2600,
  start: 4050,
  round: 5050
};

const BASE_TEMP = 36.5;
const ROUND_TIME = 10;
const VISUAL_MAX_TEMP = 2200;

const stageCopy = [
  { max: 42, stage: "stage-normal", status: "こすれ！", note: "平熱の顔で圧をかけろ" },
  { max: 70, stage: "stage-warn", status: "ピピピピ！", note: "受付がざわつき始めた" },
  { max: 140, stage: "stage-smoke", status: "煙、出てます", note: "体温計「聞いてない」" },
  { max: 320, stage: "stage-boil", status: "沸騰中", note: "おでこでラーメン可" },
  { max: 760, stage: "stage-fire", status: "炎上診断", note: "医者、逃亡準備" },
  { max: 1600, stage: "stage-magma", status: "マグマ体質", note: "待合室が溶けている" },
  { max: Infinity, stage: "stage-cosmos", status: "宇宙へ", note: "新種の恒星です" }
];

const finishLines = [
  "仮病、失敗。",
  "医者、逃亡。",
  "新種の恒星です。",
  "保健室、ブラックホール化。",
  "診断結果：太陽。"
];

let temperature = BASE_TEMP;
let maxTemperature = BASE_TEMP;
let power = 0;
let timeLeft = ROUND_TIME;
let running = false;
let started = false;
let finished = false;
let lastPoint = null;
let lastTime = 0;
let lastDirection = 0;
let segmentTravel = 0;
let lastTurnTime = 0;
let soundReady = false;
let audioContext = null;
let lastBeep = 0;
let lastFrame = performance.now();
let introTimers = [];
let introVoices = [];
let currentIntroVoiceIndex = 0;
let introStarted = false;
let introAudioBlocked = false;
let introAwaitingAudioGesture = false;
let shareButton = null;
let shareStatus = null;
let adModal = null;
let adCloseButton = null;
let adCountdownText = null;
let adTimer = null;

function formatTemp(value) {
  if (value >= 100) return Math.floor(value).toLocaleString("ja-JP");
  return value.toFixed(1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderVersionBadge() {
  let versionBadge = document.getElementById("versionBadge");
  if (!versionBadge) {
    versionBadge = document.createElement("div");
    versionBadge.id = "versionBadge";
    versionBadge.className = "version-badge";
    versionBadge.setAttribute("aria-label", "Version");
    game.appendChild(versionBadge);
  }

  versionBadge.textContent = `ver ${GAME_VERSION}`;
}

function renderShareControls() {
  if (shareButton) return;

  const finishContent = finishModal.querySelector(".finish-content");
  shareButton = document.createElement("button");
  shareButton.id = "shareXButton";
  shareButton.className = "share-x-button";
  shareButton.type = "button";
  shareButton.textContent = "Xにポスト";

  shareStatus = document.createElement("p");
  shareStatus.id = "shareStatus";
  shareStatus.className = "share-status";
  shareStatus.setAttribute("aria-live", "polite");

  finishContent.appendChild(shareButton);
  finishContent.appendChild(shareStatus);
  shareButton.addEventListener("click", shareResultToX);
}

function renderInterstitialAd() {
  if (adModal) return;

  adModal = document.createElement("div");
  adModal.id = "interstitialAd";
  adModal.className = "ad-modal";
  adModal.hidden = true;
  adModal.innerHTML = `
    <div class="ad-panel" role="dialog" aria-modal="true" aria-labelledby="adTitle">
      <p class="ad-kicker">AD</p>
      <h2 id="adTitle">THERMOMETER BOOST</h2>
      <p class="ad-copy">NEXT FEVER IS LOADING</p>
      <div class="ad-creative" aria-hidden="true">
        <span class="ad-thermo"></span>
        <span class="ad-burst ad-burst-a"></span>
        <span class="ad-burst ad-burst-b"></span>
      </div>
      <button id="adCloseButton" type="button" disabled>WAIT <span id="adCountdownText">${INTERSTITIAL_SECONDS}</span></button>
    </div>
  `;
  document.body.appendChild(adModal);
  adCloseButton = document.getElementById("adCloseButton");
  adCountdownText = document.getElementById("adCountdownText");
  adCloseButton.addEventListener("click", closeInterstitialAdAndRestart);
}

function getStage(value) {
  return stageCopy.find((item) => value <= item.max) || stageCopy[stageCopy.length - 1];
}

function initAudio() {
  if (soundReady) {
    if (audioContext && audioContext.state === "suspended") audioContext.resume();
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext = new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume();
  soundReady = true;
}

function beep(kind = "tick") {
  if (!audioContext || audioContext.state !== "running") return;

  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequency = kind === "boom" ? 76 : kind === "warn" ? 880 : 1320;
  const duration = kind === "boom" ? .42 : .055;

  osc.type = kind === "boom" ? "sawtooth" : "square";
  osc.frequency.setValueAtTime(frequency, now);
  if (kind === "boom") {
    osc.frequency.exponentialRampToValueAtTime(32, now + duration);
  }

  gain.gain.setValueAtTime(kind === "boom" ? .18 : .035, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function loadIntroVoices() {
  if (introVoices.length) return;
  introVoices = introVoiceFiles.map((src) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = .95;
    return audio;
  });
}

function playIntroVoice(index) {
  currentIntroVoiceIndex = index;
  loadIntroVoices();
  const audio = introVoices[index];
  if (!audio) return Promise.resolve();
  audio.currentTime = 0;
  return audio.play()
    .then(() => {
      introAudioBlocked = false;
    })
    .catch((error) => {
      introAudioBlocked = true;
      throw error;
    });
}

function unlockAudioFromGesture() {
  initAudio();
  if (introStarted && introAwaitingAudioGesture && !introOverlay.classList.contains("is-hidden")) {
    introAwaitingAudioGesture = false;
    introAudioBlocked = false;
    runIntro({ fromGesture: true });
  }
}

function setStage(stage) {
  game.classList.remove(
    "stage-normal",
    "stage-warn",
    "stage-smoke",
    "stage-boil",
    "stage-fire",
    "stage-magma",
    "stage-cosmos",
    "stage-finish"
  );
  game.classList.add(stage.stage);
  statusText.textContent = stage.status;
  doctorNote.textContent = stage.note;
}

function updateVisuals() {
  if (!Number.isFinite(temperature)) temperature = BASE_TEMP;
  if (!Number.isFinite(maxTemperature)) maxTemperature = temperature;

  const visibleTemp = Math.min(temperature, VISUAL_MAX_TEMP);
  const heat = clamp((visibleTemp - BASE_TEMP) / (VISUAL_MAX_TEMP - BASE_TEMP), 0, 1);
  const mercuryHeight = clamp((visibleTemp - 35) / (VISUAL_MAX_TEMP - 35) * 100, 2, 100);
  const shake = temperature > 60 ? clamp(Math.log10(temperature - 55) * 2.8, 0, 13) : 0;
  const stage = getStage(temperature);

  game.style.setProperty("--heat", heat.toFixed(3));
  game.style.setProperty("--shake", `${shake.toFixed(1)}px`);
  game.style.setProperty("--mercury", `${mercuryHeight.toFixed(1)}%`);

  tempReadout.classList.toggle("is-long", temperature >= 10000);
  tempReadout.classList.toggle("is-mega", temperature >= 1000000);
  tempReadout.innerHTML = `${formatTemp(temperature)}<span>℃</span>`;
  powerFill.style.width = `${clamp(power * 100, 0, 100).toFixed(0)}%`;
  timerText.textContent = `${Math.max(0, timeLeft).toFixed(1)}s`;
  countdownText.textContent = Math.max(0, timeLeft).toFixed(1);
  countdownBox.classList.toggle("is-urgent", running && timeLeft <= 3);
  maxTempText.textContent = `MAX ${formatTemp(maxTemperature)}℃`;
  setStage(stage);
}

function finishGame() {
  if (finished) return;
  finished = true;
  running = false;
  game.classList.add("stage-finish");
  finishTemp.textContent = `${formatTemp(maxTemperature)}℃`;

  if (maxTemperature >= 100000) {
    finishCopy.textContent = finishLines[Math.floor(Math.random() * finishLines.length)];
  } else if (maxTemperature < 42) {
    finishCopy.textContent = "仮病、薄味。";
  } else if (maxTemperature < 100) {
    finishCopy.textContent = "医者、半信半疑。";
  } else if (maxTemperature < 1000) {
    finishCopy.textContent = "保健室、避難済み。";
  } else if (maxTemperature < 10000) {
    finishCopy.textContent = "新種の恒星です。";
  } else {
    finishCopy.textContent = "宇宙、診察拒否。";
  }

  finishModal.hidden = false;
  renderShareControls();
  shareButton.disabled = false;
  shareButton.textContent = "Xにポスト";
  shareStatus.textContent = "";
  beep("boom");
}

function addFriction(clientX, clientY, now) {
  if (!started || finished) return;
  initAudio();

  if (!lastPoint) {
    lastPoint = { x: clientX, y: clientY };
    lastTime = now;
    return;
  }

  const dy = clientY - lastPoint.y;
  const absY = Math.abs(dy);
  const direction = absY >= 2 ? Math.sign(dy) : 0;

  if (direction !== 0) {
    if (lastDirection === 0) {
      lastDirection = direction;
      segmentTravel = 0;
      lastTurnTime = now;
    }

    const switched = direction !== lastDirection;
    const validStroke = switched && segmentTravel >= 18;

    if (validStroke) {
      const interval = Math.max(55, now - lastTurnTime);
      const turnsPerSecond = clamp(1000 / interval, 0, 24);
      const turnRate = clamp((turnsPerSecond - 2) / 16, 0, 1);

      power = clamp(power + .018 + turnRate * .032, 0, 1);

      const meterPressure = .22 + power * .55 + turnRate * .42;
      const elapsedRate = clamp((ROUND_TIME - timeLeft) / ROUND_TIME, 0, 1);
      const safeTemp = Math.max(temperature - BASE_TEMP, 0);
      const warmup = clamp(Math.log1p(safeTemp) / Math.log1p(180), 0, 1);
      const stageRamp = 1 + Math.log1p(Math.max(temperature - 45, 0)) * (.16 + elapsedRate * .42);
      const lateRamp = 1 + Math.log1p(Math.max(temperature - 700, 0) / 220) * (.25 + elapsedRate * 1.35);
      const timeRamp = .2 + elapsedRate * elapsedRate * 2.4;
      const gain = meterPressure * (.12 + warmup * .86) * stageRamp * lateRamp * timeRamp;
      temperature += Number.isFinite(gain) ? gain : 0;

      if (now - lastBeep > 115 && temperature > 39) {
        beep(temperature > 100 ? "warn" : "tick");
        lastBeep = now;
      }

      lastTurnTime = now;
      segmentTravel = absY;
    } else if (switched) {
      segmentTravel = absY;
    } else {
      segmentTravel = Math.min(segmentTravel + absY, 80);
    }

    lastDirection = direction;
  }

  lastPoint = { x: clientX, y: clientY };
  lastTime = now;
}

function handlePointerMove(event) {
  event.preventDefault();
  addFriction(event.clientX, event.clientY, performance.now());
}

function handleTouchMove(event) {
  event.preventDefault();
  const touch = event.touches[0];
  if (touch) addFriction(touch.clientX, touch.clientY, performance.now());
}

function blockPageTouch(event) {
  const target = event.target;
  if (target && target.closest && target.closest("button")) return;
  if (event.cancelable) event.preventDefault();
}

function resetPointer() {
  lastPoint = null;
  lastDirection = 0;
  segmentTravel = 0;
}

function loop(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, .05);
  lastFrame = now;

  if (running && !finished) {
    timeLeft -= delta;
    power = Math.max(0, power - delta * .32);

    const cooling = temperature > BASE_TEMP ? (.55 + Math.sqrt(temperature - BASE_TEMP) * .045) * delta : 0;
    temperature = Math.max(BASE_TEMP, temperature - cooling);
    maxTemperature = Math.max(maxTemperature, temperature);

    if (timeLeft <= 0) {
      updateVisuals();
      finishGame();
    } else {
      updateVisuals();
    }
  }

  requestAnimationFrame(loop);
}

function showInterstitialAd() {
  renderInterstitialAd();
  if (adTimer) clearInterval(adTimer);

  let remaining = INTERSTITIAL_SECONDS;
  adCountdownText.textContent = remaining;
  adCloseButton.disabled = true;
  adCloseButton.innerHTML = `WAIT <span id="adCountdownText">${remaining}</span>`;
  adCountdownText = document.getElementById("adCountdownText");
  adModal.hidden = false;

  adTimer = setInterval(() => {
    remaining -= 1;
    adCountdownText.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(adTimer);
      adTimer = null;
      adCloseButton.disabled = false;
      adCloseButton.textContent = "PLAY AGAIN";
    }
  }, 1000);
}

function closeInterstitialAdAndRestart() {
  if (adTimer) {
    clearInterval(adTimer);
    adTimer = null;
  }
  adModal.hidden = true;
  restart();
}

function restart() {
  clearIntroTimers();
  stopIntroVoices();
  temperature = BASE_TEMP;
  maxTemperature = BASE_TEMP;
  power = 0;
  timeLeft = ROUND_TIME;
  running = false;
  started = false;
  finished = false;
  lastPoint = null;
  lastTime = 0;
  lastDirection = 0;
  segmentTravel = 0;
  lastTurnTime = 0;
  lastBeep = 0;
  introStarted = false;
  introAudioBlocked = false;
  introAwaitingAudioGesture = false;
  finishModal.hidden = true;
  game.classList.remove("stage-finish");
  updateVisuals();
  runIntro();
}

function clearIntroTimers() {
  introTimers.forEach((timer) => clearTimeout(timer));
  introTimers = [];
}

function stopIntroVoices() {
  introVoices.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function getShareText() {
  return `仮病だ！体温計を！こすれ！で${formatTemp(maxTemperature)}度を出して仮病成功だ！！`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function drawFallbackScreenshot() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const temp = `${formatTemp(maxTemperature)}℃`;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#fff1a8");
  gradient.addColorStop(.38, "#ff4f24");
  gradient.addColorStop(1, "#0a0610");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255, 247, 220, .94)";
  ctx.strokeStyle = "#160d0d";
  ctx.lineWidth = 14;
  ctx.fillRect(94, 214, 892, 594);
  ctx.strokeRect(94, 214, 892, 594);

  ctx.textAlign = "center";
  ctx.fillStyle = "#160d0d";
  ctx.font = "700 48px Arial, sans-serif";
  ctx.fillText("RESULT", 540, 310);

  ctx.fillStyle = "#f12420";
  ctx.strokeStyle = "#160d0d";
  ctx.lineWidth = 8;
  ctx.font = "900 150px Arial, sans-serif";
  ctx.strokeText(temp, 540, 505);
  ctx.fillText(temp, 540, 505);

  ctx.fillStyle = "#160d0d";
  ctx.font = "700 46px Arial, sans-serif";
  ctx.fillText(finishCopy.textContent, 540, 625);
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText(`ver ${GAME_VERSION}`, 540, 710);

  return canvas;
}

async function createResultImageFile() {
  let canvas;

  if (window.html2canvas) {
    game.classList.add("is-capturing");
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      canvas = await window.html2canvas(game, {
        backgroundColor: null,
        scale: Math.min(window.devicePixelRatio || 1, 2)
      });
    } finally {
      game.classList.remove("is-capturing");
    }
  } else {
    canvas = drawFallbackScreenshot();
  }

  const blob = await canvasToBlob(canvas);
  if (!blob) return null;
  return new File([blob], "kebyou-result.png", { type: "image/png" });
}

async function copyScreenshotToClipboard(file) {
  if (!navigator.clipboard || !window.ClipboardItem || !file) return false;

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [file.type]: file })
    ]);
    return true;
  } catch {
    return false;
  }
}

async function shareResultToX() {
  const text = getShareText();
  const shareProbe = new File([""], "kebyou-result.png", { type: "image/png" });
  const supportsFileShare = Boolean(navigator.canShare && navigator.canShare({ files: [shareProbe] }));
  const fallbackWindow = supportsFileShare ? null : window.open("about:blank", "_blank");

  shareButton.disabled = true;
  shareButton.textContent = "準備中...";
  shareStatus.textContent = "";

  try {
    const file = await createResultImageFile();
    const files = file ? [file] : [];

    if (file && supportsFileShare) {
      await navigator.share({
        title: "Thermometer Frenzy",
        text,
        files
      });
    } else {
      const copied = await copyScreenshotToClipboard(file);
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      if (fallbackWindow) {
        fallbackWindow.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      shareStatus.textContent = copied ? "スクショをコピーしました。Xで貼り付けできます。" : "Xの投稿画面を開きました。";
    }
  } catch {
    if (fallbackWindow && !fallbackWindow.closed) fallbackWindow.close();
    shareStatus.textContent = "共有を開始できませんでした。もう一度押してください。";
  } finally {
    shareButton.disabled = false;
    shareButton.textContent = "Xにポスト";
  }
}

function startRound() {
  introOverlay.classList.add("is-hidden");
  introOverlay.classList.remove("needs-audio-start");
  started = true;
  running = true;
  lastPoint = null;
  lastDirection = 0;
  segmentTravel = 0;
  lastTurnTime = 0;
  lastFrame = performance.now();
  updateVisuals();
}

function waitForIntroAudioGesture() {
  clearIntroTimers();
  stopIntroVoices();
  introAwaitingAudioGesture = true;
  introAudioBlocked = true;
  introOverlay.classList.add("needs-audio-start");
}

function scheduleIntroTimers() {
  clearIntroTimers();
  introTimers.push(setTimeout(() => {
    introOverlay.classList.add("step-2");
    playIntroVoice(1).catch(() => {});
  }, introCueTimings.step2));
  introTimers.push(setTimeout(() => {
    introOverlay.classList.add("step-3");
    playIntroVoice(2).catch(() => {});
  }, introCueTimings.step3));
  introTimers.push(setTimeout(() => {
    introOverlay.className = "intro-overlay step-4";
    playIntroVoice(3).catch(() => {});
  }, introCueTimings.start));
  introTimers.push(setTimeout(startRound, introCueTimings.round));
}

function runIntro(options = {}) {
  clearIntroTimers();
  stopIntroVoices();
  introStarted = true;
  introAudioBlocked = false;
  introAwaitingAudioGesture = false;
  introOverlay.className = "intro-overlay step-1";
  loadIntroVoices();
  playIntroVoice(0)
    .then(scheduleIntroTimers)
    .catch((error) => {
      if (!options.fromGesture && error && error.name === "NotAllowedError") {
        waitForIntroAudioGesture();
        return;
      }
      scheduleIntroTimers();
    });
}

if (window.PointerEvent) {
  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", resetPointer);
  window.addEventListener("pointercancel", resetPointer);
} else {
  window.addEventListener("mousemove", handlePointerMove, { passive: false });
  window.addEventListener("touchmove", handleTouchMove, { passive: false });
  window.addEventListener("touchend", resetPointer);
}
window.addEventListener("pointerdown", unlockAudioFromGesture);
window.addEventListener("touchstart", unlockAudioFromGesture, { passive: false });
window.addEventListener("click", unlockAudioFromGesture);
window.addEventListener("keydown", unlockAudioFromGesture);
window.addEventListener("touchstart", blockPageTouch, { passive: false });
window.addEventListener("touchmove", blockPageTouch, { passive: false });
window.addEventListener("gesturestart", blockPageTouch, { passive: false });
window.addEventListener("gesturechange", blockPageTouch, { passive: false });
window.addEventListener("blur", resetPointer);
restartButton.addEventListener("click", showInterstitialAd);

updateVisuals();
renderVersionBadge();
renderShareControls();
renderInterstitialAd();
runIntro();
requestAnimationFrame(loop);
