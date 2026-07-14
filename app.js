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
/* Bỏ dấu tiếng Việt (Trần → TRAN) để so tên người/khách hàng */
function stripVN(s) {
  return norm(String(s).normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").replace(/đ/g, "d").replace(/Đ/g, "D"));
}

function cleanCode(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}
const EMPTYISH = new Set(["", "UNKNOWN", "0", "0.0", "NULL", "N/A"]);

/* ---------------- Dữ liệu & chỉ mục ---------------- */
const DATA = { colors: null, labdip: null, generic: null, sku: null, customers: null, suppliers: null, ms: null, meta: null, sources: {} };
const MASTER_KEYS = ["colors", "labdip", "generic", "sku", "customers", "suppliers", "ms"];
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
  // Generic theo ScaX — format 11 cột:
  // [scaf, scax, cntSKU, supRef, supScaX, supScaF, cust, mngColor, mngSize, status, block]
  IDX.genByScax = new Map();
  DATA.generic.forEach(r => {
    const e = {
      scaf: cleanCode(r[0]), scax: cleanCode(r[1]), cnt: Number(r[2] || 0), supRef: r[3] || "",
      supScaX: cleanCode(r[4]).toUpperCase(), supScaF: cleanCode(r[5]),
      cust: String(r[6] || "").trim(), mngColor: !!r[7], mngSize: !!r[8],
      status: String(r[9] || "").trim().toUpperCase(), block: !!r[10]
    };
    if (!e.scax) return;
    e.custCode = e.cust ? cleanCode(e.cust.split(" - ")[0]) : "";
    let arr = IDX.genByScax.get(e.scax);
    if (!arr) IDX.genByScax.set(e.scax, arr = []);
    arr.push(e);
  });
  // Customer master: [code, name, search, active]
  IDX.custByCode = new Map();
  IDX.custSearch = [];
  (DATA.customers || []).forEach(r => {
    const e = { code: cleanCode(r[0]), name: String(r[1] || "").trim(), search: String(r[2] || "").trim(), active: !!r[3] };
    e.tSearch = tight(stripVN(e.search));
    e.tName = tight(stripVN(e.name));
    IDX.custByCode.set(e.code, e);
    if (e.tSearch.length >= 2) IDX.custSearch.push(e);
  });
  IDX.custSearch.sort((a, b) => b.tSearch.length - a.tSearch.length);
  // Supplier profile: [scafCode, scaxCode, name, active, status]
  IDX.supByScax = new Map();
  (DATA.suppliers || []).forEach(r => {
    const e = { scaf: cleanCode(r[0]), scax: cleanCode(r[1]).toUpperCase(), name: String(r[2] || "").trim(), active: !!r[3], status: String(r[4] || "").toUpperCase() };
    if (e.scax && !IDX.supByScax.has(e.scax)) IDX.supByScax.set(e.scax, e);
  });
  // MS: [username, fullname]
  IDX.msList = (DATA.ms || []).map(r => {
    const u = cleanCode(r[0]), f = String(r[1] || "").trim();
    return { user: u, full: f, tokens: stripVN(f).split(" ").filter(Boolean), tFull: tight(stripVN(f)) };
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

/* ---------------- Khách hàng: xác định "nhóm khách" từ chuỗi customer của PO ---------------- */
/* PO ghi customer kiểu ScaX (vd "DBI02IT") → tìm SearchName dài nhất là tiền tố (vd "DBI") */
function custKeyFromPO(poCust) {
  const t = tight(stripVN(poCust));
  if (!t) return null;
  for (const e of IDX.custSearch) {           // đã sort dài → ngắn
    if (t.startsWith(e.tSearch)) return e.tSearch;
  }
  for (const e of IDX.custSearch) {
    if (e.tName && t.startsWith(e.tName)) return e.tSearch;
  }
  return null;
}
/* Nhóm khách của 1 dòng generic (map mã khách → SearchName trong Customer master) */
function custKeyOfGeneric(row) {
  if (!row.cust) return "";                   // code generic dùng chung
  const e = IDX.custByCode.get(row.custCode);
  if (e) return e.tSearch || e.tName;
  const name = row.cust.split(" - ").slice(1).join(" - ");
  return tight(stripVN(name || row.cust));
}

/* ---------------- Map ScaX -> ScaF (kiểm tra supplier + customer, mục D/K/L hướng dẫn) ---------------- */
function mapItem(scax, customer, supplier) {
  const rows = IDX.genByScax.get(cleanCode(scax));
  if (!rows || !rows.length) return { item: "", note: "Không tìm thấy OldItem (ScaX) trong master" };
  const notes = [];
  const oper = rows.filter(r => r.status === "APPROVE" && !r.block);
  if (!oper.length) notes.push("⚠ Không có code vận hành (APPROVE, không block)");
  let pool = oper.length ? oper : rows;

  // 1. Kiểm SUPPLIER (mục K): PO Supplier là mã ScaX → khớp cột Supplier Code ScaX của master,
  //    hoặc bắc cầu qua Supplier Profile (ScaX Code → Supplier Code ScaF)
  const poSup = cleanCode(supplier).toUpperCase();
  if (poSup) {
    const prof = IDX.supByScax.get(poSup);
    const supMatch = pool.filter(r => r.supScaX === poSup || (prof && r.supScaF && r.supScaF === prof.scaf));
    if (supMatch.length) {
      pool = supMatch;
      if (prof && (!prof.active || prof.status.indexOf("APPROVE") !== 0)) {
        notes.push("⚠ NCC " + poSup + " (" + prof.scaf + ") chưa APPROVE/inactive trong Supplier Profile");
      }
      if (prof) {
        const mism = supMatch.filter(r => r.supScaF && r.supScaF !== prof.scaf);
        if (mism.length) notes.push("⚠ Supplier ScaF trong material master (" + mism[0].supScaF + ") ≠ Supplier Profile (" + prof.scaf + ") — cần rà");
      }
    } else {
      notes.push("⚠ KHÔNG có code ScaF nào của " + cleanCode(scax) + " khớp supplier " + poSup + (prof ? " (ScaF " + prof.scaf + ")" : " (không thấy trong Supplier Profile)"));
    }
  }

  // 2. Kiểm CUSTOMER (mục L): so theo MÃ/nhóm khách, không so tên thô
  const poKey = custKeyFromPO(customer);
  const exact = poKey ? pool.filter(r => r.cust && custKeyOfGeneric(r) === poKey) : [];
  const generics = pool.filter(r => !r.cust);
  let chosen = null;
  if (exact.length) {
    chosen = exact.find(r => r.cnt < 999) || exact[0];
    notes.push("Code đúng khách " + (((IDX.custByCode.get(chosen.custCode) || {}).name) || chosen.cust));
  } else if (generics.length) {
    chosen = generics.find(r => r.cnt < 999) || generics[0];
    if (poKey) notes.push("Dùng code generic (khách " + norm(customer) + " chưa có code riêng)");
  } else if (!poKey) {
    chosen = pool[0];
    notes.push("⚠ Không xác định được khách «" + norm(customer) + "» trong Customer master — chọn tạm " + pool[0].scaf + ", cần kiểm tay");
  } else {
    // chỉ còn code của khách KHÁC → tuyệt đối không map (mục L.5)
    const others = [...new Set(pool.map(r => r.cust))].filter(Boolean);
    return { item: "", note: "✗ CHỈ CÓ CODE CỦA KHÁCH KHÁC (" + others.slice(0, 3).join("; ") + ") — cần mở code cho khách " + norm(customer), needNewCode: true };
  }

  const distinct = [...new Set(pool.map(r => r.scaf))];
  if (distinct.length > 1) notes.push("(" + distinct.length + " code ScaF ứng viên: " + distinct.join(", ") + ")");
  if (chosen.cnt >= 999) notes.push("⚠ Code đã " + chosen.cnt + " SKU (giới hạn 999)");
  return { item: chosen.scaf, note: notes.join(" · ") };
}

/* ---------------- Chuẩn hóa MS (dò gần đúng theo danh sách MS ScaF) ---------------- */
/* Trả về {value, status: OK|AMBIGUOUS|NOTFOUND|EMPTY, candidates} — value dạng "UserName-FULLNAME" */
function matchMS(raw) {
  const r0 = String(raw == null ? "" : raw).trim();
  if (!r0) return { value: "", status: "EMPTY", candidates: [] };
  // nếu đã có dạng "1.004114-..." thì tách phần tên/mã để dò lại
  let q = r0;
  const mUser = q.match(/^(\d\.\d{4,})\s*[-–]?\s*(.*)$/);
  if (mUser) {
    const byUser = IDX.msList.find(m => m.user === mUser[1]);
    if (byUser) return { value: byUser.user + "-" + byUser.full, status: "OK", candidates: [byUser] };
    q = mUser[2] || q;
  }
  const qTokens = stripVN(q).split(" ").filter(Boolean);
  const qT = tight(stripVN(q));
  if (!qTokens.length) return { value: "", status: "NOTFOUND", candidates: [] };
  // 1. Trùng nguyên tên
  let hits = IDX.msList.filter(m => m.tFull === qT);
  // 2. Toàn bộ token của input nằm trong tên đầy đủ (không xét thứ tự)
  if (!hits.length) hits = IDX.msList.filter(m => qTokens.every(t => m.tokens.includes(t)));
  // 3. Chuỗi input là phần cuối của tên (vd "THẢO" ~ "VŨ NGỌC THẢO")
  if (!hits.length) hits = IDX.msList.filter(m => m.tFull.endsWith(qT));
  if (!hits.length) return { value: "", status: "NOTFOUND", candidates: [] };
  if (hits.length === 1) return { value: hits[0].user + "-" + hits[0].full, status: "OK", candidates: hits };
  return { value: "", status: "AMBIGUOUS", candidates: hits.slice(0, 6) };
}

/* ---------------- Xử lý 1 dòng ---------------- */
const rowCache = new Map(); // cache theo (item + colorStr)
function processOne(oldItem, itemFilled, colorStr, customer, supplier) {
  const res = {
    item: cleanCode(itemFilled), itemNote: "",
    colorCode: "", colorName: "", labdipCode: "", labdipName: "",
    skuMissing: false, colorNotFound: false, needNewCode: false,
    ldStatus: "", ldGlobalHits: [], status: [], candidates: []
  };
  // 1. Item (kèm kiểm tra supplier + customer)
  if (!res.item) {
    const m = mapItem(oldItem, customer, supplier);
    res.item = m.item;
    res.itemNote = m.note;
    res.needNewCode = !!m.needNewCode;
    if (!res.item) { res.status.push("KHÔNG MAP ĐƯỢC ITEM" + (m.note ? ": " + m.note : "")); return res; }
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
    const r = await fetch("data/" + name + ".json.gz", { cache: "no-store" });
    if (!r.ok) throw new Error("Không tải được data/" + name + ".json.gz (HTTP " + r.status + ")");
    const buf = new Uint8Array(await r.arrayBuffer());
    // Server có thể đã tự giải nén (Content-Encoding) → kiểm tra magic bytes gzip 1F 8B
    const bytes = (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) ? pako.inflate(buf) : buf;
    const txt = new TextDecoder("utf-8").decode(bytes);
    const c0 = txt.trimStart().charAt(0);
    if (c0 !== "[" && c0 !== "{") throw new Error("data/" + name + ".json.gz trả về nội dung lạ (bắt đầu bằng «" + txt.slice(0, 30) + "…»). Kiểm tra file có được upload đầy đủ lên server không.");
    return JSON.parse(txt);
  }
  async function loadMasters() {
    const st = document.getElementById("masterStatus");
    try {
      for (const k of MASTER_KEYS) {
        const local = await idbGet(k);
        if (local) { DATA[k] = local.rows; DATA.sources[k] = "Upload " + local.date; }
      }
      const need = MASTER_KEYS.filter(k => !DATA[k]);
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
        '<span class="pill ok">Khách hàng: ' + DATA.customers.length.toLocaleString() + "</span>" +
        '<span class="pill ok">NCC: ' + DATA.suppliers.length.toLocaleString() + "</span>" +
        '<span class="pill ok">MS: ' + DATA.ms.length.toLocaleString() + "</span>" +
        '<br><span class="small">Nguồn: Color=' + DATA.sources.colors + " · Labdip=" + DATA.sources.labdip + " · Items=" + DATA.sources.generic +
        " · KH=" + DATA.sources.customers + " · NCC=" + DATA.sources.suppliers + " · MS=" + DATA.sources.ms + "</span>";
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
      const r0 = processOne(oldItem, get("Item").trim(), get("ColorItemOld"), get("Customer").trim(), get("Supplier").trim());
      const r = Object.assign({}, r0, { status: r0.status.slice() }); // tách khỏi cache trước khi gắn thông tin MS
      // Chuẩn hóa MS (cột T)
      const msRaw = H["MS"] ? get("MS").trim() : "";
      const ms = matchMS(msRaw);
      if (ms.status === "OK" && H["MS"]) row.getCell(H["MS"]).value = ms.value;
      r.msRaw = msRaw; r.msValue = ms.value; r.msStatus = ms.status;
      r.msCandidates = ms.candidates.map(c => c.user + "-" + c.full).join("; ");
      if (ms.status === "NOTFOUND") r.status.push("✗ MS «" + msRaw + "» không thấy trong danh sách MS ScaF");
      if (ms.status === "AMBIGUOUS") r.status.push("⚠ MS «" + msRaw + "» có " + ms.candidates.length + " ứng viên: " + r.msCandidates);
      if (ms.status === "OK" && ms.value !== msRaw) r.status.push("MS chuẩn hóa: " + ms.value);
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
    const skuNew = new Map(), ldNew = new Map(), noColor = [], noLd = [], msIssues = [], newCode = [];
    for (const r of results) {
      if (r.msStatus === "NOTFOUND" || r.msStatus === "AMBIGUOUS") msIssues.push(r);
      if (r.needNewCode) newCode.push(r);
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
    return { skuNew: [...skuNew.values()], ldNew: [...ldNew.values()], noColor, noLd, msIssues, newCode };
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
      '<div class="sumbox"><b style="color:var(--err)">' + a.noLd.length + "</b><span>Không thấy labdip</span></div>" +
      '<div class="sumbox"><b style="color:var(--warn)">' + a.msIssues.length + "</b><span>MS cần kiểm tra</span></div>" +
      (a.newCode.length ? '<div class="sumbox"><b style="color:var(--err)">' + a.newCode.length + "</b><span>Cần mở code mới</span></div>" : "");
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
    } else if (kind === "ms") {
      t.innerHTML = "<tr><th>Dòng</th><th>MS gốc</th><th>Tình trạng</th><th>Ứng viên</th></tr>" +
        a.msIssues.map(r => "<tr><td>" + r.rowNum + "</td><td>" + esc(r.msRaw) + "</td><td>" + (r.msStatus === "NOTFOUND" ? "Không thấy" : "Nhiều ứng viên") + "</td><td>" + esc(r.msCandidates) + "</td></tr>").join("");
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
    add("Tong hop", ["Dòng", "OldItem", "Item", "Customer", "ColorItemOld", "ColorItem", "Tên màu", "Lapdip", "Tên labdip", "MS", "Trạng thái"],
      results.map(r => [r.rowNum, r.oldItem, r.item, r.customer, r.colorOld, r.colorCode, r.colorName, r.labdipCode, r.labdipName, r.msValue || r.msRaw || "", r.status.join(" · ")]));
    add("SKU can tao", ["Item", "ColorCode", "Tên màu", "Các dòng"], a.skuNew.map(r => [r.item, r.colorCode, r.colorName, r.rows.join(", ")]));
    add("Labdip can tao", ["Item cần tạo", "LabdipCode", "Tên labdip", "Đang có ở item", "ColorItemOld", "Các dòng"],
      a.ldNew.map(r => [r.item, r.labdip, r.labdipName, r.foundAt, r.colorOld, r.rows.join(", ")]));
    add("Khong thay mau", ["Dòng", "Item", "ColorItemOld"], a.noColor.map(r => [r.rowNum, r.item, r.colorOld]));
    add("Khong thay labdip", ["Dòng", "Item", "ColorItemOld"], a.noLd.map(r => [r.rowNum, r.item, r.colorOld]));
    add("MS can kiem tra", ["Dòng", "MS gốc", "Tình trạng", "Ứng viên"],
      a.msIssues.map(r => [r.rowNum, r.msRaw, r.msStatus === "NOTFOUND" ? "Không thấy" : "Nhiều ứng viên", r.msCandidates]));
    add("Can mo code moi", ["Dòng", "OldItem", "Customer", "Ghi chú"],
      a.newCode.map(r => [r.rowNum, r.oldItem, r.customer, r.itemNote]));
    saveBlob(await wb.xlsx.writeBuffer(), origName + "_bao_cao.xlsx");
  };

  /* ---------- Admin ---------- */
  function refreshAdmin() {
    const set = (id, v) => document.getElementById(id).textContent = v;
    set("srcColors", DATA.sources.colors || "—"); set("cntColors", DATA.colors ? DATA.colors.length.toLocaleString() : "—");
    set("srcLabdip", DATA.sources.labdip || "—"); set("cntLabdip", DATA.labdip ? DATA.labdip.length.toLocaleString() : "—");
    set("srcItems", DATA.sources.generic || "—"); set("cntItems", DATA.generic ? (DATA.generic.length.toLocaleString() + " / SKU " + DATA.sku.length.toLocaleString()) : "—");
    set("srcCust", DATA.sources.customers || "—"); set("cntCust", DATA.customers ? DATA.customers.length.toLocaleString() : "—");
    set("srcSup", DATA.sources.suppliers || "—"); set("cntSup", DATA.suppliers ? DATA.suppliers.length.toLocaleString() : "—");
    set("srcMs", DATA.sources.ms || "—"); set("cntMs", DATA.ms ? DATA.ms.length.toLocaleString() : "—");
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
        const g = aoa("Generic").slice(1).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[1]), cs(r[3]), cs(r[4]), cs(r[5]), cs(r[6]), cs(r[9]), truthy(r[18]), truthy(r[19]), cs(r[34]), truthy(r[37])]);
        const s = aoa("SKU").slice(1).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[1]), cs(r[3]), cs(r[4]), cs(r[5])]);
        await idbSet("generic", { rows: g, date: today }); await idbSet("sku", { rows: s, date: today });
        DATA.generic = g; DATA.sku = s; DATA.sources.generic = DATA.sources.sku = "Upload " + today;
      } else if (masterKind === "customers") {
        const rows = aoa(wb.SheetNames[0]).slice(1).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[1]), cs(r[2]), truthy(r[4])]);
        if (!rows.length) throw new Error("Không có dữ liệu khách hàng");
        await idbSet("customers", { rows, date: today }); DATA.customers = rows; DATA.sources.customers = "Upload " + today;
      } else if (masterKind === "suppliers") {
        const all = aoa(wb.SheetNames[0]);
        // header ở dòng 2 (dòng 1 là tiêu đề "Supplier Profile List")
        const start = String(all[0][0]).toLowerCase().includes("supplier profile") ? 2 : 1;
        const tr = v => ["true", "1", "yes", "checked"].includes(String(v).trim().toLowerCase()) ? 1 : 0;
        const rows = all.slice(start).filter(r => cs(r[0])).map(r => [cs(r[0]), cs(r[1]), cs(r[2]), tr(r[27]), String(r[28] || "").toUpperCase()]);
        if (!rows.length) throw new Error("Không có dữ liệu supplier");
        await idbSet("suppliers", { rows, date: today }); DATA.suppliers = rows; DATA.sources.suppliers = "Upload " + today;
      } else if (masterKind === "ms") {
        const sheet = wb.SheetNames.includes("MS ScaF") ? "MS ScaF" : wb.SheetNames[0];
        const rows = aoa(sheet).slice(1).filter(r => cs(r[0]) && cs(r[1])).map(r => [cs(r[0]), cs(r[1])]);
        if (!rows.length) throw new Error("Không có dữ liệu MS (cần sheet MS ScaF: UserName, FullName)");
        await idbSet("ms", { rows, date: today }); DATA.ms = rows; DATA.sources.ms = "Upload " + today;
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
  /* Xuất master hiện tại thành 4 file .json.gz để đẩy lên repo GitHub */
  window.exportMasters = function () {
    if (!DATA.colors) { document.getElementById("adminStatus").innerHTML = '<span class="pill err">Master chưa tải xong</span>'; return; }
    for (const k of MASTER_KEYS) {
      const gz = pako.gzip(JSON.stringify(DATA[k]));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([gz], { type: "application/gzip" }));
      a.download = k + ".json.gz"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    document.getElementById("adminStatus").innerHTML = '<span class="pill ok">Đã tải ' + MASTER_KEYS.length + ' file — upload chúng vào thư mục data/ trên GitHub (đè file cũ)</span>';
  };

  window.resetMasters = async function () {
    await idbDel(MASTER_KEYS);
    MASTER_KEYS.forEach(k => DATA[k] = null); DATA.sources = {};
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
  module.exports = { norm, tight, stripVN, cleanCode, DATA, IDX, buildIndexes, processOne, mapItem, matchMS, custKeyFromPO, findColorCandidates, matchLabdipOnItem, matchLabdipGlobal };
}
