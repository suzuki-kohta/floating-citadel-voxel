import { lerp, smoothstep, lerpVec3, normalizeVec3 } from './math.js';
import { buildVoxelScene } from './voxel-scene.js?v=3';
import { createRenderer } from './renderer.js';

const STORAGE_KEY = 'floating-citadel-wallpaper-settings-v1';
const AUTO_CYCLE_PERIOD_SEC = 600;
const AUTO_START_PHASE = 0.18;
const MAX_FRAME_DT_SEC = 0.1;

const VALID_TIME_MODES = new Set(['auto', 'realtime', 'dawn', 'day', 'sunset', 'night']);
const VALID_QUALITIES = new Set(['high', 'medium', 'eco']);

const DEFAULT_SETTINGS = {
  timeMode: 'auto',
  quality: 'medium',
  paused: false,
};

const QUALITY_CONFIG = {
  high: { maxDpr: 2.0, minFrameIntervalMs: 0, label: '高' },
  medium: { maxDpr: 1.5, minFrameIntervalMs: 0, label: '標準' },
  eco: { maxDpr: 1.0, minFrameIntervalMs: 1000 / 30, label: '省電力' },
};

const FIXED_PHASE_MAP = {
  dawn: 0.0,
  day: 0.25,
  sunset: 0.5,
  night: 0.75,
};

const PHASE_PALETTES = [
  {
    name: '朝',
    skyZenith: [0.16, 0.24, 0.48],
    skyMid: [0.64, 0.45, 0.56],
    skyHorizon: [0.98, 0.72, 0.50],
    sunDir: [-0.55, 0.26, -0.79],
    sunColor: [1.0, 0.80, 0.56],
    sunIntensity: 1.05,
    ambientSky: [0.46, 0.42, 0.58],
    ambientGround: [0.24, 0.20, 0.22],
    fogColor: [0.88, 0.68, 0.56],
    fogDensity: 0.0020,
    cloudTint: [1.0, 0.86, 0.76],
    godRayColor: [1.0, 0.78, 0.52],
    godRayIntensity: 0.68,
    starIntensity: 0.12,
    windowGlow: 0.36,
    particleGlow: 0.48,
    particleColor: [1.0, 0.86, 0.62],
  },
  {
    name: '昼',
    skyZenith: [0.10, 0.34, 0.72],
    skyMid: [0.34, 0.62, 0.90],
    skyHorizon: [0.76, 0.89, 0.98],
    sunDir: [0.24, 0.78, -0.58],
    sunColor: [1.0, 0.97, 0.90],
    sunIntensity: 1.25,
    ambientSky: [0.54, 0.68, 0.86],
    ambientGround: [0.28, 0.32, 0.26],
    fogColor: [0.72, 0.85, 0.95],
    fogDensity: 0.00155,
    cloudTint: [1.0, 0.99, 0.97],
    godRayColor: [1.0, 0.96, 0.84],
    godRayIntensity: 0.42,
    starIntensity: 0.0,
    windowGlow: 0.05,
    particleGlow: 0.22,
    particleColor: [0.92, 0.98, 1.0],
  },
  {
    name: '夕焼け',
    skyZenith: [0.14, 0.14, 0.34],
    skyMid: [0.76, 0.32, 0.28],
    skyHorizon: [1.0, 0.56, 0.24],
    sunDir: [0.62, 0.18, -0.76],
    sunColor: [1.0, 0.60, 0.28],
    sunIntensity: 1.10,
    ambientSky: [0.52, 0.30, 0.36],
    ambientGround: [0.22, 0.14, 0.14],
    fogColor: [0.86, 0.48, 0.30],
    fogDensity: 0.0022,
    cloudTint: [1.0, 0.70, 0.50],
    godRayColor: [1.0, 0.58, 0.26],
    godRayIntensity: 0.88,
    starIntensity: 0.18,
    windowGlow: 0.58,
    particleGlow: 0.64,
    particleColor: [1.0, 0.74, 0.42],
  },
  {
    name: '夜',
    skyZenith: [0.02, 0.04, 0.11],
    skyMid: [0.05, 0.09, 0.20],
    skyHorizon: [0.11, 0.17, 0.30],
    sunDir: [-0.30, 0.62, -0.72],
    sunColor: [0.68, 0.80, 1.0],
    sunIntensity: 0.52,
    ambientSky: [0.14, 0.20, 0.34],
    ambientGround: [0.07, 0.09, 0.14],
    fogColor: [0.09, 0.14, 0.25],
    fogDensity: 0.0023,
    cloudTint: [0.46, 0.56, 0.74],
    godRayColor: [0.58, 0.74, 1.0],
    godRayIntensity: 0.30,
    starIntensity: 1.0,
    windowGlow: 1.0,
    particleGlow: 0.95,
    particleColor: [0.66, 0.90, 1.0],
  },
];

