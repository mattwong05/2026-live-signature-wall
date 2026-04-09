const canvas = document.getElementById("signatureCanvas");
const resetButton = document.getElementById("resetButton");
const submitButton = document.getElementById("submitButton");
const statusMessage = document.getElementById("statusMessage");
const pledgeLine = document.getElementById("pledgeLine");

const context = canvas.getContext("2d");
let strokes = [];
let activeStroke = null;
let pointerActive = false;
let sessionStart = 0;
let logicalWidth = 0;
let logicalHeight = 0;
let deviceScale = 1;
let pledgeLines = [];

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`.trim();
}

function applyResponsiveCard() {
  const card = document.querySelector(".sign-card");
  const landscape = window.innerWidth > window.innerHeight;
  card.classList.toggle("landscape", landscape);
}

function setupCanvas() {
  applyResponsiveCard();
  deviceScale = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  logicalWidth = Math.round(rect.width);
  logicalHeight = Math.round(rect.height);
  canvas.width = Math.round(logicalWidth * deviceScale);
  canvas.height = Math.round(logicalHeight * deviceScale);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(deviceScale, deviceScale);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 4;
  context.strokeStyle = "#1f2f44";
  context.fillStyle = "#1f2f44";
  redraw();
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

function redraw() {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 4;
  context.strokeStyle = "#1f2f44";
  context.fillStyle = "#1f2f44";

  for (const stroke of strokes) {
    drawStroke(stroke);
  }
  if (activeStroke && activeStroke.length > 0) {
    drawStroke(activeStroke);
  }
}

function drawStroke(stroke) {
  if (stroke.length === 1) {
    const point = stroke[0];
    context.beginPath();
    context.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(stroke[0].x, stroke[0].y);
  for (let index = 1; index < stroke.length; index += 1) {
    context.lineTo(stroke[index].x, stroke[index].y);
  }
  context.stroke();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = logicalWidth / rect.width;
  const scaleY = logicalHeight / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
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
  sessionStart = 0;
  redraw();
  showStatus("签名已重置。");
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const point = pointerPosition(event);
  activeStroke = [{ ...point, t: timestamp() }];
  pointerActive = true;
  redraw();
});

canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
}, { passive: false });

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
}, { passive: false });

canvas.addEventListener("gesturestart", (event) => {
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerActive || !activeStroke) {
    return;
  }
  event.preventDefault();
  const point = pointerPosition(event);
  activeStroke.push({ ...point, t: timestamp() });
  redraw();
});

function finishStroke(event) {
  if (!pointerActive || !activeStroke) {
    return;
  }
  event.preventDefault();
  canvas.releasePointerCapture(event.pointerId);
  strokes.push(activeStroke);
  activeStroke = null;
  pointerActive = false;
  redraw();
}

canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);
canvas.addEventListener("pointerleave", (event) => {
  if (pointerActive && event.buttons === 0) {
    finishStroke(event);
  }
});

resetButton.addEventListener("click", () => {
  resetSignature();
});

submitButton.addEventListener("click", async () => {
  if (!hasSignature()) {
    showStatus("请先完成签名后再提交。", "error");
    return;
  }

  submitButton.disabled = true;
  resetButton.disabled = true;
  showStatus("正在提交签名...");

  const rect = canvas.getBoundingClientRect();

  try {
    const response = await fetch("/api/signatures", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        canvas_width: Math.round(rect.width),
        canvas_height: Math.round(rect.height),
        strokes,
      }),
    });

    if (!response.ok) {
      throw new Error("提交失败");
    }

    resetSignature();
    showStatus("签名提交成功，大屏将按顺序播放。", "success");
  } catch (error) {
    console.error(error);
    showStatus("提交失败，请稍后重试。", "error");
  } finally {
    submitButton.disabled = false;
    resetButton.disabled = false;
  }
});

window.addEventListener("resize", setupCanvas);
setupCanvas();
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
