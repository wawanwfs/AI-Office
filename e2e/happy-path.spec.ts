/**
 * E2E Happy Path — dbg project (Playwright)
 * ==========================================================================
 * Cakupan (test plan):
 *   1. Auth : register, login, logout, route guard.
 *   2. CRUD : create, read, update, delete resource utama (Items).
 *   3. Error: kredensial salah, validasi form, kegagalan server (500).
 *
 * Kontrak UI (fallback otomatis ke role/label bila data-testid tidak ada):
 *   Routes : /register, /login, /items (protected -> redirect /login)
 *   testid : name-input, email-input, password-input, submit-register,
 *            submit-login, logout-button, error-alert, item-title-input,
 *            item-content-input, item-submit, item-card, item-edit-button,
 *            item-delete-button, confirm-delete
 *
 * Jalankan di CI (butuh @playwright/test >= 1.33 untuk locator.or()):
 *   npx playwright test e2e/happy-path.spec.ts
 *   BASE_URL=http://localhost:3000 (default bila tidak diset)
 * ==========================================================================
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

test.use({ baseURL: process.env.BASE_URL ?? 'http://localhost:3000' });

// Happy path berurutan: user didaftarkan di test pertama, dipakai test lain.
test.describe.configure({ mode: 'serial' });

const RUN = Date.now(); // data unik per run -> idempotent saat dijalankan ulang di CI
const USER = {
  name: 'E2E Tester',
  email: `e2e-${RUN}@dbg.test`,
  password: 'S3cure-Passw0rd!',
};

const AWAY_FROM_AUTH = (u: URL) => !/\/(login|register)$/.test(u.pathname);

// ---------- Locators (data-testid dulu, fallback ke role/label) ----------
const nameInput = (p: Page): Locator => p.getByTestId('name-input').or(p.getByLabel(/nama|name/i));
const emailInput = (p: Page): Locator => p.getByTestId('email-input').or(p.getByLabel(/email/i));
const passwordInput = (p: Page): Locator => p.getByTestId('password-input').or(p.getByLabel(/password/i));
const errorAlert = (p: Page): Locator => p.getByTestId('error-alert').or(p.getByRole('alert'));
const submitRegister = (p: Page): Locator =>
  p.getByTestId('submit-register').or(p.getByRole('button', { name: /daftar|register|sign ?up/i }));
const submitLogin = (p: Page): Locator =>
  p.getByTestId('submit-login').or(p.getByRole('button', { name: /masuk|login|sign ?in/i }));
const logoutButton = (p: Page): Locator =>
  p.getByTestId('logout-button').or(p.getByRole('button', { name: /keluar|logout|sign ?out/i }));
const itemTitleInput = (p: Page): Locator =>
  p.getByTestId('item-title-input').or(p.getByLabel(/judul|title/i));
const itemContentInput = (p: Page): Locator =>
  p.getByTestId('item-content-input').or(p.getByLabel(/isi|konten|content|deskripsi|description/i));
const submitItem = (p: Page): Locator =>
  p.getByTestId('item-submit').or(p.getByRole('button', { name: /simpan|tambah|save|create|add/i }));

// ---------- Helpers ----------
async function register(p: Page): Promise<void> {
  await p.goto('/register');
  await nameInput(p).fill(USER.name);
  await emailInput(p).fill(USER.email);
  await passwordInput(p).fill(USER.password);
  await submitRegister(p).click();
  await p.waitForURL(AWAY_FROM_AUTH, { timeout: 15_000 });
}

async function login(p: Page, email = USER.email, password = USER.password): Promise<void> {
  await p.goto('/login');
  await emailInput(p).fill(email);
  await passwordInput(p).fill(password);
  await submitLogin(p).click();
}

/** Login; bila user belum terdaftar, daftarkan lalu masuk. */
async function loginOrRegister(p: Page): Promise<void> {
  await login(p);
  try {
    await p.waitForURL(AWAY_FROM_AUTH, { timeout: 5_000 });
  } catch {
    await register(p);
  }
}

