(function () {
  const els = {};
  const swatchColors = [
    "#d95f02", "#e69f00", "#f0b400", "#b8b8b8", "#6f6f6f",
    "#0072b2", "#56b4e9", "#009e73", "#2a9d8f", "#7b2cbf",
    "#cc79a7", "#ef476f", "#ffffff", "#111827", "#000000"
  ];
  const styleStoreKey = "elementWorkbenchNew.legendStyles.v1";
  const elementSetStoreKey = "elementWorkbenchNew.elementSets.v1";
  const state = {
    dataset: null,
    fileName: "",
    plotType: "scatter",
    xColumn: "",
    yColumn: "",
    xTitle: "",
    yTitle: "",
    title: "",
    categoryField: "",
    selectedCategories: new Set(),
    visibleCategories: [],
    filteredRows: [],
    styles: {},
    sampleSets: [],
    sampleSetMode: "field",
    derivedColumns: [],
    selectedElements: [],
    elementSets: {},
    lineMode: "sample",
    lineGroupField: "",
    showLinePoints: true,
    showSdBand: true,
    legendVisible: true,
    legendScale: 1,
    markerSize: 22,
    trendlines: {
      visible: false,
      mode: "linear",
      width: 2,
      opacity: 0.85,
      categories: {}
    },
    canvasDpr: 1,
    canvasCssWidth: 1200,
    canvasCssHeight: 900,
    axes: {
      xMin: "", xMax: "", xStep: "",
      yMin: "", yMax: "", yStep: "",
      xLog: false, yLog: false,
      xReverse: false, yReverse: false,
      minorTicks: false
    },
    hoverPoints: [],
    lastModel: null,
    selectedLegendCategory: "",
    selectedHistoryId: ""
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindTabs();
    bindData();
    bindControls();
    bindLegendDrag();
    bindResizers();
    loadHistory();
    updateLineControls();
    renderAll();
  }

  function cacheElements() {
    document.querySelectorAll("[id]").forEach((el) => { els[el.id] = el; });
    els.tabs = document.querySelectorAll(".tab");
    els.pages = document.querySelectorAll(".page");
    els.canvas = els.plotCanvas;
    els.ctx = els.canvas.getContext("2d");
  }

  function bindTabs() {
    els.tabs.forEach((tab) => tab.addEventListener("click", () => {
      els.tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      els.pages.forEach((page) => page.classList.toggle("is-active", page.id === `page-${tab.dataset.tab}`));
      if (tab.dataset.tab === "workbench") requestAnimationFrame(renderPlot);
      if (tab.dataset.tab === "history") renderHistory();
    }));
  }

  function bindData() {
    els.fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      setStatus("正在读取数据...");
      try {
        state.fileName = file.name;
        state.dataset = await DataModule.loadFile(file);
        hydrateDataset();
        setStatus(`已导入 ${file.name}`);
      } catch (error) {
        setStatus(error.message);
      }
    });
    els.sheetSelect.addEventListener("change", () => {
      if (!state.fileName) return;
      state.dataset = DataModule.useSheet(els.sheetSelect.value, state.fileName);
      hydrateDataset();
    });
    els.addRatioButton.addEventListener("click", () => {
      if (!state.dataset) return;
      const numerator = els.numeratorSelect.value;
      const denominator = els.denominatorSelect.value;
      const columnName = DataModule.addRatioColumn(state.dataset, numerator, denominator, els.ratioName.value);
      if (!columnName) return;
      state.derivedColumns.push({ name: columnName, type: "ratio", numerator, denominator });
      els.ratioName.value = "";
      hydrateDataset(false);
      setStatus(`已生成比值列：${columnName}`);
    });
    els.derivedColumnList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-delete-derived]");
      if (!button) return;
      deleteDerivedColumn(button.dataset.deleteDerived);
    });
  }

  function bindControls() {
    els.plotType.addEventListener("change", () => {
      state.plotType = els.plotType.value;
      updateLineControls();
      renderPlot();
    });
    ["xSelect", "ySelect"].forEach((id) => els[id].addEventListener("change", () => {
      state.xColumn = els.xSelect.value;
      state.yColumn = els.ySelect.value;
      syncDefaultTitles();
      renderPlot();
    }));
    els.categoryField.addEventListener("change", () => {
      state.categoryField = els.categoryField.value;
      state.selectedCategories = new Set(getCategories());
      renderCategoryItems();
      renderLegendRows();
      renderPlot();
    });
    els.categoryItems.addEventListener("change", (event) => {
      if (!event.target.matches("input[type='checkbox']")) return;
      if (event.target.checked) state.selectedCategories.add(event.target.value);
      else state.selectedCategories.delete(event.target.value);
      renderLegendRows();
      renderPlot();
    });
    els.selectAllCategoriesButton.addEventListener("click", () => {
      state.selectedCategories = new Set(getCategories());
      renderCategoryItems();
      renderLegendRows();
      renderPlot();
    });
    els.selectNoneCategoriesButton.addEventListener("click", () => {
      state.selectedCategories = new Set();
      renderCategoryItems();
      renderLegendRows();
      renderPlot();
    });
    els.invertCategoriesButton.addEventListener("click", () => {
      const categories = getCategories();
      state.selectedCategories = new Set(categories.filter((category) => !state.selectedCategories.has(category)));
      renderCategoryItems();
      renderLegendRows();
      renderPlot();
    });
    els.createSampleSetButton.addEventListener("click", () => {
      const name = els.sampleSetName.value.trim();
      if (!name || !state.filteredRows.length) return;
      state.sampleSets.push({ name, rowKeys: state.filteredRows.map(DataModule.rowKey) });
      els.sampleSetName.value = "";
      refreshSampleSetDependentUi();
      setStatus(`已创建样品集合：${name}`);
    });
    els.sampleSetList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-delete-sample-set]");
      if (!button) return;
      deleteSampleSet(button.dataset.deleteSampleSet);
    });
    els.sampleSetMode.addEventListener("change", () => {
      state.sampleSetMode = els.sampleSetMode.value;
      state.selectedCategories = new Set(getCategories());
      renderCategoryItems();
      renderLegendRows();
      renderPlot();
      setStatus(state.sampleSetMode === "overlay" ? "已启用集合覆盖原分类模式" : "已更新样品集合优先级");
    });
    ["lineMode", "lineGroupField"].forEach((id) => els[id].addEventListener("change", () => {
      state.lineMode = els.lineMode.value;
      state.lineGroupField = els.lineGroupField.value;
      renderPlot();
    }));
    ["showLinePoints", "showSdBand", "legendVisible"].forEach((id) => els[id].addEventListener("change", () => {
      state[id] = els[id].checked;
      renderPlot();
    }));
    els.legendScale.addEventListener("input", () => {
      state.legendScale = Number(els.legendScale.value);
      renderHtmlLegend();
    });
    els.markerSize.addEventListener("input", () => {
      state.markerSize = Number(els.markerSize.value);
      renderPlot();
    });
    els.elementList.addEventListener("change", (event) => {
      if (!event.target.matches("input[type='checkbox']")) return;
      state.selectedElements = checkedValues(els.elementList);
      renderPlot();
    });
    els.elementList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-element-move]");
      if (!button) return;
      moveElement(button.dataset.elementMove, button.dataset.column);
    });
    els.saveElementSetButton.addEventListener("click", saveElementSet);
    els.loadElementSetButton.addEventListener("click", loadElementSet);
    els.deleteElementSetButton.addEventListener("click", deleteElementSet);
    els.reePreset.addEventListener("click", () => applyElementPreset(["La", "Ce", "Pr", "Nd", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu"]));
    els.normalizedPreset.addEventListener("click", () => applyElementPreset(state.dataset ? state.dataset.numericColumns.filter((c) => /_N$/i.test(c)) : []));
    els.applyAxisButton.addEventListener("click", applyAxis);
    ["trendlineVisible", "trendlineMode", "trendlineWidth", "trendlineOpacity"].forEach((id) => {
      els[id].addEventListener("change", () => {
        readTrendlineControls();
        renderPlot();
      });
    });
    els.trendlineCategoryList.addEventListener("change", onTrendlineCategoryChange);
    els.trendlineCategoryList.addEventListener("input", onTrendlineCategoryChange);
    els.exportPngButton.addEventListener("click", () => ExportSvg.downloadPng(composedCanvas(), state));
    els.exportSvgButton.addEventListener("click", () => ExportSvg.downloadSvg(state, metrics()));
    els.saveHistoryButton.addEventListener("click", saveCurrentHistory);
    els.plotCanvas.addEventListener("mousemove", onCanvasMove);
    els.plotCanvas.addEventListener("mouseleave", () => els.tooltip.classList.add("hidden"));
    els.clearHistoryButton.addEventListener("click", () => {
      HistoryStore.clear();
      state.selectedHistoryId = "";
      renderHistory();
    });
    els.importLegendButton.addEventListener("click", () => els.legendImportInput.click());
    els.legendImportInput.addEventListener("change", importLegendFile);
    els.exportLegendButton.addEventListener("click", exportLegendStyles);
    els.applyReferenceLegendButton.addEventListener("click", applyReferenceLegend);
    els.historyPreview.addEventListener("mousemove", onHistoryMove);
    els.historyPreview.addEventListener("mouseleave", () => els.historyTooltip.classList.add("hidden"));
  }

  function hydrateDataset(resetSelections = true) {
    if (!state.dataset) return;
    if (resetSelections) {
      state.styles = loadSavedStyles();
      state.sampleSets = [];
      state.sampleSetMode = "field";
      state.derivedColumns = [];
      state.elementSets = loadElementSets();
    }
    renderDataPreview();
    renderSelects();
    if (resetSelections || !state.xColumn) {
      state.xColumn = state.dataset.numericColumns[0] || state.dataset.columns[0] || "";
      state.yColumn = state.dataset.numericColumns[1] || state.dataset.numericColumns[0] || "";
      state.selectedElements = state.dataset.numericColumns.slice(0, 8);
      state.categoryField = DataModule.categoryFields(state.dataset, state.sampleSets)[0] || "";
      state.selectedCategories = new Set(getCategories());
      syncDefaultTitles();
    }
    renderSelects();
    renderDerivedColumnList();
    renderCategoryItems();
    renderLegendRows();
    renderTrendlineCategoryList();
    renderPlot();
  }

  function renderDataPreview() {
    const d = state.dataset;
    els.fileNameLabel.textContent = d.fileName || "未选择文件";
    els.rowCount.textContent = d.rows.length;
    els.columnCount.textContent = d.columns.length;
    els.numericCount.textContent = d.numericColumns.length;
    els.sheetSelect.innerHTML = d.sheetNames.map((name) => option(name, name, name === d.sheetName)).join("");
    const rows = d.rows.slice(0, 200);
    const html = [
      "<table><thead><tr>",
      d.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join(""),
      "</tr></thead><tbody>",
      rows.map((row) => `<tr>${d.columns.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`).join(""),
      "</tbody></table>"
    ].join("");
    els.dataPreview.classList.remove("empty");
    els.dataPreview.innerHTML = html;
  }

  function renderSelects() {
    const d = state.dataset;
    const columns = d ? d.columns : [];
    const nums = d ? d.numericColumns : [];
    fillSelect(els.xSelect, nums, state.xColumn);
    fillSelect(els.ySelect, nums, state.yColumn);
    fillSelect(els.numeratorSelect, nums, nums[0]);
    fillSelect(els.denominatorSelect, nums, nums[1] || nums[0]);
    fillSelect(els.lineGroupField, columns, state.lineGroupField || state.categoryField);
    fillSelect(els.categoryField, DataModule.categoryFields(d, state.sampleSets), state.categoryField);
    fillSelect(els.elementSetSelect, Object.keys(state.elementSets), els.elementSetSelect.value);
    if (els.sampleSetMode) els.sampleSetMode.value = state.sampleSetMode;
    renderElementList();
    renderSampleSetList();
    renderDerivedColumnList();
  }

  function renderDerivedColumnList() {
    if (!els.derivedColumnList) return;
    if (!state.derivedColumns.length) {
      els.derivedColumnList.innerHTML = `<div class="subtle-status">尚未创建比值列</div>`;
      return;
    }
    els.derivedColumnList.innerHTML = state.derivedColumns.map((column) => `
      <div class="managed-row">
        <div>
          <strong>${escapeHtml(column.name)}</strong>
          <small>${escapeHtml(column.numerator)} / ${escapeHtml(column.denominator)}</small>
        </div>
        <button type="button" data-delete-derived="${escapeHtml(column.name)}">删除</button>
      </div>
    `).join("");
  }

  function renderElementList() {
    const nums = state.dataset ? state.dataset.numericColumns : [];
    els.elementList.innerHTML = nums.map((column) => {
      const checked = state.selectedElements.includes(column) ? "checked" : "";
      const order = state.selectedElements.indexOf(column);
      const orderText = order >= 0 ? `${order + 1}.` : "";
      return `<div class="item-row element-row">
        <label><input type="checkbox" value="${escapeHtml(column)}" ${checked}> <span>${escapeHtml(orderText)} ${escapeHtml(column)}</span></label>
        <span class="row-spacer"></span>
        <button type="button" data-element-move="up" data-column="${escapeHtml(column)}" title="上移">↑</button>
        <button type="button" data-element-move="down" data-column="${escapeHtml(column)}" title="下移">↓</button>
      </div>`;
    }).join("");
  }

  function renderCategoryItems() {
    const categories = getCategories();
    els.categoryItems.innerHTML = categories.map((category) => {
      const checked = state.selectedCategories.has(category) ? "checked" : "";
      return `<label class="item-row"><input type="checkbox" value="${escapeHtml(category)}" ${checked}> <span>${escapeHtml(category)}</span></label>`;
    }).join("");
  }

  function renderSampleSetList() {
    if (!els.sampleSetList) return;
    if (!state.sampleSets.length) {
      els.sampleSetList.innerHTML = `<div class="subtle-status">尚未创建样品集合</div>`;
      return;
    }
    els.sampleSetList.innerHTML = state.sampleSets.map((set) => `
      <div class="sample-set-row">
        <div>
          <strong>${escapeHtml(set.name)}</strong>
          <small>${set.rowKeys.length} 个样品</small>
        </div>
        <button type="button" data-delete-sample-set="${escapeHtml(set.name)}">删除</button>
      </div>
    `).join("");
  }

  function renderLegendRows() {
    const categories = getVisibleCategories();
    LegendStyle.ensureStyles(state, categories);
    els.legendRows.innerHTML = categories.map((category) => {
      const style = state.styles[category];
      const active = category === state.selectedLegendCategory ? "is-active" : "";
      return `<button class="legend-row ${active}" data-category="${escapeHtml(category)}"><span class="legend-swatch">${markerIconSvg(style, 18)}</span><span>${escapeHtml(category)}</span></button>`;
    }).join("");
    els.legendRows.querySelectorAll(".legend-row").forEach((row) => row.addEventListener("click", () => {
      state.selectedLegendCategory = row.dataset.category;
      renderLegendRows();
      renderLegendEditor();
    }));
    renderLegendEditor();
    renderTrendlineCategoryList();
  }

  function renderTrendlineCategoryList() {
    if (!els.trendlineCategoryList) return;
    const categories = getVisibleCategories();
    ensureTrendlineCategoryConfig(categories);
    if (!categories.length) {
      els.trendlineCategoryList.innerHTML = `<div class="subtle-status">暂无可设置的分类</div>`;
      return;
    }
    els.trendlineCategoryList.innerHTML = categories.map((category) => {
      const config = trendlineCategoryConfig(category);
      const style = state.styles[category] || LegendStyle.defaultStyle(category, 0);
      const color = config.color || style.fill;
      return `<div class="trendline-row" data-category="${escapeHtml(category)}">
        <label class="trendline-name"><input type="checkbox" data-trend-field="enabled" ${config.enabled ? "checked" : ""}> <span>${escapeHtml(category)}</span></label>
        <select data-trend-field="lineType" title="线型">
          <option value="inherit" ${config.lineType === "inherit" ? "selected" : ""}>继承</option>
          ${LegendStyle.lineTypes.map((type) => option(type, lineLabel(type), config.lineType === type)).join("")}
        </select>
        <input data-trend-field="color" type="text" value="${escapeHtml(color)}" title="颜色 HEX" spellcheck="false">
        <input data-trend-field="width" type="number" min="0.5" max="8" step="0.5" value="${escapeHtml(config.width || "")}" placeholder="线宽" title="线宽">
        <input data-trend-field="opacity" type="number" min="0.05" max="1" step="0.05" value="${escapeHtml(config.opacity || "")}" placeholder="透明度" title="透明度">
      </div>`;
    }).join("");
  }

  function renderLegendEditor() {
    const category = state.selectedLegendCategory;
    if (!category || !state.styles[category]) {
      els.legendEditor.className = "legend-editor empty";
      els.legendEditor.textContent = "选择一个分类项进行编辑";
      return;
    }
    const style = state.styles[category];
    els.legendEditor.className = "legend-editor";
    els.legendEditor.innerHTML = `
      <strong>${escapeHtml(category)}</strong>
      <div class="editor-grid">
        <div class="field"><label>填充色 HEX</label><input id="draftFill" type="text" value="${escapeHtml(style.fill)}" inputmode="text" spellcheck="false"></div>
        <div class="field"><label>边框色 HEX</label><input id="draftStroke" type="text" value="${escapeHtml(style.stroke)}" inputmode="text" spellcheck="false"></div>
        <div class="field"><label>点形状</label><select id="draftShape">${LegendStyle.shapes.map((s) => option(s, shapeLabel(s), s === style.shape)).join("")}</select></div>
        <div class="field"><label>线型</label><select id="draftLineType">${LegendStyle.lineTypes.map((s) => option(s, lineLabel(s), s === style.lineType)).join("")}</select></div>
        <div class="field"><label>线宽</label><input id="draftLineWidth" type="number" min="0.5" max="12" step="0.5" value="${style.lineWidth}"></div>
        <div class="field"><label>透明度</label><input id="draftOpacity" type="number" min="0.05" max="1" step="0.05" value="${style.opacity}"></div>
      </div>
      <div class="swatch-section">
        <div class="swatch-label">预设色板：先点色板，再选填充色或边框色</div>
        <div class="color-swatches">
          ${swatchColors.map((color) => `<button type="button" class="color-swatch" data-color="${color}" style="background:${color}" title="${color}"></button>`).join("")}
        </div>
        <div class="toolbar compact">
          <button type="button" id="useSwatchFill">设为填充色</button>
          <button type="button" id="useSwatchStroke">设为边框色</button>
          <span id="selectedSwatch" class="selected-swatch" style="background:${style.fill}"></span>
        </div>
      </div>
      <button id="applyStyleButton" class="primary" type="button">应用样式</button>
    `;
    let selectedColor = normalizeColor(style.fill, style.fill);
    document.getElementById("useSwatchFill").addEventListener("click", () => {
      document.getElementById("draftFill").value = selectedColor;
    });
    document.getElementById("useSwatchStroke").addEventListener("click", () => {
      document.getElementById("draftStroke").value = selectedColor;
    });
    els.legendEditor.querySelectorAll(".color-swatch").forEach((button) => {
      button.addEventListener("click", () => {
        selectedColor = button.dataset.color;
        document.getElementById("selectedSwatch").style.background = selectedColor;
      });
    });
    document.getElementById("applyStyleButton").addEventListener("click", () => {
      const fill = normalizeColor(document.getElementById("draftFill").value, state.styles[category].fill);
      const stroke = normalizeColor(document.getElementById("draftStroke").value, state.styles[category].stroke);
      document.getElementById("draftFill").value = fill;
      document.getElementById("draftStroke").value = stroke;
      state.styles[category] = {
        fill,
        stroke,
        shape: document.getElementById("draftShape").value,
        lineType: document.getElementById("draftLineType").value,
        lineWidth: Number(document.getElementById("draftLineWidth").value),
        opacity: Number(document.getElementById("draftOpacity").value)
      };
      saveStyles();
      updateLegendRow(category);
      renderPlot();
    });
  }

  function renderPlot() {
    resizeCanvas();
    applyAxis(false);
    updateLineControls();
    state.filteredRows = filterRows();
    state.visibleCategories = getVisibleCategories();
    LegendStyle.ensureStyles(state, state.visibleCategories);
    const result = state.plotType === "line"
      ? LinePlot.draw(els.ctx, state, metrics())
      : ScatterPlot.draw(els.ctx, state, metrics());
    state.hoverPoints = result.points || [];
    state.lastModel = result.model || null;
    renderHtmlLegend();
  }

  function renderHtmlLegend() {
    if (!state.legendVisible) {
      els.htmlLegend.style.display = "none";
      return;
    }
    els.htmlLegend.style.display = "block";
    els.htmlLegend.style.transform = `scale(${state.legendScale})`;
    els.htmlLegend.style.transformOrigin = "top right";
    els.htmlLegend.innerHTML = state.visibleCategories.map((category, index) => {
      const style = state.styles[category] || LegendStyle.defaultStyle(category, index);
      return `<div class="legend-item"><span class="legend-swatch">${markerIconSvg(style, 18)}</span><span>${escapeHtml(category)}</span></div>`;
    }).join("");
  }

  function renderAll() {
    renderSelects();
    renderHistory();
    renderPlot();
  }

  function applyAxis(readInputs = true) {
    if (readInputs) {
      ["xMin", "xMax", "xStep", "yMin", "yMax", "yStep"].forEach((id) => { state.axes[id] = els[id].value; });
      state.axes.xLog = els.xLog.checked;
      state.axes.yLog = els.yLog.checked;
      state.axes.xReverse = els.xReverse.checked;
      state.axes.yReverse = els.yReverse.checked;
      state.axes.minorTicks = els.minorTicks.checked;
      state.title = els.chartTitle.value;
      state.xTitle = els.xTitle.value;
      state.yTitle = els.yTitle.value;
      readTrendlineControls();
      renderPlot();
    } else {
      els.chartTitle.value = state.title;
      els.xTitle.value = state.xTitle;
      els.yTitle.value = state.yTitle;
      els.xReverse.checked = state.axes.xReverse;
      els.yReverse.checked = state.axes.yReverse;
      els.xLog.checked = state.axes.xLog;
      els.yLog.checked = state.axes.yLog;
      els.minorTicks.checked = state.axes.minorTicks;
      writeTrendlineControls();
    }
  }

  function readTrendlineControls() {
    state.trendlines.visible = els.trendlineVisible.checked;
    state.trendlines.mode = els.trendlineMode.value;
    state.trendlines.width = clamp(Number(els.trendlineWidth.value) || 2, 0.5, 8);
    state.trendlines.opacity = clamp(Number(els.trendlineOpacity.value) || 0.85, 0.05, 1);
  }

  function writeTrendlineControls() {
    els.trendlineVisible.checked = state.trendlines.visible;
    els.trendlineMode.value = state.trendlines.mode;
    els.trendlineWidth.value = state.trendlines.width;
    els.trendlineOpacity.value = state.trendlines.opacity;
  }

  function onTrendlineCategoryChange(event) {
    const row = event.target.closest(".trendline-row");
    if (!row) return;
    const category = row.dataset.category;
    const config = trendlineCategoryConfig(category);
    const field = event.target.dataset.trendField;
    if (field === "enabled") config.enabled = event.target.checked;
    if (field === "lineType") config.lineType = event.target.value;
    if (field === "color") config.color = normalizeOptionalColor(event.target.value, config.color || "");
    if (field === "width") {
      const value = Number(event.target.value);
      config.width = Number.isFinite(value) && value > 0 ? clamp(value, 0.5, 8) : "";
    }
    if (field === "opacity") {
      const value = Number(event.target.value);
      config.opacity = Number.isFinite(value) && value > 0 ? clamp(value, 0.05, 1) : "";
    }
    renderPlot();
  }

  function ensureTrendlineCategoryConfig(categories) {
    categories.forEach((category) => { trendlineCategoryConfig(category); });
  }

  function trendlineCategoryConfig(category) {
    if (!state.trendlines.categories) state.trendlines.categories = {};
    if (!state.trendlines.categories[category]) {
      state.trendlines.categories[category] = {
        enabled: true,
        lineType: "inherit",
        color: "",
        width: "",
        opacity: ""
      };
    }
    return state.trendlines.categories[category];
  }

  function syncDefaultTitles() {
    state.xTitle = state.xColumn || "";
    state.yTitle = state.yColumn || "";
    state.title = state.xColumn && state.yColumn ? `${state.xColumn} vs ${state.yColumn}` : "";
  }

  function updateLineControls() {
    const line = state.plotType === "line";
    els.scatterControls.classList.toggle("hidden", line);
    els.lineControls.classList.toggle("hidden", !line);
    state.lineMode = els.lineMode.value;
    state.showLinePoints = els.showLinePoints.checked;
    state.showSdBand = els.showSdBand.checked;
  }

  function getCategories() {
    if (!state.dataset) return [];
    const rows = state.dataset.rows;
    const values = rows.map((row) => DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode));
    return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
  }

  function getVisibleCategories() {
    return getCategories().filter((category) => state.selectedCategories.has(category));
  }

  function filterRows() {
    if (!state.dataset) return [];
    return state.dataset.rows.filter((row) => state.selectedCategories.has(DataModule.categoryValue(row, state.categoryField, state.sampleSets, state.sampleSetMode)));
  }

  function deleteSampleSet(name) {
    state.sampleSets = state.sampleSets.filter((set) => set.name !== name);
    if (!state.sampleSets.length && state.categoryField === "__sampleSet") {
      state.categoryField = DataModule.categoryFields(state.dataset, state.sampleSets)[0] || "";
    }
    refreshSampleSetDependentUi();
    setStatus(`已删除样品集合：${name}`);
  }

  function deleteDerivedColumn(name) {
    if (!state.dataset || !DataModule.deleteColumn(state.dataset, name)) return;
    state.derivedColumns = state.derivedColumns.filter((column) => column.name !== name);
    if (state.xColumn === name) state.xColumn = state.dataset.numericColumns[0] || "";
    if (state.yColumn === name) state.yColumn = state.dataset.numericColumns.find((column) => column !== state.xColumn) || state.xColumn || "";
    if (state.categoryField === name) state.categoryField = DataModule.categoryFields(state.dataset, state.sampleSets)[0] || "";
    state.selectedElements = state.selectedElements.filter((column) => column !== name);
    Object.keys(state.elementSets).forEach((setName) => {
      state.elementSets[setName] = state.elementSets[setName].filter((column) => column !== name);
      if (!state.elementSets[setName].length) delete state.elementSets[setName];
    });
    saveElementSets();
    syncDefaultTitles();
    renderDataPreview();
    renderSelects();
    state.selectedCategories = new Set(getCategories());
    renderCategoryItems();
    renderLegendRows();
    renderPlot();
    setStatus(`已删除计算列：${name}`);
  }

  function refreshSampleSetDependentUi() {
    const fields = DataModule.categoryFields(state.dataset, state.sampleSets);
    if (!fields.includes(state.categoryField)) state.categoryField = fields[0] || "";
    renderSelects();
    state.selectedCategories = new Set(getCategories());
    renderCategoryItems();
    renderLegendRows();
    renderPlot();
  }

  function applyElementPreset(list) {
    state.selectedElements = list.filter((column) => state.dataset && state.dataset.numericColumns.includes(column));
    renderElementList();
    renderPlot();
  }

  function moveElement(direction, column) {
    const index = state.selectedElements.indexOf(column);
    if (index < 0) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= state.selectedElements.length) return;
    const next = [...state.selectedElements];
    [next[index], next[target]] = [next[target], next[index]];
    state.selectedElements = next;
    renderElementList();
    renderPlot();
  }

  function saveElementSet() {
    const name = els.elementSetName.value.trim();
    if (!name || !state.selectedElements.length) return;
    state.elementSets[name] = [...state.selectedElements];
    saveElementSets();
    fillSelect(els.elementSetSelect, Object.keys(state.elementSets), name);
    els.elementSetSelect.value = name;
    setStatus(`已保存元素组合：${name}`);
  }

  function loadElementSet() {
    const name = els.elementSetSelect.value;
    const set = state.elementSets[name];
    if (!set || !state.dataset) return;
    state.selectedElements = set.filter((column) => state.dataset.numericColumns.includes(column));
    renderElementList();
    renderPlot();
    setStatus(`已载入元素组合：${name}`);
  }

  function deleteElementSet() {
    const name = els.elementSetSelect.value;
    if (!name || !state.elementSets[name]) return;
    delete state.elementSets[name];
    saveElementSets();
    fillSelect(els.elementSetSelect, Object.keys(state.elementSets), "");
    setStatus(`已删除元素组合：${name}`);
  }

  function onCanvasMove(event) {
    const rect = els.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (const point of state.hoverPoints) {
      const radius = Math.max(point.radius || 0, state.markerSize * 1.35, 14);
      const d = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (d < bestD && d <= radius ** 2) { best = point; bestD = d; }
    }
    if (!best) {
      els.tooltip.classList.add("hidden");
      return;
    }
    els.tooltip.classList.remove("hidden");
    els.tooltip.style.left = `${event.clientX - rect.left + 14}px`;
    els.tooltip.style.top = `${event.clientY - rect.top + 14}px`;
    els.tooltip.innerHTML = tooltipHtml(best);
  }

  function tooltipHtml(point) {
    if (state.plotType === "line") {
      const record = point.row ? DataModule.recordLabel(point.row) : "";
      const sample = point.row ? DataModule.sampleLabel(point.row) : point.label;
      return `<strong>${escapeHtml(sample || point.category)}</strong>${record ? `<br>Record_ID: ${escapeHtml(record)}` : ""}<br>${escapeHtml(point.element)}: ${formatNumber(point.yValue)}<br>分类: ${escapeHtml(point.category)}`;
    }
    const sample = DataModule.sampleLabel(point.row);
    const record = DataModule.recordLabel(point.row);
    return `<strong>${escapeHtml(sample)}</strong>${record ? `<br>Record_ID: ${escapeHtml(record)}` : ""}<br>${escapeHtml(state.xColumn)}: ${formatNumber(point.xValue)}<br>${escapeHtml(state.yColumn)}: ${formatNumber(point.yValue)}<br>分类: ${escapeHtml(point.category)}`;
  }

  function saveCurrentHistory() {
    if (!state.dataset) return;
    const snapshot = composedCanvas().toDataURL("image/png", 0.82);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: state.title || `${state.xTitle} vs ${state.yTitle}`,
      time: new Date().toLocaleString(),
      image: snapshot,
      imageWidth: els.canvas.width,
      imageHeight: els.canvas.height,
      hoverPoints: historyHoverPoints(),
      config: lightweightConfig()
    };
    HistoryStore.add(entry);
    state.selectedHistoryId = entry.id;
    renderHistory();
    setStatus("已保存当前图件到历史记录");
  }

  function loadHistory() {
    const items = HistoryStore.all();
    state.selectedHistoryId = items[0]?.id || "";
  }

  function renderHistory() {
    const items = HistoryStore.all();
    if (!state.selectedHistoryId && items[0]) state.selectedHistoryId = items[0].id;
    els.historyList.innerHTML = items.map((item) => `
      <div class="history-card ${item.id === state.selectedHistoryId ? "is-active" : ""}" data-id="${item.id}">
        <img src="${item.image}" alt="">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.time)}</small>
          <button type="button" data-delete="${item.id}">删除</button>
        </div>
      </div>
    `).join("");
    els.historyList.querySelectorAll(".history-card").forEach((card) => card.addEventListener("click", (event) => {
      const del = event.target.dataset.delete;
      if (del) {
        HistoryStore.remove(del);
        if (state.selectedHistoryId === del) state.selectedHistoryId = "";
      } else {
        state.selectedHistoryId = card.dataset.id;
      }
      renderHistory();
    }));
    const selected = items.find((item) => item.id === state.selectedHistoryId);
    if (selected) {
      els.historyPreview.classList.remove("empty");
      els.historyPreview.innerHTML = `<img src="${selected.image}" alt="${escapeHtml(selected.name)}" data-history-image="true">`;
    } else {
      els.historyPreview.classList.add("empty");
      els.historyPreview.textContent = "暂无历史图件";
    }
  }

  function bindLegendDrag() {
    let dragging = false;
    let offset = { x: 0, y: 0 };
    els.htmlLegend.addEventListener("pointerdown", (event) => {
      dragging = true;
      const rect = els.htmlLegend.getBoundingClientRect();
      offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      els.htmlLegend.setPointerCapture(event.pointerId);
    });
    els.htmlLegend.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const shell = els.plotShell.getBoundingClientRect();
      els.htmlLegend.style.left = `${event.clientX - shell.left - offset.x}px`;
      els.htmlLegend.style.top = `${event.clientY - shell.top - offset.y}px`;
      els.htmlLegend.style.right = "auto";
    });
    els.htmlLegend.addEventListener("pointerup", () => { dragging = false; });
  }

  function bindResizers() {
    document.querySelectorAll(".resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        const type = handle.dataset.resize;
        handle.setPointerCapture(event.pointerId);
        const move = (e) => {
          if (type === "left") document.documentElement.style.setProperty("--left-width", `${clamp(e.clientX, 230, 460)}px`);
          if (type === "right") document.documentElement.style.setProperty("--right-width", `${clamp(window.innerWidth - e.clientX, 280, 520)}px`);
          if (type === "history") document.documentElement.style.setProperty("--history-left", `${clamp(e.clientX, 240, 520)}px`);
          resizeCanvas();
          renderPlot();
        };
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
      });
    });
  }

  function resizeCanvas() {
    const rect = els.plotShell.getBoundingClientRect();
    const cssWidth = Math.max(900, Math.round(rect.width || 1200));
    const cssHeight = Math.round(cssWidth * 0.75);
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    state.canvasDpr = dpr;
    state.canvasCssWidth = cssWidth;
    state.canvasCssHeight = cssHeight;
    if (els.canvas.width !== width || els.canvas.height !== height) {
      els.canvas.width = width;
      els.canvas.height = height;
    }
    els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function metrics() {
    const w = state.canvasCssWidth;
    const h = state.canvasCssHeight;
    return {
      width: w,
      height: h,
      plot: {
        left: Math.round(w * 0.13),
        right: Math.round(w * 0.78),
        top: Math.round(h * 0.12),
        bottom: Math.round(h * 0.82)
      }
    };
  }

  function lightweightConfig() {
    return {
      plotType: state.plotType,
      xColumn: state.xColumn,
      yColumn: state.yColumn,
      selectedElements: state.selectedElements,
      categoryField: state.categoryField,
      sampleSetMode: state.sampleSetMode,
      derivedColumns: state.derivedColumns,
      axes: state.axes,
      trendlines: state.trendlines,
      styles: state.styles
    };
  }

  function historyHoverPoints() {
    const dpr = state.canvasDpr || 1;
    return state.hoverPoints.slice(0, 5000).map((point) => ({
      x: Math.round(point.x * dpr),
      y: Math.round(point.y * dpr),
      radius: Math.max(8, Math.round((point.radius || state.markerSize) * dpr)),
      tooltip: tooltipHtml(point)
    }));
  }

  function onHistoryMove(event) {
    const items = HistoryStore.all();
    const selected = items.find((item) => item.id === state.selectedHistoryId);
    const img = els.historyPreview.querySelector("img[data-history-image='true']");
    if (!selected || !img || !selected.hoverPoints || !selected.hoverPoints.length) {
      els.historyTooltip.classList.add("hidden");
      return;
    }
    const rect = img.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (selected.imageWidth || img.naturalWidth) / rect.width;
    const y = (event.clientY - rect.top) * (selected.imageHeight || img.naturalHeight) / rect.height;
    let best = null;
    let bestD = Infinity;
    for (const point of selected.hoverPoints) {
      const d = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (d < bestD && d <= point.radius ** 2) { best = point; bestD = d; }
    }
    if (!best) {
      els.historyTooltip.classList.add("hidden");
      return;
    }
    const previewRect = els.historyPreview.getBoundingClientRect();
    els.historyTooltip.classList.remove("hidden");
    els.historyTooltip.style.left = `${event.clientX - previewRect.left + 14}px`;
    els.historyTooltip.style.top = `${event.clientY - previewRect.top + 14}px`;
    els.historyTooltip.innerHTML = best.tooltip;
  }

  function composedCanvas() {
    const source = els.canvas;
    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(source, 0, 0);
    if (state.legendVisible) {
      ctx.save();
      ctx.scale(state.canvasDpr, state.canvasDpr);
      drawLegendOnCanvas(ctx, state.canvasCssWidth);
      ctx.restore();
    }
    return out;
  }

  function drawLegendOnCanvas(ctx, width) {
    const categories = state.visibleCategories;
    if (!categories.length) return;
    const scale = state.legendScale || 1;
    const x = Math.round(width * 0.79);
    const y0 = Math.round(width * 0.08);
    ctx.save();
    ctx.scale(scale, scale);
    categories.forEach((category, index) => {
      const y = y0 / scale + index * 25;
      const style = state.styles[category] || LegendStyle.defaultStyle(category, index);
      LegendStyle.drawMarker(ctx, x / scale + 8, y + 8, Math.max(12, state.markerSize * 0.7), style);
      ctx.fillStyle = "#111827";
      ctx.globalAlpha = 1;
      ctx.font = "18px Calibri, FangSong";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(category, x / scale + 24, y + 8);
    });
    ctx.restore();
  }

  function checkedValues(container) {
    return [...container.querySelectorAll("input:checked")].map((input) => input.value);
  }

  function fillSelect(select, values, selected) {
    select.innerHTML = values.map((v) => option(v, v === "__sampleSet" ? "样品集合" : v, v === selected)).join("");
  }

  function option(value, label, selected) {
    return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : "";
  }

  function markerIconSvg(style, size) {
    const center = size / 2;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${LegendStyle.markerSvg(center, center, Math.max(10, size - 4), style)}</svg>`;
  }

  function normalizeColor(value, fallback) {
    const text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
    }
    if (/^[0-9a-fA-F]{3}$/.test(text)) {
      return `#${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`.toLowerCase();
    }
    return fallback || "#000000";
  }

  function normalizeOptionalColor(value, fallback) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
    }
    if (/^[0-9a-fA-F]{3}$/.test(text)) {
      return `#${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`.toLowerCase();
    }
    return fallback || "";
  }

  function loadSavedStyles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(styleStoreKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveStyles() {
    localStorage.setItem(styleStoreKey, JSON.stringify(state.styles));
  }

  function loadElementSets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(elementSetStoreKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveElementSets() {
    localStorage.setItem(elementSetStoreKey, JSON.stringify(state.elementSets));
  }

  async function importLegendFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const result = applyLegendConfig(config);
      els.legendImportStatus.textContent = `已导入 ${result.applied} 项，未匹配 ${result.unmatched} 项`;
    } catch (error) {
      els.legendImportStatus.textContent = `导入失败：${error.message}`;
    }
  }

  async function applyReferenceLegend() {
    try {
      const config = window.ReferenceLegendConfig || await fetchReferenceLegend();
      const result = applyLegendConfig(config);
      els.legendImportStatus.textContent = `已应用参考图例 ${result.applied} 项，未匹配 ${result.unmatched} 项`;
    } catch (error) {
      els.legendImportStatus.textContent = `应用失败：${error.message}`;
    }
  }

  async function fetchReferenceLegend() {
    const response = await fetch("legend-reference.json", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取参考图例配置");
    return response.json();
  }

  function exportLegendStyles() {
    const categories = getCategories();
    const styles = {};
    categories.forEach((category, index) => {
      styles[category] = state.styles[category] || LegendStyle.defaultStyle(category, index);
    });
    const config = {
      version: 1,
      name: "Element Plot Workbench legend styles",
      exportedAt: new Date().toISOString(),
      styles
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "legend-styles.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    els.legendImportStatus.textContent = "已导出当前图例设置";
  }

  function applyLegendConfig(config) {
    const incoming = normalizeLegendConfig(config);
    const visible = new Set(getCategories());
    let applied = 0;
    let unmatched = 0;
    Object.entries(incoming).forEach(([name, style]) => {
      const target = findLegendTarget(name, visible);
      if (!target) {
        unmatched += 1;
        return;
      }
      state.styles[target] = sanitizeLegendStyle(style, state.styles[target] || LegendStyle.defaultStyle(target, 0));
      applied += 1;
    });
    saveStyles();
    renderLegendRows();
    renderPlot();
    return { applied, unmatched };
  }

  function normalizeLegendConfig(config) {
    if (!config || typeof config !== "object") throw new Error("JSON 格式不正确");
    const styles = config.styles && typeof config.styles === "object" ? config.styles : config;
    return Object.fromEntries(Object.entries(styles).filter(([, value]) => value && typeof value === "object"));
  }

  function findLegendTarget(name, visibleSet) {
    if (visibleSet.has(name)) return name;
    const normalized = normalizeLegendName(name);
    return [...visibleSet].find((item) => normalizeLegendName(item) === normalized);
  }

  function normalizeLegendName(name) {
    return String(name).trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  }

  function sanitizeLegendStyle(style, fallback) {
    return {
      fill: normalizeColor(style.fill, fallback.fill),
      stroke: normalizeColor(style.stroke, fallback.stroke),
      shape: LegendStyle.shapes.includes(style.shape) ? style.shape : fallback.shape,
      lineType: LegendStyle.lineTypes.includes(style.lineType) ? style.lineType : fallback.lineType,
      lineWidth: Number.isFinite(Number(style.lineWidth)) ? Number(style.lineWidth) : fallback.lineWidth,
      opacity: Number.isFinite(Number(style.opacity)) ? Math.max(0.05, Math.min(1, Number(style.opacity))) : fallback.opacity
    };
  }

  function updateLegendRow(category) {
    const row = [...els.legendRows.querySelectorAll(".legend-row")]
      .find((item) => item.dataset.category === category);
    const swatch = row ? row.querySelector(".legend-swatch") : null;
    if (swatch) swatch.innerHTML = markerIconSvg(state.styles[category], 18);
  }

  function shapeLabel(value) {
    return {
      circle: "圆形", square: "方形", diamond: "菱形", "triangle-up": "上三角", "triangle-down": "下三角",
      cross: "十字", x: "叉号", star: "星形", hbar: "横条", vbar: "竖条", pentagon: "五边形", hexagon: "六边形", octagon: "八边形"
    }[value] || value;
  }

  function lineLabel(value) {
    return { solid: "实线", dash: "虚线", dot: "点线", dashdot: "点划线" }[value] || value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  window.addEventListener("resize", debounce(renderPlot, 120));

  function debounce(fn, wait) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
})();
