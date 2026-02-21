function setLoading(btn, isLoading, text) {
  if (!btn) return;
  if (isLoading) {
    btn.classList.add("loading");
    btn.disabled = true;
    btn.dataset.oldText = btn.textContent || "";
    btn.textContent = text || "Đang xuất dữ liệu";
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    if (btn.dataset.oldText) btn.textContent = btn.dataset.oldText;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  if (!startButton || !stopButton) return;

  // ✅ cờ dừng ở popup
  let SHOULD_STOP = false;
  // ✅ tabId hiện tại để gửi lệnh dừng
  let RUNNING_TAB_ID = null;
  // ✅ interval gửi stop signal
  let STOP_TICK = null;
  
  // ✅ Load TAB_CONFIGS từ config
  const TAB_CONFIGS = await TAB_CONFIG_MANAGER.getTAB_CONFIGS();

  stopButton.disabled = true;

  stopButton.addEventListener("click", async () => {
    SHOULD_STOP = true;
    stopButton.disabled = true;

    // gửi stop signal ngay lập tức nếu đang chạy
    if (RUNNING_TAB_ID) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: RUNNING_TAB_ID },
          func: () => { window.__STOP_EXPORT__ = true; }
        });
      } catch (e) {
        // ignore
      }
    }
  });

  startButton.addEventListener("click", async () => {
    SHOULD_STOP = false;
    stopButton.disabled = false;
    setLoading(startButton, true, "Đang xuất dữ liệu");

    const startPage = parseInt(document.getElementById("startPage").value, 10) || 1;
    const endPage = parseInt(document.getElementById("endPage").value, 10) || startPage;
    const fileName = (document.getElementById("fileName").value || "").trim() || "J&T Express";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setLoading(startButton, false);
      stopButton.disabled = true;
      return;
    }

    RUNNING_TAB_ID = tab.id;

    // ✅ interval: nếu popup bấm stop thì bơm tín hiệu stop xuống page liên tục
    if (STOP_TICK) clearInterval(STOP_TICK);
    STOP_TICK = setInterval(async () => {
      if (!RUNNING_TAB_ID) return;
      if (!SHOULD_STOP) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: RUNNING_TAB_ID },
          func: () => { window.__STOP_EXPORT__ = true; }
        });
        clearInterval(STOP_TICK);
        STOP_TICK = null;
      } catch (e) {
        // ignore
      }
    }, 250);

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [startPage, endPage, TAB_CONFIGS],
        func: async (start, end, tabConfigs) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

          // ✅ stop flag trong page
          window.__STOP_EXPORT__ = false;

          const TAB_CONFIGS = tabConfigs;

          const normalizeHeader = (txt) => (txt || "").replace(/\s+/g, " ").trim();

          const getDeepText = (el) => {
            if (!el) return "";
            const titleEl = el.querySelector?.("[title]");
            const titled = titleEl?.getAttribute?.("title");
            if (titled && titled.trim()) return titled.trim();

            const tooltip = el.querySelector?.(".el-tooltip");
            if (tooltip && tooltip.innerText.trim()) return tooltip.innerText.trim();

            const txt = (el.innerText || "").trim();
            return txt;
          };

          const ensureInValidTab = async () => {
            const activeTab = document.querySelector('.el-tabs__item.is-active[id^="tab-"]');
            if (activeTab) return activeTab.id;

            for (const t of TAB_CONFIGS) {
              const el = document.getElementById(t.id);
              if (el) {
                el.click();
                await sleep(800);
                return t.id;
              }
            }
            return null;
          };

          const getPaginationButton = (pageNumber) => {
            const pager = document.querySelectorAll(".el-pager li.number");
            return Array.from(pager).find((el) => (el.innerText || "").trim() === String(pageNumber));
          };

          const getAllHeaderTexts = () => {
            const headers = [];
            const pushHeader = (th) => {
              if (!th) return;
              if (th.classList.contains("el-table-column--selection")) return;

              const raw = normalizeHeader(getDeepText(th));
              if (!raw) return;
              if (raw === "Thao tác") return;

              if (!headers.includes(raw)) headers.push(raw);
            };

            document
              .querySelectorAll(".el-table__fixed .el-table__fixed-header-wrapper thead th")
              .forEach(pushHeader);

            document
              .querySelectorAll(".el-table__header-wrapper thead th")
              .forEach(pushHeader);

            document
              .querySelectorAll(".el-table__fixed-right .el-table__fixed-header-wrapper thead th")
              .forEach(pushHeader);

            return headers;
          };

          const buildTableHeaderMap = (tableEl) => {
            const wrapper = tableEl.closest(
              ".el-table__body-wrapper, .el-table__fixed-body-wrapper, .el-table__fixed-right .el-table__fixed-body-wrapper"
            );
            if (!wrapper) return [];

            const tableRoot = wrapper.parentElement;
            const theadThs = tableRoot?.querySelectorAll?.("thead th") || [];
            const map = [];

            theadThs.forEach((th, idx) => {
              if (th.classList.contains("el-table-column--selection")) {
                map[idx] = "";
                return;
              }
              map[idx] = normalizeHeader(getDeepText(th)) || "";
            });

            return map;
          };

          const extractCurrentPageRows = (allHeaders) => {
            const out = [];

            const mainTable = document.querySelector(".el-table__body-wrapper .el-table__body");
            if (!mainTable) return out;

            const mainRows = mainTable.querySelectorAll("tr.el-table__row");
            if (!mainRows.length) return out;

            const bodyTables = Array.from(document.querySelectorAll(".el-table__body"));
            const headerMaps = bodyTables.map((t) => buildTableHeaderMap(t));

            for (let rowIndex = 0; rowIndex < mainRows.length; rowIndex++) {
              if (window.__STOP_EXPORT__) break;

              const rowItem = {};

              bodyTables.forEach((tableEl, tableIdx) => {
                const tr = tableEl.querySelectorAll("tr.el-table__row")[rowIndex];
                if (!tr) return;

                const tds = tr.querySelectorAll("td");
                const hmap = headerMaps[tableIdx] || [];

                for (let colIndex = 0; colIndex < tds.length; colIndex++) {
                  const headerText = normalizeHeader(hmap[colIndex] || "");
                  if (!headerText) continue;
                  if (!allHeaders.includes(headerText)) continue;

                  const val = getDeepText(tds[colIndex]);
                  if (val !== "") rowItem[headerText] = val;
                }
              });

              if (Object.keys(rowItem).length) out.push(rowItem);
            }

            return out;
          };

          await ensureInValidTab();
          await sleep(600);

          const finalData = [];
          let finalHeaders = [];

          for (let p = start; p <= end; p++) {
            if (window.__STOP_EXPORT__) break;

            if (p > start) {
              const btn = getPaginationButton(p);
              if (!btn) break;
              btn.click();
              await sleep(2500);
            }

            if (!finalHeaders.length) {
              finalHeaders = getAllHeaderTexts();
            }

            const pageRows = extractCurrentPageRows(finalHeaders);
            finalData.push(...pageRows);
          }

          return {
            stopped: !!window.__STOP_EXPORT__,
            header: finalHeaders,
            data: finalData
          };
        }
      });

      const { stopped, header, data } = result?.[0]?.result || { stopped: false, header: [], data: [] };

      if (stopped) {
        alert("Đã dừng xuất dữ liệu!");
        return;
      }

      if (!header.length || !data.length) {
        alert("Không có dữ liệu để xuất!");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data, { header });

      // Nếu bạn KHÔNG muốn tự bật filter thì comment dòng dưới:
      // if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      // ✅ Ép text (giữ số 0 đầu / tránh scientific)
      const ref = ws["!ref"];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[addr]) ws[addr] = { t: "s", v: "" };
            ws[addr].t = "s";
            ws[addr].z = "@";
          }
        }
      }
      // auto width dựa trên header + data (có giới hạn max để tránh cột quá rộng)
      ws["!cols"] = header.map((h) => {
        let maxWidth = h.length + 2;
        // Tính toán độ rộng dựa vào dữ liệu nhưng giới hạn tối đa 50px
        for (const row of data) {
          const cellValue = String(row[h] || "");
          maxWidth = Math.max(maxWidth, Math.min(cellValue.length, 50));
        }
        return { wch: Math.min(maxWidth + 2, 50) };
      });
       
      
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } catch (e) {
      alert("Lỗi: " + (e?.message || e));
    } finally {
      // cleanup
      if (STOP_TICK) clearInterval(STOP_TICK);
      STOP_TICK = null;
      RUNNING_TAB_ID = null;
      stopButton.disabled = true;
      setLoading(startButton, false);
    }
  });
});
