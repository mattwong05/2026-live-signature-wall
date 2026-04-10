const backgroundFile = document.getElementById("backgroundFile");
const uploadButton = document.getElementById("uploadButton");
const clearButton = document.getElementById("clearButton");
const backgroundPreview = document.getElementById("backgroundPreview");
const emptyState = document.getElementById("emptyState");
const adminStatus = document.getElementById("adminStatus");
const backgroundOpacityInput = document.getElementById("backgroundOpacityInput");
const backgroundOpacityValue = document.getElementById("backgroundOpacityValue");
const hostIpInput = document.getElementById("hostIpInput");
const saveIpButton = document.getElementById("saveIpButton");
const signPageUrl = document.getElementById("signPageUrl");
const qrPreview = document.getElementById("qrPreview");
const qrEmptyState = document.getElementById("qrEmptyState");
const clearSignaturesButton = document.getElementById("clearSignaturesButton");
const exportSignaturesButton = document.getElementById("exportSignaturesButton");
const screenTitleInput = document.getElementById("screenTitleInput");
const saveTitleButton = document.getElementById("saveTitleButton");
const pledgeLinesInput = document.getElementById("pledgeLinesInput");
const savePledgesButton = document.getElementById("savePledgesButton");
const signatureCount = document.getElementById("signatureCount");
const endSequenceButton = document.getElementById("endSequenceButton");
let refreshTimer = null;
let adminSocket = null;
let adminSocketRetryTimer = null;
let backgroundOpacitySaveTimer = null;

function showStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.style.color = isError ? "#b03b2c" : "#445668";
}

function updatePreview(imageUrl) {
  if (imageUrl) {
    backgroundPreview.src = `${imageUrl}?ts=${Date.now()}`;
    backgroundPreview.classList.remove("hidden");
    emptyState.classList.add("hidden");
  } else {
    backgroundPreview.src = "";
    backgroundPreview.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }
}

function setBackgroundOpacityValue(opacity) {
  const normalized = Number.isFinite(Number(opacity)) ? Math.max(0, Math.min(100, Number(opacity))) : 50;
  backgroundOpacityInput.value = String(normalized);
  backgroundOpacityValue.textContent = `${normalized}%`;
}

async function loadAdminConfig() {
  const response = await fetch("/api/admin/config", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load admin config");
  }
  const data = await response.json();
  updatePreview(data.background_image_url);
  setBackgroundOpacityValue(data.background_image_opacity);
  hostIpInput.value = data.host_ip || "";
  updateQrState(data.sign_page_url);
  screenTitleInput.value = data.screen_title || "";
  pledgeLinesInput.value = (data.pledge_lines || []).join("\n");
  signatureCount.textContent = `当前签名数量：${data.signature_count || 0}`;
}

function scheduleRefresh(delay = 0) {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
  }
  refreshTimer = window.setTimeout(() => {
    loadAdminConfig().catch((error) => {
      console.error(error);
      showStatus("管理配置刷新失败。", true);
    });
  }, delay);
}

function connectAdminSocket() {
  if (adminSocket) {
    adminSocket.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  adminSocket = new WebSocket(`${protocol}://${window.location.host}/ws/screen`);

  adminSocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (
        payload.type === "signature_submitted" ||
        payload.type === "signatures_cleared" ||
        payload.type === "background_image_updated" ||
        payload.type === "background_opacity_updated" ||
        payload.type === "screen_title_updated" ||
        payload.type === "pledge_lines_updated"
      ) {
        scheduleRefresh(0);
      }
    } catch (error) {
      console.error(error);
    }
  });

  adminSocket.addEventListener("close", () => {
    adminSocket = null;
    if (adminSocketRetryTimer) {
      window.clearTimeout(adminSocketRetryTimer);
    }
    adminSocketRetryTimer = window.setTimeout(connectAdminSocket, 2000);
  });

  adminSocket.addEventListener("error", () => {
    if (adminSocket) {
      adminSocket.close();
    }
  });
}

function updateQrState(url) {
  if (url) {
    signPageUrl.textContent = url;
    qrPreview.src = `/api/admin/sign-qr.svg?ts=${Date.now()}`;
    qrPreview.classList.remove("hidden");
    qrEmptyState.classList.add("hidden");
  } else {
    signPageUrl.textContent = "尚未配置签名页地址";
    qrPreview.src = "";
    qrPreview.classList.add("hidden");
    qrEmptyState.classList.remove("hidden");
  }
}

uploadButton.addEventListener("click", async () => {
  const [file] = backgroundFile.files;
  if (!file) {
    showStatus("请先选择图片文件。", true);
    return;
  }

  uploadButton.disabled = true;
  clearButton.disabled = true;
  showStatus("正在上传背景图...");

  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/admin/background-image", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error("Upload failed");
    }
    const data = await response.json();
    updatePreview(data.background_image_url);
    backgroundFile.value = "";
    showStatus("背景图已更新。");
  } catch (error) {
    console.error(error);
    showStatus("背景图上传失败，请重试。", true);
  } finally {
    uploadButton.disabled = false;
    clearButton.disabled = false;
  }
});

