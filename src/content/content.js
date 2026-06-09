(() => {
  if (window.__tmallExporterContentLoaded) return;
  window.__tmallExporterContentLoaded = true;

  const { productExtractor, collectorWidget } = window.TmallExporter || {};

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => collectorWidget?.createWidget(), {
      once: true
    });
  } else {
    collectorWidget?.createWidget();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TMALL_READ_PRODUCT") return;
    sendResponse({ ok: true, product: productExtractor.readProduct() });
  });
})();
