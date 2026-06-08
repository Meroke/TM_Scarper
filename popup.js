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
      files: ["content.js"]
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

const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const textCell = (ref, value, style = 2) =>
  `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${escapeXml(value)}</t></is></c>`;

const numberCell = (ref, value, style = 2) => {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) {
    return textCell(ref, "", style);
  }
  return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const uint16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
const uint32 = (value) => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff
];

const concatBytes = (parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const encode = (value) => new TextEncoder().encode(value);

const createZip = (entries) => {
  const files = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : encode(entry.data);
    const crc = crc32(data);
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0)
    ]);
    const local = concatBytes([localHeader, name, data]);
    files.push(local);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset)
    ]);
    central.push(concatBytes([centralHeader, name]));
    offset += local.length;
  }

  const centralBytes = concatBytes(central);
  const end = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(entries.length),
    ...uint16(entries.length),
    ...uint32(centralBytes.length),
    ...uint32(offset),
    ...uint16(0)
  ]);

  return concatBytes([...files, centralBytes, end]);
};

const downloadImageAsPng = async (imageUrl) => {
  if (!imageUrl) return null;

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("首图下载失败。");

  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);

  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) throw new Error("首图转换失败。");
  return new Uint8Array(await pngBlob.arrayBuffer());
};

const buildXlsx = (row, imageBytes) => {
  const hasImage = Boolean(imageBytes);
  const headers = ["首图", "商品名称", "颜色分类", "单价", "数量", "总价", "网页链接", "备注"];
  const values = [
    "",
    row.name,
    row.colorCategory,
    row.unitPrice,
    row.quantity,
    row.totalPrice,
    row.url,
    row.remark
  ];

  const headerCells = headers
    .map((header, index) => textCell(`${String.fromCharCode(65 + index)}1`, header, 1))
    .join("");
  const dataCells = values
    .map((value, index) => {
      const ref = `${String.fromCharCode(65 + index)}2`;
      if (index === 6) return textCell(ref, value, 3);
      return index >= 3 && index <= 5 ? numberCell(ref, value) : textCell(ref, value);
    })
    .join("");

  const drawingRel = hasImage
    ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
    : "";
  const hyperlinkRelId = hasImage ? "rId2" : "rId1";
  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${drawingRel}
  <Relationship Id="${hyperlinkRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(row.url)}" TargetMode="External"/>
</Relationships>`;

  const entries = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImage ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${hasImage ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
</Types>`
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="商品列表" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FFFFFFFF"/></font><font><u/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF0563C1"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF9CA3AF"/></left><right style="thin"><color rgb="FF9CA3AF"/></right><top style="thin"><color rgb="FF9CA3AF"/></top><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="6" width="12" customWidth="1"/><col min="7" max="7" width="48" customWidth="1"/><col min="8" max="8" width="24" customWidth="1"/></cols>
  <sheetData><row r="1" ht="26" customHeight="1">${headerCells}</row><row r="2" ht="90" customHeight="1">${dataCells}</row></sheetData>
  <hyperlinks><hyperlink ref="G2" r:id="${hyperlinkRelId}"/></hyperlinks>
  ${hasImage ? '<drawing r:id="rId1"/>' : ""}
</worksheet>`
    }
  ];

  entries.push({
    name: "xl/worksheets/_rels/sheet1.xml.rels",
    data: sheetRels
  });

  if (hasImage) {
    entries.push(
      {
        name: "xl/drawings/drawing1.xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor editAs="twoCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="1" name="首图"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
      },
      {
        name: "xl/drawings/_rels/drawing1.xml.rels",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`
      },
      {
        name: "xl/media/image1.png",
        data: imageBytes
      }
    );
  }

  return createZip(entries);
};

const exportExcel = async () => {
  if (!currentProduct) return;

  const quantity = Math.max(1, Number.parseInt(quantityInput.value, 10) || 1);
  const unitPrice = Number.parseFloat(currentProduct.unitPrice);
  const totalPrice = Number.isFinite(unitPrice) ? (unitPrice * quantity).toFixed(2) : "";
  const row = {
    ...currentProduct,
    quantity,
    totalPrice,
    remark: remarkInput.value.trim()
  };

  setStatus("正在下载首图并生成 Excel...");
  let imageBytes = null;
  try {
    imageBytes = await downloadImageAsPng(row.image);
  } catch (error) {
    setStatus(`${error.message || "首图处理失败"}，将导出无图片版本。`, true);
  }

  const workbook = buildXlsx(row, imageBytes);
  const blob = new Blob([workbook], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
