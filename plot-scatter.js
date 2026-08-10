(function () {
  const ScatterPlot = {
    draw(ctx, state, metrics) {
      const { dataset, xColumn, yColumn, filteredRows } = state;
      clearCanvas(ctx, metrics);
      if (!dataset || !xColumn || !yColumn) {
        drawEmpty(ctx, metrics, "请先导入数据并选择 X/Y 轴字段");
        return { points: [], model: {} };
      }

      const data = filteredRows.map((row) => ({
        row,
        x: toNumber(row[xColumn]),
        y: toNumber(row[yColumn]),
        category: DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode)
      })).filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));

      const ranges = PlotCore.buildRanges(data.map((item) => item.x), data.map((item) => item.y), state.axes);
      drawFrame(ctx, state, metrics, ranges);

      const points = [];
      const trendlines = [];
      const byCategory = PlotCore.groupBy(data, (item) => item.category);
      Object.entries(byCategory).forEach(([category, items], index) => {
        const style = state.styles[category] || LegendStyle.defaultStyle(category, index);
        const visibleItems = items.filter((item) => (
          PlotCore.insideDomain(item.x, ranges.x, state.axes.xLog)
          && PlotCore.insideDomain(item.y, ranges.y, state.axes.yLog)
        ));
        if (state.trendlines && state.trendlines.visible) {
          const trendStyle = resolveTrendStyle(state.trendlines, category, style);
          const line = fitTrendline(visibleItems, ranges, state.axes, state.trendlines.mode);
          if (line && trendStyle.enabled) {
            drawTrendline(ctx, line, ranges, metrics.plot, state.axes, trendStyle);
            trendlines.push({ category, line, style: trendStyle });
          }
        }
        visibleItems.forEach((item) => {
          const x = PlotCore.scaleValue(item.x, ranges.x, metrics.plot.left, metrics.plot.right, state.axes.xLog, state.axes.xReverse);
          const y = PlotCore.scaleValue(item.y, ranges.y, metrics.plot.bottom, metrics.plot.top, state.axes.yLog, state.axes.yReverse);
          LegendStyle.drawMarker(ctx, x, y, state.markerSize, style);
          points.push({ x, y, radius: state.markerSize + 3, row: item.row, category, xValue: item.x, yValue: item.y });
        });
      });
      return { points, model: { ranges, trendlines } };
    }
  };

  function clearCanvas(ctx, metrics) {
    ctx.clearRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }

  function drawEmpty(ctx, metrics, text) {
    clearCanvas(ctx, metrics);
    ctx.fillStyle = "#667085";
    ctx.font = "24px Calibri, FangSong";
    ctx.textAlign = "center";
    ctx.fillText(text, metrics.width / 2, metrics.height / 2);
  }

  function drawFrame(ctx, state, metrics, ranges) {
    const plot = metrics.plot;
    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    drawTicks(ctx, plot.left, plot.right, plot.bottom, ranges.x, false, state.axes.xLog, state.axes.xStep, state.axes.minorTicks, state.axes.xReverse);
    drawTicks(ctx, plot.bottom, plot.top, plot.left, ranges.y, true, state.axes.yLog, state.axes.yStep, state.axes.minorTicks, state.axes.yReverse);
    drawTitles(ctx, state, metrics);
    ctx.restore();
  }

  function drawTitles(ctx, state, metrics) {
    const plot = metrics.plot;
    const title = PlotCore.displayText(state.title);
    const xTitle = PlotCore.displayText(state.xTitle);
    const yTitle = PlotCore.displayText(state.yTitle);
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    if (title) {
      ctx.font = "700 32px Calibri, FangSong";
      ctx.fillText(title, metrics.width / 2, 52);
    }
    ctx.font = "700 30px Calibri, FangSong";
    if (xTitle) ctx.fillText(xTitle, (plot.left + plot.right) / 2, metrics.height - 24);
    if (yTitle) {
      ctx.save();
      ctx.translate(38, (plot.top + plot.bottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yTitle, 0, 0);
      ctx.restore();
    }
  }

  function drawTicks(ctx, startPx, endPx, axisPx, range, vertical, logScale, step, minorVisible, reverse) {
    const ticks = PlotCore.buildAxisTicks(range, step, logScale, minorVisible);
    ctx.save();
    if (minorVisible) {
      ctx.strokeStyle = "#444";
      ticks.minor.forEach((tick) => {
        const px = PlotCore.scaleValue(tick, range, startPx, endPx, logScale, reverse);
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(axisPx, px);
          ctx.lineTo(axisPx + 5, px);
        } else {
          ctx.moveTo(px, axisPx);
          ctx.lineTo(px, axisPx - 5);
        }
        ctx.stroke();
      });
    }
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#111827";
    ctx.font = "20px Calibri, FangSong";
    ctx.textAlign = vertical ? "right" : "center";
    ctx.textBaseline = vertical ? "middle" : "top";
    ticks.major.forEach((tick) => {
      const px = PlotCore.scaleValue(tick, range, startPx, endPx, logScale, reverse);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(axisPx, px);
        ctx.lineTo(axisPx + 10, px);
        ctx.stroke();
        ctx.fillText(PlotCore.formatTick(tick), axisPx - 10, px);
      } else {
        ctx.moveTo(px, axisPx);
        ctx.lineTo(px, axisPx - 10);
        ctx.stroke();
        ctx.fillText(PlotCore.formatTick(tick), px, axisPx + 12);
      }
    });
    ctx.restore();
  }

  function fitTrendline(items, ranges, axes, mode) {
    const points = items.map((item) => {
      let x = item.x;
      let y = item.y;
      if (mode === "axis") {
        if ((axes.xLog && x <= 0) || (axes.yLog && y <= 0)) return null;
        x = axes.xLog ? Math.log10(x) : x;
        y = axes.yLog ? Math.log10(y) : y;
      }
      return { x, y };
    }).filter(Boolean);
    if (points.length < 2) return null;
    const fit = linearRegression(points);
    if (!fit) return null;
    const xMin = mode === "axis" && axes.xLog ? Math.log10(ranges.x.min) : ranges.x.min;
    const xMax = mode === "axis" && axes.xLog ? Math.log10(ranges.x.max) : ranges.x.max;
    let y1 = fit.intercept + fit.slope * xMin;
    let y2 = fit.intercept + fit.slope * xMax;
    let x1 = xMin;
    let x2 = xMax;
    if (mode === "axis") {
      x1 = axes.xLog ? 10 ** x1 : x1;
      x2 = axes.xLog ? 10 ** x2 : x2;
      y1 = axes.yLog ? 10 ** y1 : y1;
      y2 = axes.yLog ? 10 ** y2 : y2;
    }
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;
    return clipLineToRange({ x1, y1, x2, y2 }, ranges, axes);
  }

  function linearRegression(points) {
    const count = points.length;
    const sumX = points.reduce((sum, point) => sum + point.x, 0);
    const sumY = points.reduce((sum, point) => sum + point.y, 0);
    const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
    const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
    const denominator = count * sumXX - sumX * sumX;
    if (Math.abs(denominator) < 1e-12) return null;
    const slope = (count * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / count;
    return { slope, intercept };
  }

  function clipLineToRange(line, ranges, axes) {
    const candidates = [];
    const add = (x, y) => {
      if (PlotCore.insideDomain(x, ranges.x, axes.xLog) && PlotCore.insideDomain(y, ranges.y, axes.yLog)) candidates.push({ x, y });
    };
    add(line.x1, line.y1);
    add(line.x2, line.y2);
    if (line.x1 !== line.x2) {
      const slope = (line.y2 - line.y1) / (line.x2 - line.x1);
      const intercept = line.y1 - slope * line.x1;
      if (Math.abs(slope) > 1e-15) {
        [ranges.y.min, ranges.y.max].forEach((y) => add((y - intercept) / slope, y));
      }
    }
    if (line.y1 !== line.y2 && line.x1 !== line.x2) {
      const slope = (line.y2 - line.y1) / (line.x2 - line.x1);
      const intercept = line.y1 - slope * line.x1;
      [ranges.x.min, ranges.x.max].forEach((x) => add(x, slope * x + intercept));
    }
    const unique = [];
    candidates.forEach((point) => {
      if (!unique.some((item) => Math.abs(item.x - point.x) < 1e-9 && Math.abs(item.y - point.y) < 1e-9)) unique.push(point);
    });
    if (unique.length < 2) return null;
    return { x1: unique[0].x, y1: unique[0].y, x2: unique[unique.length - 1].x, y2: unique[unique.length - 1].y };
  }

  function resolveTrendStyle(trendlines, category, legendStyle) {
    const config = trendlines.categories && trendlines.categories[category] ? trendlines.categories[category] : {};
    const lineType = config.lineType && config.lineType !== "inherit" ? config.lineType : legendStyle.lineType;
    return {
      enabled: config.enabled !== false,
      color: config.color || legendStyle.fill,
      lineType,
      width: Number(config.width) > 0 ? Number(config.width) : Number(trendlines.width || 2),
      opacity: Number(config.opacity) > 0 ? Number(config.opacity) : Number(trendlines.opacity || 0.85)
    };
  }

  function drawTrendline(ctx, line, ranges, plot, axes, style) {
    const x1 = PlotCore.scaleValue(line.x1, ranges.x, plot.left, plot.right, axes.xLog, axes.xReverse);
    const y1 = PlotCore.scaleValue(line.y1, ranges.y, plot.bottom, plot.top, axes.yLog, axes.yReverse);
    const x2 = PlotCore.scaleValue(line.x2, ranges.x, plot.left, plot.right, axes.xLog, axes.xReverse);
    const y2 = PlotCore.scaleValue(line.y2, ranges.y, plot.bottom, plot.top, axes.yLog, axes.yReverse);
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.clip();
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = style.opacity;
    ctx.lineWidth = style.width;
    ctx.setLineDash(LegendStyle.dashArray(style.lineType));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  window.ScatterPlot = ScatterPlot;
})();
