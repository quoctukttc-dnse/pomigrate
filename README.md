# Mapping Labdip & Color — ScaX → ScaF

Website tĩnh (chạy hoàn toàn trong trình duyệt) để xử lý file lỗi Import PO:

1. **Map Item**: nếu cột `Item` trống, tự map từ `OldItem` (code ScaX) sang code ScaF theo master Material Items (ưu tiên code APPROVE, không block; ưu tiên đúng khách hàng; nếu nhiều ứng viên sẽ ghi chú).
2. **Dò Labdip**: tìm labdip code/name của Master Labdip chứa trong chuỗi `ColorItemOld` (đã UPPER, loại ký tự ẩn, bỏ ký tự đặc biệt khi so):
   - Khớp đúng item → điền cột `Lapdip`.
   - Khớp nhưng ở item khác → đưa vào danh sách **Labdip cần tạo**.
   - Không khớp → danh sách **Không thấy labdip**.
3. **Dò màu**: tìm tên màu Color Library chứa trong `ColorItemOld`:
   - Ưu tiên color code trên dòng labdip đã khớp (Master Labdip), sau đó tên khớp dài nhất, đồng hạng thì ưu tiên màu đã có SKU.
   - Điền cột `ColorItem`; nếu item chưa có SKU màu đó → danh sách **SKU cần tạo**.
   - Không thấy → danh sách **Không thấy màu**.
4. **Xuất**: file gốc đã điền (giữ nguyên format) + file báo cáo riêng (5 sheet).

## Cấu trúc

```
index.html          — giao diện (2 tab: Xử lý / Cập nhật Master)
app.js              — toàn bộ logic
libs/               — thư viện (SheetJS, ExcelJS, pako) - offline, không cần CDN
data/*.json.gz      — master data nhúng sẵn (đã nén):
  colors.json.gz    — Color Library (Code, Name)
  labdip.json.gz    — Master Labdip (RMCode, ColorCode, LapdipCode, LapdipName, ColorRange)
  generic.json.gz   — Material Items sheet Generic (các cột phục vụ mapping)
  sku.json.gz       — Material Items sheet SKU (MaterialCode, SKUCode, ColorCode, ColorName, Size)
```

## Đưa lên GitHub Pages

1. Tạo repository mới trên GitHub (ví dụ `labdip-mapping`), chọn **Public** (Pages miễn phí cần public, hoặc private với gói trả phí).
2. Upload toàn bộ nội dung thư mục này lên repo (kéo thả trên web GitHub: **Add file → Upload files**, hoặc dùng git):
   ```bash
   cd labdip-mapping-site
   git init
   git add .
   git commit -m "Labdip mapping site"
   git branch -M main
   git remote add origin https://github.com/<username>/labdip-mapping.git
   git push -u origin main
   ```
3. Vào **Settings → Pages → Source**: chọn branch `main`, folder `/ (root)` → **Save**.
4. Sau ~1 phút, site chạy tại `https://<username>.github.io/labdip-mapping/`.

> Lưu ý: nếu chứa dữ liệu nội bộ, cân nhắc dùng GitHub Enterprise/private Pages hoặc chạy nội bộ.

## Chạy thử trên máy (không cần GitHub)

Không mở trực tiếp `index.html` bằng đúp chuột (trình duyệt chặn đọc file data). Thay vào đó:

```bash
cd labdip-mapping-site
python -m http.server 8000
```

Mở `http://localhost:8000`.

## Cập nhật master data

**Cách 1 (từng máy):** tab **Cập nhật Master Data** trên website → upload file master mới (đúng cấu trúc file mẫu). Dữ liệu lưu trong trình duyệt máy đó (IndexedDB), tự dùng thay bản nhúng. Bấm *Khôi phục bản gốc* để quay về bản nhúng.

**Cách 2 (cho tất cả người dùng):** tạo lại các file `data/*.json.gz` từ file master mới rồi push lên repo. Cấu trúc JSON là mảng các mảng đúng thứ tự cột nêu trên, nén gzip.

## File mẫu master

- `Color Library 20260714.xlsx` — sheet `PRD`: cột A=Code, B=Name
- `Master File Labdip 14072026.xlsx` — sheet 1: RMCode, CustomerColorCode, CustomerColorName(=ColorCode), SupplierCode, SupplierName, SupplierRef, LapdipCode, LapdipName, ColorRange
- `Material Items List PRD 20260714.xlsx` — sheet `Generic` (39 cột) + sheet `SKU` (6 cột)

## File lỗi đầu vào

File `.xlsx`, sheet đầu tiên, dòng 1 là header, bắt buộc có các cột: `OldItem`, `Item`, `ColorItemOld`, `ColorItem`, `Lapdip` (nên có thêm `Customer` để chọn code đúng khách).
