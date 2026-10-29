/* =========================================================================
 * src/hooks/useApiState.js
 * API client + state management (loading/error) + form submit & validasi
 * untuk menghubungkan frontend 'dbg project' dengan REST API.
 *
 * DEPENDENSI: npm install axios
 *
 * -------------------------------------------------------------------------
 * 1) ENVIRONMENT VARIABLE (buat file .env di root frontend)
 * -------------------------------------------------------------------------
 * .env.development  (lokal):
 *   VITE_API_BASE_URL=http://localhost:3000/api
 *
 * .env.staging      (staging):
 *   VITE_API_BASE_URL=https://api-staging.dbg-project.com/api
 *
 * (Jika memakai CRA, ganti prefix menjadi REACT_APP_API_BASE_URL.)
 *
 * -------------------------------------------------------------------------
 * 2) KONFIGURASI CORS DI BACKEND (wajib agar browser tidak memblokir)
 * -------------------------------------------------------------------------
 * Express:
 *   const cors = require('cors');
 *   app.use(cors({
 *     origin: [
 *       'http://localhost:5173',            // Vite dev
 *       'http://localhost:3000',            // CRA dev
 *       'https://staging.dbg-project.com',  // staging frontend
 *     ],
 *     credentials: true,
 *     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
 *     allowedHeaders: ['Content-Type', 'Authorization'],
 *   }));
 * Jika auth berbasis cookie/session, set WITH_CREDENTIALS = true di bawah.
 * ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

/* ========================= 1. KONFIGURASI DASAR ========================= */

const WITH_CREDENTIALS = false; // true jika auth memakai cookie/session

function readEnv(keys) {
  for (const key of keys) {
    try {
      if (import.meta && import.meta.env && import.meta.env[key]) return import.meta.env[key];
    } catch { /* bukan Vite */ }
    try {
      if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    } catch { /* bukan CRA/Node */ }
  }
  return undefined;
}

export const API_BASE_URL =
  readEnv(['VITE_API_BASE_URL', 'REACT_APP_API_BASE_URL', 'NEXT_PUBLIC_API_BASE_URL']) ||
  'http://localhost:3000/api';

/* ==================== 2. API CLIENT + INTERCEPTOR ======================= */

export const TOKEN_KEY = 'dbg_access_token';
export const REFRESH_KEY = 'dbg_refresh_token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage tidak tersedia */ }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch { /* storage tidak tersedia */ }
  },
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: WITH_CREDENTIALS,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

/* Interceptor request: sisipkan Bearer token ke setiap permintaan */
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* Interceptor response: refresh token otomatis saat 401 */
let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !String(original.url || '').includes('/auth/')
    ) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise || doRefreshToken();
        const { data } = await refreshPromise;
        refreshPromise = null;
        if (data?.accessToken) {
          tokenStore.set(data.accessToken);
          original.headers = { ...original.headers, Authorization: `Bearer ${data.accessToken}` };
          return apiClient(original);
        }
      } catch {
        refreshPromise = null;
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
    }
    return Promise.reject(normalizeError(error));
  }
);

async function doRefreshToken() {
  let refreshToken = null;
  try { refreshToken = localStorage.getItem(REFRESH_KEY); } catch { /* noop */ }
  if (!refreshToken) throw new Error('Tidak ada refresh token');
  return axios.post(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 15000, withCredentials: WITH_CREDENTIALS }
  );
}

/* Shortcut: api.get('/users'), api.post('/login', payload), dst. */
export const api = {
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  patch: (url, data, config) => apiClient.patch(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};

/* ============ 3. NORMALISASI ERROR & MAPPING RESPONSE KE UI ============= */

export function normalizeError(err) {
  if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || axios.isCancel?.(err)) {
    return { type: 'CANCELED', status: 0, message: 'Permintaan dibatalkan.', fields: {} };
  }
  if (!err?.response) {
    const isTimeout = err?.code === 'ECONNABORTED';
    return {
      type: isTimeout ? 'TIMEOUT' : 'NETWORK',
      status: 0,
      message: isTimeout
        ? 'Server tidak merespons (timeout).'
        : 'Gagal terhubung ke server. Periksa koneksi, API_BASE_URL, atau konfigurasi CORS.',
      fields: {},
    };
  }
  const { status, data } = err.response;
  const messages = {
    400: 'Permintaan tidak valid.',
    401: 'Sesi berakhir. Silakan login ulang.',
    403: 'Anda tidak memiliki akses.',
    404: 'Data tidak ditemukan.',
    422: 'Data yang dikirim tidak valid.',
    500: 'Terjadi kesalahan pada server.',
  };
  return {
    type: 'HTTP',
    status,
    message: data?.message || data?.error || messages[status] || 'Permintaan gagal.',
    fields: data?.errors && typeof data.errors === 'object' ? data.errors : {},
  };
}

/**
 * mapResponse — mapping bentuk response API ke struktur UI yang konsisten.
 * Mendukung: array langsung, { data: [...] }, { items: [...] },
 * { results: [...] }, { data: [...], meta: {...} }, atau listKey kustom.
 */
export function mapResponse(response, { listKey } = {}) {
  const body = response?.data ?? response;
  const candidate = listKey
    ? body?.[listKey]
    : Array.isArray(body)
      ? body
      : body?.data ?? body?.items ?? body?.results ?? [];
  return {
    raw: body,
    list: Array.isArray(candidate) ? candidate : [],
    item: Array.isArray(candidate) ? null : candidate ?? null,
    meta: body?.meta ?? body?.pagination ?? null,
    message: body?.message ?? null,
  };
}

/* ============ 4. HOOK: useApiState (loading/error konsisten) ============ */

