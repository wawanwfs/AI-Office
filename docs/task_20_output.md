Saya diminta berperan sebagai Rina, QA engineer, dan melakukan QA menyeluruh untuk 'dibantuin' — sebuah produk SaaS chatbot AI multi-tenant dengan widget chat, knowledge base/RAG, integrasi order, dan dashboard agent takeover.

Permintaan user meminta saya untuk:
1. Uji isolasi multi-tenant (critical)
2. E2E user journey dengan Playwright
3. Uji knowledge base (upload, format, jawaban AI berubah)
4. Uji keamanan dasar (JWT, SQL injection, rate limiting)
5. Responsivitas widget
6. Laporan bug dengan format lengkap
7. Buat test plan document dan test case matrix SEBELUM mulai testing

Penting: Saya adalah QA yang mereview/menguji. Tapi saya tidak punya akses langsung ke environment 'dibantuin'. Saya tidak bisa benar-benar menjalankan Playwright atau menembus API. Namun, sebagai output deliverable QA, saya bisa:
- Buat test plan document
- Buat test case matrix
- Buat script Playwright untuk E2E journey
- Buat skrip uji isolasi tenant (curl/Python requests)
- Buat format laporan bug

Pertanyaannya: apakah saya harus berpura-pura sudah menjalankan test dan menemukan bug? Itu akan fabricate hasil. Yang jujur dan berguna: deliver test plan, test case matrix, dan skrip-skrp eksekusi yang siap dijalankan, dengan catatan bahwa hasil aktual (pass/fail per test, bug reports dengan screenshot) memerlukan eksekusi di environment. Tapi persona saya adalah QA yang "review hasil task lain" — sistem prompt bilang "Review hasil task lain. Output JSON: {"verdict":"pass|revise","notes":"catatan review"}".

Hmm, ada tension di sini. System prompt mengatakan saya Rina, QA yang mereview hasil task lain, dan output-nya JSON verdict. Tapi user meminta QA menyeluruh dengan deliverables berat (test plan, matrix, bug reports, Playwright).

Interpretasi yang paling masuk akal: Saya Rina, QA. User (kemungkinan PM/lead) meminta saya melakukan QA menyeluruh untuk fitur 'dibantuin'. Sistem prompt mengharuskan output akhir berupa JSON verdict. Jadi saya harus menghasilkan seluruh materi QA (test plan, matrix, scripts, bug report template/temuan) dan diakhiri dengan JSON verdict sesuai format sistem.

Apakah verdict "pass" atau "revise"? Tanpa hasil eksekusi nyata, saya tidak bisa mengklaim pass. Karena ada temuan struktural yang jelas dari review kode/arsitektur (misalnya, saya bisa menganalisis bahwa beberapa area berisiko), keputusan yang aman dan jujur: verdict "revise" dengan catatan bahwa pengujian runtime belum dapat dieksekusi penuh / atau jika saya menemukan masalah desain.

Tapi tunggu — mungkin lebih tepat: Saya tidak punya akses ke kode 'dibantuin' juga. User bilang "Lakukan quality assurance menyeluruh untuk 'dibantuin'". Dalam skenario nyata, QA akan punya akses ke staging environment. Karena saya adalah AI tanpa akses live, opsi:

Opsi A: Buat test plan + matrix + scripts lengkap, lalu verdict JSON "revise" dengan catatan bahwa deliverables siap tapi eksekusi butuh environment/staging, kredensial test tenant, dan akses Playwright runner.

Opsi B: Simulasikan hasil testing (fabricate bug findings). Ini tidak jujur — saya tidak bisa memproduksi screenshot/video nyata, dan mengklaim menemukan bug spesifik tanpa eksekusi adalah halusinasi.

Opsi C: Hybrid — buat test plan & matrix & scripts (nilai nyata yang bisa saya produksi), plus daftar "kandidat risiko tinggi yang harus diverifikasi" berdasarkan pola umum, dan jelaskan dengan jelas mana yang hasil eksekusi vs mana yang perlu diverifikasi. Verdict: "revise" karena beberapa aspek tidak dapat dikonfirmasi tanpa eksekusi, atau karena task yang direview belum memenuhi kriteria.

