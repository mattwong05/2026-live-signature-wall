const backgroundCanvas = document.getElementById("backgroundCanvas");
const playbackCanvas = document.getElementById("playbackCanvas");
const screenHint = document.getElementById("screenHint");
const screenTitle = document.getElementById("screenTitle");
const screenOverlay = document.getElementById("screenOverlay");
const backgroundImageLayer = document.getElementById("backgroundImageLayer");
const fullscreenButton = document.getElementById("fullscreenButton");

const backgroundContext = backgroundCanvas.getContext("2d");
const playbackContext = playbackCanvas.getContext("2d");

let backgroundItems = [];
let pendingQueue = [];
let playing = false;
let backgroundImageUrl = null;
let backgroundImageOpacity = 50;
let currentPlaybackSignature = null;
let playbackRunId = 0;
let endingSequence = null;
const BACKGROUND_PADDING = 24;
const MAX_LAYOUT_ATTEMPTS = 80;

function resizeCanvas(canvas, context) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(ratio, ratio);
}

function setupCanvases() {
  resizeCanvas(backgroundCanvas, backgroundContext);
  resizeCanvas(playbackCanvas, playbackContext);
}

function updateHint(message) {
  screenHint.textContent = message;
  screenHint.classList.toggle("hidden", !message);
}

function isIdleMode() {
  return !playing && pendingQueue.length === 0;
}

function updateBackgroundImage(url) {
  backgroundImageUrl = url;
  if (url) {
    backgroundImageLayer.style.backgroundImage = `url("${url}?ts=${Date.now()}")`;
    backgroundImageLayer.classList.add("visible");
    backgroundImageLayer.style.opacity = String(backgroundImageOpacity / 100);
  } else {
    backgroundImageLayer.style.backgroundImage = "";
    backgroundImageLayer.classList.remove("visible");
  }
}