function safeLerpVec3(out, a, b, t) {
  return lerpVec3(a, b, t, out);
}

function safeNormalizeVec3(out, v) {
  if (normalizeVec3.length >= 2) {
    const res = normalizeVec3(out, v);
    if (res && res !== out) {
      out[0] = res[0];
      out[1] = res[1];
      out[2] = res[2];
    }
  } else {
    const res = normalizeVec3(v);
    out[0] = res[0];
    out[1] = res[1];
    out[2] = res[2];
  }
  return out;
}

function createEnvStateBuffer() {
  return {
    phaseName: '昼',
    skyZenith: new Float32Array(3),
    skyMid: new Float32Array(3),
    skyHorizon: new Float32Array(3),
    sunDir: new Float32Array(3),
    sunColor: new Float32Array(3),
    sunIntensity: 1.0,
    ambientSky: new Float32Array(3),
    ambientGround: new Float32Array(3),
    fogColor: new Float32Array(3),
    fogDensity: 0.0025,
    cloudTint: new Float32Array(3),
    godRayColor: new Float32Array(3),
    godRayIntensity: 0.5,
    starIntensity: 0.0,
    windowGlow: 0.0,
    particleGlow: 0.3,
    particleColor: new Float32Array(3),
  };
}

function computeRealtimePhase(date) {
  let hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  if (hours < 5.5) {
    hours += 24.0;
  }

  if (hours < 12.0) {
    return ((hours - 5.5) / (12.0 - 5.5)) * 0.25;
  }
  if (hours < 18.0) {
    return 0.25 + ((hours - 12.0) / (18.0 - 12.0)) * 0.25;
  }
  if (hours < 21.5) {
    return 0.5 + ((hours - 18.0) / (21.5 - 18.0)) * 0.25;
  }
  return 0.75 + ((hours - 21.5) / (29.5 - 21.5)) * 0.25;
}

function computePhase(timeMode, elapsedSec) {
  if (timeMode === 'auto') {
    const raw = (AUTO_START_PHASE + elapsedSec / AUTO_CYCLE_PERIOD_SEC) % 1.0;
    return raw < 0 ? raw + 1.0 : raw;
  }
  if (timeMode === 'realtime') {
    return computeRealtimePhase(new Date()) % 1.0;
  }
  return typeof FIXED_PHASE_MAP[timeMode] === 'number' ? FIXED_PHASE_MAP[timeMode] : 0.25;
}

function updateEnvState(out, phase) {
  const wrapped = ((phase % 1.0) + 1.0) % 1.0;
  const scaled = wrapped * 4.0;
  const idxA = Math.floor(scaled) % 4;
  const idxB = (idxA + 1) % 4;
  const localT = scaled - Math.floor(scaled);
  const t = smoothstep(0.0, 1.0, localT);

  const a = PHASE_PALETTES[idxA];
  const b = PHASE_PALETTES[idxB];

  out.phaseName = localT < 0.5 ? a.name : b.name;
  safeLerpVec3(out.skyZenith, a.skyZenith, b.skyZenith, t);
  safeLerpVec3(out.skyMid, a.skyMid, b.skyMid, t);
  safeLerpVec3(out.skyHorizon, a.skyHorizon, b.skyHorizon, t);
  safeLerpVec3(out.sunDir, a.sunDir, b.sunDir, t);
  safeNormalizeVec3(out.sunDir, out.sunDir);
  safeLerpVec3(out.sunColor, a.sunColor, b.sunColor, t);
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
  safeLerpVec3(out.ambientSky, a.ambientSky, b.ambientSky, t);
  safeLerpVec3(out.ambientGround, a.ambientGround, b.ambientGround, t);
  safeLerpVec3(out.fogColor, a.fogColor, b.fogColor, t);
  out.fogDensity = lerp(a.fogDensity, b.fogDensity, t);
  safeLerpVec3(out.cloudTint, a.cloudTint, b.cloudTint, t);
  safeLerpVec3(out.godRayColor, a.godRayColor, b.godRayColor, t);
  out.godRayIntensity = lerp(a.godRayIntensity, b.godRayIntensity, t);
  out.starIntensity = lerp(a.starIntensity, b.starIntensity, t);
  out.windowGlow = lerp(a.windowGlow, b.windowGlow, t);
  out.particleGlow = lerp(a.particleGlow, b.particleGlow, t);
  safeLerpVec3(out.particleColor, a.particleColor, b.particleColor, t);

  return out;
}