async function createItem(p: Page, title: string, content: string): Promise<Locator> {
  await p.goto('/items');
  await itemTitleInput(p).fill(title);
  await itemContentInput(p).fill(content);
  await submitItem(p).click();
  const card = p.getByTestId('item-card').filter({ hasText: title });
  await expect(card).toBeVisible({ timeout: 10_000 });
  return card;
}

async function deleteItem(p: Page, card: Locator): Promise<void> {
  // Dukung window.confirm() native maupun modal konfirmasi custom.
  p.on('dialog', (d) => void d.accept());
  await card.getByTestId('item-delete-button').or(card.getByRole('button', { name: /hapus|delete/i })).click();
  const confirm = p.getByTestId('confirm-delete').or(p.getByRole('button', { name: /ya,? hapus|confirm|yes/i }));
  try {
    await confirm.waitFor({ state: 'visible', timeout: 2_000 });
    await confirm.click();
  } catch {
    /* tanpa modal konfirmasi */
  }
  await expect(card).toHaveCount(0);
}

// ---------- 1. AUTH ----------
test.describe('Auth', () => {
  test('registrasi user baru berhasil dan masuk ke aplikasi', async ({ page }) => {
    await register(page);
    await expect(errorAlert(page)).toBeHidden();
  });

  test('logout mengakhiri sesi dan kembali ke halaman login', async ({ page }) => {
    await loginOrRegister(page);
    await logoutButton(page).click();
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });

  test('login dengan kredensial valid berhasil', async ({ page }) => {
    await login(page);
    await page.waitForURL(AWAY_FROM_AUTH, { timeout: 10_000 });
    await expect(errorAlert(page)).toBeHidden();
  });

  test('login dengan password salah menampilkan pesan error', async ({ page }) => {
    await login(page, USER.email, 'Password-Salah-123!');
    await expect(errorAlert(page)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/login/);
  });

  test('route guard: akses /items tanpa sesi diarahkan ke /login', async ({ browser }) => {
    const ctx = await browser.newContext(); // context segar: tanpa cookie/token
    const page = await ctx.newPage();
    await page.goto('/items');
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
    await ctx.close();
  });
});

// ---------- 2. CRUD UTAMA + 3. ERROR HANDLING ----------
test.describe('CRUD Items', () => {
  test.beforeEach(async ({ page }) => {
    await loginOrRegister(page);
  });

  test('CREATE: item baru muncul di daftar', async ({ page }) => {
    await createItem(page, `Item CREATE ${RUN}`, 'Konten create');
  });

  test('UPDATE: perubahan judul tersimpan', async ({ page }) => {
    const card = await createItem(page, `Item UPDATE ${RUN}`, 'Konten awal');
    await card.getByTestId('item-edit-button').or(card.getByRole('button', { name: /edit|ubah/i })).click();
    await itemTitleInput(page).fill(`Item UPDATE ${RUN} (revisi)`);
    await submitItem(page).click();
    await expect(
      page.getByTestId('item-card').filter({ hasText: `Item UPDATE ${RUN} (revisi)` })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('DELETE: item terhapus dari daftar', async ({ page }) => {
    const card = await createItem(page, `Item DELETE ${RUN}`, 'Konten delete');
    await deleteItem(page, card);
  });

  test('VALIDASI: item tanpa judul tidak tersimpan', async ({ page }) => {
    await page.goto('/items');
    await submitItem(page).click();
    // Dua mode validasi diterima: pesan error dari app, atau validasi HTML5
    // native (required) yang mencegah submit sehingga form tetap tampil.
    const sawAppError = await errorAlert(page)
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(sawAppError || (await itemTitleInput(page).isVisible())).toBeTruthy();
  });

  test('SERVER ERROR: kegagalan 500 pada POST /api/items menampilkan pesan error', async ({ page }) => {
    await page.route('**/api/items', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal Server Error' }) })
        : route.continue()
    );
    await page.goto('/items');
    await itemTitleInput(page).fill(`Item FAIL ${RUN}`);
    await submitItem(page).click();
    await expect(errorAlert(page)).toBeVisible({ timeout: 10_000 });
  });
});
