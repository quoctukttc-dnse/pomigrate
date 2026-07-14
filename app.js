/* =====================================================================
 * Mapping Labdip & Color — ScaX -> ScaF
 * Chạy hoàn toàn trong trình duyệt (GitHub Pages).
 * ===================================================================== */

/* ---------------- Chuẩn hóa chuỗi ---------------- */
function norm(s) {
  if (s === null || s === undefined) return "";
  s = String(s).toUpperCase();
  s = s.replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  s = s.replace(/[ ​‌‍﻿]/g, " ");
  s = s.replace(/_X000D_/g, " ");
  s = s.replace(/[\r\n\t]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
/* Dạng "chặt": chỉ giữ A-Z0-9 — dùng để so khớp chứa (bỏ khác biệt space, gạch, ngoặc) */
function tight(s) { return norm(s).replace(/[^A-Z0-9]/g, ""); }

function cleanCode(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}
const EMPTYISH = new Set(["", "UNKNOWN", "0", "0.0", "NULL", "N/A"]);

/* ---------------- Dữ liệu & chỉ mục ---------------- */
const DATA = { colors: null, labdip: null, generic: null, sku: null, meta: null, sources: {} };
const IDX = {};
const GRAM = 4;

function buildIndexes() {
  // Color library
  IDX.colorTight = [];
  IDX.colorGram = new Map();
  IDX.colorShort = [];
  IDX.colorByCode = new Map();
  DATA.colors.forEach((c, i) => {
    const t = tight(c[1]);
    IDX.colorTight.push(t);
    IDX.colorByCode.set(cleanCode(c[0]), c[1]);
    if (t.length >= GRAM) {
      const g = t.slice(0, GRAM);
      let arr = IDX.colorGram.get(g);
      if (!arr) IDX.colorGram.set(g, arr = []);
      arr.push(i);
    } else if (t.length === 3) {
      IDX.colorShort.push(i);
    }
  });
  // Labdip theo item
  IDX.ldByItem = new Map();
  IDX.ldAll = [];
  DATA.labdip.forEach(r => {
    const e = {
      item: cleanCode(r[0]), colorCode: cleanCode(r[1]),
      code: String(r[2] || "").trim(), name: String(r[3] || "").trim(), range: r[4] || "",
      tCode: tight(r[2]), tName: tight(r[3])
    };
    if (EMPTYISH.has(e.code.toUpperCase())) e.tCode = "";
    if (EMPTYISH.has(e.name.toUpperCase())) e.tName = "";
    IDX.ldAll.push(e);
    let arr = IDX.ldByItem.get(e.item);
    if (!arr) IDX.ldByItem.set(e.item, arr = []);
    arr.push(e);
  });
  // Generic theo ScaX
  IDX.genByScax = new Map();
  DATA.generic.forEach(r => {
    const e = {
      scaf: cleanCode(r[0]), scax: cleanCode(r[1]), cnt: Number(r[2] || 0), supRef: r[3] || "",
      cust: String(r[4] || "").trim(), mngColor: !!r[5], mngSize: !!r[6],
      status: String(r[7] || "").trim().toUpperCase(), block: !!r[8]
    };
    if (!e.scax) return;
    let arr = IDX.genByScax.get(e.scax);
    if (!arr) IDX.genByScax.set(e.scax, arr = []);
    arr.push(e);
  });
  // SKU: item -> Map(colorCode -> colorName)
  IDX.skuColors = new Map();
  DATA.sku.forEach(r => {
    const item = cleanCode(r[0]), cc = cleanCode(r[2]);
    if (!item) return;
    let m = IDX.skuColors.get(item);
    if (!m) IDX.skuColors.set(item, m = new Map());
    if (cc) m.set(cc, r[3] || "");
  });
}

/* ---------------- Dò màu trong chuỗi ---------------- */
function findColorCandidates(tStr) {
  const found = [];
  const seen = new Set();
  for (const i of IDX.colorShort) {
    if (tStr.includes(IDX.colorTight[i])) { found.push(i); seen.add(i); }
  }
  for (let p = 0; p <= tStr.length - GRAM; p++) {
    const arr = IDX.colorGram.get(tStr.substr(p, GRAM));
    if (!arr) continue;
    for (const i of arr) {
      if (seen.has(i)) continue;
      seen.add(i);
      if (tStr.includes(IDX.colorTight[i])) found.push(i);
    }
  }
  return found; // mảng index vào DATA.colors
}

/* ---------------- Dò labdip ---------------- */
/* Tên labdip quá chung (ngắn và không chứa chữ số, vd "SHADE B", "BLACK") dễ khớp nhiễu */
function ldSpecific(t, minLen) { return t && t.length >= minLen && (/\d/.test(t) || t.length >= 10); }
function matchLabdipOnItem(item, tStr) {
  const rows = IDX.ldByItem.get(item) || [];
  const skuMap = IDX.skuColors.get(item);
  let bestLen = 0, bestRows = [];
  for (const r of rows) {
    for (const t of [r.tCode, r.tName]) {
      if (ldSpecific(t, GRAM) && tStr.includes(t)) {
        if (t.length > bestLen) { bestLen = t.length; bestRows = [r]; }
        else if (t.length === bestLen && !bestRows.includes(r)) bestRows.push(r);
      }
    }
  }
  if (!bestRows.length) return null;
  /* Nhiều dòng labdip khớp ngang nhau (cùng code) → ưu tiên dòng có màu đã tồn tại SKU */
  const withSku = bestRows.find(r => r.colorCode && skuMap && skuMap.has(r.colorCode));
  return withSku || bestRows[0];
}
function matchLabdipGlobal(tStr) {
  const hits = [];
  const seen = new Set();
  for (const r of IDX.ldAll) {
    for (const t of [r.tCode, r.tName]) {
      if (ldSpecific(t, 7) && tStr.includes(t)) {
        const k = r.code + "||" + r.item;
        if (!seen.has(k)) { seen.add(k); hits.push(r); }
        break;
      }
    }
  }
  return hits;
}

/* ---------------- Map ScaX -> ScaF ---------------- */
function mapItem(scax, customer) {
  const rows = IDX.genByScax.get(cleanCode(scax));
  if (!rows || !rows.length) return { item: "", note: "Không tìm thấy OldItem (ScaX) trong master" };
  const oper = rows.filter(r => r.status === "APPROVE" && !r.block);
  const pool = oper.length ? oper : rows;
  const cu = norm(customer);
  let chosen = null;
  if (cu) {
    const m = pool.filter(r => r.cust && (norm(r.cust).includes(cu) || cu.includes(norm(r.cust))));
    if (m.length) chosen = m[0];
  }
  if (!chosen) {
    const gen = pool.filter(r => !r.cust);
    chosen = gen[0] || pool[0];
  }
  const distinct = [...new Set(pool.map(r => r.scaf))];
  let note = "";
  if (!oper.length) note = "⚠ Code chưa APPROVE hoặc bị block. ";
  if (distinct.length > 1) note += "Nhiều code ScaF ứng viên: " + distinct.join(", ");
  return { item: chosen.scaf, note: note.trim() };
}

/* ---------------- Xử lý 1 dòng ---------------- */
const rowCache = new Map(); // cache theo (item + colorStr)
function processOne(oldItem, itemFilled, colorStr, customer) {
  const res = {
    item: cleanCode(itemFilled), itemNote: "",
    colorCode: "", colorName: "", labdipCode: "", labdipName: "",
    skuMissing: false, colorNotFound: false,
    ldStatus: "", ldGlobalHits: [], status: [], candidates: []
  };
  // 1. Item
  if (!res.item) {
    const m = mapItem(oldItem, customer);
    res.item = m.item;
    res.itemNote = m.note;
    if (!res.item) { res.status.push("KHÔNG MAP ĐƯỢC ITEM"); return res; }
    res.status.push("Item tự map từ OldItem");
  }
  if (res.itemNote) res.status.push(res.itemNote);

  const cs = norm(colorStr);
  if (!cs) { res.status.push("ColorItemOld trống — bỏ qua màu/labdip"); return res; }
  const tStr = tight(cs);

  const cacheKey = res.item + "" + tStr;
  if (rowCache.has(cacheKey)) {
    const c = rowCache.get(cacheKey);
    return Object.assign({}, c, { itemNote: res.itemNote, status: res.status.concat(c.status.filter(s => !res.status.includes(s))) });
  }

  // 2. Labdip trên đúng item
  const ld = matchLabdipOnItem(res.item, tStr);
  if (ld) {
    res.labdipCode = ld.code;
    res.labdipName = ld.name;
    res.ldStatus = "OK";
    res.status.push("Labdip: " + ld.code);
  } else {
    const hits = matchLabdipGlobal(tStr);
    if (hits.length) {
      res.ldStatus = "CREATE";
      res.ldGlobalHits = hits.slice(0, 10).map(h => ({ code: h.code, name: h.name, item: h.item, colorCode: h.colorCode }));
      res.status.push("⚠ CẦN TẠO LABDIP cho item " + res.item + " (labdip có ở item khác: " +
        [...new Set(hits.slice(0, 5).map(h => h.code + "@" + h.item))].join("; ") + ")");
    } else {
      res.ldStatus = "NOTFOUND";
      res.status.push("✗ KHÔNG TÌM THẤY LABDIP trong Master Labdip");
    }
  }

  // 3. Màu — ưu tiên color code trên dòng labdip khớp, sau đó tên khớp dài nhất
  //    (đồng hạng độ dài → ưu tiên màu đã có SKU trên item)
  const skuMap = IDX.skuColors.get(res.item);
  const candIdx = findColorCandidates(tStr);
  res.candidates = candIdx.map(i => {
    const code = cleanCode(DATA.colors[i][0]);
    return { code, name: DATA.colors[i][1], len: IDX.colorTight[i].length, hasSku: skuMap && skuMap.has(code) ? 1 : 0 };
  }).sort((a, b) => (b.len - a.len) || (b.hasSku - a.hasSku));
  let colorFromLd = "";
  if (ld && ld.colorCode && !EMPTYISH.has(ld.colorCode.toUpperCase())) colorFromLd = ld.colorCode;

  if (colorFromLd) {
    res.colorCode = colorFromLd;
    res.colorName = IDX.colorByCode.get(colorFromLd) || (res.candidates.find(c => c.code === colorFromLd) || {}).name || "";
    res.status.push("Màu lấy theo Master Labdip: " + res.colorCode);
  } else if (res.candidates.length) {
    res.colorCode = res.candidates[0].code;
    res.colorName = res.candidates[0].name;
    res.status.push("Màu khớp tên dài nhất: " + res.colorCode + " (" + res.colorName + ")");
  } else {
    res.colorNotFound = true;
    res.status.push("✗ KHÔNG TÌM THẤY MÀU trong Color Library");
  }

  // 4. Kiểm tra SKU
  if (res.colorCode) {
    const m = IDX.skuColors.get(res.item);
    if (m && m.has(res.colorCode)) {
      res.status.push("SKU đã có (" + res.colorCode + ")");
    } else {
      res.skuMissing = true;
      res.status.push("⚠ CẦN TẠO SKU: " + res.item + " / " + res.colorCode);
    }
  }
  rowCache.set(cacheKey, res);
  return res;
}

/* =====================================================================
 * PHẦN DƯỚI: chỉ chạy trong trình duyệt
 * ===================================================================== */
if (typeof document !== "undefined") {

  /* ---------- IndexedDB ---------- */
  function idb() {
    return new Promise((ok, err) => {
      const rq = indexedDB.open("labdip-mapping", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("masters");
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => err(rq.error);
    });
  }
  async function idbGet(key) {
    const db = await idb();
    return new Promise((ok, err) => {
      const rq = db.transaction("masters").objectStore("masters").get(key);
      rq.onsuccess = () => ok(rq.result); rq.onerror = () => err(rq.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idb();
    return new Promise((ok, err) => {
      const tx = db.transaction("masters", "readwrite");
      tx.objectStore("masters").put(val, key);
      tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error);
    });
  }
  async function idbDel(keys) {
    const db = await idb();
    return new Promise((ok, err) => {
      const tx = db.transaction("masters", "readwrite");
      keys.forEach(k => tx.objectStore("masters").delete(k));
      tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error);
    });
  }

  /* ---------- Tải master ---------- */
  async function fetchGz(name) {
    const r = await fetch("data/" + name + ".json.gz");
    if (!r.ok) throw new Error("Không tải được data/" + name + ".json.gz");
    const buf = new Uint8Array(await r.arrayBuffer());
    return JSON.parse(pako.inflate(buf, { to: "string" }));
  }
  async function loadMasters() {
    const st = document.getElementById("masterStatus");
    try {
      for (const k of ["colors", "labdip", "generic", "sku"]) {
        const local = await idbGet(k);
        if (local) { DATA[k] = local.rows; DATA.sources[k] = "Upload " + local.date; }
      }
      const need = ["colors", "labdip", "generic", "sku"].filter(k => !DATA[k]);
      if (need.length) {
        st.textContent = "Đang tải dữ liệu nhúng (" + need.join(", ") + ")…";
        for (const k of need) { DATA[k] = await fetchGz(k); DATA.sources[k] = "Bản nhúng trong website"; }
      }
      buildIndexes();
      st.innerHTML =
        '<span class="pill ok">Color Library: ' + DATA.colors.length.toLocaleString() + " màu</span>" +
        '<span class="pill ok">Master Labdip: ' + DATA.labdip.length.toLocaleString() + " dòng</span>" +
        '<span class="pill ok">Generic: ' + DATA.generic.length.toLocaleString() + " code</span>" +
        '<span class="pill ok">SKU: ' + DATA.sku.length.toLocaleString() + " dòng</span>" +
        '<br><span class="small">Nguồn: Color=' + DATA.sources.colors + " · Labdip=" + DATA.sources.labdip + " · Items=" + DATA.sources.generic + "</span>";
      document.getElementById("btnRun").disabled = !uploadedFile;
      refreshAdmin();
    } catch (e) {
      st.innerHTML = '<span class="pill err">Lỗi tải master: ' + e.message + "</span><br>" +
        '<span class="small">Nếu mở file trực tiếp (file://), trình duyệt chặn fetch. Hãy chạy qua GitHub Pages hoặc server cục bộ: <code>python -m http.server</code></span>';
    }
  }

  /* ---------- Upload file lỗi ---------- */
  let uploadedFile = null, uploadedWB = null, results = null, headerMap = null, origName = "";
  const dz = document.getElementById("dropZone"), fi = document.getElementById("fileInput");
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("drag"); };
  dz.ondragleave = () => dz.classList.remove("drag");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("drag"); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); };
  fi.onchange = () => { if (fi.files[0]) setFile(fi.files[0]); };

  async function setFile(f) {
    uploadedFile = f; origName = f.name.replace(/\.xlsx?$/i, "");
    const st = document.getElementById("fileStatus");
    st.textContent = "Đang đọc " + f.name + "…";
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      uploadedWB = wb;
      const ws = wb.worksheets[0];
      headerMap = {};
      ws.getRow(1).eachCell((cell, col) => { headerMap[String(cell.value).trim()] = col; });
      const required = ["OldItem", "Item", "ColorItemOld", "ColorItem", "Lapdip"];
      const missing = required.filter(h => !headerMap[h]);
      if (missing.length) {
        st.innerHTML = '<span class="pill err">Thiếu cột: ' + missing.join(", ") + "</span>";
        uploadedFile = null; return;
      }
      let n = 0;
      ws.eachRow((row, rn) => { if (rn > 1 && norm(row.getCell(headerMap["OldItem"]).value)) n++; });
      st.innerHTML = '<span class="pill ok">' + f.name + " — " + n + " dòng dữ liệu, sheet «" + ws.name + "»</span>";
      document.getElementById("btnRun").disabled = !DATA.colors;
    } catch (e) {
      st.innerHTML = '<span class="pill err">Không đọc được file: ' + e.message + "</span>";
      uploadedFile = null;
    }
  }

  /* ---------- Chạy xử lý ---------- */
  window.runProcess = async function () {
    if (!uploadedWB || !DATA.colors) return;
    rowCache.clear();
    const ws = uploadedWB.worksheets[0];
    const H = headerMap;
    const prog = document.getElementById("prog");
    prog.classList.remove("hidden");
    results = [];
    const rows = [];
    ws.eachRow((row, rn) => { if (rn > 1) rows.push(rn); });
    let done = 0;
    for (const rn of rows) {
      const row = ws.getRow(rn);
      const get = h => { const c = H[h] ? row.getCell(H[h]).value : null; return c === null || c === undefined ? "" : (typeof c === "object" && c.richText ? c.richText.map(t => t.text).join("") : String(c)); };
      const oldItem = get("OldItem").trim();
      if (!oldItem && !get("Item").trim()) { done++; continue; }
      const r = processOne(oldItem, get("Item").trim(), get("ColorItemOld"), get("Customer").trim());
      // Điền vào file
      if (r.item && !get("Item").trim()) row.getCell(H["Item"]).value = r.item;
      if (r.colorCode) row.getCell(H["ColorItem"]).value = r.colorCode;
      if (r.labdipCode) row.getCell(H["Lapdip"]).value = r.labdipCode;
      results.push(Object.assign({ rowNum: rn, oldItem: oldItem, colorOld: norm(get("ColorItemOld")), customer: get("Customer").trim() }, r));
      done++;
      if (done % 200 === 0) { prog.value = done / rows.length * 100; await new Promise(x => setTimeout(x)); }
    }
    prog.value = 100;
    setTimeout(() => prog.classList.add("hidden"), 800);
    renderResults();
  };

  /* ---------- Hiển thị kết quả ---------- */
  function agg() {
    const skuNew = new Map(), ldNew = new Map(), noColor = [], noLd = [];
    for (const r of results) {
      if (r.skuMissing) {
        const k = r.item + "|" + r.colorCode;
        if (!skuNew.has(k)) skuNew.set(k, { item: r.item, colorCode: r.colorCode, colorName: r.colorName, rows: [] });
        skuNew.get(k).rows.push(r.rowNum);
      }
      if (r.ldStatus === "CREATE") {
        const hit = r.ldGlobalHits[0] || {};
        const k = r.item + "|" + (hit.code || r.colorOld);
        if (!ldNew.has(k)) ldNew.set(k, { item: r.item, labdip: hit.code || "", labdipName: hit.name || "", foundAt: r.ldGlobalHits.map(h => h.item).join(", "), colorOld: r.colorOld, rows: [] });
        ldNew.get(k).rows.push(r.rowNum);
      }
      if (r.colorNotFound) noColor.push(r);
      if (r.ldStatus === "NOTFOUND") noLd.push(r);
    }
    return { skuNew: [...skuNew.values()], ldNew: [...ldNew.values()], noColor, noLd };
  }

  function renderResults() {
    const a = agg();
    document.getElementById("resultCard").classList.remove("hidden");
    const ok = results.filter(r => r.colorCode && r.ldStatus === "OK" && !r.skuMissing).length;
    document.getElementById("summaryBoxes").innerHTML =
      '<div class="sumbox"><b>' + results.length + "</b><span>Tổng dòng</span></div>" +
      '<div class="sumbox"><b style="color:var(--ok)">' + ok + "</b><span>Mapping đủ (màu + labdip + SKU)</span></div>" +
      '<div class="sumbox"><b style="color:var(--warn)">' + a.skuNew.length + "</b><span>SKU cần tạo</span></div>" +
      '<div class="sumbox"><b style="color:var(--warn)">' + a.ldNew.length + "</b><span>Labdip cần tạo</span></div>" +
      '<div class="sumbox"><b style="color:var(--err)">' + a.noColor.length + "</b><span>Không thấy màu</span></div>" +
      '<div class="sumbox"><b style="color:var(--err)">' + a.noLd.length + "</b><span>Không thấy labdip</span></div>";
    showResultTable(document.querySelector('#resultTabs button[data-rt="all"]'));
  }

  window.showResultTable = function (btn) {
    document.querySelectorAll("#resultTabs .tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const t = document.getElementById("resultTable");
    const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const a = agg();
    const kind = btn.dataset.rt;
    if (kind === "all") {
      t.innerHTML = "<tr><th>Dòng</th><th>OldItem</th><th>Item</th><th>ColorItemOld</th><th>ColorItem</th><th>Tên màu</th><th>Lapdip</th><th>Trạng thái</th></tr>" +
        results.map(r => "<tr><td>" + r.rowNum + "</td><td>" + esc(r.oldItem) + "</td><td>" + esc(r.item) + "</td><td>" + esc(r.colorOld) +
          "</td><td>" + esc(r.colorCode) + "</td><td>" + esc(r.colorName) + "</td><td>" + esc(r.labdipCode) + "</td><td>" + esc(r.status.join(" · ")) + "</td></tr>").join("");
    } else if (kind === "sku") {
      t.innerHTML = "<tr><th>Item</th><th>ColorCode</th><th>Tên màu</th><th>Dòng liên quan</th></tr>" +
        a.skuNew.map(r => "<tr><td>" + esc(r.item) + "</td><td>" + esc(r.colorCode) + "</td><td>" + esc(r.colorName) + "</td><td>" + r.rows.join(", ") + "</td></tr>").join("");
    } else if (kind === "ldnew") {
      t.innerHTML = "<tr><th>Item cần tạo labdip</th><th>Labdip</th><th>Tên labdip</th><th>Đang có ở item</th><th>Dòng</th></tr>" +
        a.ldNew.map(r => "<tr><td>" + esc(r.item) + "</td><td>" + esc(r.labdip) + "</td><td>" + esc(r.labdipName) + "</td><td>" + esc(r.foundAt) + "</td><td>" + r.rows.join(", ") + "</td></tr>").join("");
    } else if (kind === "nocolor") {
      t.innerHTML = "<tr><th>Dòng</th><th>Item</th><th>ColorItemOld</th></tr>" +
        a.noColor.map(r => "<tr><td>" + r.rowNum + "</td><td>" + esc(r.item) + "</td><td>" + esc(r.colorOld) + "</td></tr>").join("");
    } else {
      t.innerHTML = "<tr><th>Dòng</th><th>Item</th><th>ColorItemOld</th></tr>" +
        a.noLd.map(r => "<tr><td>" + r.rowNum + "</td><td>" + esc(r.item) + "</td><td>" + esc(r.colorOld) + "</td></tr>").join("");
    }
  };

  /* ---------- Tải file xuống ---------- */
  function saveBlob(buf, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  window.downloadFilled = async function () {
    const buf = await uploadedWB.xlsx.writeBuffer();
    saveBlob(buf, origName + "_da_dien.xlsx");
  };
  window.downloadReport = async function () {
    const a = agg();
    const wb = new ExcelJS.Workbook();
    const bold = { font: { bold: true } };
    const add = (name, headers, rows) => {
      const ws = wb.addWorksheet(name);
      ws.addRow(headers).eachCell(c => Object.assign(c, bold));
      rows.forEach(r => ws.addRow(r));
      ws.columns.forEach((col, i) => { col.width = Math.min(60, Math.max(12, ...[headers[i], ...rows.map(r => String(r[i] || ""))].map(v => String(v).length + 2))); });
      return ws;
    };
    add("Tong hop", ["Dòng", "OldItem", "Item", "Customer", "ColorItemOld", "ColorItem", "Tên màu", "Lapdip", "Tên labdip", "Trạng thái"],
      results.map(r => [r.rowNum, r.oldItem, r.item, r.customer, r.colorOld, r.colorCode, r.colorName, r.labdipCode, r.labdipName, r.status.join(" · ")]));
    add("SKU can tao", ["Item", "ColorCode", "Tên màu", "Các dòng"], a.skuNew.map(r => [r.item, r.colorCode, r.colorName, r.rows.join(", ")]));
    add("Labdip can tao", ["Item cần tạo", "LabdipCode", "Tên labdip", "Đang có ở item", "ColorItemOld", "Các dòng"],
      a.ldNew.map(r => [r.item, r.labdip, r.labdipName, r.foundAt, r.colorOld, r.rows.join(", ")]));
    add("Khong thay mau", ["Dòng", "Item", "ColorItemOld"], a.noColor.map(r => [r.rowNum, r.item, r.colorOld]));
    add("Khong thay labdip", ["Dòng", "Item", "ColorItemOld"], a.noLd.map(r => [r.rowNum, r.item, r.colorOld]));
    saveBlob(await wb.xlsx.writeBuffer(), origName + "_bao_cao.xlsx");
  };

  /* ---------- Admin ---------- */
  function refreshAdmin() {
    const set = (id, v) => document.getElementById(id).textContent = v;
    set("srcColors", DATA.sources.colors || "—"); set("cntColors", DATA.colors ? DATA.colors.length.toLocaleString() : "—");
    set("srcLabdip", DATA.sources.labdip || "—"); set("cntLabdip", DATA.labdip ? DATA.labdip.length.toLocaleString() : "—");
    set("srcItems", DATA.sources.generic || "—"); set("cntItems", DATA.generic ? (DATA.generic.length.toLocaleString() + " / SKU " + DATA.sku.length.toLocaleString()) : "—");
  }
  let masterKind = null;
  const mi = document.getElementById("masterInput");
  window.pickMaster = function (kind) { masterKind = kind; mi.value = ""; mi.click(); };
  mi.onchange = async () => {
    if (!mi.files[0]) return;
    const st = document.getElementById("adminStatus");
    st.textContent = "Đang đọc " + mi.files[0].name + "… (file lớn có thể mất 30–60 giây)";
    await new Promise(x => setTimeout(x, 50));
    try {
      const wb = XLSX.read(await mi.files[0].arrayBuffer(), { type: "array" });
      const aoa = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      const today = new Date().toISOString().slice(0, 10);
      const cs = v => { let s = String(v == null ? "" : v).trim(); if (/^\d+\.0$/.test(s)) s = s.slice(0, -2); return s; };
      const truthy = v => ["true", "1", "yes"].includes(String(v).trim().toLowerCase()) ? 1 : 0;
      if (masterKind === "colors") {
        const sheet = wb.SheetNames.includes("PRD") ? "PRD" : wb.SheetNames[0];
        const rows = aoa(sheet).slice(1).filter(r => cs(r[0]) && cs(r[1])).map(r => [cs(r[0]), cs(r[1])]);
        if (!rows.length) throw new Error("Không có dữ liệu Code/Name");
        await idbSet("colors", { rows, date: today }); DATA.colors = rows; DATA.sources.colors = "Upload " + today;
      } else if (masterKind === "labdip") {
        const rows = aoa(wb.SheetNames[0]).slice(1).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[2]), cs(r[6]), cs(r[7]), cs(r[8])]);
        if (!rows.length) throw new Error("Không có dữ liệu labdip");
        await idbSet("labdip", { rows, date: today }); DATA.labdip = rows; DATA.sources.labdip = "Upload " + today;
      } else if (masterKind === "items") {
        if (!wb.SheetNames.includes("Generic") || !wb.SheetNames.includes("SKU")) throw new Error('File cần có sheet "Generic" và "SKU"');
        const g = aoa("Generic").slice(1).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[1]), cs(r[3]), cs(r[4]), cs(r[9]), truthy(r[18]), truthy(r[19]), cs(r[34]), truthy(r[37])]);
        const s = aoa("SKU").slice(1).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[1]), cs(r[3]), cs(r[4]), cs(r[5])]);
        await idbSet("generic", { rows: g, date: today }); await idbSet("sku", { rows: s, date: today });
        DATA.generic = g; DATA.sku = s; DATA.sources.generic = DATA.sources.sku = "Upload " + today;
      }
      buildIndexes(); rowCache.clear();
      st.innerHTML = '<span class="pill ok">Đã cập nhật master «' + masterKind + '» — dữ liệu lưu trong trình duyệt này</span>';
      refreshAdmin(); loadMastersBanner();
    } catch (e) {
      st.innerHTML = '<span class="pill err">Lỗi: ' + e.message + "</span>";
    }
  };
  function loadMastersBanner() {
    const st = document.getElementById("masterStatus");
    st.innerHTML =
      '<span class="pill ok">Color Library: ' + DATA.colors.length.toLocaleString() + " màu</span>" +
      '<span class="pill ok">Master Labdip: ' + DATA.labdip.length.toLocaleString() + " dòng</span>" +
      '<span class="pill ok">Generic: ' + DATA.generic.length.toLocaleString() + " code</span>" +
      '<span class="pill ok">SKU: ' + DATA.sku.length.toLocaleString() + " dòng</span>";
  }
  window.resetMasters = async function () {
    await idbDel(["colors", "labdip", "generic", "sku"]);
    DATA.colors = DATA.labdip = DATA.generic = DATA.sku = null; DATA.sources = {};
    rowCache.clear();
    document.getElementById("adminStatus").innerHTML = '<span class="pill ok">Đã xóa bản upload — quay về dữ liệu nhúng</span>';
    await loadMasters();
  };

  /* ---------- Tabs ---------- */
  window.showTab = function (t) {
    document.getElementById("paneProcess").classList.toggle("hidden", t !== "process");
    document.getElementById("paneAdmin").classList.toggle("hidden", t !== "admin");
    document.getElementById("tabProcess").classList.toggle("active", t === "process");
    document.getElementById("tabAdmin").classList.toggle("active", t === "admin");
  };

  loadMasters();
}

/* Cho phép test bằng Node.js */
if (typeof module !== "undefined") {
  module.exports = { norm, tight, cleanCode, DATA, IDX, buildIndexes, processOne, mapItem, findColorCandidates, matchLabdipOnItem, matchLabdipGlobal };
}
