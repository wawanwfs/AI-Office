/**
 * src/hooks/useFormSubmit.js
 * API client + hook submit form untuk dbg project.
 *
 * Fitur:
 * - Axios instance + interceptor token (Bearer) & auto-refresh saat 401
 * - Normalisasi error konsisten (network / HTTP / validasi server)
 * - Validasi form lokal (required, email, minLength, matches, dll.)
 * - Mapping response API -> bentuk UI (envelope {data}, snake_case -> camelCase)
 * - Status konsisten: idle | validating | loading | success | error
 *
 * CATATAN KONFIGURASI (.env & CORS):
 *
 * 1) Environment variable — buat .env.local (lokal) dan .env.staging:
 *      # CRA (.env.local)
 *      REACT_APP_API_BASE_URL=http://localhost:5000/api
 *      REACT_APP_ENV=local
 *      # CRA (.env.staging) — build: REACT_APP_ENV=staging npm run build
 *      REACT_APP_API_BASE_URL=https://api-staging.dbg-project.id/api
 *      REACT_APP_ENV=staging
 *    Vite: gunakan prefix VITE_ (VITE_API_BASE_URL, VITE_ENV) — otomatis didukung getEnv() di bawah.
 *
 * 2) CORS dikonfigurasi di BACKEND (contoh Express):
 *      const cors = require('cors');
 *      const allowed = {
 *        local:   ['http://localhost:3000', 'http://localhost:5173'],
 *        staging: ['https://staging.dbg-project.id'],
 *      }[process.env.APP_ENV || 'local'];
 *      app.use(cors({
 *        origin: (origin, cb) => (!origin || allowed.includes(origin)) ? cb(null, true) : cb(new Error('CORS blocked')),
 *        credentials: true, // wajib, karena client di bawah memakai withCredentials: true
 *        allowedHeaders: ['Content-Type', 'Authorization'],
 *        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
 *      }));
 *    Pastikan preflight OPTIONS di-handle dan proxy (nginx) tidak membuang header Access-Control-Allow-*.
 *
 * 3) Token disimpan di localStorage (key: dbg_access_token). Jika ingin lebih aman,
 *    gunakan httpOnly cookie lalu hapus interceptor Authorization (withCredentials sudah aktif).
 */

import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

/* ===================== ENV ===================== */
function getEnv(key, fallback = '') {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const viteKey = key.replace(/^REACT_APP_/, 'VITE_');
      return import.meta.env[viteKey] || fallback;
    }
  } catch (e) {
    /* bundler tanpa import.meta: abaikan */
  }
  return fallback;
}

export const API_BASE_URL = getEnv('REACT_APP_API_BASE_URL', 'http://localhost:5000/api');
export const APP_ENV = getEnv('REACT_APP_ENV', 'local');

/* ===================== API CLIENT ===================== */
const TOKEN_KEY = 'dbg_access_token';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// Interceptor request: sisipkan token ke setiap request
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor response: auto-refresh token saat 401 + normalisasi error
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const isAuthRoute = String(original.url || '').includes('/auth/');

    if (status === 401 && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        refreshPromise =
          refreshPromise ||
          axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const { data } = await refreshPromise;
        refreshPromise = null;
        const newToken = data?.data?.accessToken || data?.accessToken;
        if (newToken) {
          window.localStorage.setItem(TOKEN_KEY, newToken);
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (e) {
        refreshPromise = null;
        window.localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
    }

    return Promise.reject(normalizeError(error));
  }
);