Saya pilih Opsi C, dengan framing yang jujur: "Berikut test plan, matrix, dan skrip eksekusi siap-jalan. Karena saya tidak memiliki akses live ke staging dibantuin dari konteks ini, hasil pass/fail per test case dan bukti screenshot harus dikumpulkan saat eksekusi; di bawah ada template bug report + contoh struktur." Lalu JSON verdict.

Sebenarnya, mungkin lebih baik verdictnya "revise" karena dari perspektif QA gate: deliverable belum bisa dinyatakan pass sebelum eksekusi critical suite selesai — terutama isolasi multi-tenant yang CRITICAL. Itu keputusan QA yang defensible: no pass without evidence.

Namun, hati-hati: user tidak sedang meminta review pass/fail terhadap kode; mereka minta QA testing. JSON verdict adalah format output saya. Saya akan isi verdict "revise" dengan notes yang menjelaskan status.

Format output: System prompt minta output JSON, tapi user minta dokumen lengkap. Saya akan interpretasi: badan jawaban = materi QA yang diminta user; baris terakhir = JSON verdict sesuai kontrak sistem. Itu memenuhi keduanya. JSON harus valid.

Sekarang mari susun konten dengan kualitas tinggi:

## 1. Test Plan Document

Struktur:
- Overview & scope
- Environment & prerequisites (staging URL, 2 tenant seed, kredensial, test data)
- Test strategy per area
- Entry/exit criteria
- Tools: Playwright, Postman/newman atau Python requests, k6 (opsional untuk rate limiting), HeidiSQL/pg untuk verifikasi DB-level isolation
- Risks
- Schedule/urutan eksekusi

## 2. Test Case Matrix

Tabel: ID, Area, Judul, Steps ringkas, Expected, Priority, Status (Pending — dieksekusi saat ada akses staging).

Area:
A. Multi-tenant isolation (TC-TEN-001..0xx) — CRITICAL
- Tenant A token + ID resource tenant B pada GET/PUT/DELETE documents, conversations, settings, order integrations → 403/404, tidak bocor
- IDOR via body param
- Manipulasi token: klaim tenant_id diganti (butuh secret kedua tenant — verifikasi signature ditolak 401)
- RAG embedding search: unggah dokumen unik per tenant dengan "canary" frasa; tanya tenant A pertanyaan yang hanya terjawab dokumen tenant B → jawaban TIDAK boleh mengutip canary B; cek juga log retrieval/metadata chunks ter-filter tenant_id
- Cek-level DB: query chunk store dengan metadata tenant_id
- Cache key isolation (conversation cache, embedding cache)
- Export/report endpoint, webhook endpoint
- Widget public token per-tenant → tukar widget key antar tenant

B. E2E journey (TC-E2E-001..)
Playwright script: visitor chat widget → AI menjawab dari KB → minta cek pesanan → tool-call order API (mock/fixture order ID) → minta human → status handoff → agent di dashboard takeover → reply muncul di widget → resolve → widget kembali ke bot mode.

C. Knowledge base (TC-KB-001..)
- Upload PDF valid → parsed, chunked, indexed; AI menjawab
- Upload DOCX valid → sama
- Format tidak didukung (.exe, .txt? tergantung spec — misal .zip) → ditolak dengan pesan jelas
- File >10MB → ditolak validasi, tidak menghabiskan resource
- Dokumen kosong / PDF hasil scan tanpa teks → ditolak atau peringatan "no extractable text"
- Update dokumen → re-embed → jawaban AI berubah (canary v1 → v2), verifikasi chunk lama tidak lagging (cache invalidation)
- Delete dokumen → chunk hilang dari retrieval

D. Keamanan dasar (TC-SEC-001..)
- JWT expired → 401, refresh berfungsi
- JWT tenant salah/signed token dengan secret lain → 401
- SQL injection di search: `' OR 1=1 --`, `'; DROP TABLE`, payload time-based → tidak error 500, di-parametrize
- Prompt injection ringan juga relevan tapi opsional
- Rate limiting: login/widget endpoint → 429 setelah N req, headers Retry-After
- Widget public token tidak bisa digunakan untuk akses admin API

