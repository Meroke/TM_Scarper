(() => {
  const exporter = (window.TmallExporter = window.TmallExporter || {});
  const STORAGE_KEY = "tmall_collected_products";

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

  const toRow = (product) => {
    const quantity = 1;
    const unitPrice = Number.parseFloat(product.unitPrice);
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...product,
      colorCategory: cleanColorCategory(product.colorCategory),
      quantity,
      totalPrice: Number.isFinite(unitPrice) ? (unitPrice * quantity).toFixed(2) : "",
      remark: "",
      collectedAt: new Date().toISOString()
    };
  };

  const getItems = async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  };

  const saveItems = async (items) => {
    await chrome.storage.local.set({ [STORAGE_KEY]: items });
  };

  exporter.collectionStore = {
    STORAGE_KEY,
    getItems,
    saveItems,
    toRow,
    withRecalculatedTotal,
    cleanColorCategory
  };
})();
