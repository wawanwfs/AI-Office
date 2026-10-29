/**
 * src/hooks/useApi.js
 * API client + hooks untuk menghubungkan frontend ke REST API dbg project.
 *
 * Fitur:
 *  - apiFetch: fetch wrapper dengan interceptor (request/response) & auto-attach token
 *  - useApi: data fetching dengan state loading/error/data + refetch + abort
 *  - useSubmit: submit form dengan validasi client & mapping error validasi server (422)
 *  - validators + validateValues: helper validasi form
 *  - createListMapper / createObjectMapper: mapping response API ke bentuk UI
 *
 * ── ENVIRONMENT VARIABLE ─────────────────────────────────────────────
 * Vite  -> .env.development : VITE_API_BASE_URL=http://localhost:3000/api
 *          .env.staging     : VITE_API_BASE_URL=https://staging-api.dbg-project.com/api
 * CRA   -> ganti prefix menjadi REACT_APP_API_BASE_URL
 * Restart dev server setelah mengubah file .env.
 *
 * ── CORS (konfigurasi di sisi BACKEND) ───────────────────────────────
 * Access-Control-Allow-Origin      : http://localhost:5173 (lokal)
 *                                    https://staging.dbg-project.com (staging)
 * Access-Control-Allow-Methods     : GET,POST,PUT,PATCH,DELETE,OPTIONS
 * Access-Control-Allow-Headers     : Content-Type, Authorization
 * Access-Control-Allow-Credentials : true (client mengirim credentials:'include')
 * Catatan: origin tidak boleh '*' jika credentials diaktifkan.
 * Pastikan preflight (OPTIONS) dijawab 204 tanpa memerlukan auth.
 * Alternatif lokal: proxy dev server (Vite: server.proxy -> '/api').
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/* ============================ KONFIGURASI ============================ */

const getEnv = (key) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] !== undefined) {
      return import.meta.env[key];
    }
  } catch {
    /* bukan environment ESM */
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      return process.env[key];
    }
  } catch {
    /* process tidak tersedia */
  }
  return undefined;
};

export const API_BASE_URL = String(
  getEnv('VITE_API_BASE_URL') ||
    getEnv('REACT_APP_API_BASE_URL') ||
    'http://localhost:3000/api'
).replace(/\/+$/, '');

const DEFAULT_TIMEOUT = Number(getEnv('VITE_API_TIMEOUT') || 15000);

/* ============================ TOKEN STORE ============================ */

const TOKEN_KEY = 'dbg_access_token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage tidak tersedia */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
  },
};

/* =========================== INTERCEPTORS ============================ */

const requestInterceptors = [];
const responseInterceptors = [];

/** Daftarkan interceptor request: fn(config) -> config */
export function onRequest(fn) {
  requestInterceptors.push(fn);
  return () => {
    const i = requestInterceptors.indexOf(fn);
    if (i > -1) requestInterceptors.splice(i, 1);
  };
}

/** Daftarkan interceptor response: fn(response) -> response */
export function onResponse(fn) {
  responseInterceptors.push(fn);
  return () => {
    const i = responseInterceptors.indexOf(fn);
    if (i > -1) responseInterceptors.splice(i, 1);
  };
}

/* Built-in 1: sisipkan token Authorization ke setiap request */
onRequest((config) => {
  const token = tokenStore.get();
  if (token && !config.headers.Authorization) {
    config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
  }
  return config;
});

/* Built-in 2: auto-clear token + event global saat token invalid (401) */
onResponse((response) => {
  if (response.status === 401) {
    tokenStore.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
    }
  }
  return response;
});

/** Subscribe untuk reaksi global saat 401 (redirect ke login, dsb.) */
export function onUnauthorized(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('api:unauthorized', handler);
  return () => window.removeEventListener('api:unauthorized', handler);
}

/* ============================== ERROR ================================ */

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, isNetworkError = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.isNetworkError = isNetworkError;
  }
}

/* ============================ API CLIENT ============================= */

function buildUrl(endpoint, params) {
  let url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  if (params && typeof params === 'object') {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  }
  return url;
}

