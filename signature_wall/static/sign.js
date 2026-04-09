const baseCanvas = document.getElementById("signatureCanvas");
const expandedCanvas = document.getElementById("expandedSignatureCanvas");
const resetButton = document.getElementById("resetButton");
const submitButton = document.getElementById("submitButton");
const expandedResetButton = document.getElementById("expandedResetButton");
const expandedSubmitButton = document.getElementById("expandedSubmitButton");
const expandedCloseButton = document.getElementById("expandedCloseButton");
const expandedSigningOverlay = document.getElementById("expandedSigningOverlay");
const phoneSigningHint = document.getElementById("phoneSigningHint");
const statusMessage = document.getElementById("statusMessage");
const pledgeLine = document.getElementById("pledgeLine");

const baseContext = baseCanvas.getContext("2d");
const expandedContext = expandedCanvas.getContext("2d");
const canvasState = new Map([
  [baseCanvas, { context: baseContext, logicalWidth: 0, logicalHeight: 0, deviceScale: 1 }],
  [expandedCanvas, { context: expandedContext, logicalWidth: 0, logicalHeight: 0, deviceScale: 1 }],
]);

let strokes = [];
let activeStroke = null;
let pointerActive = false;
let activeCanvas = null;
let sessionStart = 0;
let pledgeLines = [];
let submissionSize = { width: 0, height: 0 };