/* ===================== NORMALISASI ERROR ===================== */
// Semua error berbentuk sama: { isApiError, status, message, errors }
// `errors` = object per-field dari server, mis. { email: ['Email sudah dipakai'] }
export function normalizeError(error) {
  if (error && error.isApiError) return error;

  if (error?.response) {
    const { status, data } = error.response;
    const messages = {
      400: 'Permintaan tidak valid.',
      401: 'Sesi berakhir. Silakan login kembali.',
      403: 'Anda tidak memiliki akses.',
      404: 'Data tidak ditemukan.',
      409: 'Data sudah ada / terjadi konflik.',
      422: 'Data yang dikirim tidak valid.',
      429: 'Terlalu banyak permintaan. Coba lagi nanti.',
    };
    return {
      isApiError: true,
      status,
      message:
        data?.message ||
        data?.error ||
        messages[status] ||
        (status >= 500 ? 'Terjadi kesalahan pada server. Coba lagi nanti.' : 'Permintaan gagal.'),
      errors: data?.errors || data?.data?.errors || null,
    };
  }

  if (error?.request) {
    return {
      isApiError: true,
      status: 0,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
      errors: null,
    };
  }

  return {
    isApiError: false,
    status: 0,
    message: error?.message || 'Terjadi kesalahan tak terduga.',
    errors: null,
  };
}

/* ===================== MAPPING RESPONSE -> UI ===================== */
// Mendukung envelope: { data }, { data: { items, meta } }, atau payload langsung.
export function mapResponse(data) {
  const payload = data && data.data !== undefined ? data.data : data;

  if (Array.isArray(payload)) return payload.map(mapRecord);

  if (payload && typeof payload === 'object' && Array.isArray(payload.items)) {
    return {
      items: payload.items.map(mapRecord),
      meta: payload.meta || { page: payload.page || 1, total: payload.total || payload.items.length },
    };
  }

  return mapRecord(payload);
}

function mapRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    id: record.id ?? record._id ?? record.uuid ?? null,
    status: typeof record.status === 'string' ? record.status.toLowerCase() : record.status,
    createdAt: record.createdAt ?? record.created_at ?? null,
    updatedAt: record.updatedAt ?? record.updated_at ?? null,
  };
}