function isRawBody(body) {
  return (
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer)
  );
}

function createTimeoutError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Request timeout', 'TimeoutError');
  }
  const e = new Error('Request timeout');
  e.name = 'TimeoutError';
  return e;
}

/**
 * Wrapper fetch ala axios dengan interceptor.
 * return: { data, status, headers }
 */
export async function apiFetch(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    params,
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    signal,
    ...rest
  } = options;

  let config = {
    url: buildUrl(endpoint, params),
    method: String(method).toUpperCase(),
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isRawBody(body) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body,
    timeout,
    signal,
    ...rest,
  };

  /* jalankan interceptor request */
  for (const fn of requestInterceptors) {
    config = (await fn(config)) || config;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(createTimeoutError()), config.timeout || DEFAULT_TIMEOUT);
  if (config.signal) {
    if (config.signal.aborted) controller.abort(config.signal.reason);
    else {
      config.signal.addEventListener('abort', () => controller.abort(config.signal.reason), {
        once: true,
      });
    }
  }

  try {
    const fetchOptions = {
      method: config.method,
      headers: config.headers,
      credentials: 'include', // penting untuk CORS berbasis cookie
      signal: controller.signal,
    };
    if (config.body !== undefined) {
      fetchOptions.body = isRawBody(config.body) ? config.body : JSON.stringify(config.body);
    }

    let response = await fetch(config.url, fetchOptions);

    /* jalankan interceptor response */
    for (const fn of responseInterceptors) {
      response = (await fn(response)) || response;
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    if (!response.ok) {
      const message =
        (data && (data.message || data.error || data.detail)) ||
        `Request gagal (HTTP ${response.status})`;
      throw new ApiError(message, { status: response.status, data });
    }

    return { data, status: response.status, headers: response.headers };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new ApiError(
        err.name === 'TimeoutError' ? 'Request timeout. Coba lagi.' : 'Request dibatalkan.',
        { isNetworkError: true, status: 0 }
      );
    }
    throw new ApiError(
      'Gagal terhubung ke server. Periksa koneksi, VITE_API_BASE_URL, atau konfigurasi CORS.',
      { isNetworkError: true, status: 0 }
    );
  } finally {
    clearTimeout(timer);
  }
}

/* Convenience method: api.get('/users', { params }) dll. */
export const api = {
  get: (ep, opts) => apiFetch(ep, { ...opts, method: 'GET' }),
  post: (ep, body, opts) => apiFetch(ep, { ...opts, method: 'POST', body }),
  put: (ep, body, opts) => apiFetch(ep, { ...opts, method: 'PUT', body }),
  patch: (ep, body, opts) => apiFetch(ep, { ...opts, method: 'PATCH', body }),
  delete: (ep, opts) => apiFetch(ep, { ...opts, method: 'DELETE' }),
};

/* ========================= HOOK: useApi ============================== */

/**
 * const { data, loading, error, refetch, abort } = useApi('/products', {
 *   params: { page: 1 },
 *   mapper: createListMapper({ mapItem: (p) => ({ id: p.id, name: p.nama }) }),
 * });
 */
