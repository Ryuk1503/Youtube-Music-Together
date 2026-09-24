# WORKING_GUIDELINES.md — Quy trình làm việc cho AI coding agent

> File này là **ENTRY POINT** cho mọi AI coding agent làm việc trên dự án YouTube Music Together. Không tạo thêm file "AI_START_HERE" hay tương tự — đây chính là điểm khởi đầu.
> Đọc **Core Rules** trước MỌI task. Các phần sau chỉ đọc khi cần.
> Mục tiêu tổng: **tiết kiệm context / token / credit** — đọc ít nhất mà làm đúng nhất.

---

## CORE RULES (đọc trước MỌI task)

1. **Code là nguồn chân lý.** Tài liệu chỉ để định vị. Nếu docs mâu thuẫn code → xác minh bằng code, tin code, rồi cập nhật docs cũ.
2. **Tra trước khi quét.** Thứ tự bắt buộc: file này → `PROJECT_ARCHITECTURE.md` → xác định feature/file/symbol → mở file trực tiếp → search có mục tiêu (symbol/route/import/event/endpoint). Repo-wide search là phương án CUỐI CÙNG — phải dừng và hỏi user trước khi làm.
3. **Chỉ làm đúng cái được yêu cầu.** Không refactor, không cleanup, không rename, không tối ưu, không sửa bug/UI/file ngoài phạm vi. Ghi nhận các phát hiện ngoài phạm vi vào mục "Out-of-scope findings" cuối task để user quyết định.
4. **Giữ project gọn.** Chọn giải pháp thay đổi **tối thiểu**. Không thêm file/helper/abstraction/wrapper/duplicate utility khi không bắt buộc cho yêu cầu hiện tại. Ba dòng giống nhau tốt hơn một abstraction vội.
5. **Phân quyền quyết định** (mục 3.2): quyết định lớn PHẢI hỏi user trước; chi tiết nhỏ, cục bộ, rủi ro thấp thì tự quyết.
6. **Verify theo phạm vi ảnh hưởng** (mục 5): file đã sửa → dependency trực tiếp → test liên quan. KHÔNG tự động chạy full test suite / full build / scan toàn project cho thay đổi cục bộ.
7. **Thấy dấu hiệu refactor dở dang / duplicate implementation / nhiều code path song song** → KHÔNG tự chọn một path để "sửa". Dừng lại, báo cáo và hỏi user.
8. **Hoàn thành task code = Completed/Files changed/Verification/Architecture/Out-of-scope findings** (mục 6).
9. **Sau khi verify:** deploy theo `AGENTS.md` (deploy là một phần hoàn thành task, không cần hỏi lại).

---

## 1. Hiểu yêu cầu

- Xác định yêu cầu là gì, PHẠM VI ở đâu (feature nào, file nào), và điều gì KHÔNG thuộc phạm vi.
- Nếu yêu cầu mơ hồ: xem trong bối cảnh của dự án web app này (phòng nhạc, audio, auth, shop, lịch sử nghe...); tra `PROJECT_ARCHITECTURE.md` để hiểu feature trước khi hỏi user.
- Chỉ hỏi user khi thật sự thiếu thông tin quyết định — không hỏi những thứ tự tra được trong code/docs.

## 2. Định vị code (search strategy — bắt buộc theo thứ tự)

1. Đọc Core Rules (file này).
2. Tra `PROJECT_ARCHITECTURE.md` theo feature group → feature → file → symbol.
3. Xác định feature/file/symbol liên quan đến yêu cầu.
4. **Mở file trực tiếp** bằng Read (đã biết path từ bản đồ).
5. Search **có mục tiêu**: grep đúng symbol / route / import / socket event / tên bảng / endpoint — trong file hoặc module chứa nó.
6. Search **trong phạm vi module** (`server/src/utils/`, `client/src/pages/`...) khi chưa chắc vị trí.
7. Vẫn chưa đủ → **DỪNG và hỏi user** trước khi search toàn repository. Đây là phương án cuối cùng.

**Dừng khám phá ngay khi đủ context để làm việc.** Mỗi bước đọc thêm đều tốn token — không đọc cho chắc.

**Bỏ qua mặc định (không bao giờ đọc/quét):** `node_modules/`, `vendor/`, `dist/`, `build/`, `coverage/`, `.cache/`, `.git/`, generated code, lockfiles, `server/public/` (build output), `.deploy-local/` (artifacts triển khai riêng tư).

## 3. Phạm vi & quyền quyết định

### 3.1 Phạm vi

- Chỉ xử lý đúng yêu cầu. Bug/layout cũ, code xấu, dead code (xem cảnh báo kiến trúc mục 10 trong `PROJECT_ARCHITECTURE.md`) → KHÔNG sửa; chỉ ghi vào "Out-of-scope findings".
- Không thêm feature "tiện tay", không defensive coding cho kịch bản không thể xảy ra, không feature flag / backward-compatibility shim khi đổi được thẳng.

### 3.2 Quyền quyết định

**Tự quyết (nhỏ, cục bộ, rủi ro thấp):** đặt tên biến cục bộ, thứ tự helper trong cùng file, format chuỗi UI, class Tailwind, xử lý nhỏ trong một hàm, chọn cách viết idiom đã có sẵn trong codebase.

**PHẢI hỏi user trước:** database schema, migration, API contract, public interface, thay đổi kiến trúc, ranh giới module, auth/permission, dependency lớn, **thêm package mới**, data model, hành vi lưu bền vững (persistent behavior), backward compatibility, core business behavior, thiết kế cross-module.

### 3.3 Báo cáo ảnh hưởng TRƯỚC khi sửa

