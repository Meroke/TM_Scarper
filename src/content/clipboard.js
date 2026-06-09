(() => {
  const exporter = (window.TmallExporter = window.TmallExporter || {});

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const toTsvValue = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();

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

  const copyToClipboard = async (plainText, html) => {
    if (navigator.clipboard?.write && window.ClipboardItem && html) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" })
        })
      ]);
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plainText);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = plainText;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.documentElement.append(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const buildClipboardHtml = (items) => {
    const cellStyle =
      "border:0.5pt solid #9CA3AF;mso-border-alt:0.5pt solid #9CA3AF;vertical-align:middle;font-family:'Microsoft YaHei';font-size:11pt;color:#000000;white-space:normal;";
    const linkCellStyle =
      "border:0.5pt solid #9CA3AF;mso-border-alt:0.5pt solid #9CA3AF;vertical-align:middle;font-family:'Microsoft YaHei';font-size:11pt;color:#0563C1;text-decoration:underline;white-space:normal;";
    const linkStyle = "color:#0563C1 !important;text-decoration:underline;";
    const rows = items
      .map(
        (item) => `
          <tr>
            <td style="${cellStyle}">${escapeHtml(item.image)}</td>
            <td style="${cellStyle}">${escapeHtml(item.name)}</td>
            <td style="${cellStyle}">${escapeHtml(item.colorCategory)}</td>
            <td style="${cellStyle}">${escapeHtml(item.unitPrice)}</td>
            <td style="${cellStyle}">${escapeHtml(item.quantity)}</td>
            <td style="${cellStyle}">${escapeHtml(item.totalPrice)}</td>
            <td style="${linkCellStyle}"><a href="${escapeHtml(item.url)}" style="${linkStyle}">${escapeHtml(item.url)}</a></td>
            <td style="${cellStyle}">${escapeHtml(item.remark)}</td>
          </tr>
        `
      )
      .join("");
    return `<html><body><!--StartFragment--><table style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">${rows}</table><!--EndFragment--></body></html>`;
  };

  const copyRows = async (items) => {
    const rows = items.map((item) =>
      [
        item.image,
        item.name,
        item.colorCategory,
        item.unitPrice,
        item.quantity,
        item.totalPrice,
        item.url,
        item.remark
      ]
        .map(toTsvValue)
        .join("\t")
    );

    await copyToClipboard(rows.join("\n"), buildClipboardHtml(items));
  };

  const imageToPngBlob = async (imageUrl) => {
    const widthScale = 0.18;
    const heightScale = 0.15;
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("首图下载失败。");
    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmap(sourceBlob);
    const targetWidth = Math.max(1, Math.round(bitmap.width * widthScale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * heightScale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("首图转换失败。"));
      }, "image/png");
    });
  };

  const copyImage = async (item) => {
    if (!item) throw new Error("未找到要复制首图的商品。");
    if (!item.image) throw new Error("该商品没有首图。");
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      throw new Error("当前浏览器不支持复制图片，请使用导出 Excel。");
    }

    const pngBlob = await imageToPngBlob(item.image);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  };

  exporter.clipboard = {
    escapeHtml,
    triggerDownload,
    copyRows,
    copyImage
  };
})();
