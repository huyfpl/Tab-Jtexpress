document.addEventListener("DOMContentLoaded", async () => {
  const btn = document.getElementById("startButton");
  if (!btn) return;

  // ✅ Load allowed selectors từ config
  const ALLOWED_TABS = await TAB_CONFIG_MANAGER.getAllowedSelectors();

  const updateUI = (isLock, msg = "") => {
    btn.disabled = isLock;
    btn.textContent = isLock ? (msg || "Sai Tab rùi!🤔  ") : "Xuất dữ liệu";
    btn.style.cssText = isLock 
      ? "opacity: 0.65; cursor: not-allowed;" 
      : "opacity: 1; cursor: pointer;";
  };

  const checkTabStatus = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return updateUI(true, "❌ Không tìm thấy Tab");

      const [{ result: isActive }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [ALLOWED_TABS],
        func: (selectors) => selectors.some(s => {
          const el = document.querySelector(s);
          return el && (el.classList.contains("is-active") || el.getAttribute("aria-selected") === "true");
        })
      });

      updateUI(!isActive);
    } catch (err) {
      updateUI(true, "❌ Lỗi hệ thống");
    }
  };

  await checkTabStatus();
  window.addEventListener("focus", checkTabStatus);
});