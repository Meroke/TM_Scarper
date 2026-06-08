(() => {
  const exporter = (window.TmallExporter = window.TmallExporter || {});

  const createWidget = () => {
    const {
      productExtractor,
      collectionStore,
      clipboard
    } = exporter;

    if (document.getElementById("tmall-exporter-widget")) return;

    const {
      STORAGE_KEY,
      getItems,
      saveItems,
      toRow,
      withRecalculatedTotal
    } = collectionStore;
    const { escapeHtml, triggerDownload, copyRows, copyImage } = clipboard;

    const host = document.createElement("div");
    host.id = "tmall-exporter-widget";
    host.style.position = "fixed";
    host.style.top = "112px";
    host.style.right = "18px";
    host.style.zIndex = "2147483647";
    document.documentElement.append(host);

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          all: initial;
          color: #2f1724;
          font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        .dock {
          display: grid;
          gap: 8px;
          justify-items: end;
        }

        .buttons {
          display: grid;
          gap: 8px;
          justify-items: end;
        }

        button {
          border: 0;
          border-radius: 999px;
          padding: 10px 14px;
          color: #fff;
          background: linear-gradient(135deg, #ff5c93, #e73772);
          box-shadow: 0 8px 20px rgba(231, 55, 114, 0.26);
          font: 700 14px/1 "Microsoft YaHei", "PingFang SC", sans-serif;
          cursor: pointer;
        }

        button.secondary {
          background: #fff;
          color: #d92d67;
          border: 1px solid #ffc0d5;
        }

        button.danger {
          background: #a61b3c;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .panel {
          width: 430px;
          max-height: min(620px, calc(100vh - 150px));
          display: none;
          overflow: hidden;
          border: 1px solid #ffd0df;
          border-radius: 10px;
          background: #fffafb;
          box-shadow: 0 18px 42px rgba(90, 22, 48, 0.22);
        }

        .panel.open {
          display: block;
        }

        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid #ffe0ea;
          background: #fff0f5;
        }

        .head strong {
          font-size: 15px;
        }

        .status {
          padding: 9px 14px;
          color: #8a425b;
          border-bottom: 1px solid #ffe0ea;
          font-size: 12px;
          line-height: 1.45;
        }

        .tools {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          padding: 10px 14px;
          border-bottom: 1px solid #ffe0ea;
        }

        .tools label {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-right: auto;
          font-size: 13px;
        }

        .tools button {
          border-radius: 7px;
          padding: 8px 10px;
          font-size: 12px;
        }

        .list {
          max-height: 390px;
          overflow: auto;
          padding: 6px;
        }

        .empty {
          padding: 24px 12px;
          color: #9b6476;
          text-align: center;
          font-size: 13px;
        }

        .item {
          position: relative;
          display: grid;
          grid-template-columns: 20px 48px 1fr;
          gap: 8px;
          align-items: start;
          padding: 6px;
          border: 1px solid #ffe0ea;
          border-radius: 8px;
          background: #fff;
        }

        .item + .item {
          margin-top: 6px;
        }

        .image-copy {
          width: 48px;
          height: 48px;
          border: 0;
          border-radius: 6px;
          padding: 0;
          overflow: hidden;
          background: #ffe0ea;
          box-shadow: none;
          cursor: copy;
        }

        .image-copy:focus {
          outline: 2px solid #ff5c93;
          outline-offset: 2px;
        }

        .image-copy img {
          width: 48px;
          height: 48px;
          display: block;
          object-fit: cover;
        }

        .item strong {
          display: -webkit-box;
          overflow: hidden;
          color: #2f1724;
          font-size: 13px;
          line-height: 1.35;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .item-delete {
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          padding: 0;
          color: #a61b3c;
          background: #fff0f5;
          border: 1px solid #ffc0d5;
          box-shadow: none;
          font-size: 16px;
          line-height: 1;
        }

        .item-delete:hover {
          background: #ffe0ea;
        }

        .meta {
          margin-top: 3px;
          color: #8a425b;
          font-size: 12px;
          line-height: 1.4;
        }

        .quantity {
          display: inline-grid;
          grid-template-columns: auto 44px;
          gap: 4px;
          align-items: center;
          margin-top: 4px;
          color: #5f253a;
          font-size: 12px;
        }

        .quantity input {
          width: 44px;
          height: 24px;
          border: 1px solid #ffc0d5;
          border-radius: 6px;
          padding: 2px 4px;
          color: #2f1724;
          background: #fffafb;
          font: 600 12px/1 "Microsoft YaHei", "PingFang SC", sans-serif;
          outline: none;
        }

        .quantity input:focus {
          border-color: #ff5c93;
          box-shadow: 0 0 0 3px rgba(255, 92, 147, 0.16);
        }

        input[type="checkbox"] {
          accent-color: #ff5c93;
        }
      </style>
      <div class="dock">
        <div class="buttons">
          <button id="collectButton" type="button">采集</button>
          <button id="listButton" class="secondary" type="button">已采集(0)</button>
        </div>
        <section id="panel" class="panel" aria-label="已采集商品信息">
          <div class="head">
            <strong>已采集商品</strong>
            <button id="closeButton" class="secondary" type="button">收起</button>
          </div>
          <div id="status" class="status">暂无操作。</div>
          <div class="tools">
            <label><input id="selectAll" type="checkbox" /> 全选</label>
            <button id="deleteButton" class="danger" type="button">删除选中</button>
            <button id="exportButton" type="button">导出选中</button>
            <button id="copyButton" type="button">复制选中</button>
          </div>
          <div id="list" class="list"></div>
        </section>
      </div>
    `;

    const collectButton = root.getElementById("collectButton");
    const listButton = root.getElementById("listButton");
    const closeButton = root.getElementById("closeButton");
    const panel = root.getElementById("panel");
    const status = root.getElementById("status");
    const list = root.getElementById("list");
    const selectAll = root.getElementById("selectAll");
    const deleteButton = root.getElementById("deleteButton");
    const exportButton = root.getElementById("exportButton");
    const copyButton = root.getElementById("copyButton");

    const setStatus = (text) => {
      status.textContent = text;
    };

    const getSelectedIds = () =>
      [...root.querySelectorAll(".row-check:checked")].map((input) => input.value);

    const getSelectedItems = async () => {
      const selectedIds = new Set(getSelectedIds());
      if (!selectedIds.size) return [];
      const items = await getItems();
      return items.filter((item) => selectedIds.has(item.id)).map(withRecalculatedTotal);
    };

    const refresh = async () => {
      const items = await getItems();
      listButton.textContent = `已采集(${items.length})`;
      selectAll.checked = items.length > 0 && getSelectedIds().length === items.length;
      deleteButton.disabled = items.length === 0;
      exportButton.disabled = items.length === 0;
      copyButton.disabled = items.length === 0;

      if (!items.length) {
        list.innerHTML = '<div class="empty">暂无采集商品</div>';
        return;
      }

      list.innerHTML = items
        .map(
          (item) => `
            <article class="item">
              <input class="row-check" type="checkbox" value="${escapeHtml(item.id)}" checked />
              <button class="image-copy" type="button" data-id="${escapeHtml(item.id)}" title="复制首图">
                <img src="${escapeHtml(item.image || "")}" alt="" />
              </button>
              <div>
                <strong>${escapeHtml(item.name || "未识别商品名称")}</strong>
                <div class="meta">
                  ${item.colorCategory ? `颜色分类：${escapeHtml(item.colorCategory)}<br />` : ""}
                  单价：${escapeHtml(item.unitPrice || "-")} ｜ 总价：${escapeHtml(withRecalculatedTotal(item).totalPrice || "-")}
                </div>
                <label class="quantity">
                  数量
                  <input class="quantity-input" type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" data-id="${escapeHtml(item.id)}" />
                </label>
              </div>
              <button class="item-delete" type="button" data-id="${escapeHtml(item.id)}" title="删除该商品">×</button>
            </article>
          `
        )
        .join("");
      selectAll.checked = true;
    };

    const collect = async () => {
      collectButton.disabled = true;
      try {
        const item = toRow(productExtractor.readProduct());
        const items = await getItems();
        items.push(item);
        await saveItems(items);
        panel.classList.add("open");
        setStatus(`已采集：${item.name || "未识别商品"}`);
        await refresh();
      } catch (error) {
        setStatus(error.message || "采集失败。");
      } finally {
        collectButton.disabled = false;
      }
    };

    const deleteSelected = async () => {
      const selectedIds = new Set(getSelectedIds());
      if (!selectedIds.size) {
        setStatus("请先选择要删除的商品。");
        return;
      }
      const items = await getItems();
      const nextItems = items.filter((item) => !selectedIds.has(item.id));
      await saveItems(nextItems);
      setStatus(`已删除 ${items.length - nextItems.length} 项。`);
      await refresh();
    };

    const deleteItem = async (id) => {
      const items = await getItems();
      const nextItems = items.filter((item) => item.id !== id);
      await saveItems(nextItems);
      setStatus(`已删除 ${items.length - nextItems.length} 项。`);
      await refresh();
    };

    const updateQuantity = async (input) => {
      const id = input.dataset.id;
      const quantity = Math.max(1, Number.parseInt(input.value, 10) || 1);
      input.value = String(quantity);
      const items = await getItems();
      const nextItems = items.map((item) =>
        item.id === id ? withRecalculatedTotal({ ...item, quantity }) : item
      );
      await saveItems(nextItems);
      setStatus("数量已更新。");
    };

    const copyImageItem = async (item) => {
      try {
        await copyImage(item);
        setStatus(`已复制首图：${item.name || "未识别商品"}`);
      } catch (error) {
        setStatus(error.message || "复制首图失败。");
      }
    };

    const copySelected = async () => {
      const selectedItems = await getSelectedItems();
      if (!selectedItems.length) {
        setStatus("请先选择要复制的商品。");
        return;
      }

      try {
        await copyRows(selectedItems);
        setStatus(`已复制 ${selectedItems.length} 项，可直接粘贴到 Excel。`);
      } catch (error) {
        setStatus(error.message || "复制失败。");
      }
    };

    const exportSelected = async () => {
      const selectedItems = await getSelectedItems();
      if (!selectedItems.length) {
        setStatus("请先选择要导出的商品。");
        return;
      }

      exportButton.disabled = true;
      try {
        setStatus(`正在生成 ${selectedItems.length} 项商品的 Excel...`);
        const blob = await window.TmallExcel.createWorkbookBlob(selectedItems, (_error, row) => {
          setStatus(`部分首图处理失败：${row.name || "未识别商品"}`);
        });
        const filename = `tmall-products-${new Date().toISOString().slice(0, 10)}.xlsx`;
        triggerDownload(blob, filename);
        setStatus(`已导出 ${selectedItems.length} 项。`);
      } catch (error) {
        setStatus(error.message || "导出失败。");
      } finally {
        exportButton.disabled = false;
      }
    };

    collectButton.addEventListener("click", collect);
    listButton.addEventListener("click", async () => {
      panel.classList.toggle("open");
      await refresh();
    });
    closeButton.addEventListener("click", () => panel.classList.remove("open"));
    deleteButton.addEventListener("click", deleteSelected);
    exportButton.addEventListener("click", exportSelected);
    copyButton.addEventListener("click", copySelected);
    list.addEventListener("click", async (event) => {
      const deleteButton = event.target.closest(".item-delete");
      if (deleteButton) {
        await deleteItem(deleteButton.dataset.id);
        return;
      }

      const button = event.target.closest(".image-copy");
      if (!button) return;
      const items = await getItems();
      const item = items.find((row) => row.id === button.dataset.id);
      await copyImageItem(item);
    });
    selectAll.addEventListener("change", () => {
      for (const input of root.querySelectorAll(".row-check")) input.checked = selectAll.checked;
    });
    list.addEventListener("change", () => {
      const checks = [...root.querySelectorAll(".row-check")];
      selectAll.checked = checks.length > 0 && checks.every((input) => input.checked);
    });
    list.addEventListener("change", (event) => {
      if (event.target.classList.contains("quantity-input")) updateQuantity(event.target);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[STORAGE_KEY]) refresh();
    });

    refresh();
  };

  exporter.collectorWidget = {
    createWidget
  };
})();