function loadSettings() {
  const merged = { ...DEFAULT_SETTINGS };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (VALID_TIME_MODES.has(parsed.timeMode)) {
          merged.timeMode = parsed.timeMode;
        }
        if (VALID_QUALITIES.has(parsed.quality)) {
          merged.quality = parsed.quality;
        }
        if (typeof parsed.paused === 'boolean') {
          merged.paused = parsed.paused;
        }
      }
    }
  } catch {
    // Ignore storage access or parse errors in restricted environments
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const timeParam = params.get('time');
    if (timeParam && VALID_TIME_MODES.has(timeParam)) {
      merged.timeMode = timeParam;
    }
    const qualityParam = params.get('quality');
    if (qualityParam && VALID_QUALITIES.has(qualityParam)) {
      merged.quality = qualityParam;
    }
    const pausedParam = params.get('paused');
    if (pausedParam === '1' || pausedParam === 'true') {
      merged.paused = true;
    } else if (pausedParam === '0' || pausedParam === 'false') {
      merged.paused = false;
    }
  } catch {
    // Ignore malformed query string
  }

  return merged;
}

function saveSettings(settings) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        timeMode: settings.timeMode,
        quality: settings.quality,
        paused: settings.paused,
      })
    );
  } catch {
    // Ignore storage write errors (e.g. private browsing / quota exceeded)
  }
}

function isEditableElement(element) {
  if (!element) {
    return false;
  }
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    Boolean(element.isContentEditable)
  );
}

function createCustomSelect({ container, trigger, valueEl, listbox, onChange, onBeforeOpen }) {
  if (!container || !trigger || !valueEl || !listbox) {
    return null;
  }

  const options = Array.from(listbox.querySelectorAll('.select-option[role="option"]'));
  const initialOption =
    options.find((opt) => opt.getAttribute('aria-selected') === 'true') || options[0] || null;
  let currentValue =
    initialOption && typeof initialOption.dataset.value === 'string'
      ? initialOption.dataset.value
      : '';
  let isOpen = false;

  function getSelectedIndex() {
    const idx = options.findIndex((opt) => opt.dataset.value === currentValue);
    return idx >= 0 ? idx : 0;
  }

  function setOpen(open, { focusOption = false, focusIndex = -1, returnFocus = false } = {}) {
    if (open) {
      if (!isOpen && typeof onBeforeOpen === 'function') {
        onBeforeOpen();
      }
      isOpen = true;
      listbox.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      if (focusOption && options.length > 0) {
        const targetIndex =
          focusIndex >= 0 && focusIndex < options.length ? focusIndex : getSelectedIndex();
        options[targetIndex].focus();
      }
      return;
    }

    const wasOpen = isOpen;
    isOpen = false;
    listbox.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus && wasOpen) {
      trigger.focus();
    }
  }

  function setValue(value) {
    const matched = options.find((opt) => opt.dataset.value === value);
    if (!matched) {
      return false;
    }
    currentValue = value;
    valueEl.textContent = matched.textContent;
    for (const opt of options) {
      opt.setAttribute('aria-selected', opt === matched ? 'true' : 'false');
    }
    return true;
  }

  function selectOption(opt) {
    const nextValue = opt.dataset.value;
    if (typeof nextValue !== 'string') {
      return;
    }
    const changed = nextValue !== currentValue;
    setValue(nextValue);
    if (changed && typeof onChange === 'function') {
      onChange(nextValue);
    }
    setOpen(false, { returnFocus: true });
  }

  trigger.addEventListener('click', () => {
    setOpen(!isOpen);
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true, { focusOption: true, focusIndex: getSelectedIndex() });
    }
  });

  for (const opt of options) {
    opt.addEventListener('click', () => {
      selectOption(opt);
    });
  }

  listbox.addEventListener('keydown', (event) => {
    if (options.length === 0) {
      return;
    }
    const currentIndex = options.indexOf(document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
      options[nextIndex].focus();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex =
        currentIndex >= 0 ? (currentIndex - 1 + options.length) % options.length : options.length - 1;
      options[prevIndex].focus();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      options[0].focus();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      options[options.length - 1].focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (currentIndex >= 0) {
        event.preventDefault();
        selectOption(options[currentIndex]);
      }
    }
  });

  return {
    setValue,
    open: (opts) => setOpen(true, opts),
    close: (opts) => setOpen(false, opts),
    isOpen: () => isOpen,
    contains: (target) => container.contains(target instanceof Node ? target : null),
  };
}

