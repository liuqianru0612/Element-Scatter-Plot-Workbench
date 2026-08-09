(function () {
  const ExportSvg = {
    generate(state, metrics) {
      const title = escapeXml(state.title || `${state.xTitle || state.xColumn || "X"} vs ${state.yTitle || state.yColumn || "Y"}`);
      const p = metrics.plot;
      const chunks = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}">`,
        `<rect width="100%" height="100%" fill="#ffffff"/>`,
        `<g id="title"><text x="${metrics.width / 2}" y="52" text-anchor="middle" font-family="Calibri,FangSong" font-size="32" font-weight="700">${title}</text></g>`,
        `<g id="axes"><rect x="${p.left}" y="${p.top}" width="${p.right - p.left}" height="${p.bottom - p.top}" fill="none" stroke="#000" stroke-width="2"/></g>`,
        tickSvg(state, metrics),
        axisTitleSvg(state, metrics)
      ];
      if (state.plotType === "line") chunks.push(lineDataSvg(state, metrics));
      else chunks.push(scatterDataSvg(state, metrics));
      chunks.push(legendSvg(state, metrics));
      chunks.push(`</svg>`);
      return chunks.join("\n");
    },

    downloadSvg(state, metrics) {
      const svg = this.generate(state, metrics);
      downloadBlob(svg, `${fileBase(state)}.svg`, "image/svg+xml;charset=utf-8");
    },

    downloadPng(canvas, state) {
      canvas.toBlob((blob) => downloadBlob(blob, `${fileBase(state)}.png`, "image/png"));
    }
  };

  function scatterDataSvg(state, metrics) {
    const model = state.lastModel;
    if (!model || !model.ranges) return `<g id="scatter-data"></g>`;
    const p = metrics.plot;
    const grouped = PlotMath.groupBy(state.filteredRows, (row) => DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode));
    const parts = [`<g id="scatter-data">`];
    Object.entries(grouped).forEach(([category, rows], index) => {
      const style = state.styles[category] || LegendStyle.defaultStyle(category, index);
      parts.push(`<g id="category-${escapeId(category)}" data-name="${escapeXml(category)}">`);
      if (state.trendlines && state.trendlines.visible && model.trendlines) {
        const trend = model.trendlines.find((item) => item.category === category);
        if (trend && trend.line) parts.push(trendlineSvg(trend.line, trend.style || style, state, metrics));
      }
      rows.forEach((row) => {
        const xv = toNumber(row[state.xColumn]);
        const yv = toNumber(row[state.yColumn]);
        if (!PlotMath.insideDomain(xv, model.ranges.x, state.axes.xLog) || !PlotMath.insideDomain(yv, model.ranges.y, state.axes.yLog)) return;
        const x = PlotMath.scaleValue(xv, model.ranges.x, p.left, p.right, state.axes.xLog, state.axes.xReverse);
        const y = PlotMath.scaleValue(yv, model.ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
        parts.push(LegendStyle.markerSvg(round(x), round(y), state.markerSize, style));
      });
      parts.push(`</g>`);
    });
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function trendlineSvg(line, style, state, metrics) {
    const p = metrics.plot;
    const ranges = state.lastModel.ranges;
    const x1 = PlotMath.scaleValue(line.x1, ranges.x, p.left, p.right, state.axes.xLog, state.axes.xReverse);
    const y1 = PlotMath.scaleValue(line.y1, ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
    const x2 = PlotMath.scaleValue(line.x2, ranges.x, p.left, p.right, state.axes.xLog, state.axes.xReverse);
    const y2 = PlotMath.scaleValue(line.y2, ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
    const dash = LegendStyle.dashArray(style.lineType).join(" ");
    const width = style.width || state.trendlines.width || 2;
    const opacity = style.opacity || state.trendlines.opacity || 0.85;
    const color = style.color || style.fill || "#111827";
    return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${escapeXml(color)}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="${opacity}"/>`;
  }

  function lineDataSvg(state, metrics) {
    const model = state.lastModel;
    if (!model || !model.lineSeries || !model.ranges) return `<g id="line-data"></g>`;
    const p = metrics.plot;
    const xRange = model.ranges.x;
    const yRange = model.ranges.y;
    const parts = [`<g id="line-data">`];
    model.lineSeries.forEach((series, index) => {
      const style = state.styles[series.category] || LegendStyle.defaultStyle(series.category, index);
      const d = series.values.map((value, i) => {
        if (!PlotMath.insideDomain(value, yRange, state.axes.yLog)) return "";
        const x = PlotMath.scaleValue(i, xRange, p.left, p.right, false, state.axes.xReverse);
        const y = PlotMath.scaleValue(value, yRange, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
        return `${i === 0 ? "M" : "L"}${round(x)},${round(y)}`;
      }).join(" ");
      const dash = LegendStyle.dashArray(style.lineType).join(" ");
      parts.push(`<g id="line-${escapeId(series.name)}" data-name="${escapeXml(series.name)}">`);
      parts.push(`<path d="${d}" fill="none" stroke="${escapeXml(style.fill)}" stroke-width="${style.lineWidth}" stroke-dasharray="${dash}" opacity="${style.opacity}"/>`);
      if (state.showLinePoints) {
        series.values.forEach((value, i) => {
          if (!PlotMath.insideDomain(value, yRange, state.axes.yLog)) return;
          const x = PlotMath.scaleValue(i, xRange, p.left, p.right, false, state.axes.xReverse);
          const y = PlotMath.scaleValue(value, yRange, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
          parts.push(LegendStyle.markerSvg(round(x), round(y), state.markerSize * 0.9, style));
        });
      }
      parts.push(`</g>`);
    });
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function legendSvg(state) {
    if (!state.legendVisible) return `<g id="legend"></g>`;
    const categories = state.visibleCategories;
    const parts = [`<g id="legend" transform="translate(900 95) scale(${state.legendScale})">`];
    categories.forEach((category, index) => {
      const y = index * 24;
      const style = state.styles[category] || LegendStyle.defaultStyle(category, index);
      parts.push(`<g id="legend-item-${escapeId(category)}" transform="translate(0 ${y})">`);
      parts.push(LegendStyle.markerSvg(10, 10, Math.max(12, state.markerSize * 0.7), style));
      parts.push(`<text x="30" y="15" font-family="Calibri,FangSong" font-size="18">${escapeXml(category)}</text>`);
      parts.push(`</g>`);
    });
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function tickSvg(state, metrics) {
    const model = state.lastModel;
    if (!model || !model.ranges) return `<g id="ticks"></g>`;
    const p = metrics.plot;
    const parts = [`<g id="ticks" font-family="Calibri,FangSong" font-size="20" fill="#111827" stroke="#000">`];
    if (state.plotType === "line") {
      const yTicks = PlotMath.makeTicks(model.ranges.y.min, model.ranges.y.max, state.axes.yStep, state.axes.yLog);
      if (state.axes.minorTicks) {
        PlotMath.makeMinorTicks(model.ranges.y, yTicks, state.axes.yLog).forEach((tick) => {
          const y = PlotMath.scaleValue(tick, model.ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
          parts.push(`<line x1="${p.left}" y1="${round(y)}" x2="${p.left + 5}" y2="${round(y)}" stroke="#444"/>`);
        });
      }
      yTicks.forEach((tick) => {
        const y = PlotMath.scaleValue(tick, model.ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
        parts.push(`<g><line x1="${p.left}" y1="${round(y)}" x2="${p.left + 10}" y2="${round(y)}"/><text x="${p.left - 10}" y="${round(y + 6)}" text-anchor="end" stroke="none">${escapeXml(PlotMath.formatTick(tick))}</text></g>`);
      });
      state.selectedElements.forEach((el, i) => {
        const x = PlotMath.scaleValue(i, model.ranges.x, p.left, p.right, false, state.axes.xReverse);
        parts.push(`<g><line x1="${round(x)}" y1="${p.bottom}" x2="${round(x)}" y2="${p.bottom - 10}"/><text x="${round(x)}" y="${p.bottom + 34}" text-anchor="middle" stroke="none">${escapeXml(el)}</text></g>`);
      });
    } else {
      const xTicks = PlotMath.makeTicks(model.ranges.x.min, model.ranges.x.max, state.axes.xStep, state.axes.xLog);
      const yTicks = PlotMath.makeTicks(model.ranges.y.min, model.ranges.y.max, state.axes.yStep, state.axes.yLog);
      if (state.axes.minorTicks) {
        PlotMath.makeMinorTicks(model.ranges.x, xTicks, state.axes.xLog).forEach((tick) => {
          const x = PlotMath.scaleValue(tick, model.ranges.x, p.left, p.right, state.axes.xLog, state.axes.xReverse);
          parts.push(`<line x1="${round(x)}" y1="${p.bottom}" x2="${round(x)}" y2="${p.bottom - 5}" stroke="#444"/>`);
        });
        PlotMath.makeMinorTicks(model.ranges.y, yTicks, state.axes.yLog).forEach((tick) => {
          const y = PlotMath.scaleValue(tick, model.ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
          parts.push(`<line x1="${p.left}" y1="${round(y)}" x2="${p.left + 5}" y2="${round(y)}" stroke="#444"/>`);
        });
      }
      xTicks.forEach((tick) => {
        const x = PlotMath.scaleValue(tick, model.ranges.x, p.left, p.right, state.axes.xLog, state.axes.xReverse);
        parts.push(`<g><line x1="${round(x)}" y1="${p.bottom}" x2="${round(x)}" y2="${p.bottom - 10}"/><text x="${round(x)}" y="${p.bottom + 34}" text-anchor="middle" stroke="none">${escapeXml(PlotMath.formatTick(tick))}</text></g>`);
      });
      yTicks.forEach((tick) => {
        const y = PlotMath.scaleValue(tick, model.ranges.y, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
        parts.push(`<g><line x1="${p.left}" y1="${round(y)}" x2="${p.left + 10}" y2="${round(y)}"/><text x="${p.left - 10}" y="${round(y + 6)}" text-anchor="end" stroke="none">${escapeXml(PlotMath.formatTick(tick))}</text></g>`);
      });
    }
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function axisTitleSvg(state, metrics) {
    const p = metrics.plot;
    return `<g id="axis-titles" font-family="Calibri,FangSong" font-size="30" font-weight="700" fill="#111827">
      <text x="${(p.left + p.right) / 2}" y="${metrics.height - 32}" text-anchor="middle">${escapeXml(state.xTitle || state.xColumn || "X")}</text>
      <text x="38" y="${(p.top + p.bottom) / 2}" text-anchor="middle" transform="rotate(-90 38 ${(p.top + p.bottom) / 2})">${escapeXml(state.yTitle || state.yColumn || "Y")}</text>
    </g>`;
  }

  function fileBase(state) {
    return sanitize(`${state.xTitle || state.xColumn || "元素"} vs ${state.yTitle || state.yColumn || "含量"}`);
  }

  function sanitize(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  }

  function escapeId(value) {
    return sanitize(String(value)).replace(/\s+/g, "-");
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function downloadBlob(content, name, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.ExportSvg = ExportSvg;
})();