Nếu thay đổi chạm tới bất kỳ điều nào dưới đây, mô tả trước cho user ảnh hưởng dự kiến rồi mới sửa:
- ≥ 5 files, hoặc ≥ 2 modules
- Database (schema/data)
- API contract
- Kiến trúc
- Dependency quan trọng

## 4. Chỉnh sửa

- **Minimal diff.** Sửa đúng chỗ cần sửa; giữ style của code xung quanh (server: CommonJS `require`; client: ESM; UI text tiếng Việt; chú thích gần như không có — chỉ giải thích WHY không hiển nhiên).
- Convention phải tuân theo:
  - Mọi REST call từ client đi qua `client/src/api/index.js` (axios instance đã gắn CSRF header `X-YTM-Request: 1`) — không tự tạo fetch/axios mới (trừ `client/src/audioDiagnostics.js` đã cố ý tách).
  - Notes là số lớn: dùng BigInt ở client, BIGINT/thận trọng ở server.
  - Socket event mới: đặt tên theo pattern `group:action` hiện có; tra bảng events trong `PROJECT_ARCHITECTURE.md` mục 3.5 trước khi đặt tên trùng.
  - Test: `node:test`, file `*.test.js` đặt **cạnh** module được test.
  - KHÔNG sửa trực tiếp `server/public/` — đó là build output của `client/`.
- Không tạo file mới nếu yêu cầu giải quyết được trong file hiện có. Không tạo file kế hoạch/analytic/tổng hợp tạm trong repo.

## 5. Kiểm chứng (theo phạm vi ảnh hưởng)

| Phạm vi thay đổi | Phải verify |
|---|---|
| 1 file, nội bộ | Đọc lại file đã sửa; chạy test của module đó nếu có |
| Vài file cùng module | Test các file liên quan (`node --test src/utils/foo.test.js` từ `server/`, tương tự client); test trực tiếp của dependency |
| API contract / socket event | Test route/socket tương ứng + spot-check client gọi đến nó |
| Build-affected (client UI) | `npm run build` ở `client/`; kiểm tra feature trong browser nếu có thể |
| DB | Test có DB (`TEST_DATABASE_URL`); không đụng production trước khi deploy |

- KHÔNG auto chạy full test suite / full build / full project scan cho thay đổi cục bộ.
- Với UI change: nếu không test được trong browser, nói rõ là chưa verify UI — không tuyên bố thành công.

## 6. Cập nhật tài liệu

- **Chỉ cập nhật docs bị ảnh hưởng trực tiếp** khi code change làm docs đó sai. Không viết lại docs không liên quan.
- **`PROJECT_ARCHITECTURE.md`:** chỉ cập nhật khi có thay đổi kiến trúc THẬT — file/feature/sub-feature quan trọng mới hoặc bị di chuyển/xóa, trách nhiệm module đổi, symbol quan trọng đổi, dependency quan trọng đổi, luồng data/API đổi. KHÔNG cập nhật cho bug fix hay thay đổi cài đặt nội bộ.
- **Decision log:** chỉ ghi quyết định có giá trị dài hạn (kiến trúc, ràng buộc, workaround, migration, legacy issue) — và ghi vào chính docs liên quan (`NATIVE_AUDIO.md`, `MUSIC_HISTORY.md`... theo pattern hiện có), không tạo file log riêng cho quyết định nhỏ.
- **Trước khi tạo doc mới:** kiểm tra docs hiện có (README, NATIVE_AUDIO, MUSIC_HISTORY, SECURITY_REVIEW, AGENTS, PROJECT_ARCHITECTURE, file này) — ưu tiên reuse/update; không nhân bản nội dung; không đổi tên file hiện có khi chưa cần.

## 7. Deploy (sau khi verify)

Theo `AGENTS.md` (trích ý):
- Deploy là một phần của hoàn thành task — KHÔNG hỏi lại quyền deploy.
- Backup các production file bị ảnh hưởng trước khi upload; giữ nguyên data/session hiện có.
- Publish **cả frontend build** đi kèm backend (upload backend-only không hoàn thành UI change).
- Backend cần restart: hướng dẫn user bấm **Web > Sites > Restart** trên alwaysdata (user tự làm bước này).
- Sau deploy phải verify site công khai. Không báo "deploy xong" nếu backend vẫn chờ restart.

## 8. Output format (cuối mỗi task code)

```
Completed:
<việc đã làm, 1-2 câu>

Files changed:
- <path> — <thay đổi ngắn>

Verification:
<những gì đã check/chạy + kết quả; nói rõ cái gì chưa verify được>

Architecture:
<Changed/Not changed. Nếu changed: PROJECT_ARCHITECTURE.md đã cập nhật chưa.>

Out-of-scope findings:  (chỉ khi có)
- <phát hiện ngoài phạm vi, để user quyết>
```

Không tường thuật quá trình giữa chừng trong báo cáo cuối.

## 9. Ngôn ngữ & style tài liệu

- Mô tả bằng **tiếng Việt**, giữ nguyên thuật ngữ kỹ thuật English (JWT, middleware, range request...).
- Tiêu đề section có thể English; identifier/tên hàm/tên bảng/biến **không bao giờ** dịch.
- Ưu tiên: rõ ràng, ngắn, có cấu trúc, dễ search, AI-friendly (bảng, list, path chính xác).

## 10. Bản đồ nhanh

- Kiến trúc & định vị feature/file/symbol: **`PROJECT_ARCHITECTURE.md`** (kèm cảnh báo legacy/dead code ở mục 10 của nó).
- Audio pipeline chi tiết: `NATIVE_AUDIO.md`. Lịch sử nghe + BXH + reset: `MUSIC_HISTORY.md`. Bảo mật: `SECURITY_REVIEW.md`. Chạy local + tổng quan: `README.md`. Deploy: `AGENTS.md`.
