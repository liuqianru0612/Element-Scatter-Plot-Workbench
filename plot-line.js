(function () {
  const LinePlot = {
    draw(ctx, state, metrics) {
      const elements = state.selectedElements;
      if (!state.dataset || elements.length < 2) {
        ctx.clearRect(0, 0, metrics.width, metrics.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, metrics.width, metrics.height);
        ctx.fillStyle = "#667085";
        ctx.font = "24px Calibri, FangSong";
        ctx.textAlign = "center";
        ctx.fillText("请选择至少两个元素列", metrics.width / 2, metrics.height / 2);
        return { points: [], model: {} };
      }
      const series = buildSeries(state);
      const values = series.flatMap((s) => s.values).filter(Number.isFinite);
      const yRange = PlotMath.rangeFrom(values, state.axes.yMin, state.axes.yMax, state.axes.yLog);
      const xRange = { min: 0, max: elements.length - 1 };
      const model = { ranges: { x: xRange, y: yRange }, lineSeries: series };
      ctx.clearRect(0, 0, metrics.width, metrics.height);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, metrics.width, metrics.height);
      drawLineFrame(ctx, state, metrics, yRange);

      const p = metrics.plot;
      const points = [];
      series.forEach((s, index) => {
        const style = state.styles[s.category] || LegendStyle.defaultStyle(s.category, index);
        ctx.save();
        ctx.strokeStyle = style.fill;
        ctx.globalAlpha = Number(style.opacity ?? 1);
        ctx.lineWidth = Number(style.lineWidth || 2);
        ctx.setLineDash(LegendStyle.dashArray(style.lineType));
        ctx.beginPath();
        s.values.forEach((value, i) => {
          if (!PlotMath.insideDomain(value, yRange, state.axes.yLog)) return;
          const x = PlotMath.scaleValue(i, xRange, p.left, p.right, false, state.axes.xReverse);
          const y = PlotMath.scaleValue(value, yRange, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        if (s.sd && state.showSdBand) drawSdBand(ctx, s, p, xRange, yRange, state.axes.yLog, style, state.axes.xReverse, state.axes.yReverse);
        if (state.showLinePoints) {
          s.values.forEach((value, i) => {
            if (!PlotMath.insideDomain(value, yRange, state.axes.yLog)) return;
            const x = PlotMath.scaleValue(i, xRange, p.left, p.right, false, state.axes.xReverse);
            const y = PlotMath.scaleValue(value, yRange, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
            LegendStyle.drawMarker(ctx, x, y, state.markerSize * 0.9, style);
            points.push({ x, y, radius: state.markerSize + 4, category: s.category, label: s.name, row: s.row || null, element: elements[i], yValue: value });
          });
        }
      });
      return { points, model };
    }
  };

  function buildSeries(state) {
    const rows = state.filteredRows;
    const elements = state.selectedElements;
    if (state.lineMode === "sample") {
      return rows.map((row, index) => ({
        name: DataModule.sampleLabel(row) || `样品 ${index + 1}`,
        category: DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode),
        row,
        values: elements.map((el) => toNumber(row[el]))
      }));
    }
    const field = state.lineMode === "field" ? state.lineGroupField : state.categoryField;
    const groups = PlotMath.groupBy(rows, (row) => DataModule.categoryValue(row, field, state.sampleSets, state.sampleSetMode));
    return Object.entries(groups).map(([category, group]) => {
      const stats = elements.map((el) => {
        const vals = group.map((row) => toNumber(row[el])).filter(Number.isFinite);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(vals.length - 1, 1);
        return { mean, sd: Math.sqrt(variance) };
      });
      return {
        name: category,
        category,
        values: stats.map((s) => s.mean),
        sd: stats.map((s) => s.sd)
      };
    });
  }

  function drawLineFrame(ctx, state, metrics, yRange) {
    const p = metrics.plot;
    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.left, p.top, p.right - p.left, p.bottom - p.top);
    const yTicks = PlotMath.makeTicks(yRange.min, yRange.max, state.axes.yStep, state.axes.yLog);
    if (state.axes.minorTicks) {
      ctx.strokeStyle = "#444";
      PlotMath.makeMinorTicks(yRange, yTicks, state.axes.yLog).forEach((tick) => {
        const y = PlotMath.scaleValue(tick, yRange, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
        ctx.beginPath();
        ctx.moveTo(p.left, y); ctx.lineTo(p.left + 5, y);
        ctx.stroke();
      });
      ctx.strokeStyle = "#000";
    }
    yTicks.forEach((tick) => {
      const y = PlotMath.scaleValue(tick, yRange, p.bottom, p.top, state.axes.yLog, state.axes.yReverse);
      ctx.beginPath();
      ctx.moveTo(p.left, y); ctx.lineTo(p.left + 10, y);
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.font = "20px Calibri, FangSong";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(PlotMath.formatTick(tick), p.left - 10, y);
    });
    const elements = state.selectedElements;
    ctx.fillStyle = "#111827";
    ctx.font = "20px Calibri, FangSong";
    ctx.textAlign = "center";
    elements.forEach((el, i) => {
      const x = PlotMath.scaleValue(i, { min: 0, max: elements.length - 1 }, p.left, p.right, false, state.axes.xReverse);
      ctx.beginPath();
      ctx.moveTo(x, p.bottom); ctx.lineTo(x, p.bottom - 10);
      ctx.stroke();
      ctx.fillText(el, x, p.bottom + 14);
    });
    ctx.font = "700 32px Calibri, FangSong";
    ctx.fillText(state.title || "元素配分折线图", metrics.width / 2, 52);
    ctx.font = "700 30px Calibri, FangSong";
    ctx.fillText(state.xTitle || "元素", (p.left + p.right) / 2, metrics.height - 32);
    ctx.save();
    ctx.translate(38, (p.top + p.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(state.yTitle || "含量", 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawSdBand(ctx, series, p, xRange, yRange, logScale, style, xReverse, yReverse) {
    ctx.save();
    ctx.fillStyle = style.fill;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    series.values.forEach((v, i) => {
      const yv = v + (series.sd[i] || 0);
      if (!PlotMath.insideDomain(yv, yRange, logScale)) return;
      const x = PlotMath.scaleValue(i, xRange, p.left, p.right, false, xReverse);
      const y = PlotMath.scaleValue(yv, yRange, p.bottom, p.top, logScale, yReverse);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    for (let i = series.values.length - 1; i >= 0; i -= 1) {
      const yv = series.values[i] - (series.sd[i] || 0);
      if (!PlotMath.insideDomain(yv, yRange, logScale)) continue;
      const x = PlotMath.scaleValue(i, xRange, p.left, p.right, false, xReverse);
      const y = PlotMath.scaleValue(yv, yRange, p.bottom, p.top, logScale, yReverse);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  window.LinePlot = LinePlot;
})();
