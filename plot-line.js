(function () {
  const LinePlot = {
    draw(ctx, state, metrics) {
      const elements = state.selectedElements;
      clearCanvas(ctx, metrics);
      if (!state.dataset || elements.length < 2) {
        drawEmpty(ctx, metrics, "请选择至少两个元素列");
        return { points: [], model: {} };
      }

      const series = buildSeries(state);
      const values = series.flatMap((item) => {
        const rangeValues = [...item.values];
        if (state.showSdBand && item.sd) {
          item.values.forEach((mean, index) => {
            const sd = item.sd[index];
            if (Number.isFinite(mean) && Number.isFinite(sd)) rangeValues.push(mean - sd, mean + sd);
          });
        }
        return rangeValues;
      }).filter(Number.isFinite);
      const yRange = PlotCore.rangeFrom(values, state.axes.yMin, state.axes.yMax, state.axes.yLog);
      const xRange = { min: 0, max: elements.length - 1 };
      const model = {
        ranges: { x: xRange, y: yRange },
        lineSeries: series,
        legendCategories: PlotCore.unique(series.map((item) => item.category))
      };
      drawLineFrame(ctx, state, metrics, yRange);

      const points = [];
      series.forEach((item, index) => {
        const style = state.styles[item.category] || LegendStyle.defaultStyle(item.category, index);
        if (item.sd && state.showSdBand) {
          drawSdBand(ctx, item, metrics.plot, xRange, yRange, state.axes.yLog, style, state.axes.xReverse, state.axes.yReverse);
        }
        drawSeriesLine(ctx, item, metrics.plot, xRange, yRange, state.axes, style);
        if (state.showLinePoints) {
          item.values.forEach((value, elementIndex) => {
            if (!PlotCore.insideDomain(value, yRange, state.axes.yLog)) return;
            const x = PlotCore.scaleValue(elementIndex, xRange, metrics.plot.left, metrics.plot.right, false, state.axes.xReverse);
            const y = PlotCore.scaleValue(value, yRange, metrics.plot.bottom, metrics.plot.top, state.axes.yLog, state.axes.yReverse);
            LegendStyle.drawMarker(ctx, x, y, state.markerSize * 0.9, style);
            points.push({
              x,
              y,
              radius: state.markerSize + 4,
              category: item.category,
              label: item.name,
              row: item.row || null,
              element: elements[elementIndex],
              yValue: value
            });
          });
        }
      });
      return { points, model };
    },

    buildSeries,
    bandSegments
  };

  function clearCanvas(ctx, metrics) {
    ctx.clearRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }

  function drawEmpty(ctx, metrics, text) {
    ctx.fillStyle = "#667085";
    ctx.font = "24px Calibri, FangSong";
    ctx.textAlign = "center";
    ctx.fillText(text, metrics.width / 2, metrics.height / 2);
  }

  function buildSeries(state) {
    const rows = state.filteredRows;
    const elements = state.selectedElements;
    if (state.lineMode === "sample") {
      return rows.map((row, index) => ({
        name: DataModule.sampleLabel(row) || `样品 ${index + 1}`,
        category: DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode),
        row,
        values: elements.map((element) => toNumber(row[element]))
      }));
    }

    const field = state.lineMode === "field" ? state.lineGroupField : state.categoryField;
    const groups = PlotCore.groupBy(rows, (row) => DataModule.categoryValue(row, field, state.sampleSets, state.sampleSetMode));
    return Object.entries(groups).map(([category, group]) => {
      const stats = elements.map((element) => {
        const values = group.map((row) => toNumber(row[element])).filter(Number.isFinite);
        if (!values.length) return { mean: NaN, sd: NaN };
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length - 1, 1);
        return { mean, sd: Math.sqrt(variance) };
      });
      return {
        name: category,
        category,
        values: stats.map((item) => item.mean),
        sd: stats.map((item) => item.sd)
      };
    });
  }

  function drawSeriesLine(ctx, series, plot, xRange, yRange, axes, style) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.clip();
    ctx.strokeStyle = style.fill;
    ctx.globalAlpha = Number(style.opacity ?? 1);
    ctx.lineWidth = Number(style.lineWidth || 2);
    ctx.setLineDash(LegendStyle.dashArray(style.lineType));
    ctx.beginPath();
    let started = false;
    series.values.forEach((value, index) => {
      if (!PlotCore.insideDomain(value, yRange, axes.yLog)) {
        started = false;
        return;
      }
      const x = PlotCore.scaleValue(index, xRange, plot.left, plot.right, false, axes.xReverse);
      const y = PlotCore.scaleValue(value, yRange, plot.bottom, plot.top, axes.yLog, axes.yReverse);
      if (!started) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      started = true;
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawLineFrame(ctx, state, metrics, yRange) {
    const plot = metrics.plot;
    const ticks = PlotCore.buildAxisTicks(yRange, state.axes.yStep, state.axes.yLog, state.axes.minorTicks);
    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    if (state.axes.minorTicks) {
      ctx.strokeStyle = "#444";
      ticks.minor.forEach((tick) => {
        const y = PlotCore.scaleValue(tick, yRange, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
        ctx.beginPath();
        ctx.moveTo(plot.left, y);
        ctx.lineTo(plot.left + 5, y);
        ctx.stroke();
      });
    }
    ctx.strokeStyle = "#000";
    ticks.major.forEach((tick) => {
      const y = PlotCore.scaleValue(tick, yRange, plot.bottom, plot.top, state.axes.yLog, state.axes.yReverse);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + 10, y);
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.font = "20px Calibri, FangSong";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(PlotCore.formatTick(tick), plot.left - 10, y);
    });
    drawElementLabels(ctx, state, metrics);
    drawTitles(ctx, state, metrics);
    ctx.restore();
  }

  function drawElementLabels(ctx, state, metrics) {
    const plot = metrics.plot;
    const layout = metrics.elementLabels;
    const xRange = { min: 0, max: state.selectedElements.length - 1 };
    ctx.fillStyle = "#111827";
    ctx.font = `${layout.fontSize}px Calibri, FangSong`;
    state.selectedElements.forEach((element, index) => {
      const x = PlotCore.scaleValue(index, xRange, plot.left, plot.right, false, state.axes.xReverse);
      ctx.beginPath();
      ctx.moveTo(x, plot.bottom);
      ctx.lineTo(x, plot.bottom - 10);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, layout.y);
      ctx.rotate(layout.angle * Math.PI / 180);
      ctx.textAlign = layout.angle === 0 ? "center" : "right";
      ctx.textBaseline = layout.angle === 0 ? "top" : "middle";
      ctx.fillText(element, 0, 0);
      ctx.restore();
    });
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

  function bandSegments(series, yRange, logScale) {
    const segments = [];
    let current = [];
    series.values.forEach((mean, index) => {
      const sd = series.sd ? series.sd[index] : NaN;
      if (!Number.isFinite(mean) || !Number.isFinite(sd)) {
        if (current.length > 1) segments.push(current);
        current = [];
        return;
      }
      const lowerLimit = logScale ? Math.max(yRange.min, Number.MIN_VALUE) : yRange.min;
      const upper = Math.min(yRange.max, mean + sd);
      const lower = Math.max(lowerLimit, mean - sd);
      if (upper < yRange.min || lower > yRange.max || (logScale && upper <= 0)) {
        if (current.length > 1) segments.push(current);
        current = [];
        return;
      }
      current.push({ index, upper, lower });
    });
    if (current.length > 1) segments.push(current);
    return segments;
  }

  function drawSdBand(ctx, series, plot, xRange, yRange, logScale, style, xReverse, yReverse) {
    const segments = bandSegments(series, yRange, logScale);
    if (!segments.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.clip();
    ctx.fillStyle = style.fill;
    ctx.globalAlpha = 0.14;
    segments.forEach((segment) => {
      ctx.beginPath();
      segment.forEach((point, offset) => {
        const x = PlotCore.scaleValue(point.index, xRange, plot.left, plot.right, false, xReverse);
        const y = PlotCore.scaleValue(point.upper, yRange, plot.bottom, plot.top, logScale, yReverse);
        if (offset === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      [...segment].reverse().forEach((point) => {
        const x = PlotCore.scaleValue(point.index, xRange, plot.left, plot.right, false, xReverse);
        const y = PlotCore.scaleValue(point.lower, yRange, plot.bottom, plot.top, logScale, yReverse);
        ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  window.LinePlot = LinePlot;
})();