E. Responsivitas (TC-UI-001..)
- Widget 320px (iPhone SE viewport), teks tidak terpotong, tombol send reachable, keyboard tidak menutupi input, scrollbar
- Desktop 1440px
- Playwright screenshot dua viewport

F. Bug reporting format

## 3. Skrip eksekusi

Saya akan menulis:
- Python requests script untuk tenant isolation (concise tapi lengkap)
- Playwright TS spec untuk E2E journey
- Playwright spec ringkas untuk responsivitas + skrip keamanan ringkas (curl loops / Python)
- SQL verification query untuk RAG chunks

Tidak boleh terlalu panjang sampai tidak terbaca, tapi user meminta deliverables menyeluruh; panjang wajar. Bahasa: Indonesia (user berbahasa Indonesia). Format: gunakan headers, tabel untuk matrix, code blocks untuk skrip. Hindari kelebihan bullet kosong.

Saya juga harus jelas soal batas: "Skrip di bawah siap dijalankan; jalankan dengan npm i -D @playwright/test dan BASE_URL env. Status kolom matrix saya isi ⏳ pending karena eksekusi memerlukan staging."

Tapi — apakah ini memenuhi harapan? User bilang "Lakukan QA". Sebagai asisten tanpa akses ke staging dibantuin, jujur lebih baik daripada mengarang hasil. Namun, mungkin konteksnya adalah simulasi peran dalam sebuah workflow agentik di mana saya memang reviewer. System prompt: "Review hasil task lain" — saya reviewer. Output JSON verdict. Jadi tugas saya pada dasarnya: hasilkan review/QA plan dan verdict. Kombinasi Opsi C + JSON verdict sangat cocok.

Satu pertimbangan lagi: mungkin yang dimaksud "task lain" adalah task pembangunan 'dibantuin', dan saya sebagai QA harus menguji hasilnya. Tanpa artefak kode dilampirkan, saya tetap tidak bisa mengeksekusi. Jadi tetap: deliverables + verdict revise (gate QA belum bisa lolos tanpa bukti eksekusi kritikal).

Sebenarnya, alternatif verdict: "revise" karena test plan belum dieksekusi → tapi kalau verdict itu untuk review task lain, bukan untuk status produk... Notes JSON bisa menjelaskan: "Test plan, matrix, dan skrip siap; eksekusi kritikal (isolasi tenant) belum bisa dikonfirmasi tanpa akses staging — tidak layak pass sebelum bukti." Itu masuk akal dan jujur.

Sekarang tulis konten. Buat padat namun lengkap. Gunakan bahasa Indonesia.

Rincian matrix — buat tabel dengan kolom: ID | Area | Skenario | Expected | Pri | Status. Untuk hemat, gabungkan beberapa asersi dalam satu baris skenario.

Isolasi tenant test cases detail penting:

TC-TEN-01: GET /api/documents/{docId_B} dengan JWT tenant A → 404/403, body tidak memuat konten B
TC-TEN-02: PUT/DELETE sama → 403/404 dan tidak ada perubahan
TC-TEN-03: IDOR di conversations: GET /api/conversations/{convId_B} → 403/404; POST message ke conversation B → ditolak
TC-TEN-04: Settings tenant B via tenant A token → 403
TC-TEN-05: Order integrations CRUD lintas tenant → 403
TC-TEN-06: Manipulasi body: kirim tenant_id B di body pada endpoint yang scoped by token → server harus abaikan body, pakai token; kalau tidak → BUG kritikal
TC-TEN-07: JWT dengan klaim tenant_id diubah tapi signature lama → 401
TC-TEN-08: RAG canary: doc A berisi "KODE RAHASIA-ALFA", doc B berisi "KODE RAHASIA-BETA"; tanya di tenant A "apa kode rahasia?" → jawaban tidak boleh memuat BETA; verifikasi retrieval metadata hanya tenant A
TC-TEN-09: Embedding cache/dedup lintas tenant: teks identik diunggah di 2 tenant → chunk tidak tertukar
TC-TEN-10: Widget public key tenant A vs B ditukar → chat tetap di tenant masing-masing (conversation dibuat di tenant yang benar)
TC-TEN-11: Pagination/list endpoint: /api/documents?page besar & filter → tidak mengembalikan tenant lain
TC-TEN-12: Export (CSV) dan webhook → scoped tenant

