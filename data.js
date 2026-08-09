(function () {
  const DataModule = {
    workbook: null,
    sheets: {},
    currentSheet: "",

    async loadFile(file) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext === "csv") {
        const text = await file.text();
        const rows = this.parseCsv(text);
        this.sheets = { CSV: rows };
        this.currentSheet = "CSV";
        return this.buildDataset(rows, file.name);
      }
      if (!window.XLSX) {
        throw new Error("Excel 解析库未加载。可以先使用 CSV，或联网后重新打开页面。");
      }
      const buffer = await file.arrayBuffer();
      this.workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      this.sheets = {};
      this.workbook.SheetNames.forEach((name) => {
        this.sheets[name] = XLSX.utils.sheet_to_json(this.workbook.Sheets[name], { header: 1, defval: "" });
      });
      this.currentSheet = this.workbook.SheetNames[0] || "";
      return this.buildDataset(this.sheets[this.currentSheet], file.name);
    },

    useSheet(name, fileName) {
      this.currentSheet = name;
      return this.buildDataset(this.sheets[name] || [], fileName);
    },

    parseCsv(text) {
      const rows = [];
      let row = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"' && quoted && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = !quoted;
        } else if (ch === "," && !quoted) {
          row.push(cell);
          cell = "";
        } else if ((ch === "\n" || ch === "\r") && !quoted) {
          if (ch === "\r" && next === "\n") i += 1;
          row.push(cell);
          if (row.some((v) => String(v).trim() !== "")) rows.push(row);
          row = [];
          cell = "";
        } else {
          cell += ch;
        }
      }
      row.push(cell);
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      return rows;
    },

    buildDataset(rows, fileName) {
      if (!rows || rows.length === 0) {
        return { fileName, columns: [], numericColumns: [], rows: [], sheetNames: Object.keys(this.sheets) };
      }
      const headerRowIndex = rows.findIndex((row) => row.filter((v) => String(v).trim() !== "").length > 1);
      const rawHeaders = (rows[headerRowIndex] || []).map((value, index) => {
        const text = String(value || "").trim();
        return text || `Column ${index + 1}`;
      });
      const headers = uniqueHeaders(rawHeaders);
      const records = rows.slice(headerRowIndex + 1).map((row, rowIndex) => {
        const record = { __rowIndex: rowIndex + 1 };
        headers.forEach((column, index) => {
          record[column] = row[index] ?? "";
        });
        return record;
      }).filter((record) => headers.some((column) => String(record[column]).trim() !== ""));

      const numericColumns = headers.filter((column) => {
        let seen = 0;
        let numeric = 0;
        for (const row of records) {
          const raw = row[column];
          if (raw === "" || raw == null) continue;
          seen += 1;
          if (Number.isFinite(toNumber(raw))) numeric += 1;
        }
        return seen > 0 && numeric / seen >= 0.65;
      });

      return {
        fileName,
        sheetNames: Object.keys(this.sheets),
        sheetName: this.currentSheet,
        columns: headers,
        numericColumns,
        rows: records
      };
    },

    addRatioColumn(dataset, numerator, denominator, name) {
      if (!dataset || !numerator || !denominator || !name) return null;
      const columnName = uniqueColumnName(dataset.columns, name);
      dataset.rows.forEach((row) => {
        const a = toNumber(row[numerator]);
        const b = toNumber(row[denominator]);
        row[columnName] = Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : "";
      });
      dataset.columns.push(columnName);
      dataset.numericColumns.push(columnName);
      return columnName;
    },

    deleteColumn(dataset, columnName) {
      if (!dataset || !dataset.columns.includes(columnName)) return false;
      dataset.columns = dataset.columns.filter((column) => column !== columnName);
      dataset.numericColumns = dataset.numericColumns.filter((column) => column !== columnName);
      dataset.rows.forEach((row) => { delete row[columnName]; });
      return true;
    },

    categoryFields(dataset, sampleSets) {
      if (!dataset) return [];
      const preferred = ["Type", "Ti", "Ti_Type", "Mission", "Sub", "Sub_Type", "Parent Sample ID", "Parent_Sample_ID", "ParentSampleID"];
      const found = preferred
        .map((name) => findColumn(dataset.columns, name))
        .filter(Boolean);
      const textColumns = dataset.columns.filter((column) => !dataset.numericColumns.includes(column));
      const merged = [...new Set([...found, ...textColumns.slice(0, 8)])];
      if (sampleSets && sampleSets.length) merged.push("__sampleSet");
      return merged;
    },

    categoryValue(row, field, sampleSets, sampleSetMode = "field") {
      if (!field) return "全部样品";
      const baseValue = baseCategoryValue(row, field);
      const hit = sampleSets && sampleSets.length
        ? sampleSets.find((set) => set.rowKeys.includes(rowKey(row)))
        : null;
      if (field === "__sampleSet") return hit ? hit.name : "未归入集合";
      if ((sampleSetMode === "overlay" || sampleSetMode === "sample-first") && hit) return hit.name;
      if (sampleSetMode === "field-sample" && hit) return `${baseValue} / ${hit.name}`;
      return baseValue;
    },

    sampleSetName(row, sampleSets) {
      const hit = sampleSets && sampleSets.length
        ? sampleSets.find((set) => set.rowKeys.includes(rowKey(row)))
        : null;
      return hit ? hit.name : "";
    },

    recordLabel(row) {
      return row.Record_ID || row.RecordID || row.record_id || row["Record ID"] || "";
    },

    sampleLabel(row) {
      return row["Sample ID"] || row.Sample || row.Name || row.Parent_Sample_ID || row["Parent Sample ID"] || `行 ${row.__rowIndex}`;
    },

    baseCategoryValue,
    rowKey
  };

  function baseCategoryValue(row, field) {
    if ((field === "Sub" || field === "Sub_Type") && row.Mission) {
      return `${row.Mission} / ${row[field] || "空值"}`;
    }
    const value = row[field];
    return value == null || value === "" ? "空值" : String(value);
  }

  function toNumber(value) {
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    const text = String(value).replace(/,/g, "").trim();
    if (!text) return NaN;
    const n = Number(text);
    return Number.isFinite(n) ? n : NaN;
  }

  function uniqueColumnName(columns, base) {
    let name = base.trim();
    let i = 2;
    while (columns.includes(name)) {
      name = `${base.trim()}_${i}`;
      i += 1;
    }
    return name;
  }

  function uniqueHeaders(headers) {
    const seen = new Map();
    return headers.map((header) => {
      const count = seen.get(header) || 0;
      seen.set(header, count + 1);
      return count === 0 ? header : `${header}_${count + 1}`;
    });
  }

  function normalizeHeader(value) {
    return String(value).toLowerCase().replace(/[\s_#-]+/g, "");
  }

  function findColumn(columns, target) {
    const wanted = normalizeHeader(target);
    return columns.find((column) => normalizeHeader(column) === wanted);
  }

  function rowKey(row) {
    const sample = row["Sample ID"] || row.Sample || row.Name || row["Parent Sample ID"] || row.Parent_Sample_ID || "";
    return `${sample}#${row.__rowIndex}`;
  }

  window.DataModule = DataModule;
  window.toNumber = toNumber;
})();
