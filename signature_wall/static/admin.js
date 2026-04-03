const backgroundFile = document.getElementById("backgroundFile");
const uploadButton = document.getElementById("uploadButton");
const clearButton = document.getElementById("clearButton");
const backgroundPreview = document.getElementById("backgroundPreview");
const emptyState = document.getElementById("emptyState");
const adminStatus = document.getElementById("adminStatus");
const hostIpInput = document.getElementById("hostIpInput");
const saveIpButton = document.getElementById("saveIpButton");
const signPageUrl = document.getElementById("signPageUrl");
const qrPreview = document.getElementById("qrPreview");
const qrEmptyState = document.getElementById("qrEmptyState");
const clearSignaturesButton = document.getElementById("clearSignaturesButton");
const screenTitleInput = document.getElementById("screenTitleInput");
const saveTitleButton = document.getElementById("saveTitleButton");

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

async function loadBackground() {
  const response = await fetch("/api/admin/config");
  if (!response.ok) {
    throw new Error("Failed to load admin config");
  }
  const data = await response.json();
  updatePreview(data.background_image_url);
  hostIpInput.value = data.host_ip || "";
  updateQrState(data.sign_page_url);
  screenTitleInput.value = data.screen_title || "";
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
  if (!screenTitle) {
    showStatus("请先输入大屏标题。", true);
    return;
  }

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
    showStatus(`已清空 ${data.cleared} 份签名。`);
  } catch (error) {
    console.error(error);
    showStatus("清空签名失败，请重试。", true);
  } finally {
    clearSignaturesButton.disabled = false;
  }
});

loadBackground().catch((error) => {
  console.error(error);
  showStatus("管理配置加载失败。", true);
});
