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
let soundReady = false;
let audioContext = null;
let lastBeep = 0;
let lastFrame = performance.now();
let introTimers = [];

function formatTemp(value) {
  if (value >= 100) return Math.floor(value).toLocaleString("ja-JP");
  return value.toFixed(1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getStage(value) {
  return stageCopy.find((item) => value <= item.max) || stageCopy[stageCopy.length - 1];
}

function initAudio() {
  if (soundReady) return;
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

  const dx = clientX - lastPoint.x;
  const dy = clientY - lastPoint.y;
  const distance = Math.hypot(dx, dy);
  const dt = Math.max(8, now - lastTime);
  const speed = distance / dt;
  const gainedPower = clamp(speed / 2.2, 0, 1.55);

  if (distance > 1) {
    power = clamp(power + gainedPower * .18, 0, 1.2);
    const elapsedRate = clamp((ROUND_TIME - timeLeft) / ROUND_TIME, 0, 1);
    const safeTemp = Math.max(temperature - BASE_TEMP, 0);
    const warmup = clamp(Math.log1p(safeTemp) / Math.log1p(180), 0, 1);
    const stageRamp = 1 + Math.log1p(Math.max(temperature - 45, 0)) * (.16 + elapsedRate * .42);
    const lateRamp = 1 + Math.log1p(Math.max(temperature - 700, 0) / 220) * (.25 + elapsedRate * 1.35);
    const timeRamp = .2 + elapsedRate * elapsedRate * 2.4;
    const flickRamp = gainedPower * (1 + Math.log1p(gainedPower * 3) * .55);
    const gain = flickRamp * (.12 + warmup * .86) * stageRamp * lateRamp * timeRamp;
    temperature += Number.isFinite(gain) ? gain : 0;

    if (now - lastBeep > 115 && temperature > 39) {
      beep(temperature > 100 ? "warn" : "tick");
      lastBeep = now;
    }
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

function resetPointer() {
  lastPoint = null;
}

function loop(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, .05);
  lastFrame = now;

  if (running && !finished) {
    timeLeft -= delta;
    power = Math.max(0, power - delta * .85);

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

function restart() {
  clearIntroTimers();
  temperature = BASE_TEMP;
  maxTemperature = BASE_TEMP;
  power = 0;
  timeLeft = ROUND_TIME;
  running = false;
  started = false;
  finished = false;
  lastPoint = null;
  lastTime = 0;
  lastBeep = 0;
  finishModal.hidden = true;
  game.classList.remove("stage-finish");
  updateVisuals();
  runIntro();
}

function clearIntroTimers() {
  introTimers.forEach((timer) => clearTimeout(timer));
  introTimers = [];
}

function startRound() {
  introOverlay.classList.add("is-hidden");
  started = true;
  running = true;
  lastPoint = null;
  lastFrame = performance.now();
  updateVisuals();
}

function runIntro() {
  introOverlay.className = "intro-overlay step-1";
  introTimers.push(setTimeout(() => introOverlay.classList.add("step-2"), 620));
  introTimers.push(setTimeout(() => introOverlay.classList.add("step-3"), 1240));
  introTimers.push(setTimeout(() => {
    introOverlay.className = "intro-overlay step-4";
  }, 2050));
  introTimers.push(setTimeout(startRound, 2780));
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
window.addEventListener("blur", resetPointer);
restartButton.addEventListener("click", restart);

updateVisuals();
runIntro();
requestAnimationFrame(loop);