function init() {
  const canvas = document.getElementById('scene-canvas');
  const hotspotBtn = document.getElementById('settings-hotspot');
  const settingsPanel = document.getElementById('settings-panel');
  const timeModeContainer = document.querySelector('[data-select="time-mode"]');
  const timeModeTrigger = document.getElementById('time-mode-trigger');
  const timeModeValue = document.getElementById('time-mode-value');
  const timeModeListbox = document.getElementById('time-mode-listbox');
  const qualityContainer = document.querySelector('[data-select="quality"]');
  const qualityTrigger = document.getElementById('quality-trigger');
  const qualityValue = document.getElementById('quality-value');
  const qualityListbox = document.getElementById('quality-listbox');
  const pauseToggleBtn = document.getElementById('pause-toggle-btn');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const statusReadout = document.getElementById('status-readout');
  const fallbackMessage = document.getElementById('fallback-message');
  const fallbackReason = document.getElementById('fallback-reason');

  function showFallback(reason) {
    if (fallbackReason) {
      fallbackReason.textContent = reason || 'WebGL が利用できない環境です。';
    }
    if (fallbackMessage) {
      fallbackMessage.hidden = false;
    }
  }

  if (!canvas) {
    showFallback('描画用キャンバスが見つかりませんでした。');
    return;
  }

  const settings = loadSettings();
  const envState = createEnvStateBuffer();
  const sceneData = buildVoxelScene();
  const renderer = createRenderer(canvas, sceneData);

  if (!renderer.supported) {
    showFallback(renderer.reason);
    return;
  }

  let elapsedSec = 0;
  let rafId = 0;
  let lastFrameTime = 0;
  let lastDrawTime = 0;
  let lastStatusText = '';

  const customSelects = [];

  function closeOpenSelects(options = {}) {
    let closedAny = false;
    for (const selectCtrl of customSelects) {
      if (selectCtrl.isOpen()) {
        selectCtrl.close(options);
        closedAny = true;
      }
    }
    return closedAny;
  }

  const timeModeSelect = createCustomSelect({
    container: timeModeContainer,
    trigger: timeModeTrigger,
    valueEl: timeModeValue,
    listbox: timeModeListbox,
    onBeforeOpen: () => closeOpenSelects(),
    onChange: (nextValue) => {
      if (VALID_TIME_MODES.has(nextValue)) {
        settings.timeMode = nextValue;
        saveSettings(settings);
        renderSingleFrame();
      }
    },
  });

  const qualitySelect = createCustomSelect({
    container: qualityContainer,
    trigger: qualityTrigger,
    valueEl: qualityValue,
    listbox: qualityListbox,
    onBeforeOpen: () => closeOpenSelects(),
    onChange: (nextValue) => {
      if (VALID_QUALITIES.has(nextValue)) {
        settings.quality = nextValue;
        saveSettings(settings);
        renderer.setQuality(settings.quality);
        applyViewportSize();
        renderSingleFrame();
      }
    },
  });

  if (timeModeSelect) {
    customSelects.push(timeModeSelect);
  }
  if (qualitySelect) {
    customSelects.push(qualitySelect);
  }

  function setPanelOpen(open) {
    if (!open) {
      closeOpenSelects();
    }
    if (settingsPanel) {
      settingsPanel.hidden = !open;
    }
    if (hotspotBtn) {
      hotspotBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function togglePanel() {
    if (!settingsPanel) {
      return;
    }
    setPanelOpen(settingsPanel.hidden);
  }

  function updateStatusReadout() {
    if (!statusReadout) {
      return;
    }
    const qLabel = QUALITY_CONFIG[settings.quality].label;
    const playLabel = settings.paused ? '一時停止中' : '再生中';
    const nextText = `時間帯: ${envState.phaseName} / 品質: ${qLabel} / ${playLabel}`;
    if (nextText !== lastStatusText) {
      statusReadout.textContent = nextText;
      lastStatusText = nextText;
    }
  }

  function syncControlsFromSettings() {
    if (timeModeSelect) {
      timeModeSelect.setValue(settings.timeMode);
    }
    if (qualitySelect) {
      qualitySelect.setValue(settings.quality);
    }
    if (pauseToggleBtn) {
      pauseToggleBtn.setAttribute('aria-pressed', settings.paused ? 'true' : 'false');
      pauseToggleBtn.textContent = settings.paused ? '再開' : '一時停止';
    }
  }

  function applyViewportSize() {
    const qConfig = QUALITY_CONFIG[settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, qConfig.maxDpr);
    const width = Math.max(1, window.innerWidth || canvas.clientWidth || 1280);
    const height = Math.max(1, window.innerHeight || canvas.clientHeight || 720);
    renderer.resize(width, height, dpr);
  }

  function renderSingleFrame() {
    const phase = computePhase(settings.timeMode, elapsedSec);
    updateEnvState(envState, phase);
    renderer.render(elapsedSec, envState);
    updateStatusReadout();
  }

  function stopLoop() {
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function frameLoop(now) {
    rafId = 0;
    if (settings.paused || document.visibilityState === 'hidden') {
      return;
    }

    const qConfig = QUALITY_CONFIG[settings.quality];
    if (qConfig.minFrameIntervalMs > 0 && lastDrawTime > 0) {
      if (now - lastDrawTime < qConfig.minFrameIntervalMs) {
        rafId = window.requestAnimationFrame(frameLoop);
        return;
      }
    }

    if (lastFrameTime > 0) {
      const dt = Math.min(Math.max((now - lastFrameTime) * 0.001, 0), MAX_FRAME_DT_SEC);
      elapsedSec += dt;
    }
    lastFrameTime = now;
    lastDrawTime = now;

    renderSingleFrame();
    rafId = window.requestAnimationFrame(frameLoop);
  }

  function startLoop() {
    if (settings.paused || document.visibilityState === 'hidden') {
      return;
    }
    if (rafId === 0) {
      lastFrameTime = 0;
      rafId = window.requestAnimationFrame(frameLoop);
    }
  }

  // Initial setup
  setPanelOpen(false);
  syncControlsFromSettings();
  renderer.setQuality(settings.quality);
  applyViewportSize();
  renderSingleFrame();

  if (!settings.paused && document.visibilityState !== 'hidden') {
    startLoop();
  }

  // UI event listeners
  if (hotspotBtn) {
    hotspotBtn.addEventListener('click', () => {
      togglePanel();
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      setPanelOpen(false);
    });
  }

  if (pauseToggleBtn) {
    pauseToggleBtn.addEventListener('click', () => {
      settings.paused = !settings.paused;
      saveSettings(settings);
      syncControlsFromSettings();
      if (settings.paused) {
        stopLoop();
        renderSingleFrame();
      } else {
        renderSingleFrame();
        startLoop();
      }
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    for (const selectCtrl of customSelects) {
      if (selectCtrl.isOpen() && !selectCtrl.contains(target)) {
        selectCtrl.close();
      }
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (closeOpenSelects({ returnFocus: true })) {
        event.preventDefault();
        return;
      }
      if (settingsPanel && !settingsPanel.hidden) {
        setPanelOpen(false);
      }
      return;
    }

    if (
      (event.key === 'h' || event.key === 'H') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isEditableElement(document.activeElement)
    ) {
      event.preventDefault();
      togglePanel();
    }
  });

  window.addEventListener('resize', () => {
    applyViewportSize();
    renderSingleFrame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopLoop();
    } else {
      lastFrameTime = 0;
      lastDrawTime = 0;
      if (settings.paused) {
        renderSingleFrame();
      } else {
        startLoop();
      }
    }
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    stopLoop();
    renderer.handleContextLost(event);
  });

  canvas.addEventListener('webglcontextrestored', () => {
    renderer.handleContextRestored();
    renderer.setQuality(settings.quality);
    applyViewportSize();
    renderSingleFrame();
    if (!settings.paused && document.visibilityState !== 'hidden') {
      startLoop();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopLoop();
    renderer.dispose();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