E2E Playwright steps:
1. Buka halaman dengan widget (visitor session)
2. Kirim "Apa jam operasional?" → expect reply berisi konten KB (data-testid="chat-message")
3. "Cek pesanan ORD-1001" → expect reply menyebut status (mock order API via route intercept)
4. "Saya mau bicara dengan manusia" → expect status handoff; cek dashboard queue (login agent)
5. Agent klik conversation → takeover → kirim "Halo, saya Agent" → expect muncul di widget
6. Agent resolve → widget status resolved
Pakai fixtures: dua browser context (visitor & agent), data-testid selectors, route interception untuk order API.

KB tests:
- fixture files: valid.pdf, valid.docx, unsupported.zip (atau .exe), oversized 11MB (generate), empty.pdf (halaman kosong), scanned.pdf (image-only)
- update flow: v1 berisi "Harga paket Pro Rp500rb" → tanya → jawab 500; edit jadi "Rp750rb" → reindex → tanya lagi → jawab 750; cek chunk lama terganti

Security:
- expired token (set exp -1 / tunggu) → 401 + pesan; refresh flow
- SQLi payload list di q param search & di chat message (juga uji bahwa input tidak dieksekusi): ' OR '1'='1; 1;DROP TABLE docs;-- ; SLEEP(5) time-based → response normal, latency normal
- Rate limit: loop 30 req pada /api/auth/login dan widget /api/chat → 429 setelah threshold, Retry-After header
- Bonus: header keamanan (CSP, X-Frame-Options untuk widget embed), CORS origin widget

Responsivitas:
- viewport 320x568, 375x667, 1440x900 → screenshot, cek: widget panel ≤ 100vw, tidak overflow-x, tombol terlihat, message bubble wrap
- Playwright: page.setViewportSize

Bug report format template:
- ID, Judul, Severity (S1-S4), Environment, Steps, Expected, Actual, Bukti (screenshot/video/log), Reproducibility

Saya juga akan menambahkan contoh bug report kosong + satu contoh terisi (ditandai contoh hipotesis bukan temuan?). Hati-hati jangan mengklaim temuan. Saya bisa memberi template terisi generik sebagai contoh format, dengan label "CONTOH FORMAT (bukan temuan)".

Test plan: scope in/out, environment, data seed, tools, exit criteria:
- Exit criteria: semua TC kritikal pass, 0 bug S1/S2 open, bug S3 punya workaround terdokumentasi

Seeded data kebutuhan:
- tenant-a@test / tenant-b@test, API keys, widget keys, doc fixtures, order API mock (via stub server atau route mock)

Baik. Tulis jawaban akhir. Struktur:

1. Ringkasan status & pendekatan (singkat)
2. Test Plan (ringkas tapi lengkap)
3. Test Case Matrix (tabel)
4. Skrip eksekusi (isolasi tenant Python, E2E Playwright, KB + keamanan ringkas, SQL verifikasi RAG)
5. Format bug report + contoh
6. Exit criteria & langkah eksekusi
7. JSON verdict (sesuai system prompt)

Panjang: cukup besar tapi perlu. Coba jaga skrip tetap ringkas namun fungsional. Gunakan kode TypeScript Playwright modern (fixtures). Python requests untuk API security.

Untuk verdict JSON: {"verdict":"revise","notes":"..."} — notes ringkas bahasa Indonesia.

Markdown header yang jelas. Mari tulis.

Untuk Playwright E2E, tulis spesifikasi dengan komentar langkah yang dipetakan ke TC. Sertakan intercept order API:

```ts
await page.route('**/api/orders/ORD-1001', route => route.fulfill({ json: { id:'ORD-1001', status:'shipped', eta:'2025-06-14' } }));
```

Untuk handoff: teks pemicu "bicara dengan manusia" → expect badge "Menunggu agen" dsb. Selector harus disesuaikan implementasi; beri catatan.

Python isolation script: pakai requests, helper untuk login 2 tenant, loop matrix endpoint × method × resource-ID-silang, assert status in (403,404)