(() => {
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

  const buildXlsx = (rows, imageBytesByRow) => {
    const headers = ["首图", "商品名称", "颜色分类", "单价", "数量", "总价", "网页链接", "备注"];
    const imageRows = rows
      .map((_, index) => ({ index, bytes: imageBytesByRow[index] }))
      .filter((item) => Boolean(item.bytes));
    const hasImages = imageRows.length > 0;

    const headerCells = headers
      .map((header, index) => textCell(`${String.fromCharCode(65 + index)}1`, header, 1))
      .join("");

    const dataRows = rows
      .map((row, rowIndex) => {
        const excelRow = rowIndex + 2;
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
        const cells = values
          .map((value, index) => {
            const ref = `${String.fromCharCode(65 + index)}${excelRow}`;
            if (index === 6) return textCell(ref, value, 3);
            return index >= 3 && index <= 5 ? numberCell(ref, value) : textCell(ref, value);
          })
          .join("");
        return `<row r="${excelRow}" ht="90" customHeight="1">${cells}</row>`;
      })
      .join("");

    const hyperlinkRels = rows
      .map((row, index) => {
        const id = `rId${hasImages ? index + 2 : index + 1}`;
        return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(row.url)}" TargetMode="External"/>`;
      })
      .join("");
    const drawingRel = hasImages
      ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
      : "";
    const hyperlinks = rows
      .map((_, index) => {
        const id = `rId${hasImages ? index + 2 : index + 1}`;
        return `<hyperlink ref="G${index + 2}" r:id="${id}"/>`;
      })
      .join("");

    const entries = [
      {
        name: "[Content_Types].xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImages ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${hasImages ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
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
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF5C93"/><bgColor indexed="64"/></patternFill></fill></fills>
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
  <sheetData><row r="1" ht="26" customHeight="1">${headerCells}</row>${dataRows}</sheetData>
  <hyperlinks>${hyperlinks}</hyperlinks>
  ${hasImages ? '<drawing r:id="rId1"/>' : ""}
</worksheet>`
      },
      {
        name: "xl/worksheets/_rels/sheet1.xml.rels",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${drawingRel}
  ${hyperlinkRels}
</Relationships>`
      }
    ];

    if (hasImages) {
      const anchors = imageRows
        .map(({ index }, imageIndex) => {
          const row = index + 1;
          const relId = `rId${imageIndex + 1}`;
          return `<xdr:twoCellAnchor editAs="twoCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="${imageIndex + 1}" name="首图${imageIndex + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
        })
        .join("");
      const imageRels = imageRows
        .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${index + 1}.png"/>`)
        .join("");

      entries.push(
        {
          name: "xl/drawings/drawing1.xml",
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`
        },
        {
          name: "xl/drawings/_rels/drawing1.xml.rels",
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imageRels}</Relationships>`
        },
        ...imageRows.map(({ bytes }, index) => ({
          name: `xl/media/image${index + 1}.png`,
          data: bytes
        }))
      );
    }

    return createZip(entries);
  };

  const createWorkbookBlob = async (rows, onImageError) => {
    const imageBytesByRow = [];
    for (let index = 0; index < rows.length; index += 1) {
      try {
        imageBytesByRow[index] = await downloadImageAsPng(rows[index].image);
      } catch (error) {
        imageBytesByRow[index] = null;
        onImageError?.(error, rows[index], index);
      }
    }

    return new Blob([buildXlsx(rows, imageBytesByRow)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  };

  window.TmallExcel = {
    createWorkbookBlob
  };
})();