/* ===================== VALIDASI ===================== */
export const validators = {
  required: (msg) => (v) =>
    v !== undefined && v !== null && String(v).trim() !== '' ? '' : msg || 'Wajib diisi.',
  email: (msg) => (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? '' : msg || 'Format email tidak valid.',
  minLength: (n, msg) => (v) =>
    !v || String(v).length >= n ? '' : msg || `Minimal ${n} karakter.`,
  maxLength: (n, msg) => (v) =>
    !v || String(v).length <= n ? '' : msg || `Maksimal ${n} karakter.`,
  number: (msg) => (v) =>
    !v || !Number.isNaN(Number(v)) ? '' : msg || 'Harus berupa angka.',
  matches: (field, msg) => (v, all) =>
    v === (all && all[field]) ? '' : msg || 'Nilai tidak cocok.',
  custom: (fn) => fn,
};

function validateValues(values, schema) {
  const errors = {};
  Object.keys(schema || {}).forEach((field) => {
    const rules = Array.isArray(schema[field]) ? schema[field] : [schema[field]];
    for (const rule of rules) {
      const msg = rule(values[field], values);
      if (msg) {
        errors[field] = msg;
        break;
      }
    }
  });
  return errors;
}

/* ===================== HELPER REQUEST (non-form) ===================== */
// Selalu mengembalikan { ok, data?, error?, canceled? } dengan error ternormalisasi.
export async function apiRequest({ url, method = 'get', data, params, ...rest } = {}) {
  try {
    const response = await api({ url, method, data, params, ...rest });
    return { ok: true, data: mapResponse(response.data), response };
  } catch (rawErr) {
    if ((axios.isCancel && axios.isCancel(rawErr)) || rawErr?.name === 'CanceledError') {
      return { ok: false, canceled: true };
    }
    return { ok: false, error: normalizeError(rawErr) };
  }
}

/* ===================== HOOK UTAMA ===================== */
// Contoh:
//   const form = useFormSubmit({
//     endpoint: '/auth/register',
//     method: 'post',
//     initialData: { name: '', email: '', password: '', confirmPassword: '' },
//     schema: {
//       name: [validators.required(), validators.minLength(3)],
//       email: [validators.required(), validators.email()],
//       password: [validators.required(), validators.minLength(8)],
//       confirmPassword: [validators.required(), validators.matches('password')],
//     },
//     transform: ({ confirmPassword, ...rest }) => rest,
//     onSuccess: (data) => console.log('Sukses:', data),
//   });
//   <input name='email' value={form.values.email} onChange={form.handleChange} onBlur={form.handleBlur} />
//   {form.touched.email && form.errors.email ? <span>{form.errors.email}</span> : null}
//   <button disabled={form.isSubmitting} onClick={() => form.submit()}>Kirim</button>
//   {form.serverError && !Object.keys(form.errors).length ? <p role='alert'>{form.serverError.message}</p> : null}
export function useFormSubmit({
  endpoint,
  method = 'post',
  schema = {},
  initialData = {},
  onSuccess,
  onError,
  transform = (v) => v,
} = {}) {
  const [values, setValues] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState('idle'); // idle | validating | loading | success | error
  const [serverError, setServerError] = useState(null);
  const [result, setResult] = useState(null);

  const abortRef = useRef(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const optionsRef = useRef({});
  optionsRef.current = { endpoint, method, schema, initialData, onSuccess, onError, transform };

  const setValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleChange = useCallback(
    (e) => {
      const target = e.target;
      const value = target.type === 'checkbox' ? target.checked : target.value;
      setValue(target.name, value);
    },
    [setValue]
  );

  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const sc = optionsRef.current.schema || {};
    if (!sc[name]) return;
    const fieldErrors = validateValues(valuesRef.current, { [name]: sc[name] });
    if (fieldErrors[name]) {
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }, []);

  const submit = useCallback(async (overrideValues) => {
    const opts = optionsRef.current;
    const payloadValues = { ...valuesRef.current, ...(overrideValues || {}) };

    // 1) Validasi lokal sebelum kirim
    setStatus('validating');
    const validationErrors = validateValues(payloadValues, opts.schema);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const err = {
        isApiError: false,
        status: 0,
        message: 'Periksa kembali isian form Anda.',
        errors: validationErrors,
      };
      setServerError(err);
      setStatus('error');
      if (opts.onError) opts.onError(err);
      return { ok: false, errors: validationErrors };
    }

    // 2) Kirim ke API
    setStatus('loading');
    setServerError(null);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const isGet = String(opts.method).toLowerCase() === 'get';
      const response = await api({
        url: opts.endpoint,
        method: opts.method,
        data: isGet ? undefined : opts.transform(payloadValues),
        params: isGet ? payloadValues : undefined,
        signal: controller.signal,
      });

      const mapped = mapResponse(response.data);
      setResult(mapped);
      setStatus('success');
      if (opts.onSuccess) opts.onSuccess(mapped, response);
      return { ok: true, data: mapped };
    } catch (rawErr) {
      if (
        (axios.isCancel && axios.isCancel(rawErr)) ||
        rawErr?.name === 'CanceledError' ||
        rawErr?.code === 'ERR_CANCELED'
      ) {
        return { ok: false, canceled: true };
      }
      const normalized = normalizeError(rawErr);
      setServerError(normalized);
      // Map error per-field dari server (mis. 422) langsung ke form
      if (normalized.errors && typeof normalized.errors === 'object') {
        setErrors((prev) => ({ ...prev, ...normalized.errors }));
      }
      setStatus('error');
      if (opts.onError) opts.onError(normalized);
      return { ok: false, error: normalized };
    }
  }, []);

  const reset = useCallback((nextValues) => {
    if (abortRef.current) abortRef.current.abort();
    setValues(nextValues !== undefined ? nextValues : optionsRef.current.initialData || {});
    setErrors({});
    setTouched({});
    setStatus('idle');
    setServerError(null);
    setResult(null);
  }, []);

  return {
    values,
    errors,
    touched,
    status,
    isLoading: status === 'loading',
    isSubmitting: status === 'loading' || status === 'validating',
    isSuccess: status === 'success',
    isError: status === 'error',
    serverError,
    result,
    setValue,
    handleChange,
    handleBlur,
    submit,
    reset,
  };
}

export default useFormSubmit;
