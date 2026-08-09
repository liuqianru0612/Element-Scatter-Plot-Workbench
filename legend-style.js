(function () {
  const palette = [
    "#d55e00", "#0072b2", "#009e73", "#cc79a7", "#f0b400",
    "#56b4e9", "#6f4cc3", "#4d4d4d", "#e76f51", "#2a9d8f"
  ];
  const shapes = ["circle", "square", "diamond", "triangle-up", "triangle-down", "cross", "x", "star", "hbar", "vbar", "pentagon", "hexagon", "octagon"];
  const lineTypes = ["solid", "dash", "dot", "dashdot"];

  const LegendStyle = {
    shapes,
    lineTypes,

    ensureStyles(state, categories) {
      categories.forEach((category, index) => {
        if (!state.styles[category]) {
          state.styles[category] = this.defaultStyle(category, index);
        }
      });
    },

    defaultStyle(category, index) {
      const color = namedColor(category) || palette[index % palette.length];
      return {
        fill: color,
        stroke: "#ffffff",
        shape: shapes[index % shapes.length],
        lineType: "solid",
        lineWidth: 2,
        opacity: 0.88
      };
    },

    dashArray(type) {
      if (type === "dash") return [10, 7];
      if (type === "dot") return [2, 7];
      if (type === "dashdot") return [10, 6, 2, 6];
      return [];
    },

    drawMarker(ctx, x, y, size, style) {
      const s = size;
      ctx.save();
      ctx.globalAlpha = Number(style.opacity ?? 1);
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke || "#fff";
      ctx.lineWidth = Math.max(1, Number(style.lineWidth || 2) * 0.45);
      pathMarker(ctx, x, y, s, style.shape);
      if (["cross", "x", "hbar", "vbar"].includes(style.shape)) {
        ctx.strokeStyle = style.fill;
        ctx.lineWidth = Math.max(2, s / 3);
        ctx.stroke();
      } else {
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    },

    markerSvg(x, y, size, style) {
      const fill = escapeXml(style.fill);
      const stroke = escapeXml(style.stroke || "#fff");
      const opacity = Number(style.opacity ?? 1);
      const shape = style.shape;
      const strokeWidth = Math.max(1, Number(style.lineWidth || 2) * 0.45);
      if (shape === "circle") return `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
      if (shape === "square") return `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
      if (shape === "diamond") return `<polygon points="${x},${y - size / 2} ${x + size / 2},${y} ${x},${y + size / 2} ${x - size / 2},${y}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
      if (shape === "cross") return `<path d="M${x - size / 2},${y}H${x + size / 2}M${x},${y - size / 2}V${y + size / 2}" stroke="${fill}" stroke-width="2" opacity="${opacity}"/>`;
      if (shape === "x") return `<path d="M${x - size / 2},${y - size / 2}L${x + size / 2},${y + size / 2}M${x + size / 2},${y - size / 2}L${x - size / 2},${y + size / 2}" stroke="${fill}" stroke-width="2" opacity="${opacity}"/>`;
      if (shape === "hbar") return `<path d="M${x - size / 2},${y}H${x + size / 2}" stroke="${fill}" stroke-width="3" opacity="${opacity}"/>`;
      if (shape === "vbar") return `<path d="M${x},${y - size / 2}V${y + size / 2}" stroke="${fill}" stroke-width="3" opacity="${opacity}"/>`;
      return `<polygon points="${polygonPoints(x, y, size / 2, polygonSides(shape), shape === "triangle-up" ? -90 : 90)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
    }
  };

  function namedColor(category) {
    const c = String(category).toLowerCase();
    if (c.includes("high-ti")) return "#e4572e";
    if (c.includes("low-ti") && !c.includes("very")) return "#008c8c";
    if (c.includes("very-low")) return "#5851a6";
    if (c.includes("kreep")) return "#7a9a01";
    if (c.includes("apollo 11")) return "#e56b1f";
    if (c.includes("apollo 17")) return "#d9a300";
    if (c.includes("apollo 12")) return "#1f77b4";
    if (c.includes("apollo 15")) return "#2c9c69";
    if (c.includes("apollo 14")) return "#6589a8";
    if (c.includes("apollo 16")) return "#a66a4c";
    if (c.includes("ce-5")) return "#00a7e1";
    if (c.includes("ce-6")) return "#7b2cbf";
    if (c.includes("met")) return "#374151";
    return null;
  }

  function pathMarker(ctx, x, y, size, shape) {
    const r = size / 2;
    ctx.beginPath();
    if (shape === "circle") {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (shape === "square") {
      ctx.rect(x - r, y - r, size, size);
    } else if (shape === "diamond") {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    } else if (shape === "cross") {
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    } else if (shape === "x") {
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    } else if (shape === "hbar") {
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    } else if (shape === "vbar") {
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    } else if (shape === "star") {
      starPath(ctx, x, y, r);
    } else {
      polygonPath(ctx, x, y, r, polygonSides(shape), shape === "triangle-up" ? -90 : 90);
    }
  }

  function polygonSides(shape) {
    if (shape === "triangle-up" || shape === "triangle-down") return 3;
    if (shape === "pentagon") return 5;
    if (shape === "hexagon") return 6;
    if (shape === "octagon") return 8;
    return 5;
  }

  function polygonPath(ctx, x, y, r, sides, rotation) {
    const rot = rotation * Math.PI / 180;
    for (let i = 0; i < sides; i += 1) {
      const a = rot + i * Math.PI * 2 / sides;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function starPath(ctx, x, y, r) {
    for (let i = 0; i < 10; i += 1) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function polygonPoints(x, y, r, sides, rotation) {
    const rot = rotation * Math.PI / 180;
    return Array.from({ length: sides }, (_, i) => {
      const a = rot + i * Math.PI * 2 / sides;
      return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`;
    }).join(" ");
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[m]));
  }

  window.LegendStyle = LegendStyle;
  window.escapeXml = escapeXml;
})();