/**
 * useApiState — state loading/error/data yang konsisten untuk semua call API.
 *
 * Contoh GET:
 *   const { list, loading, error, execute } = useApiState();
 *   useEffect(() => { execute({ url: '/users', params: { page: 1 } }); }, [execute]);
 *
 * Contoh POST:
 *   const res = await execute({ url: '/users', method: 'POST', data: payload });
 */
export function useApiState(options = {}) {
  const {
    listKey, immediate = false, url, params,
    onSuccess, onError, keepPreviousData = true,
  } = options;

  const [state, setState] = useState({
    data: null, list: [], item: null, meta: null,
    loading: false, error: null, status: 'idle', // idle | loading | success | error
  });

  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (config = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        status: 'loading',
        ...(keepPreviousData ? {} : { data: null, list: [], item: null, meta: null }),
      }));

      try {
        const response = await apiClient({
          method: config.method || 'GET',
          url: config.url,
          data: config.data,
          params: config.params,
          headers: config.headers,
          signal: controller.signal,
        });
        const mapped = mapResponse(response, { listKey });
        if (!mountedRef.current) return mapped;
        setState({
          data: mapped.raw, list: mapped.list, item: mapped.item, meta: mapped.meta,
          loading: false, error: null, status: 'success',
        });
        onSuccess?.(mapped);
        return mapped;
      } catch (err) {
        const normalized = normalizeError(err);
        if (normalized.type === 'CANCELED') return null;
        if (!mountedRef.current) return null;
        setState((s) => ({ ...s, loading: false, error: normalized, status: 'error' }));
        onError?.(normalized);
        return null;
      }
    },
    [listKey, keepPreviousData, onSuccess, onError]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ data: null, list: [], item: null, meta: null, loading: false, error: null, status: 'idle' });
  }, []);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  useEffect(() => {
    if (immediate && url) execute({ url, params });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, execute, reset, setData };
}

/* ============ 5. VALIDASI FORM + SUBMIT (useFormSubmit) ================= */

export const validators = {
  required: (msg = 'Wajib diisi.') => (v) =>
    v === undefined || v === null || String(v).trim() === '' ? msg : null,
  email: (msg = 'Format email tidak valid.') => (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? null : msg,
  minLength: (n, msg) => (v) =>
    !v || String(v).length >= n ? null : msg || `Minimal ${n} karakter.`,
  min: (n, msg) => (v) =>
    v === '' || v === undefined || v === null || Number(v) >= n ? null : msg || `Minimal ${n}.`,
  pattern: (re, msg = 'Format tidak valid.') => (v) =>
    !v || re.test(String(v)) ? null : msg,
  match: (otherField, msg = 'Konfirmasi tidak sama.') => (v, all) =>
    !v || v === all?.[otherField] ? null : msg,
};

export function validateForm(values, schema) {
  const errors = {};
  for (const [field, rules] of Object.entries(schema)) {
    for (const rule of rules) {
      const msg = rule(values[field], values);
      if (msg) { errors[field] = msg; break; }
    }
  }
  return errors;
}

/**
 * useFormSubmit — submit form dengan validasi klien + mapping error server.
 *
 * Contoh:
 *   const form = useFormSubmit({
 *     initialValues: { email: '', password: '' },
 *     schema: {
 *       email: [validators.required(), validators.email()],
 *       password: [validators.required(), validators.minLength(8)],
 *     },
 *     url: '/auth/login',
 *     method: 'POST',
 *     onSuccess: (mapped) => tokenStore.set(mapped.raw.accessToken),
 *   });
 *   <form onSubmit={form.handleSubmit}> ... </form>
 */
export function useFormSubmit({
  initialValues, schema = {}, url, method = 'POST',
  transform, onSuccess, onError,
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const handleChange = useCallback((e) => {
    const target = e.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setValues((prev) => ({ ...prev, [target.name]: value }));
    setErrors((prev) => (prev[target.name] ? { ...prev, [target.name]: null } : prev));
  }, []);

  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    if (schema[name]) {
      const msg = validateForm({ [name]: values[name] }, { [name]: schema[name] })[name];
      setErrors((prev) => ({ ...prev, [name]: msg }));
    }
  }, [schema, values]);

  const setFieldError = useCallback((field, msg) => {
    setErrors((prev) => ({ ...prev, [field]: msg }));
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();

      const validationErrors = validateForm(values, schema);
      setErrors(validationErrors);
      setTouched(Object.keys(schema).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
      if (Object.values(validationErrors).some(Boolean)) return null;

      setSubmitting(true);
      setSubmitError(null);
      try {
        const payload = transform ? transform(values) : values;
        const response = await apiClient({ method, url, data: payload });
        const mapped = mapResponse(response);
        onSuccess?.(mapped, values);
        return mapped;
      } catch (err) {
        const normalized = normalizeError(err);
        // Mapping error validasi dari server (mis. 422) ke field form terkait
        if (normalized.fields && Object.keys(normalized.fields).length) {
          setErrors((prev) => {
            const next = { ...prev };
            for (const [field, msg] of Object.entries(normalized.fields)) {
              next[field] = Array.isArray(msg) ? msg[0] : String(msg);
            }
            return next;
          });
        }
        setSubmitError(normalized);
        onError?.(normalized);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [values, schema, url, method, transform, onSuccess, onError]
  );

  return {
    values, errors, touched, submitting, submitError,
    handleChange, handleBlur, handleSubmit, setFieldError, setValues,
    reset: () => {
      setValues(initialValues);
      setErrors({});
      setTouched({});
      setSubmitError(null);
    },
  };
}

export default useApiState;