function updateExpandedWorkbenchLayout() {
  const stage = expandedSigningOverlay.querySelector(".sign-overlay-stage");
  const rail = expandedSigningOverlay.querySelector(".sign-overlay-rail");
  const rotatedWorkbench = expandedSigningOverlay.querySelector(".rotated-workbench");
  if (!stage || !rail || !rotatedWorkbench) {
    return;
  }

  const railStyles = window.getComputedStyle(rail);
  const railWidth = parseFloat(railStyles.width || "74");
  const gap = parseFloat(window.getComputedStyle(rotatedWorkbench).gap || "12");
  const stageRect = stage.getBoundingClientRect();
  const availableVisualWidth = Math.max(220, stageRect.width);
  const availableVisualHeight = Math.max(280, stageRect.height);

  const preRotateWidth = Math.max(260, availableVisualHeight);
  const preRotateHeight = Math.max(180, availableVisualWidth);

  const usableHeight = Math.max(180, preRotateHeight);
  const usableWidth = Math.max(260, preRotateWidth);
  const frameWidth = Math.max(220, usableWidth - railWidth - gap);

  expandedSigningOverlay.style.setProperty("--expanded-workbench-width", `${usableWidth}px`);
  expandedSigningOverlay.style.setProperty("--expanded-workbench-height", `${usableHeight}px`);
  expandedSigningOverlay.style.setProperty("--expanded-frame-width", `${frameWidth}px`);
}

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`.trim();
}

function isPhoneLikeDevice() {
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const longSide = Math.max(window.innerWidth, window.innerHeight);
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return coarsePointer && shortSide <= 540 && longSide <= 960;
}

function applyResponsiveCard() {
  const card = document.querySelector(".sign-card");
  const landscape = window.innerWidth > window.innerHeight;
  card.classList.toggle("landscape", landscape);
  phoneSigningHint.classList.toggle("hidden", !isPhoneLikeDevice());
}

function setupSingleCanvas(targetCanvas) {
  const state = canvasState.get(targetCanvas);
  if (!state) {
    return;
  }

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  state.logicalWidth = Math.max(1, Math.round(targetCanvas.clientWidth || targetCanvas.getBoundingClientRect().width));
  state.logicalHeight = Math.max(1, Math.round(targetCanvas.clientHeight || targetCanvas.getBoundingClientRect().height));
  state.deviceScale = ratio;
  targetCanvas.width = Math.round(state.logicalWidth * ratio);
  targetCanvas.height = Math.round(state.logicalHeight * ratio);
}

function setupCanvases() {
  applyResponsiveCard();
  updateExpandedWorkbenchLayout();
  setupSingleCanvas(baseCanvas);
  setupSingleCanvas(expandedCanvas);
  redrawAll();
}

function chooseRandomPledge() {
  if (!pledgeLines.length) {
    pledgeLine.textContent = "依法管水、科学配水、节水优先，守护右江灌区每一滴水";
    return;
  }
  const index = Math.floor(Math.random() * pledgeLines.length);
  pledgeLine.textContent = pledgeLines[index];
}

async function loadSignConfig() {
  const response = await fetch("/api/sign-config");
  if (!response.ok) {
    throw new Error("Failed to load sign config");
  }
  const data = await response.json();
  pledgeLines = Array.isArray(data.pledge_lines) ? data.pledge_lines : [];
  chooseRandomPledge();
}

async function requestSignFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    if (window.screen?.orientation?.lock) {
      try {
        await window.screen.orientation.lock("landscape");
      } catch (error) {
        console.debug("Landscape lock unavailable", error);
      }
    }
  } catch (error) {
    console.debug("Auto fullscreen unavailable", error);
  }
}

async function requestOverlayFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await expandedSigningOverlay.requestFullscreen();
    }
    if (window.screen?.orientation?.lock) {
      try {
        await window.screen.orientation.lock("landscape");
      } catch (error) {
        console.debug("Overlay landscape lock unavailable", error);
      }
    }
  } catch (error) {
    console.debug("Overlay fullscreen unavailable", error);
  }
}

function drawStrokePoint(context, state, point, radius) {
  context.beginPath();
  context.arc(point.x * state.logicalWidth, point.y * state.logicalHeight, radius, 0, Math.PI * 2);
  context.fill();
}

function drawStroke(context, state, stroke) {
  if (stroke.length === 1) {
    drawStrokePoint(context, state, stroke[0], 2.2);
    return;
  }

  context.beginPath();
  context.moveTo(stroke[0].x * state.logicalWidth, stroke[0].y * state.logicalHeight);
  for (let index = 1; index < stroke.length; index += 1) {
    context.lineTo(stroke[index].x * state.logicalWidth, stroke[index].y * state.logicalHeight);
  }
  context.stroke();
}

function redrawCanvas(targetCanvas) {
  const state = canvasState.get(targetCanvas);
  if (!state) {
    return;
  }
  const { context, logicalWidth, logicalHeight, deviceScale } = state;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 4;
  context.strokeStyle = "#1f2f44";
  context.fillStyle = "#1f2f44";

  if (!logicalWidth || !logicalHeight) {
    return;
  }

  for (const stroke of strokes) {
    drawStroke(context, state, stroke);
  }
  if (activeStroke && activeCanvas === targetCanvas && activeStroke.length > 0) {
    drawStroke(context, state, activeStroke);
  }
}

function redrawAll() {
  redrawCanvas(baseCanvas);
  redrawCanvas(expandedCanvas);
}

function pointerPosition(event, targetCanvas) {
  const state = canvasState.get(targetCanvas);
  const rect = targetCanvas.getBoundingClientRect();
  if (!state || !rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }

  if (targetCanvas === expandedCanvas) {
    const visualX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const visualY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return {
      x: visualY,
      y: 1 - visualX,
    };
  }

  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function timestamp() {
  if (!sessionStart) {
    sessionStart = performance.now();
  }
  return Math.round(performance.now() - sessionStart);
}

function hasSignature() {
  return strokes.some((stroke) => stroke.length > 0) || (activeStroke && activeStroke.length > 0);
}

function resetSignature() {
  strokes = [];
  activeStroke = null;
  pointerActive = false;
  activeCanvas = null;
  sessionStart = 0;
  submissionSize = { width: 0, height: 0 };
  redrawAll();
  showStatus("签名已重置。");
}

function getCanvasSize(targetCanvas) {
  const state = canvasState.get(targetCanvas);
  return {
    width: state?.logicalWidth || 0,
    height: state?.logicalHeight || 0,
  };
}

function openExpandedSigning() {
  if (!isPhoneLikeDevice()) {
    return;
  }
  expandedSigningOverlay.classList.remove("hidden");
  expandedSigningOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-active");
  setupCanvases();
  window.setTimeout(() => {
    requestOverlayFullscreen();
  }, 40);
}

function closeExpandedSigning() {
  expandedSigningOverlay.classList.add("hidden");
  expandedSigningOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overlay-active");
  if (document.fullscreenElement === expandedSigningOverlay && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  redrawAll();
}

function startStroke(event, targetCanvas) {
  if (targetCanvas === baseCanvas && isPhoneLikeDevice()) {
    event.preventDefault();
    openExpandedSigning();
    return;
  }

  event.preventDefault();
  targetCanvas.setPointerCapture(event.pointerId);
  const point = pointerPosition(event, targetCanvas);
  activeStroke = [{ ...point, t: timestamp() }];
  activeCanvas = targetCanvas;
  pointerActive = true;
  submissionSize = getCanvasSize(targetCanvas);
  redrawAll();
}

function moveStroke(event, targetCanvas) {
  if (!pointerActive || !activeStroke || activeCanvas !== targetCanvas) {
    return;
  }
  event.preventDefault();
  const point = pointerPosition(event, targetCanvas);
  activeStroke.push({ ...point, t: timestamp() });
  redrawAll();
}

function finishStroke(event, targetCanvas) {
  if (!pointerActive || !activeStroke || activeCanvas !== targetCanvas) {
    return;
  }
  event.preventDefault();
  try {
    targetCanvas.releasePointerCapture(event.pointerId);
  } catch (error) {
    console.debug("Pointer release skipped", error);
  }
  strokes.push(activeStroke);
  activeStroke = null;
  pointerActive = false;
  activeCanvas = null;
  redrawAll();
}

function attachCanvasEvents(targetCanvas) {
  targetCanvas.addEventListener("pointerdown", (event) => {
    startStroke(event, targetCanvas);
  });

  targetCanvas.addEventListener("pointermove", (event) => {
    moveStroke(event, targetCanvas);
  });

  targetCanvas.addEventListener("pointerup", (event) => {
    finishStroke(event, targetCanvas);
  });

  targetCanvas.addEventListener("pointercancel", (event) => {
    finishStroke(event, targetCanvas);
  });

  targetCanvas.addEventListener("pointerleave", (event) => {
    if (pointerActive && activeCanvas === targetCanvas && event.buttons === 0) {
      finishStroke(event, targetCanvas);
    }
  });

  targetCanvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
  }, { passive: false });

  targetCanvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
  }, { passive: false });

  targetCanvas.addEventListener("gesturestart", (event) => {
    event.preventDefault();
  });
}

function serializeStrokes(width, height) {
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: Math.round(point.x * width * 1000) / 1000,
      y: Math.round(point.y * height * 1000) / 1000,
      t: point.t,
    })),
  );
}

async function submitSignature() {
  if (!hasSignature()) {
    showStatus("请先完成签名后再提交。", "error");
    return;
  }

  const width = submissionSize.width || getCanvasSize(baseCanvas).width;
  const height = submissionSize.height || getCanvasSize(baseCanvas).height;
  if (!width || !height) {
    showStatus("签名框尚未准备完成，请稍后重试。", "error");
    return;
  }

  submitButton.disabled = true;
  resetButton.disabled = true;
  expandedSubmitButton.disabled = true;
  expandedResetButton.disabled = true;
  expandedCloseButton.disabled = true;
  showStatus("正在提交签名...");

  try {
    const response = await fetch("/api/signatures", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        canvas_width: Math.round(width),
        canvas_height: Math.round(height),
        strokes: serializeStrokes(width, height),
      }),
    });

    if (!response.ok) {
      throw new Error("提交失败");
    }

    resetSignature();
    closeExpandedSigning();
    showStatus("签名提交成功，大屏将按顺序播放。", "success");
  } catch (error) {
    console.error(error);
    showStatus("提交失败，请稍后重试。", "error");
  } finally {
    submitButton.disabled = false;
    resetButton.disabled = false;
    expandedSubmitButton.disabled = false;
    expandedResetButton.disabled = false;
    expandedCloseButton.disabled = false;
  }
}

attachCanvasEvents(baseCanvas);
attachCanvasEvents(expandedCanvas);

resetButton.addEventListener("click", () => {
  resetSignature();
});

expandedResetButton.addEventListener("click", () => {
  resetSignature();
});

submitButton.addEventListener("click", submitSignature);
expandedSubmitButton.addEventListener("click", submitSignature);
expandedCloseButton.addEventListener("click", () => {
  closeExpandedSigning();
});

expandedSigningOverlay.addEventListener("click", (event) => {
  if (event.target === expandedSigningOverlay) {
    closeExpandedSigning();
  }
});

window.addEventListener("resize", setupCanvases);
setupCanvases();
showStatus("请直接在签名框中手写签名。");
loadSignConfig().catch((error) => {
  console.error(error);
  pledgeLine.textContent = "依法管水、科学配水、节水优先，守护右江灌区每一滴水";
});
window.addEventListener("load", () => {
  window.setTimeout(() => {
    requestSignFullscreen();
  }, 120);
}, { once: true });