function updateBackgroundOpacity(opacity) {
  backgroundImageOpacity = Math.max(0, Math.min(100, Number(opacity) || 0));
  if (backgroundImageUrl) {
    backgroundImageLayer.style.opacity = String(backgroundImageOpacity / 100);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function boundsForSignature(signature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  signature.strokes.forEach((stroke) => {
    stroke.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function buildTransform(signature, viewportWidth, viewportHeight, widthRatio, heightRatio) {
  const bounds = boundsForSignature(signature);
  const availableWidth = viewportWidth * widthRatio;
  const availableHeight = viewportHeight * heightRatio;
  const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const translateX = viewportWidth / 2 - (bounds.minX + bounds.width / 2) * scale;
  const translateY = viewportHeight / 2 - (bounds.minY + bounds.height / 2) * scale;
  return { scale, translateX, translateY };
}

function buildTightTransform(bounds, targetWidth, targetHeight, padding) {
  const availableWidth = Math.max(1, targetWidth - padding * 2);
  const availableHeight = Math.max(1, targetHeight - padding * 2);
  const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const translateX = padding + (availableWidth - contentWidth) / 2 - bounds.minX * scale;
  const translateY = padding + (availableHeight - contentHeight) / 2 - bounds.minY * scale;
  return { scale, translateX, translateY };
}

function setScreenTitle(title) {
  const normalized = (title || "").trim();
  screenTitle.textContent = normalized;
  screenTitle.classList.toggle("hidden", !normalized);
}

function drawStrokePoint(context, point, transform, radius) {
  context.beginPath();
  context.arc(
    point.x * transform.scale + transform.translateX,
    point.y * transform.scale + transform.translateY,
    radius,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function drawSignature(context, signature, transform, pointRadius = Math.max(2, context.lineWidth / 2)) {
  signature.strokes.forEach((stroke) => {
    if (stroke.length === 0) {
      return;
    }

    if (stroke.length === 1) {
      drawStrokePoint(context, stroke[0], transform, pointRadius);
      return;
    }

    context.beginPath();
    context.moveTo(
      stroke[0].x * transform.scale + transform.translateX,
      stroke[0].y * transform.scale + transform.translateY,
    );
    for (let index = 1; index < stroke.length; index += 1) {
      context.lineTo(
        stroke[index].x * transform.scale + transform.translateX,
        stroke[index].y * transform.scale + transform.translateY,
      );
    }
    context.stroke();
  });
}

function createBackgroundItem(signature) {
  const bounds = boundsForSignature(signature);
  const padding = 54;
  const longestSide = 560;
  const baseScale = longestSide / Math.max(bounds.width, bounds.height);
  const spriteWidth = Math.max(220, Math.round(bounds.width * baseScale + padding * 2));
  const spriteHeight = Math.max(180, Math.round(bounds.height * baseScale + padding * 2));

  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = spriteWidth;
  spriteCanvas.height = spriteHeight;
  const spriteContext = spriteCanvas.getContext("2d");
  spriteContext.lineCap = "round";
  spriteContext.lineJoin = "round";
  spriteContext.lineWidth = 3.2;
  spriteContext.strokeStyle = "rgba(249, 240, 224, 0.82)";
  spriteContext.fillStyle = "rgba(249, 240, 224, 0.82)";

  const transform = buildTightTransform(bounds, spriteWidth, spriteHeight, padding);
  drawSignature(spriteContext, signature, transform, Math.max(3.5, spriteContext.lineWidth * 0.95));

  const scale = 0.42 + Math.random() * 0.36;
  const width = spriteCanvas.width * scale;
  const height = spriteCanvas.height * scale;

  return {
    id: signature.id,
    image: spriteCanvas,
    baseWidth: width,
    baseHeight: height,
    x: 0,
    y: 0,
    width,
    height,
    driftX: 0,
    driftY: 0,
    alpha: 0.22 + Math.random() * 0.16,
    idleAlpha: 0.82 + Math.random() * 0.1,
    pulse: Math.random() * Math.PI * 2,
    scaleWeight: 0.9 + Math.random() * 0.22,
  };
}

function buildEndingActor(signature, item = null) {
  const actor = item || createBackgroundItem(signature);
  return {
    id: signature.id,
    signature,
    signatureDuration: maxSignatureTime(signature),
    image: actor.image,
    x: actor.x,
    y: actor.y,
    width: actor.width,
    height: actor.height,
    startX: actor.x,
    startY: actor.y,
    startWidth: actor.width,
    startHeight: actor.height,
    alpha: 1,
  };
}

function uniqueSignatures(signatures) {
  const byId = new Map();
  signatures.forEach((signature) => {
    if (signature && !byId.has(signature.id)) {
      byId.set(signature.id, signature);
    }
  });
  return Array.from(byId.values());
}

function maxSignatureTime(signature) {
  let maxTime = 0;
  signature.strokes.forEach((stroke) => {
    stroke.forEach((point) => {
      maxTime = Math.max(maxTime, point.t);
    });
  });
  return Math.max(1, maxTime);
}

function drawStrokeProgress(context, stroke, transform, threshold, pointRadius) {
  if (!stroke.length || threshold < stroke[0].t) {
    return;
  }

  if (stroke.length === 1) {
    drawStrokePoint(context, stroke[0], transform, pointRadius);
    return;
  }

  if (threshold < stroke[1].t) {
    drawStrokePoint(context, stroke[0], transform, pointRadius);
    return;
  }

  context.beginPath();
  context.moveTo(
    stroke[0].x * transform.scale + transform.translateX,
    stroke[0].y * transform.scale + transform.translateY,
  );

  for (let index = 1; index < stroke.length; index += 1) {
    const previous = stroke[index - 1];
    const point = stroke[index];
    if (threshold >= point.t) {
      context.lineTo(
        point.x * transform.scale + transform.translateX,
        point.y * transform.scale + transform.translateY,
      );
      continue;
    }

    const span = Math.max(1, point.t - previous.t);
    const ratio = Math.min(1, Math.max(0, (threshold - previous.t) / span));
    const x = previous.x + (point.x - previous.x) * ratio;
    const y = previous.y + (point.y - previous.y) * ratio;
    context.lineTo(
      x * transform.scale + transform.translateX,
      y * transform.scale + transform.translateY,
    );
    break;
  }

  context.stroke();
}

function drawSignatureProgress(context, signature, signatureDuration, rect, progress, alpha) {
  const bounds = boundsForSignature(signature);
  const transform = buildTightTransform(bounds, rect.width, rect.height, 10);
  transform.translateX += rect.x;
  transform.translateY += rect.y;

  context.save();
  context.globalAlpha = alpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1.8, Math.min(rect.width, rect.height) * 0.018);
  context.strokeStyle = "rgba(255, 248, 236, 0.94)";
  context.fillStyle = "rgba(255, 248, 236, 0.94)";
  context.shadowBlur = 18;
  context.shadowColor = "rgba(255, 250, 242, 0.58)";

  const threshold = signatureDuration * Math.min(1, Math.max(0, progress));
  signature.strokes.forEach((stroke) => {
    drawStrokeProgress(context, stroke, transform, threshold, Math.max(1.4, context.lineWidth * 0.52));
  });
  context.restore();
}

function ensureBackgroundSignature(signature) {
  if (backgroundItems.some((item) => item.id === signature.id)) {
    return;
  }
  backgroundItems.push(createBackgroundItem(signature));
  relayoutBackgroundItems();
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function getLayoutScale(count) {
  if (count <= 1) {
    return 1;
  }
  const densityScale = 1 / Math.sqrt(count * 0.82);
  return Math.max(0.34, Math.min(0.92, densityScale * 1.55));
}

function randomVelocity(baseSpeed) {
  const direction = Math.random() > 0.5 ? 1 : -1;
  return direction * (baseSpeed * (0.7 + Math.random() * 0.6));
}

function relayoutBackgroundItems() {
  if (backgroundItems.length === 0) {
    return;
  }

  const layoutScale = getLayoutScale(backgroundItems.length);
  const placed = [];
  const visibleWidth = window.innerWidth - BACKGROUND_PADDING * 2;
  const visibleHeight = window.innerHeight - BACKGROUND_PADDING * 2;
  const idleMode = isIdleMode();
  const baseSpeed = idleMode ? 0.55 : 0.26;

  backgroundItems.forEach((item) => {
    item.width = Math.max(120, item.baseWidth * layoutScale * item.scaleWeight);
    item.height = Math.max(96, item.baseHeight * layoutScale * item.scaleWeight);

    let placedRect = null;
    for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt += 1) {
      const candidate = {
        x: BACKGROUND_PADDING + Math.random() * Math.max(visibleWidth - item.width, 1),
        y: BACKGROUND_PADDING + Math.random() * Math.max(visibleHeight - item.height, 1),
        width: item.width,
        height: item.height,
      };
      if (!placed.some((other) => rectsOverlap(candidate, other))) {
        placedRect = candidate;
        break;
      }
    }

    if (!placedRect) {
      const fallbackScale = 0.84;
      item.width *= fallbackScale;
      item.height *= fallbackScale;
      placedRect = {
        x: BACKGROUND_PADDING + Math.random() * Math.max(visibleWidth - item.width, 1),
        y: BACKGROUND_PADDING + Math.random() * Math.max(visibleHeight - item.height, 1),
        width: item.width,
        height: item.height,
      };
    }

    item.x = placedRect.x;
    item.y = placedRect.y;
    item.driftX = randomVelocity(baseSpeed);
    item.driftY = randomVelocity(baseSpeed * 0.88);
    placed.push(placedRect);
  });
}

function currentDisplayRect(item, idleMode) {
  const pulseScale = 1 + Math.sin(item.pulse) * (idleMode ? 0.06 : 0.018);
  const emphasisScale = idleMode ? 1.08 : 1;
  const width = item.width * pulseScale * emphasisScale;
  const height = item.height * pulseScale * emphasisScale;
  return {
    x: item.x - (width - item.width) / 2,
    y: item.y - (height - item.height) / 2,
    width,
    height,
  };
}

function resolveItemCollisions(item, itemRect, index, idleMode) {
  for (let otherIndex = index + 1; otherIndex < backgroundItems.length; otherIndex += 1) {
    const other = backgroundItems[otherIndex];
    const otherRect = currentDisplayRect(other, idleMode);
    if (!rectsOverlap(itemRect, otherRect)) {
      continue;
    }

    const overlapX = Math.min(itemRect.x + itemRect.width, otherRect.x + otherRect.width) - Math.max(itemRect.x, otherRect.x);
    const overlapY = Math.min(itemRect.y + itemRect.height, otherRect.y + otherRect.height) - Math.max(itemRect.y, otherRect.y);

    if (overlapX < overlapY) {
      const push = overlapX / 2 + 1;
      if (itemRect.x < otherRect.x) {
        item.x -= push;
        other.x += push;
      } else {
        item.x += push;
        other.x -= push;
      }
      const velocity = item.driftX;
      item.driftX = -other.driftX;
      other.driftX = -velocity;
    } else {
      const push = overlapY / 2 + 1;
      if (itemRect.y < otherRect.y) {
        item.y -= push;
        other.y += push;
      } else {
        item.y += push;
        other.y -= push;
      }
      const velocity = item.driftY;
      item.driftY = -other.driftY;
      other.driftY = -velocity;
    }
  }
}

function easeInOutCubic(value) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }
  return 1 - ((-2 * value + 2) ** 3) / 2;
}

function easeInQuint(value) {
  return value ** 5;
}

function easeInCubic(value) {
  return value ** 3;
}

function easeOutQuart(value) {
  return 1 - (1 - value) ** 4;
}

function mixedConvergeEase(value) {
  return Math.min(1, value * 0.18 + easeInQuint(value) * 0.82);
}

function drawEnergyOrb(context, centerX, centerY, coreRadius, glowRadius, alpha) {
  const gradient = context.createRadialGradient(
    centerX,
    centerY,
    Math.max(1, coreRadius * 0.18),
    centerX,
    centerY,
    glowRadius,
  );
  gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
  gradient.addColorStop(0.28, `rgba(255, 255, 255, ${Math.min(1, alpha * 0.92)})`);
  gradient.addColorStop(0.62, `rgba(255, 255, 255, ${Math.min(1, alpha * 0.28)})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.fillStyle = gradient;
  context.beginPath();
  context.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha)})`;
  context.beginPath();
  context.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
  context.fill();
}

function drawFlashWave(context, centerX, centerY, radius, alpha) {
  const innerRadius = Math.max(1, radius * 0.34);
  const gradient = context.createRadialGradient(
    centerX,
    centerY,
    innerRadius,
    centerX,
    centerY,
    radius,
  );
  gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha * 0.08)})`);
  gradient.addColorStop(0.55, `rgba(255, 255, 255, ${Math.min(1, alpha * 0.18)})`);
  gradient.addColorStop(0.82, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
}

async function startEndingSequence() {
  if (endingSequence) {
    return;
  }

  playbackRunId += 1;
  playing = false;
  updateHint("");
  screenOverlay.classList.add("sequence-hidden");

  let state;
  try {
    state = await fetchScreenState();
  } catch (error) {
    console.error(error);
    state = {
      background_signatures: [],
      pending_signatures: [],
    };
  }

  const allSignatures = uniqueSignatures([
    ...state.background_signatures,
    ...state.pending_signatures,
    ...pendingQueue,
    currentPlaybackSignature,
  ]);

  const existingItems = new Map(backgroundItems.map((item) => [item.id, item]));
  const actors = allSignatures.map((signature, index) => {
    const existing = existingItems.get(signature.id);
    const actor = buildEndingActor(signature, existing);
    if (!existing) {
      const orbitRadiusX = window.innerWidth * 0.22 + (index % 5) * 36;
      const orbitRadiusY = window.innerHeight * 0.18 + (index % 7) * 24;
      const angle = (Math.PI * 2 * index) / Math.max(allSignatures.length, 1);
      actor.x = window.innerWidth / 2 + Math.cos(angle) * orbitRadiusX - actor.width / 2;
      actor.y = window.innerHeight / 2 + Math.sin(angle) * orbitRadiusY - actor.height / 2;
      actor.startX = actor.x;
      actor.startY = actor.y;
    }
    return actor;
  });

  pendingQueue = [];
  currentPlaybackSignature = null;
  playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);

  endingSequence = {
    startedAt: performance.now(),
    actors,
    completed: false,
  };
}

function drawEndingSequence(now) {
  if (!endingSequence) {
    return false;
  }

  const convergeDuration = 2800;
  const fuseDuration = 1100;
  const blastDuration = 1180;
  const totalDuration = convergeDuration + fuseDuration + blastDuration;
  const elapsed = now - endingSequence.startedAt;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const maxRadius = Math.hypot(window.innerWidth, window.innerHeight);

  backgroundContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);

  if (elapsed <= convergeDuration) {
    const progress = mixedConvergeEase(Math.min(elapsed / convergeDuration, 1));
    const replayProgress = easeOutQuart(Math.min(1, elapsed / (convergeDuration * 0.78)));
    endingSequence.actors.forEach((actor) => {
      const targetWidth = Math.max(10, actor.startWidth * 0.1);
      const targetHeight = Math.max(8, actor.startHeight * 0.1);
      const targetX = centerX - targetWidth / 2;
      const targetY = centerY - targetHeight / 2;
      const width = actor.startWidth + (targetWidth - actor.startWidth) * progress;
      const height = actor.startHeight + (targetHeight - actor.startHeight) * progress;
      const x = actor.startX + (targetX - actor.startX) * progress;
      const y = actor.startY + (targetY - actor.startY) * progress;

      drawSignatureProgress(
        backgroundContext,
        actor.signature,
        actor.signatureDuration,
        { x, y, width, height },
        replayProgress,
        0.28 + (1 - progress) * 0.72,
      );
    });

    const orbProgress = Math.max(0, (progress - 0.5) / 0.5);
    const coreRadius = 0.4 + orbProgress * 8;
    const glowRadius = 4 + orbProgress * 22;
    playbackContext.globalCompositeOperation = "screen";
    playbackContext.shadowBlur = 10 + orbProgress * 18;
    playbackContext.shadowColor = "rgba(255, 255, 255, 0.78)";
    if (orbProgress > 0) {
      drawEnergyOrb(playbackContext, centerX, centerY, coreRadius, glowRadius, 0.28 + orbProgress * 0.62);
    }
    playbackContext.globalCompositeOperation = "source-over";
  } else if (elapsed <= convergeDuration + fuseDuration) {
    const progress = easeInOutCubic((elapsed - convergeDuration) / fuseDuration);

    endingSequence.actors.forEach((actor, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(endingSequence.actors.length, 1);
      const drift = (1 - progress) * 12;
      const width = Math.max(5, actor.startWidth * (0.1 - progress * 0.06));
      const height = Math.max(4, actor.startHeight * (0.1 - progress * 0.06));
      const x = centerX - width / 2 + Math.cos(angle) * drift;
      const y = centerY - height / 2 + Math.sin(angle) * drift;
      backgroundContext.globalAlpha = (1 - progress) * 0.42;
      backgroundContext.shadowBlur = 24;
      backgroundContext.shadowColor = "rgba(255, 255, 255, 0.8)";
      backgroundContext.drawImage(actor.image, x, y, width, height);
    });

    const coreRadius = 8 + progress * 10;
    const glowRadius = 24 + progress * 18;
    playbackContext.globalCompositeOperation = "screen";
    playbackContext.shadowBlur = 34 + progress * 20;
    playbackContext.shadowColor = "rgba(255, 255, 255, 0.98)";
    drawEnergyOrb(playbackContext, centerX, centerY, coreRadius, glowRadius, 0.92 + progress * 0.08);
    playbackContext.globalCompositeOperation = "source-over";
  } else if (elapsed <= totalDuration) {
    const phaseProgress = (elapsed - convergeDuration - fuseDuration) / blastDuration;
    const progress = easeOutQuart(phaseProgress);
    const ringProgress = easeInCubic(Math.min(1, phaseProgress * 1.06));
    const flashRadius = ringProgress * maxRadius * 1.14;
    const whiteAlpha = Math.min(1, 0.08 + progress * 0.92);

    backgroundContext.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
    backgroundContext.fillRect(0, 0, window.innerWidth, window.innerHeight);

    playbackContext.globalCompositeOperation = "screen";
    playbackContext.shadowBlur = 52 + progress * 24;
    playbackContext.shadowColor = "rgba(255, 255, 255, 1)";
    drawFlashWave(playbackContext, centerX, centerY, Math.max(12, flashRadius), 0.34 + progress * 0.56);
    drawEnergyOrb(
      playbackContext,
      centerX,
      centerY,
      Math.max(4, 8 + progress * 18),
      Math.max(18, 26 + flashRadius * 0.86),
      Math.min(1, 0.72 + progress * 0.28),
    );
    playbackContext.globalCompositeOperation = "source-over";
  } else {
    backgroundContext.fillStyle = "#ffffff";
    backgroundContext.fillRect(0, 0, window.innerWidth, window.innerHeight);
    endingSequence.completed = true;
  }

  backgroundContext.globalAlpha = 1;
  backgroundContext.shadowBlur = 0;
  playbackContext.globalAlpha = 1;
  playbackContext.shadowBlur = 0;

  return true;
}

function animateBackground() {
  if (drawEndingSequence(performance.now())) {
    window.requestAnimationFrame(animateBackground);
    return;
  }

  backgroundContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const idleMode = isIdleMode();

  backgroundItems.forEach((item, index) => {
    const speedMultiplier = idleMode ? 0.8 : 0.3;
    item.x += item.driftX * speedMultiplier;
    item.y += item.driftY * speedMultiplier;
    item.pulse += (idleMode ? 0.0068 : 0.0028) + index * 0.00008;

    const rect = currentDisplayRect(item, idleMode);
    if (rect.x <= BACKGROUND_PADDING || rect.x + rect.width >= window.innerWidth - BACKGROUND_PADDING) {
      item.driftX *= -1;
      item.x = Math.min(
        Math.max(item.x, BACKGROUND_PADDING + (rect.width - item.width) / 2),
        window.innerWidth - BACKGROUND_PADDING - item.width - (rect.width - item.width) / 2,
      );
    }
    if (rect.y <= BACKGROUND_PADDING || rect.y + rect.height >= window.innerHeight - BACKGROUND_PADDING) {
      item.driftY *= -1;
      item.y = Math.min(
        Math.max(item.y, BACKGROUND_PADDING + (rect.height - item.height) / 2),
        window.innerHeight - BACKGROUND_PADDING - item.height - (rect.height - item.height) / 2,
      );
    }

    resolveItemCollisions(item, rect, index, idleMode);

    const drawRect = currentDisplayRect(item, idleMode);
    backgroundContext.globalAlpha = idleMode ? Math.max(0.97, item.idleAlpha + 0.08) : Math.max(0.42, item.alpha + 0.08);
    backgroundContext.shadowBlur = idleMode ? 64 : 14;
    backgroundContext.shadowColor = idleMode ? "rgba(255, 252, 245, 0.72)" : "rgba(255, 247, 232, 0.22)";
    backgroundContext.drawImage(item.image, drawRect.x, drawRect.y, drawRect.width, drawRect.height);
  });

  backgroundContext.globalAlpha = 1;
  backgroundContext.shadowBlur = 0;
  window.requestAnimationFrame(animateBackground);
}

async function fetchSignature(signatureId) {
  const response = await fetch(`/api/signatures/${signatureId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch signature ${signatureId}`);
  }
  return response.json();
}

async function fetchScreenState() {
  const response = await fetch("/api/screen-state");
  if (!response.ok) {
    throw new Error("Failed to fetch screen state");
  }
  return response.json();
}

async function markSignatureCompleted(signatureId) {
  const response = await fetch(`/api/signatures/${signatureId}/complete`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to complete signature");
  }
  const data = await response.json();
  return data.signature;
}

async function playSignature(signature, runId) {
  const transform = buildTransform(signature, window.innerWidth, window.innerHeight, 0.5, 0.36);
  playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  playbackContext.lineCap = "round";
  playbackContext.lineJoin = "round";
  playbackContext.lineWidth = Math.max(3, transform.scale * 4.4);
  playbackContext.strokeStyle = "#fff9ef";
  playbackContext.fillStyle = "#fff9ef";
  playbackContext.shadowBlur = 26;
  playbackContext.shadowColor = "rgba(245, 223, 187, 0.24)";

  let previousTime = 0;
  for (const stroke of signature.strokes) {
    if (runId !== playbackRunId || endingSequence) {
      playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      return false;
    }

    if (stroke.length === 0) {
      continue;
    }

    const firstPoint = stroke[0];
    if (firstPoint.t > previousTime) {
      await sleep(firstPoint.t - previousTime);
      if (runId !== playbackRunId || endingSequence) {
        playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
        return false;
      }
    }

    if (stroke.length === 1) {
      drawStrokePoint(playbackContext, firstPoint, transform, playbackContext.lineWidth / 2.2);
      previousTime = firstPoint.t;
      continue;
    }

    playbackContext.beginPath();
    playbackContext.moveTo(
      firstPoint.x * transform.scale + transform.translateX,
      firstPoint.y * transform.scale + transform.translateY,
    );
    previousTime = firstPoint.t;

    for (let index = 1; index < stroke.length; index += 1) {
      const point = stroke[index];
      const wait = Math.max(0, point.t - previousTime);
      if (wait > 0) {
        await sleep(wait);
        if (runId !== playbackRunId || endingSequence) {
          playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
          return false;
        }
      }
      playbackContext.lineTo(
        point.x * transform.scale + transform.translateX,
        point.y * transform.scale + transform.translateY,
      );
      playbackContext.stroke();
      previousTime = point.t;
    }
  }

  await sleep(650);
  if (runId !== playbackRunId || endingSequence) {
    playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    return false;
  }
  playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  return true;
}

function enqueueSignature(signature) {
  if (pendingQueue.some((item) => item.id === signature.id)) {
    return;
  }
  pendingQueue.push(signature);
}

async function playNextIfNeeded() {
  if (endingSequence) {
    return;
  }

  if (playing || pendingQueue.length === 0) {
    if (!playing && pendingQueue.length === 0 && backgroundItems.length === 0) {
      updateHint("等待第一位来宾落笔");
    }
    return;
  }

  playing = true;

  while (pendingQueue.length > 0) {
    const current = pendingQueue.shift();
    const runId = ++playbackRunId;
    currentPlaybackSignature = current;
    updateHint("");
    const completedPlayback = await playSignature(current, runId);
    if (!completedPlayback || endingSequence || runId !== playbackRunId) {
      break;
    }
    try {
      const completedSignature = await markSignatureCompleted(current.id);
      ensureBackgroundSignature(completedSignature);
    } catch (error) {
      console.error(error);
      const state = await fetchScreenState();
      pendingQueue = state.pending_signatures;
      backgroundItems = state.background_signatures.map(createBackgroundItem);
      break;
    }
  }

  currentPlaybackSignature = null;
  playing = false;
  if (endingSequence) {
    return;
  }
  if (backgroundItems.length > 0) {
    updateHint("");
  } else {
    updateHint("等待第一位来宾落笔");
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/screen`);

  socket.addEventListener("message", async (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "ending_sequence_started") {
      await startEndingSequence();
      return;
    }

    if (payload.type === "background_image_updated") {
      updateBackgroundImage(payload.background_image_url);
      return;
    }

    if (payload.type === "background_opacity_updated") {
      updateBackgroundOpacity(payload.background_image_opacity);
      return;
    }

    if (payload.type === "screen_title_updated") {
      setScreenTitle(payload.screen_title);
      return;
    }

    if (payload.type === "signatures_cleared") {
      endingSequence = null;
      playbackRunId += 1;
      pendingQueue = [];
      backgroundItems = [];
      currentPlaybackSignature = null;
      screenOverlay.classList.remove("sequence-hidden");
      playbackContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      updateHint("签名已清空，等待新的来宾落笔");
      playing = false;
      return;
    }

    if (payload.type !== "signature_submitted" || endingSequence) {
      return;
    }

    try {
      const signature = await fetchSignature(payload.signature_id);
      enqueueSignature(signature);
      updateHint(`收到新签名，当前排队 ${payload.queue_length} 份`);
      playNextIfNeeded();
    } catch (error) {
      console.error(error);
    }
  });

  socket.addEventListener("open", () => {
    window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 20000);
  });

  socket.addEventListener("close", () => {
    window.setTimeout(connectWebSocket, 1500);
  });
}

