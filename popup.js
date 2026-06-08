const statusNode = document.querySelector("#status");
const readButton = document.querySelector("#readButton");
const exportButton = document.querySelector("#exportButton");
const preview = document.querySelector("#preview");
const imagePreview = document.querySelector("#imagePreview");
const namePreview = document.querySelector("#namePreview");
const pricePreview = document.querySelector("#pricePreview");
const quantityInput = document.querySelector("#quantity");
const remarkInput = document.querySelector("#remark");

let currentProduct = null;

const setStatus = (text, isError = false) => {
  statusNode.textContent = text;
  statusNode.classList.toggle("error", isError);
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const readFromTab = async (tab) => {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "TMALL_READ_PRODUCT" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        "excel.js",
        "product-extractor.js",
        "collection-store.js",
        "clipboard.js",
        "collector-widget.js",
        "content.js"
      ]
    });
    return chrome.tabs.sendMessage(tab.id, { type: "TMALL_READ_PRODUCT" });
  }
};

const renderProduct = (product) => {
  currentProduct = product;
  imagePreview.src = product.image || "";
  imagePreview.hidden = !product.image;
  namePreview.textContent = product.name || "未识别商品名称";
  pricePreview.textContent = [
    product.colorCategory ? `颜色分类：${product.colorCategory}` : "",
    product.unitPrice ? `单价：${product.unitPrice}` : "未识别单价"
  ]
    .filter(Boolean)
    .join(" | ");
  preview.hidden = false;
  exportButton.disabled = false;
};

const normalizeRow = (product) => {
  const quantity = Math.max(1, Number.parseInt(quantityInput.value, 10) || 1);
  const unitPrice = Number.parseFloat(product.unitPrice);
  const totalPrice = Number.isFinite(unitPrice) ? (unitPrice * quantity).toFixed(2) : "";
  return {
    ...product,
    quantity,
    totalPrice,
    remark: remarkInput.value.trim()
  };
};

const exportExcel = async () => {
  if (!currentProduct) return;

  setStatus("正在生成 Excel...");
  const row = normalizeRow(currentProduct);
  const blob = await window.TmallExcel.createWorkbookBlob([row], () => {
    setStatus("首图处理失败，将导出无图片版本。", true);
  });
  const url = URL.createObjectURL(blob);
  const filename = `tmall-product-${new Date().toISOString().slice(0, 10)}.xlsx`;

  await chrome.downloads.download({ url, filename, saveAs: true });
  setStatus("已生成 Excel 文件。");
};

readButton.addEventListener("click", async () => {
  readButton.disabled = true;
  setStatus("正在读取当前页面...");

  try {
    const tab = await getActiveTab();
    if (!tab?.url || !/tmall\.com/i.test(tab.url)) {
      throw new Error("请先打开天猫商品详情页。");
    }

    const response = await readFromTab(tab);
    if (!response?.ok) throw new Error("页面读取失败。");
    renderProduct(response.product);
    setStatus("读取完成，可导出。");
  } catch (error) {
    setStatus(error.message || "读取失败。", true);
  } finally {
    readButton.disabled = false;
  }
});

exportButton.addEventListener("click", exportExcel);
