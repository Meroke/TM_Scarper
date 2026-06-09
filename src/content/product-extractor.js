(() => {
  const exporter = (window.TmallExporter = window.TmallExporter || {});

  const pickText = (selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value =
        node?.content ||
        node?.getAttribute?.("title") ||
        node?.innerText ||
        node?.textContent ||
        "";
      const text = value.trim();
      if (text) return text;
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

  const pickImage = () => {
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      "#J_ImgBooth",
      "#J_UlThumb img",
      ".tb-booth img",
      ".tb-gallery img",
      ".tb-pic img",
      '[class*="mainPic"] img',
      '[class*="MainPic"] img',
      '[class*="PicGallery"] img',
      '[class*="thumbnail"] img',
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

  const findScriptPrice = () => {
    const scripts = [...document.scripts]
      .map((script) => script.textContent || "")
      .filter((text) => /price|promotion|sku|item/i.test(text));
    const patterns = [
      /"(?:price|priceText|promotionPrice|currentPrice|salePrice)"\s*:\s*"?[¥￥]?\s*(\d+(?:\.\d+)?)/i,
      /"(?:priceText|price)"\s*:\s*"[¥￥]?\s*(\d+(?:\.\d+)?)/i,
      /[¥￥]\s*(\d+(?:\.\d+)?)/
    ];

    for (const text of scripts) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
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
      '[aria-checked="true"]',
      ".tb-selected",
      ".tm-selected",
      '[class*="isSelected"]',
      '[class*="sku"][class*="active"]',
      '[class*="Sku"][class*="active"]',
      '[data-value][class*="selected"]',
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
      !/^(宝贝|详情|评价|推荐|店铺|客服|首页|购物车|收藏|全部|销量|价格|综合|已选|请选择)$/u.test(value);

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
        "#tbpcDetail_SkuPanelBody [class*='MainTitle'] span",
        "#tbpcDetail_SkuPanelBody [class*='mainTitle']",
        "[class*='MainTitle'][class*='f-els'] span",
        "span[class*='mainTitle']",
        ".tb-detail-hd h1",
        ".tb-main-title",
        ".tb-title h3",
        "#J_Title h3",
        '[class*="ItemHeader"] h1',
        '[class*="ItemTitle"]',
        '[class*="mainTitle"]',
        '[class*="MainTitle"]',
        '[class*="title--"]',
        'meta[property="og:title"]',
        'meta[name="title"]',
        "h1"
      ]) || document.title.replace(/[-_].*$/, "").trim();

    const rawPrice =
      pickText([
        'meta[property="product:price:amount"]',
        'meta[itemprop="price"]',
        "#J_StrPrice .tb-rmb-num",
        "#J_PromoPriceNum",
        ".tb-price .tb-rmb-num",
        ".tm-promo-price .tm-price",
        ".tm-price",
        '[class*="priceText"]',
        '[class*="PriceText"]',
        '[class*="Price"]',
        '[class*="price"]'
      ]) ||
      findJsonLdPrice() ||
      findScriptPrice();

    return {
      image: pickImage(),
      name,
      colorCategory: readSelectedSku(),
      unitPrice: cleanPrice(rawPrice),
      url: location.href
    };
  };

  exporter.productExtractor = {
    readProduct
  };
})();