async function bootstrap() {
  setupCanvases();
  animateBackground();

  try {
    const state = await fetchScreenState();
    backgroundItems = state.background_signatures.map(createBackgroundItem);
    relayoutBackgroundItems();
    pendingQueue = state.pending_signatures;
    updateBackgroundOpacity(state.background_image_opacity);
    updateBackgroundImage(state.background_image_url);
    setScreenTitle(state.screen_title);
    if (pendingQueue.length > 0) {
      updateHint("恢复排队签名中");
    }
    playNextIfNeeded();
  } catch (error) {
    console.error(error);
    updateHint("大屏初始化失败，请刷新页面");
  }

  connectWebSocket();
}

async function requestFullscreenMode() {
  if (document.fullscreenElement) {
    fullscreenButton.classList.add("hidden");
    return;
  }
  try {
    await document.documentElement.requestFullscreen();
    fullscreenButton.classList.add("hidden");
  } catch (error) {
    fullscreenButton.classList.remove("hidden");
  }
}

fullscreenButton.addEventListener("click", async () => {
  await requestFullscreenMode();
});

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    fullscreenButton.classList.add("hidden");
  } else {
    fullscreenButton.classList.remove("hidden");
  }
});

window.addEventListener("resize", () => {
  setupCanvases();
  if (!endingSequence) {
    relayoutBackgroundItems();
  }
});

bootstrap();
window.addEventListener("load", () => {
  window.setTimeout(() => {
    requestFullscreenMode();
  }, 120);
}, { once: true });