export function useApi(endpoint, config = {}) {
  const { params, immediate = true, mapper, ...requestConfig } = config;

  const [data, setData] = useState(null);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(Boolean(immediate && endpoint));
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const mapperRef = useRef(mapper);
  const requestConfigRef = useRef(requestConfig);
  const paramsRef = useRef(params);

  useEffect(() => {
    mapperRef.current = mapper;
    requestConfigRef.current = requestConfig;
    paramsRef.current = params;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (override = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++seqRef.current;

      setLoading(true);
      setError(null);

      try {
        const result = await apiFetch(endpoint, {
          ...requestConfigRef.current,
          ...override,
          params: { ...(paramsRef.current || {}), ...(override.params || {}) },
          signal: controller.signal,
        });
        const mapped = mapperRef.current ? mapperRef.current(result.data, result) : result.data;
        if (mountedRef.current && seqRef.current === requestId) {
          setData(mapped);
          setRaw(result.data);
        }
        return { ok: true, data: mapped, response: result };
      } catch (err) {
        if (err && err.name === 'AbortError') return { ok: false, aborted: true };
        if (mountedRef.current && seqRef.current === requestId) setError(err);
        return { ok: false, error: err };
      } finally {
        if (mountedRef.current && seqRef.current === requestId) setLoading(false);
      }
    },
    [endpoint]
  );

  const paramsKey = JSON.stringify(params || null);

  useEffect(() => {
    if (immediate && endpoint) execute();
    return () => abortRef.current?.abort();
  }, [endpoint, immediate, execute, paramsKey]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  return { data, raw, loading, error, refetch: execute, abort };
}

/* ===================== VALIDASI FORM (CLIENT) ======================== */

export const validators = {
  required: (msg = 'Wajib diisi') => (v) =>
    v === undefined || v === null || String(v).trim() === '' ? msg : null,
  email: (msg = 'Format email tidak valid') => (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? null : msg,
  minLength: (n, msg) => (v) =>
    !v || String(v).length >= n ? null : msg || `Minimal ${n} karakter`,
  maxLength: (n, msg) => (v) =>
    !v || String(v).length <= n ? null : msg || `Maksimal ${n} karakter`,
  min: (n, msg) => (v) =>
    v === '' || v === undefined || Number(v) >= n ? null : msg || `Minimal ${n}`,
  max: (n, msg) => (v) =>
    v === '' || v === undefined || Number(v) <= n ? null : msg || `Maksimal ${n}`,
  number: (msg = 'Harus berupa angka') => (v) =>
    v === '' || v === undefined || !Number.isNaN(Number(v)) ? null : msg,
  pattern: (re, msg = 'Format tidak valid') => (v) => (!v || re.test(String(v)) ? null : msg),
  match: (field, msg = 'Konfirmasi tidak cocok') => (v, all) => (v === all[field] ? null : msg),
};

/**
 * validateValues(values, {
 *   email: [validators.required(), validators.email()],
 *   password: [validators.required(), validators.minLength(8)],
 * });
 */
export function validateValues(values, rules) {
  const errors = {};
  for (const [field, fieldRules] of Object.entries(rules || {})) {
    for (const rule of [].concat(fieldRules)) {
      const msg = typeof rule === 'function' ? rule(values[field], values) : null;
      if (msg) {
        errors[field] = msg;
        break;
      }
    }
  }
  return errors;
}

/* Normalisasi error validasi dari server (422) -> { field: message } */
function normalizeFieldErrors(serverErrors) {
  const out = {};
  if (Array.isArray(serverErrors)) {
    for (const item of serverErrors) {
      if (item && item.field) {
        out[item.field] = Array.isArray(item.message) ? item.message[0] : item.message;
      }
    }
  } else if (serverErrors && typeof serverErrors === 'object') {
    for (const [key, val] of Object.entries(serverErrors)) {
      out[key] = Array.isArray(val) ? String(val[0]) : String(val);
    }
  }
  return out;
}

/* ===================== HOOK: useSubmit (FORM) ======================== */

/**
 * const { submit, loading, error, fieldErrors, success } = useSubmit(
 *   (values) => api.post('/auth/login', values),
 *   {
 *     validate: (v) => validateValues(v, { email: [...], password: [...] }),
 *     onSuccess: (data) => { tokenStore.set(data.token); navigate('/'); },
 *   }
 * );
 * // onSubmit={(e) => { e.preventDefault(); submit(formValues); }}
 */
export function useSubmit(submitFn, options = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);

  const mountedRef = useRef(true);
  const submitFnRef = useRef(submitFn);
  const optionsRef = useRef(options);

  useEffect(() => {
    submitFnRef.current = submitFn;
    optionsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = useCallback(async (values = {}) => {
    const { validate: validateFn, onSuccess: onOk, onError: onErr, mapper: mapFn } =
      optionsRef.current;

    /* 1. Validasi client-side */
    let errors = {};
    if (typeof validateFn === 'function') errors = validateFn(values) || {};
    if (Object.keys(errors).length > 0) {
      const validationError = new ApiError('Periksa kembali isian form.', { status: 422 });
      if (mountedRef.current) {
        setFieldErrors(errors);
        setError(validationError);
        setSuccess(false);
      }
      return { ok: false, fieldErrors: errors, error: validationError };
    }

    /* 2. Kirim ke API */
    if (mountedRef.current) {
      setFieldErrors({});
      setError(null);
      setSuccess(false);
      setLoading(true);
    }

    try {
      const result = await submitFnRef.current(values);
      const mapped = mapFn ? mapFn(result.data, result) : result.data;
      if (mountedRef.current) setSuccess(true);
      if (onOk) onOk(mapped, result);
      return { ok: true, data: mapped, response: result };
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        /* 3. Mapping error validasi server (422) ke field form */
        if (err instanceof ApiError && err.status === 422 && err.data) {
          setFieldErrors(normalizeFieldErrors(err.data.errors || err.data));
        }
      }
      if (onErr) onErr(err);
      return { ok: false, error: err };
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setFieldErrors({});
    setSuccess(false);
  }, []);

  return { submit, loading, error, fieldErrors, success, clear };
}

/* ==================== MAPPING RESPONSE -> UI ========================= */

/**
 * Mapper untuk endpoint list dengan pagination.
 * const { data } = useApi('/products', {
 *   mapper: createListMapper({ mapItem: (p) => ({ id: p.id, name: p.nama, price: Number(p.harga) }) }),
 * });
 * // data.items -> array untuk render, data.meta -> { page, total, ... }
 */
export function createListMapper({ itemsKey, mapItem = (x) => x } = {}) {
  return (raw) => {
    let payload = raw;
    if (itemsKey && raw && typeof raw === 'object') payload = raw[itemsKey];
    else if (raw && typeof raw === 'object') payload = raw.data ?? raw.items ?? raw.results ?? raw;
    const items = Array.isArray(payload) ? payload.map(mapItem) : [];
    const meta =
      (raw && typeof raw === 'object' && (raw.meta || raw.pagination)) || { total: items.length };
    return { items, meta };
  };
}

/** Mapper sederhana untuk mengubah nama field dari API ke nama field UI. */
export function createObjectMapper(fieldMap = {}) {
  return (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const out = { ...raw };
    for (const [from, to] of Object.entries(fieldMap)) {
      if (from in out) {
        out[to] = out[from];
        if (to !== from) delete out[from];
      }
    }
    return out;
  };
}

/* ======================= CONTOH PEMAKAIAN ============================
 *
 * import { useApi, useSubmit, api, tokenStore, onUnauthorized,
 *          validators, validateValues, createListMapper } from '../hooks/useApi';
 *
 * // 1) Ambil data list + mapping ke komponen UI
 * function ProductList() {
 *   const { data, loading, error, refetch } = useApi('/products', {
 *     params: { page: 1, limit: 10 },
 *     mapper: createListMapper({ mapItem: (p) => ({ id: p.id, name: p.nama }) }),
 *   });
 *   if (loading) return <Spinner />;
 *   if (error) return <ErrorBox message={error.message} onRetry={refetch} />;
 *   return data.items.map((p) => <Card key={p.id} title={p.name} />);
 * }
 *
 * // 2) Submit form login dengan validasi + loading/error state
 * function LoginForm() {
 *   const [form, setForm] = useState({ email: '', password: '' });
 *   const { submit, loading, fieldErrors } = useSubmit(
 *     (v) => api.post('/auth/login', v),
 *     {
 *       validate: (v) =>
 *         validateValues(v, {
 *           email: [validators.required(), validators.email()],
 *           password: [validators.required(), validators.minLength(8)],
 *         }),
 *       onSuccess: (d) => tokenStore.set(d.token),
 *     }
 *   );
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); submit(form); }}>
 *       <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
 *       {fieldErrors.email && <span>{fieldErrors.email}</span>}
 *       <button disabled={loading}>{loading ? 'Loading...' : 'Login'}</button>
 *     </form>
 *   );
 * }
 *
 * // 3) Reaksi global saat sesi habis (401)
 * useEffect(() => onUnauthorized(() => window.location.assign('/login')), []);
 *
 * ===================================================================== */