clearButton.addEventListener("click", async () => {
  uploadButton.disabled = true;
  clearButton.disabled = true;
  showStatus("正在清除背景图...");

  try {
    const response = await fetch("/api/admin/background-image", {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Delete failed");
    }
    updatePreview(null);
    backgroundFile.value = "";
    showStatus("背景图已清除。");
  } catch (error) {
    console.error(error);
    showStatus("清除背景图失败，请重试。", true);
  } finally {
    uploadButton.disabled = false;
    clearButton.disabled = false;
  }
});

saveIpButton.addEventListener("click", async () => {
  const hostIp = hostIpInput.value.trim();
  if (!hostIp) {
    showStatus("请先输入本机局域网 IP。", true);
    return;
  }

  saveIpButton.disabled = true;
  showStatus("正在保存本机 IP...");

  try {
    const response = await fetch("/api/admin/config/ip", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ host_ip: hostIp }),
    });
    if (!response.ok) {
      throw new Error("Save IP failed");
    }
    const data = await response.json();
    updateQrState(data.sign_page_url);
    showStatus("本机 IP 已保存，二维码已更新。");
  } catch (error) {
    console.error(error);
    showStatus("保存本机 IP 失败，请重试。", true);
  } finally {
    saveIpButton.disabled = false;
  }
});

saveTitleButton.addEventListener("click", async () => {
  const screenTitle = screenTitleInput.value.trim();

  saveTitleButton.disabled = true;
  showStatus("正在保存大屏标题...");

  try {
    const response = await fetch("/api/admin/config/title", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ screen_title: screenTitle }),
    });
    if (!response.ok) {
      throw new Error("Save title failed");
    }
    const data = await response.json();
    screenTitleInput.value = data.screen_title;
    showStatus("大屏标题已更新。");
  } catch (error) {
    console.error(error);
    showStatus("保存大屏标题失败，请重试。", true);
  } finally {
    saveTitleButton.disabled = false;
  }
});

async function saveBackgroundOpacity(opacity) {
  const response = await fetch("/api/admin/config/background-opacity", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ background_image_opacity: opacity }),
  });
  if (!response.ok) {
    throw new Error("Save background opacity failed");
  }
  const data = await response.json();
  setBackgroundOpacityValue(data.background_image_opacity);
}

backgroundOpacityInput.addEventListener("input", () => {
  setBackgroundOpacityValue(backgroundOpacityInput.value);
  showStatus("正在调整背景显示强度...");

  if (backgroundOpacitySaveTimer) {
    window.clearTimeout(backgroundOpacitySaveTimer);
  }
  backgroundOpacitySaveTimer = window.setTimeout(async () => {
    try {
      await saveBackgroundOpacity(backgroundOpacityInput.value);
      showStatus("背景显示强度已更新。");
    } catch (error) {
      console.error(error);
      showStatus("保存背景显示强度失败，请重试。", true);
    }
  }, 180);
});

savePledgesButton.addEventListener("click", async () => {
  const pledgeLines = pledgeLinesInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!pledgeLines.length) {
    showStatus("请至少保留一条宣誓文案。", true);
    return;
  }

  savePledgesButton.disabled = true;
  showStatus("正在保存宣誓文案列表...");

  try {
    const response = await fetch("/api/admin/config/pledges", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pledge_lines: pledgeLines }),
    });
    if (!response.ok) {
      throw new Error("Save pledges failed");
    }
    const data = await response.json();
    pledgeLinesInput.value = (data.pledge_lines || []).join("\n");
    showStatus("宣誓文案列表已更新。");
  } catch (error) {
    console.error(error);
    showStatus("保存宣誓文案列表失败，请重试。", true);
  } finally {
    savePledgesButton.disabled = false;
  }
});

clearSignaturesButton.addEventListener("click", async () => {
  const confirmed = window.confirm("确认清空全部签名吗？队列和背景签名都会立刻消失。");
  if (!confirmed) {
    return;
  }

  clearSignaturesButton.disabled = true;
  showStatus("正在清空全部签名...");

  try {
    const response = await fetch("/api/admin/signatures", {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Clear signatures failed");
    }
    const data = await response.json();
    signatureCount.textContent = "当前签名数量：0";
    showStatus(`已清空 ${data.cleared} 份签名。`);
  } catch (error) {
    console.error(error);
    showStatus("清空签名失败，请重试。", true);
  } finally {
    clearSignaturesButton.disabled = false;
  }
});

exportSignaturesButton.addEventListener("click", async () => {
  exportSignaturesButton.disabled = true;
  showStatus("正在导出签名...");

  try {
    const response = await fetch("/api/admin/signatures/export");
    if (!response.ok) {
      throw new Error("Export signatures failed");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "signature-export.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showStatus("签名导出完成。");
  } catch (error) {
    console.error(error);
    showStatus("导出签名失败，请确认当前存在可导出的签名。", true);
  } finally {
    exportSignaturesButton.disabled = false;
  }
});

endSequenceButton.addEventListener("click", async () => {
  const confirmed = window.confirm("确认结束签名吗？大屏将立刻播放收束爆发动画。");
  if (!confirmed) {
    return;
  }

  endSequenceButton.disabled = true;
  showStatus("正在触发结束签名动画...");

  try {
    const response = await fetch("/api/admin/end-sequence", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("End sequence failed");
    }
    showStatus("结束签名动画已发送到大屏。");
  } catch (error) {
    console.error(error);
    showStatus("结束签名动画触发失败，请重试。", true);
  } finally {
    endSequenceButton.disabled = false;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    scheduleRefresh(0);
  }
});

window.addEventListener("focus", () => {
  scheduleRefresh(0);
});

window.setInterval(() => {
  scheduleRefresh(0);
}, 15000);

connectAdminSocket();

loadAdminConfig().catch((error) => {
  console.error(error);
  showStatus("管理配置加载失败。", true);
});
