(function () {
  const MAX_TICKS = 1000;
  const DEFAULT_SUBDIVISIONS = 5;

  const PlotCore = {
    createMetrics(state, width, height, ctx) {
      const plot = {
        left: Math.round(width * 0.13),
        right: Math.round(width * 0.78),
        top: Math.round(height * 0.12),
        bottom: Math.round(height * 0.82)
      };
      plot.right = Math.max(plot.left + 160, Math.min(plot.right, width - 160));
      const elementLabels = state.plotType === "line"
        ? elementLabelLayout(state.selectedElements || [], plot, height, ctx, Boolean(displayText(state.xTitle)))
        : { angle: 0, fontSize: 20, y: plot.bottom + 14, textAnchor: "middle", verticalExtent: 20 };

      if (state.plotType === "line") {
        const baseMargin = height - plot.bottom;
        const titleMargin = displayText(state.xTitle) ? 46 : 18;
        const requiredMargin = 22 + elementLabels.verticalExtent + titleMargin;
        plot.bottom = Math.max(plot.top + 160, Math.round(height - Math.max(baseMargin, requiredMargin)));
        elementLabels.y = plot.bottom + 15;
      }

      const savedLegend = state.legendPosition || {};
      const defaultLegendX = Math.min(width - 120, plot.right + 12);
      const legend = {
        x: Number.isFinite(savedLegend.x) ? clampNumber(Math.round(savedLegend.x * width), 0, Math.max(0, width - 120)) : defaultLegendX,
        y: Number.isFinite(savedLegend.y) ? clampNumber(Math.round(savedLegend.y * height), 0, Math.max(0, height - 40)) : Math.round(height * 0.105)
      };

      return { width, height, plot, legend, elementLabels };
    },

    displayText,

    buildRanges(xs, ys, axes) {
      return {
        x: rangeFrom(xs, axes.xMin, axes.xMax, axes.xLog),
        y: rangeFrom(ys, axes.yMin, axes.yMax, axes.yLog)
      };
    },

    rangeFrom,
    buildAxisTicks,

    scaleValue(value, range, outA, outB, logScale, reverse = false) {
      const v = logScale ? Math.log10(value) : value;
      const min = logScale ? Math.log10(range.min) : range.min;
      const max = logScale ? Math.log10(range.max) : range.max;
      const t = (v - min) / (max - min);
      const mapped = reverse ? 1 - t : t;
      return outA + mapped * (outB - outA);
    },

    insideDomain(value, range, logScale) {
      return Number.isFinite(value) && (!logScale || value > 0) && value >= range.min && value <= range.max;
    },

    formatTick(value) {
      if (!Number.isFinite(value)) return "";
      if (value === 0) return "0";
      const abs = Math.abs(value);
      if (abs >= 1e6 || abs < 1e-6) return value.toExponential(1);
      if (abs < 1) return trimFixed(value, Math.min(8, Math.ceil(-Math.log10(abs)) + 2));
      return Number(value.toPrecision(7)).toString();
    },

    groupBy(items, getter) {
      return items.reduce((acc, item) => {
        const key = getter(item);
        (acc[key] ||= []).push(item);
        return acc;
      }, {});
    },

    unique(items) {
      return [...new Set(items)];
    }
  };

  function elementLabelLayout(labels, plot, height, ctx, hasAxisTitle) {
    const fontSize = 20;
    const widths = labels.map((label) => measureLabel(ctx, label, fontSize));
    const maxWidth = Math.max(0, ...widths);
    const spacing = labels.length > 1 ? (plot.right - plot.left) / (labels.length - 1) : plot.right - plot.left;
    let angle = 0;
    if (maxWidth > spacing * 0.88) {
      if (projectedWidth(maxWidth, fontSize, 35) <= spacing * 0.9) angle = -35;
      else if (projectedWidth(maxWidth, fontSize, 60) <= spacing * 0.9) angle = -60;
      else angle = -90;
    }
    const radians = Math.abs(angle) * Math.PI / 180;
    const verticalExtent = angle === 0
      ? fontSize
      : maxWidth * Math.sin(radians) + fontSize * Math.cos(radians);
    return {
      angle,
      fontSize,
      y: plot.bottom + 15,
      textAnchor: angle === 0 ? "middle" : "end",
      verticalExtent: Math.ceil(verticalExtent),
      hasAxisTitle,
      availableHeight: height
    };
  }

  function displayText(value) {
    return String(value ?? "").trim();
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function measureLabel(ctx, value, fontSize) {
    const text = String(value ?? "");
    if (!ctx || typeof ctx.measureText !== "function") return text.length * fontSize * 0.62;
    ctx.save();
    ctx.font = `${fontSize}px Calibri, FangSong`;
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  }

  function projectedWidth(textWidth, fontSize, degrees) {
    const radians = degrees * Math.PI / 180;
    return textWidth * Math.cos(radians) + fontSize * Math.sin(radians);
  }

  function rangeFrom(values, minInput, maxInput, logScale) {
    const valid = values.filter((value) => Number.isFinite(value) && (!logScale || value > 0));
    const fallbackMin = valid.length ? Math.min(...valid) : (logScale ? 1 : 0);
    const fallbackMax = valid.length ? Math.max(...valid) : (logScale ? 10 : 1);
    const requestedMin = finiteInput(minInput);
    const requestedMax = finiteInput(maxInput);
    let min = requestedMin != null && (!logScale || requestedMin > 0) ? requestedMin : fallbackMin;
    let max = requestedMax != null && (!logScale || requestedMax > 0) ? requestedMax : fallbackMax;

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = logScale ? 1 : 0;
      max = logScale ? 10 : 1;
    }
    if (min > max) [min, max] = [max, min];
    if (min === max) {
      if (logScale) {
        min /= 10;
        max *= 10;
      } else {
        const delta = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
        min -= delta;
        max += delta;
      }
    }

    const span = max - min;
    if (requestedMin == null && !logScale) min -= span * 0.05;
    if (requestedMax == null && !logScale) max += span * 0.05;
    return { min, max };
  }

  function buildAxisTicks(range, stepInput, logScale, includeMinor = true, subdivisions = DEFAULT_SUBDIVISIONS) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max) {
      return { major: [], minor: [], step: NaN };
    }
    if (logScale) return logarithmicTicks(range, includeMinor);

    const span = range.max - range.min;
    let step = Number(stepInput) > 0 ? Number(stepInput) : niceStep(span / 5);
    if (!Number.isFinite(step) || step <= 0) step = niceStep(span / 5);
    if (span / step > MAX_TICKS) step = niceStep(span / 10);

    const major = gridValues(range.min, range.max, step);
    if (!includeMinor || subdivisions < 2) return { major, minor: [], step };

    const minorStep = step / subdivisions;
    const allMinor = gridValues(range.min, range.max, minorStep);
    const minor = allMinor.filter((value) => !isGridMultiple(value, step));
    return { major, minor, step };
  }

  function logarithmicTicks(range, includeMinor) {
    if (range.min <= 0 || range.max <= 0) return { major: [], minor: [], step: NaN };
    const major = [];
    const minor = [];
    const firstPower = Math.floor(Math.log10(range.min));
    const lastPower = Math.ceil(Math.log10(range.max));
    for (let power = firstPower; power <= lastPower; power += 1) {
      const base = 10 ** power;
      if (base >= range.min && base <= range.max) major.push(base);
      if (!includeMinor) continue;
      for (let multiplier = 2; multiplier < 10; multiplier += 1) {
        const value = multiplier * base;
        if (value > range.min && value < range.max) minor.push(value);
      }
    }
    if (!major.length) major.push(range.min, range.max);
    return { major: uniqueNumbers(major), minor: uniqueNumbers(minor), step: NaN };
  }

  function gridValues(min, max, step) {
    const values = [];
    const epsilon = Math.max(1, Math.abs(min), Math.abs(max)) * 1e-12;
    const firstIndex = Math.ceil((min - epsilon) / step);
    const lastIndex = Math.floor((max + epsilon) / step);
    const count = Math.min(MAX_TICKS, Math.max(0, lastIndex - firstIndex + 1));
    for (let offset = 0; offset < count; offset += 1) {
      const value = (firstIndex + offset) * step;
      if (value >= min - epsilon && value <= max + epsilon) values.push(roundNumber(value));
    }
    return uniqueNumbers(values);
  }

  function isGridMultiple(value, step) {
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-9;
  }

  function uniqueNumbers(values) {
    return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > 1e-12);
  }

  function roundNumber(value) {
    return Number(value.toPrecision(13));
  }

  function finiteInput(value) {
    if (value === "" || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function niceStep(raw) {
    const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-12)));
    const normalized = raw / power;
    if (normalized <= 1) return power;
    if (normalized <= 2) return 2 * power;
    if (normalized <= 5) return 5 * power;
    return 10 * power;
  }

  function trimFixed(value, digits) {
    return value.toFixed(digits).replace(/\.?0+$/, "");
  }

  window.PlotCore = PlotCore;
})();
