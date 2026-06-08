(() => {
  if (window.__tmallExporterContentLoaded) return;
  window.__tmallExporterContentLoaded = true;

  const STORAGE_KEY = "tmall_collected_products";

  const pickText = (selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.content || node?.innerText || node?.textContent || "";
      const text = value.trim();
      if (text) return text;
    }
    return "";
  };

  const pickImage = () => {
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      ".tb-booth img",
      ".tb-gallery img",
      '[class*="mainPic"] img',
      '[class*="MainPic"] img',
      '[class*="gallery"] img',
      "img"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const raw =
        node?.content ||
        node?.src ||
        node?.getAttribute?.("data-src") ||
        node?.getAttribute?.("data-ks-lazyload") ||
        "";
      const image = normalizeUrl(raw);
      if (image && !image.startsWith("data:")) return image;
    }
    return "";
  };

  const normalizeUrl = (value) => {
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.startsWith("//")) return `${location.protocol}${trimmed}`;
    try {
      return new URL(trimmed, location.href).href;
    } catch {
      return trimmed;
    }
  };

  const findJsonLdPrice = () => {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offer?.price) return String(offer.price);
        }
      } catch {
        // Ignore invalid JSON-LD blocks from third-party scripts.
      }
    }
    return "";
  };

  const cleanPrice = (value) => {
    const text = String(value || "").replace(/,/g, "");
    const match = text.match(/\d+(?:\.\d+)?/);
    return match ? match[0] : "";
  };

  const readSelectedSku = () => {
    const selectors = [
      '[aria-selected="true"]',
      ".tb-selected",
      ".tm-selected",
      '[class*="selected"]',
      '[class*="Selected"]'
    ];
    const values = [];
    const normalizeSkuText = (value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .replace(/^宝贝\s*\/\s*/u, "")
        .trim();
    const isSkuText = (value) =>
      value &&
      value.length <= 80 &&
      !/^(宝贝|详情|评价|推荐|店铺|客服|首页|购物车|收藏)$/u.test(value);

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = normalizeSkuText(node.innerText || node.textContent || node.title || "");
        if (isSkuText(text) && !values.includes(text)) values.push(text);
      }
    }

    const colorLabel = [...document.querySelectorAll("*")].find((node) =>
      /颜色分类|颜色|规格/.test((node.innerText || node.textContent || "").trim())
    );
    const scopedSelected = colorLabel?.parentElement?.querySelector(
      '[aria-selected="true"], .tb-selected, .tm-selected, [class*="selected"], [class*="Selected"]'
    );
    const scopedText = normalizeSkuText(scopedSelected?.innerText || scopedSelected?.textContent || "");
    if (isSkuText(scopedText) && !values.includes(scopedText)) values.unshift(scopedText);

    return values.slice(0, 3).join(" / ").replace(/^宝贝\s*\/\s*/u, "");
  };

  const readProduct = () => {
    const name =
      pickText([
        'meta[property="og:title"]',
        'meta[name="title"]',
        ".tb-detail-hd h1",
        '[class*="ItemHeader"] h1',
        '[class*="mainTitle"]',
        "h1"
      ]) || document.title.replace(/[-_].*$/, "").trim();

    const rawPrice =
      pickText([
        'meta[property="product:price:amount"]',
        'meta[itemprop="price"]',
        ".tm-promo-price .tm-price",
        ".tm-price",
        '[class*="Price"]',
        '[class*="price"]'
      ]) || findJsonLdPrice();

    return {
      image: pickImage(),
      name,
      colorCategory: readSelectedSku(),
      unitPrice: cleanPrice(rawPrice),
      url: location.href
    };
  };

  const toRow = (product) => {
    const quantity = 1;
    const unitPrice = Number.parseFloat(product.unitPrice);
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...product,
      quantity,
      totalPrice: Number.isFinite(unitPrice) ? (unitPrice * quantity).toFixed(2) : "",
      remark: "",
      collectedAt: new Date().toISOString()
    };
  };

  const cleanColorCategory = (value) =>
    String(value || "")
      .split(/\s*\/\s*/u)
      .map((item) => item.trim())
      .filter((item) => item && item !== "宝贝")
      .join(" / ");

  const withRecalculatedTotal = (item) => {
    const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    const unitPrice = Number.parseFloat(item.unitPrice);
    return {
      ...item,
      colorCategory: cleanColorCategory(item.colorCategory),
      quantity,
      totalPrice: Number.isFinite(unitPrice) ? (unitPrice * quantity).toFixed(2) : ""
    };
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const getItems = async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  };

  const saveItems = async (items) => {
    await chrome.storage.local.set({ [STORAGE_KEY]: items });
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const createWidget = () => {
    if (document.getElementById("tmall-exporter-widget")) return;

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
          padding: 8px;
        }

        .empty {
          padding: 24px 12px;
          color: #9b6476;
          text-align: center;
          font-size: 13px;
        }

        .item {
          display: grid;
          grid-template-columns: 22px 54px 1fr;
          gap: 10px;
          align-items: center;
          padding: 8px;
          border: 1px solid #ffe0ea;
          border-radius: 8px;
          background: #fff;
        }

        .item + .item {
          margin-top: 8px;
        }

        .item img {
          width: 54px;
          height: 54px;
          object-fit: cover;
          border-radius: 6px;
          background: #ffe0ea;
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

        .meta {
          margin-top: 4px;
          color: #8a425b;
          font-size: 12px;
          line-height: 1.4;
        }

        .quantity {
          display: inline-grid;
          grid-template-columns: auto 64px;
          gap: 6px;
          align-items: center;
          margin-top: 6px;
          color: #5f253a;
          font-size: 12px;
        }

        .quantity input {
          width: 64px;
          height: 28px;
          border: 1px solid #ffc0d5;
          border-radius: 6px;
          padding: 3px 6px;
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

    const setStatus = (text) => {
      status.textContent = text;
    };

    const getSelectedIds = () =>
      [...root.querySelectorAll(".row-check:checked")].map((input) => input.value);

    const refresh = async () => {
      const items = await getItems();
      listButton.textContent = `已采集(${items.length})`;
      selectAll.checked = items.length > 0 && getSelectedIds().length === items.length;
      deleteButton.disabled = items.length === 0;
      exportButton.disabled = items.length === 0;

      if (!items.length) {
        list.innerHTML = '<div class="empty">暂无采集商品</div>';
        return;
      }

      list.innerHTML = items
        .map(
          (item) => `
            <article class="item">
              <input class="row-check" type="checkbox" value="${escapeHtml(item.id)}" checked />
              <img src="${escapeHtml(item.image || "")}" alt="" />
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
            </article>
          `
        )
        .join("");
      selectAll.checked = true;
    };

    const collect = async () => {
      collectButton.disabled = true;
      try {
        const item = toRow(readProduct());
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

    const exportSelected = async () => {
      const selectedIds = new Set(getSelectedIds());
      if (!selectedIds.size) {
        setStatus("请先选择要导出的商品。");
        return;
      }

      exportButton.disabled = true;
      try {
        const items = await getItems();
        const selectedItems = items.filter((item) => selectedIds.has(item.id)).map(withRecalculatedTotal);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget, { once: true });
  } else {
    createWidget();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TMALL_READ_PRODUCT") return;
    sendResponse({ ok: true, product: readProduct() });
  });
})();
