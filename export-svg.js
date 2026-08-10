(function () {
  const ExportSvg = {
    generate(state, metrics) {
      const plot = metrics.plot;
      const chunks = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}">`,
        `<rect width="100%" height="100%" fill="#ffffff"/>`,
        `<defs><clipPath id="plot-clip"><rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}"/></clipPath></defs>`,
        titleSvg(state, metrics),
        `<g id="axes"><rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" fill="none" stroke="#000" stroke-width="2"/></g>`,
        tickSvg(state, metrics),
        axisTitleSvg(state, metrics),
        state.plotType === "line" ? lineDataSvg(state, metrics) : scatterDataSvg(state, metrics),
        legendSvg(state, metrics),
        `</svg>`
      ];
      return chunks.join("\n");
    },

    downloadSvg(state, metrics) {
      downloadBlob(this.generate(state, metrics), `${fileBase(state)}.svg`, "image/svg+xml;charset=utf-8");
    },

    downloadPng(canvas, state) {
      canvas.toBlob((blob) => downloadBlob(blob, `${fileBase(state)}.png`, "image/png"));
    }
  };

  function titleSvg(state, metrics) {
    const title = PlotCore.displayText(state.title);
    if (!title) return `<g id="title"></g>`;
    return `<g id="title"><text x="${metrics.width / 2}" y="52" text-anchor="middle" font-family="Calibri,FangSong" font-size="32" font-weight="700">${escapeXml(title)}</text></g>`;
  }

  function scatterDataSvg(state, metrics) {
    const model = state.lastModel;
    if (!model || !model.ranges) return `<g id="scatter-data"></g>`;
    const plot = metrics.plot;
    const grouped = PlotCore.groupBy(state.filteredRows, (row) => DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode));
    const parts = [`<g id="scatter-data">`];
    Object.entries(grouped).forEach(([category, rows], index) => {
      const style = state.styles[category] || LegendStyle.defaultStyle(category, index);
      parts.push(`<g id="category-${escapeId(category)}" data-name="${escapeXml(category)}">`);
      if (state.trendlines && state.trendlines.visible && model.trendlines) {
        const trend = model.trendlines.find((item) => item.category === category);
        if (trend && trend.line) parts.push(trendlineSvg(trend.line, trend.style || style, state, metrics));
      }
      rows.forEach((row) => {
        const xValue = toNumber(row[state.xColumn]);
        const yValue = toNumber(row[state.yColumn]);
        if (!PlotCore.insideDomain(xValue, model.ranges.x, state.axes.xLog) || !PlotCore.insideDomain(yValue, model.ranges.y, state.axes.yLog)) return;
        const x = PlotCore.scaleValue(xValue, model.ranges.x, plot.left, plot.right, state.axes.xLog, state.axes.xReverse);
        const y = PlotCore.scaleValue(yValue, model.ranges.y, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
        parts.push(LegendStyle.markerSvg(round(x), round(y), state.markerSize, style));
      });
      parts.push(`</g>`);
    });
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function trendlineSvg(line, style, state, metrics) {
    const plot = metrics.plot;
    const ranges = state.lastModel.ranges;
    const x1 = PlotCore.scaleValue(line.x1, ranges.x, plot.left, plot.right, state.axes.xLog, state.axes.xReverse);
    const y1 = PlotCore.scaleValue(line.y1, ranges.y, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
    const x2 = PlotCore.scaleValue(line.x2, ranges.x, plot.left, plot.right, state.axes.xLog, state.axes.xReverse);
    const y2 = PlotCore.scaleValue(line.y2, ranges.y, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
    const dash = LegendStyle.dashArray(style.lineType).join(" ");
    const width = style.width ?? state.trendlines.width ?? 2;
    const opacity = style.opacity ?? state.trendlines.opacity ?? 0.85;
    const color = style.color || style.fill || "#111827";
    return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${escapeXml(color)}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="${opacity}" clip-path="url(#plot-clip)"/>`;
  }

  function lineDataSvg(state, metrics) {
    const model = state.lastModel;
    if (!model || !model.lineSeries || !model.ranges) return `<g id="line-data"></g>`;
    const plot = metrics.plot;
    const xRange = model.ranges.x;
    const yRange = model.ranges.y;
    const parts = [`<g id="line-data">`];
    model.lineSeries.forEach((series, index) => {
      const style = state.styles[series.category] || LegendStyle.defaultStyle(series.category, index);
      const dash = LegendStyle.dashArray(style.lineType).join(" ");
      parts.push(`<g id="line-${escapeId(series.name)}" data-name="${escapeXml(series.name)}">`);
      if (series.sd && state.showSdBand) {
        parts.push(sdBandSvg(series, state, metrics, style));
      }
      const path = linePath(series.values, state, metrics, xRange, yRange);
      parts.push(`<path d="${path}" fill="none" stroke="${escapeXml(style.fill)}" stroke-width="${style.lineWidth}" stroke-dasharray="${dash}" opacity="${style.opacity}" clip-path="url(#plot-clip)"/>`);
      if (state.showLinePoints) {
        series.values.forEach((value, elementIndex) => {
          if (!PlotCore.insideDomain(value, yRange, state.axes.yLog)) return;
          const x = PlotCore.scaleValue(elementIndex, xRange, plot.left, plot.right, false, state.axes.xReverse);
          const y = PlotCore.scaleValue(value, yRange, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
          parts.push(LegendStyle.markerSvg(round(x), round(y), state.markerSize * 0.9, style));
        });
      }
      parts.push(`</g>`);
    });
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function linePath(values, state, metrics, xRange, yRange) {
    let started = false;
    return values.map((value, index) => {
      if (!PlotCore.insideDomain(value, yRange, state.axes.yLog)) {
        started = false;
        return "";
      }
      const x = PlotCore.scaleValue(index, xRange, metrics.plot.left, metrics.plot.right, false, state.axes.xReverse);
      const y = PlotCore.scaleValue(value, yRange, metrics.plot.bottom, metrics.plot.top, state.axes.yLog, state.axes.yReverse);
      const command = started ? "L" : "M";
      started = true;
      return `${command}${round(x)},${round(y)}`;
    }).filter(Boolean).join(" ");
  }

  function sdBandSvg(series, state, metrics, style) {
    const xRange = state.lastModel.ranges.x;
    const yRange = state.lastModel.ranges.y;
    const segments = LinePlot.bandSegments(series, yRange, state.axes.yLog);
    if (!segments.length) return "";
    return segments.map((segment, segmentIndex) => {
      const upper = segment.map((point) => mapBandPoint(point.index, point.upper, state, metrics, xRange, yRange));
      const lower = [...segment].reverse().map((point) => mapBandPoint(point.index, point.lower, state, metrics, xRange, yRange));
      return `<polygon id="sd-band-${escapeId(series.name)}-${segmentIndex + 1}" points="${[...upper, ...lower].join(" ")}" fill="${escapeXml(style.fill)}" opacity="0.14" clip-path="url(#plot-clip)"/>`;
    }).join("\n");
  }

  function mapBandPoint(index, value, state, metrics, xRange, yRange) {
    const x = PlotCore.scaleValue(index, xRange, metrics.plot.left, metrics.plot.right, false, state.axes.xReverse);
    const y = PlotCore.scaleValue(value, yRange, metrics.plot.bottom, metrics.plot.top, state.axes.yLog, state.axes.yReverse);
    return `${round(x)},${round(y)}`;
  }

  function legendSvg(state, metrics) {
    if (!state.legendVisible) return `<g id="legend"></g>`;
    const parts = [`<g id="legend" transform="translate(${metrics.legend.x} ${metrics.legend.y}) scale(${state.legendScale})">`];
    state.visibleCategories.forEach((category, index) => {
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
    const plot = metrics.plot;
    const parts = [`<g id="ticks" font-family="Calibri,FangSong" font-size="20" fill="#111827" stroke="#000">`];
    if (state.plotType === "line") {
      const yTicks = PlotCore.buildAxisTicks(model.ranges.y, state.axes.yStep, state.axes.yLog, state.axes.minorTicks);
      appendYTicks(parts, yTicks, model.ranges.y, state, plot);
      state.selectedElements.forEach((element, index) => {
        const x = PlotCore.scaleValue(index, model.ranges.x, plot.left, plot.right, false, state.axes.xReverse);
        const layout = metrics.elementLabels;
        const transform = layout.angle ? ` transform="rotate(${layout.angle} ${round(x)} ${layout.y})"` : "";
        const anchor = layout.angle ? "end" : "middle";
        parts.push(`<g><line x1="${round(x)}" y1="${plot.bottom}" x2="${round(x)}" y2="${plot.bottom - 10}"/><text x="${round(x)}" y="${layout.y}" text-anchor="${anchor}" dominant-baseline="${layout.angle ? "middle" : "hanging"}" stroke="none"${transform}>${escapeXml(element)}</text></g>`);
      });
    } else {
      const xTicks = PlotCore.buildAxisTicks(model.ranges.x, state.axes.xStep, state.axes.xLog, state.axes.minorTicks);
      const yTicks = PlotCore.buildAxisTicks(model.ranges.y, state.axes.yStep, state.axes.yLog, state.axes.minorTicks);
      if (state.axes.minorTicks) {
        xTicks.minor.forEach((tick) => {
          const x = PlotCore.scaleValue(tick, model.ranges.x, plot.left, plot.right, state.axes.xLog, state.axes.xReverse);
          parts.push(`<line x1="${round(x)}" y1="${plot.bottom}" x2="${round(x)}" y2="${plot.bottom - 5}" stroke="#444"/>`);
        });
      }
      xTicks.major.forEach((tick) => {
        const x = PlotCore.scaleValue(tick, model.ranges.x, plot.left, plot.right, state.axes.xLog, state.axes.xReverse);
        parts.push(`<g><line x1="${round(x)}" y1="${plot.bottom}" x2="${round(x)}" y2="${plot.bottom - 10}"/><text x="${round(x)}" y="${plot.bottom + 34}" text-anchor="middle" stroke="none">${escapeXml(PlotCore.formatTick(tick))}</text></g>`);
      });
      appendYTicks(parts, yTicks, model.ranges.y, state, plot);
    }
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function appendYTicks(parts, ticks, range, state, plot) {
    if (state.axes.minorTicks) {
      ticks.minor.forEach((tick) => {
        const y = PlotCore.scaleValue(tick, range, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
        parts.push(`<line x1="${plot.left}" y1="${round(y)}" x2="${plot.left + 5}" y2="${round(y)}" stroke="#444"/>`);
      });
    }
    ticks.major.forEach((tick) => {
      const y = PlotCore.scaleValue(tick, range, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
      parts.push(`<g><line x1="${plot.left}" y1="${round(y)}" x2="${plot.left + 10}" y2="${round(y)}"/><text x="${plot.left - 10}" y="${round(y + 6)}" text-anchor="end" stroke="none">${escapeXml(PlotCore.formatTick(tick))}</text></g>`);
    });
  }

  function axisTitleSvg(state, metrics) {
    const xTitle = PlotCore.displayText(state.xTitle);
    const yTitle = PlotCore.displayText(state.yTitle);
    const parts = [`<g id="axis-titles" font-family="Calibri,FangSong" font-size="30" font-weight="700" fill="#111827">`];
    if (xTitle) parts.push(`<text x="${(metrics.plot.left + metrics.plot.right) / 2}" y="${metrics.height - 24}" text-anchor="middle">${escapeXml(xTitle)}</text>`);
    if (yTitle) parts.push(`<text x="38" y="${(metrics.plot.top + metrics.plot.bottom) / 2}" text-anchor="middle" transform="rotate(-90 38 ${(metrics.plot.top + metrics.plot.bottom) / 2})">${escapeXml(yTitle)}</text>`);
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function fileBase(state) {
    const title = PlotCore.displayText(state.title);
    if (title) return sanitize(title);
    if (state.plotType === "line") return "元素配分折线图";
    return sanitize(`${state.xColumn || "X"} vs ${state.yColumn || "Y"}`);
  }

  function sanitize(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.ExportSvg = ExportSvg;
})();
