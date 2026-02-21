document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('startButton');

  if (!startButton) {
    console.error("Không tìm thấy nút Start Export.");
    return;
  }

  startButton.addEventListener('click', async () => {
    const startPage = parseInt(document.getElementById('startPage').value, 10);
    const endPage = parseInt(document.getElementById('endPage').value, 10);
    const fileName = document.getElementById("fileName").value.trim() || "extracted_data";

    if (isNaN(startPage) || isNaN(endPage) || startPage > endPage || startPage < 1) {
      alert("Vui lòng nhập số trang hợp lệ!");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert("Không tìm thấy tab!");
      return;
    }

    try {
      // ============================================
      // ✅ 1) Crawl data trên trang web (content script)
      // ============================================
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [startPage, endPage],
        func: async (start, end) => {
          const allData = [];
          let currentPage = start;

          const sleep = (ms) => new Promise(res => setTimeout(res, ms));

          async function goToPage(targetPage) {
            let attempts = 0;
            while (attempts < 10) {
              const currentActive = document.querySelector('li.number.active');
              const currentPageNumber = currentActive ? parseInt(currentActive.innerText.trim()) : null;

              if (currentPageNumber === targetPage) return true;

              const pageButton = Array.from(document.querySelectorAll("li.number"))
                .find(li => li.innerText.trim() === targetPage.toString());

              if (!pageButton) return false;

              pageButton.click();
              await sleep(2000);
              attempts++;
            }
            return false;
          }

          // ✅ đọc header động + lấy index đúng theo cellIndex
          function getHeaderAndIndexes() {
            const ths = Array.from(document.querySelectorAll(".el-table__header-wrapper th"));

            const headers = [];
            const indexes = [];

            ths.forEach(th => {
              // bỏ cột hidden
              if (th.classList.contains("is-hidden")) return;

              // bỏ cột checkbox selection
              if (th.classList.contains("el-table-column--selection")) return;

              // lấy text header
              const text = (th.innerText || "").trim();

              // nếu header trống -> thường là cột phụ => bỏ
              if (!text) return;

              // nếu bạn muốn bỏ STT thì bật dòng này
              // if (text.toUpperCase() === "STT") return;

              headers.push(text);
              indexes.push(th.cellIndex); // ✅ index td tương ứng
            });

            return { headers, indexes };
          }

          function extractTableData(headers, indexes) {
            const rows = document.querySelectorAll(".el-table__body-wrapper table tbody tr.el-table__row");
            const data = [];

            rows.forEach(row => {
              const tds = Array.from(row.querySelectorAll("td"));

              if (!tds.length) return;

              const rowObject = {};
              headers.forEach((h, i) => {
                const tdIndex = indexes[i];
                const cell = tds[tdIndex];
                rowObject[h] = cell ? (cell.innerText || "").trim() : "";
              });

              // chỉ push nếu dòng có dữ liệu
              if (Object.values(rowObject).some(v => v !== "")) {
                data.push(rowObject);
              }
            });

            return data;
          }

          if (!(await goToPage(start))) {
            return { header: [], data: [] };
          }

          // ✅ lấy header + indexes ngay tại trang start
          const { headers, indexes } = getHeaderAndIndexes();

          if (!headers.length) {
            console.error("❌ Không lấy được header!");
            return { header: [], data: [] };
          }

          while (currentPage <= end) {
            console.log(`📄 Crawl trang ${currentPage}...`);

            const pageData = extractTableData(headers, indexes);

            if (pageData.length > 0) {
              allData.push(...pageData);
            } else break;

            if (currentPage === end) break;

            const nextButton = Array.from(document.querySelectorAll("li.number"))
              .find(li => li.innerText.trim() === (currentPage + 1).toString());

            if (!nextButton) break;

            nextButton.click();
            await sleep(2000);
            currentPage++;
          }

          return { header: headers, data: allData };
        }
      });

      const { header, data } = result[0].result;

      if (!data || data.length === 0) {
        alert("Không lấy được dữ liệu!");
        return;
      }

      console.log("✅ Header:", header);
      console.log("✅ Total rows:", data.length);

      // ============================================
      // ✅ 2) EXPORT XLSX: ÉP TEXT 100% (không \t)
      // ============================================
      function toText(value) {
        return (value ?? "").toString().trim();
      }

      const aoa = [
        header.map(h => toText(h)),
        ...data.map(row => header.map(h => toText(row[h])))
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // ép kiểu text
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellRef];
          if (!cell) continue;
          cell.t = "s";
          cell.z = "@";
        }
      }

      // auto width
      ws["!cols"] = header.map(h => ({ wch: Math.max(12, h.length + 2) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, `${fileName}.xlsx`);

      alert("🎉 Export XLSX thành công! Không mất cột đầu ở trang khác nữa!");

    } catch (err) {
      console.error("❌ Export XLSX error:", err);
      alert("Có lỗi khi export XLSX! Xem console để biết chi tiết.");
    }
  });
});
