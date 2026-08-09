(function () {
  const ScatterPlot = {
    draw(ctx, state, metrics) {
      const { dataset } = state;
      const xColumn = state.xColumn;
      const yColumn = state.yColumn;
      const rows = state.filteredRows;
      const model = baseModel(ctx, state, metrics);
      if (!dataset || !xColumn || !yColumn) {
        drawEmpty(ctx, metrics, "请先导入数据并选择 X/Y 轴字段");
        return { points: [], model };
      }

      const data = rows.map((row) => ({
        row,
        x: toNumber(row[xColumn]),
        y: toNumber(row[yColumn]),
        category: DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode)
      })).filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));

      const ranges = buildRanges(data.map((d) => d.x), data.map((d) => d.y), state.axes);
      model.ranges = ranges;
      drawFrame(ctx, state, metrics, ranges);

      const points = [];
      const byCategory = groupBy(data, (d) => d.category);
      const trendlines = [];
      Object.entries(byCategory).forEach(([category, items]) => {
        const style = state.styles[category] || LegendStyle.defaultStyle(category, 0);
        const visibleItems = items.filter((item) => insideDomain(item.x, ranges.x, state.axes.xLog) && insideDomain(item.y, ranges.y, state.axes.yLog));
        if (state.trendlines && state.trendlines.visible) {
          const trendStyle = resolveTrendStyle(state.trendlines, category, style);
          const line = fitTrendline(visibleItems, ranges, state.axes, state.trendlines.mode);
          if (line && trendStyle.enabled) {
            drawTrendline(ctx, line, ranges, metrics.plot, state.axes, trendStyle);
            trendlines.push({ category, line, style: trendStyle });
          }
        }
        for (const item of visibleItems) {
          const x = scaleValue(item.x, ranges.x, metrics.plot.left, metrics.plot.right, state.axes.xLog, state.axes.xReverse);
          const y = scaleValue(item.y, ranges.y, metrics.plot.bottom, metrics.plot.top, state.axes.yLog, state.axes.yReverse);
          LegendStyle.drawMarker(ctx, x, y, state.markerSize, style);
          points.push({ x, y, radius: state.markerSize + 3, row: item.row, category, xValue: item.x, yValue: item.y });
        }
      });
      model.trendlines = trendlines;
      return { points, model };
    }
  };

  function baseModel(ctx, state, metrics) {
    ctx.clearRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, metrics.width, metrics.height);
    return {};
  }

  function drawEmpty(ctx, metrics, text) {
    ctx.clearRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = "#667085";
    ctx.font = "24px Calibri, FangSong";
    ctx.textAlign = "center";
    ctx.fillText(text, metrics.width / 2, metrics.height / 2);
  }

  function drawFrame(ctx, state, metrics, ranges) {
    const p = metrics.plot;
    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.left, p.top, p.right - p.left, p.bottom - p.top);
    drawTicks(ctx, p.left, p.right, p.bottom, ranges.x, false, state.axes.xLog, state.axes.xStep, state.axes.minorTicks, state.axes.xReverse);
    drawTicks(ctx, p.bottom, p.top, p.left, ranges.y, true, state.axes.yLog, state.axes.yStep, state.axes.minorTicks, state.axes.yReverse);
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.font = "700 32px Calibri, FangSong";
    ctx.fillText(state.title || `${state.xTitle} vs ${state.yTitle}`, metrics.width / 2, 52);
    ctx.font = "700 30px Calibri, FangSong";
    ctx.fillText(state.xTitle || state.xColumn || "X", (p.left + p.right) / 2, metrics.height - 32);
    ctx.save();
    ctx.translate(38, (p.top + p.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(state.yTitle || state.yColumn || "Y", 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawTicks(ctx, startPx, endPx, axisPx, range, vertical, logScale, step, minor, reverse) {
    const ticks = makeTicks(range.min, range.max, step, logScale);
    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#111827";
    ctx.font = "20px Calibri, FangSong";
    ctx.textAlign = vertical ? "right" : "center";
    ctx.textBaseline = vertical ? "middle" : "top";
    ticks.forEach((tick) => {
      const px = vertical
        ? scaleValue(tick, range, startPx, endPx, logScale, reverse)
        : scaleValue(tick, range, startPx, endPx, logScale, reverse);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(axisPx, px); ctx.lineTo(axisPx + 10, px);
        ctx.stroke();
        ctx.fillText(formatTick(tick), axisPx - 10, px);
      } else {
        ctx.moveTo(px, axisPx); ctx.lineTo(px, axisPx - 10);
        ctx.stroke();
        ctx.fillText(formatTick(tick), px, axisPx + 12);
      }
    });
    if (minor) {
      ctx.strokeStyle = "#444";
      makeMinorTicks(range, ticks, logScale).forEach((tick) => {
        const px = scaleValue(tick, range, startPx, endPx, logScale, reverse);
        ctx.beginPath();
        if (vertical) { ctx.moveTo(axisPx, px); ctx.lineTo(axisPx + 5, px); }
        else { ctx.moveTo(px, axisPx); ctx.lineTo(px, axisPx - 5); }
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  function makeMinorTicks(range, majorTicks, logScale) {
    const ticks = [];
    if (logScale) {
      const a = Math.floor(Math.log10(range.min));
      const b = Math.ceil(Math.log10(range.max));
      for (let power = a; power <= b; power += 1) {
        const base = 10 ** power;
        for (let m = 2; m < 10; m += 1) {
          const tick = m * base;
          if (tick > range.min && tick < range.max) ticks.push(tick);
        }
      }
      return ticks;
    }
    if (majorTicks.length < 2) return ticks;
    for (let i = 0; i < majorTicks.length - 1; i += 1) {
      const d = (majorTicks[i + 1] - majorTicks[i]) / 5;
      for (let j = 1; j < 5; j += 1) {
        const tick = majorTicks[i] + d * j;
        if (tick > range.min && tick < range.max) ticks.push(tick);
      }
    }
    return ticks;
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
    const n = points.length;
    const sx = points.reduce((sum, point) => sum + point.x, 0);
    const sy = points.reduce((sum, point) => sum + point.y, 0);
    const sxx = points.reduce((sum, point) => sum + point.x * point.x, 0);
    const sxy = points.reduce((sum, point) => sum + point.x * point.y, 0);
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-12) return null;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    return { slope, intercept };
  }

  function clipLineToRange(line, ranges, axes) {
    const candidates = [];
    const add = (x, y) => {
      if (insideDomain(x, ranges.x, axes.xLog) && insideDomain(y, ranges.y, axes.yLog)) candidates.push({ x, y });
    };
    add(line.x1, line.y1);
    add(line.x2, line.y2);
    if (line.x1 !== line.x2) {
      const slope = (line.y2 - line.y1) / (line.x2 - line.x1);
      const intercept = line.y1 - slope * line.x1;
      [ranges.y.min, ranges.y.max].forEach((y) => {
        const x = (y - intercept) / slope;
        add(x, y);
      });
    }
    if (line.y1 !== line.y2) {
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
    const categoryConfig = trendlines.categories && trendlines.categories[category] ? trendlines.categories[category] : {};
    const lineType = categoryConfig.lineType && categoryConfig.lineType !== "inherit" ? categoryConfig.lineType : legendStyle.lineType;
    return {
      enabled: categoryConfig.enabled !== false,
      color: categoryConfig.color || legendStyle.fill,
      lineType,
      width: Number(categoryConfig.width) > 0 ? Number(categoryConfig.width) : Number(trendlines.width || 2),
      opacity: Number(categoryConfig.opacity) > 0 ? Number(categoryConfig.opacity) : Number(trendlines.opacity || 0.85)
    };
  }

  function drawTrendline(ctx, line, ranges, p, axes, trendStyle) {
    const x1 = scaleValue(line.x1, ranges.x, p.left, p.right, axes.xLog, axes.xReverse);
    const y1 = scaleValue(line.y1, ranges.y, p.bottom, p.top, axes.yLog, axes.yReverse);
    const x2 = scaleValue(line.x2, ranges.x, p.left, p.right, axes.xLog, axes.xReverse);
    const y2 = scaleValue(line.y2, ranges.y, p.bottom, p.top, axes.yLog, axes.yReverse);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.left, p.top, p.right - p.left, p.bottom - p.top);
    ctx.clip();
    ctx.strokeStyle = trendStyle.color;
    ctx.globalAlpha = trendStyle.opacity;
    ctx.lineWidth = trendStyle.width;
    ctx.setLineDash(LegendStyle.dashArray(trendStyle.lineType));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function buildRanges(xs, ys, axes) {
    return {
      x: rangeFrom(xs, axes.xMin, axes.xMax, axes.xLog),
      y: rangeFrom(ys, axes.yMin, axes.yMax, axes.yLog)
    };
  }

  function rangeFrom(values, minInput, maxInput, logScale) {
    const valid = values.filter((v) => Number.isFinite(v) && (!logScale || v > 0));
    let min = minInput !== "" && Number.isFinite(Number(minInput)) ? Number(minInput) : Math.min(...valid);
    let max = maxInput !== "" && Number.isFinite(Number(maxInput)) ? Number(maxInput) : Math.max(...valid);
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = logScale ? 1 : 0; max = logScale ? 10 : 1; }
    if (logScale && min <= 0) min = Math.min(...valid.filter((v) => v > 0));
    if (min === max) { min -= 1; max += 1; }
    const pad = logScale ? 1 : (max - min) * 0.05;
    if (minInput === "" && !logScale) min -= pad;
    if (maxInput === "" && !logScale) max += pad;
    return { min, max };
  }

  function makeTicks(min, max, step, logScale) {
    if (logScale) {
      const a = Math.ceil(Math.log10(min));
      const b = Math.floor(Math.log10(max));
      const ticks = [];
      for (let i = a; i <= b; i += 1) ticks.push(10 ** i);
      return ticks.length ? ticks : [min, max];
    }
    const span = max - min;
    const rawStep = Number(step) > 0 ? Number(step) : niceStep(span / 5);
    const first = Math.ceil(min / rawStep) * rawStep;
    const ticks = [];
    for (let v = first; v <= max + rawStep * 0.001; v += rawStep) ticks.push(Number(v.toPrecision(12)));
    return ticks;
  }

  function niceStep(raw) {
    const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-12)));
    const n = raw / pow;
    if (n <= 1) return pow;
    if (n <= 2) return 2 * pow;
    if (n <= 5) return 5 * pow;
    return 10 * pow;
  }

  function scaleValue(value, range, outA, outB, logScale, reverse = false) {
    const v = logScale ? Math.log10(value) : value;
    const min = logScale ? Math.log10(range.min) : range.min;
    const max = logScale ? Math.log10(range.max) : range.max;
    const t = (v - min) / (max - min);
    const mapped = reverse ? 1 - t : t;
    return outA + mapped * (outB - outA);
  }

  function insideDomain(value, range, logScale) {
    return Number.isFinite(value) && (!logScale || value > 0) && value >= range.min && value <= range.max;
  }

  function formatTick(value) {
    if (!Number.isFinite(value)) return "";
    if (value === 0) return "0";
    const abs = Math.abs(value);
    if (abs >= 1e6 || abs < 1e-6) return value.toExponential(1);
    if (abs < 1) return trimFixed(value, Math.min(6, Math.ceil(-Math.log10(abs)) + 2));
    return Number(value.toPrecision(6)).toString();
  }

  function trimFixed(value, digits) {
    return value.toFixed(digits).replace(/\.?0+$/, "");
  }

  function groupBy(items, getter) {
    return items.reduce((acc, item) => {
      const key = getter(item);
      (acc[key] ||= []).push(item);
      return acc;
    }, {});
  }

  window.ScatterPlot = ScatterPlot;
  window.PlotMath = { buildRanges, rangeFrom, makeTicks, makeMinorTicks, scaleValue, insideDomain, formatTick, groupBy, drawFrame };
})();
