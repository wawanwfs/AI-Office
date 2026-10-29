/**
 * src/utils/validators.js
 * Util validasi form + mapping error REST API ke struktur error form yang konsisten.
 * Dipakai bersama API client (axios/fetch wrapper) saat submit form.
 */

/* ---------------------------------- Aturan ---------------------------------- */

export const rules = {
  required: (message = 'Wajib diisi') => (value) => {
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);
    return empty ? message : null;
  },

  email: (message = 'Format email tidak valid') => (value) => {
    if (value === null || value === undefined || value === '') return null;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(String(value).trim()) ? null : message;
  },

  minLength: (min, message) => (value) => {
    if (value === null || value === undefined || value === '') return null;
    return String(value).length >= min ? null : (message || 'Minimal ' + min + ' karakter');
  },

  maxLength: (max, message) => (value) => {
    if (value === null || value === undefined || value === '') return null;
    return String(value).length <= max ? null : (message || 'Maksimal ' + max + ' karakter');
  },

  pattern: (regex, message = 'Format tidak valid') => (value) => {
    if (value === null || value === undefined || value === '') return null;
    return regex.test(String(value)) ? null : message;
  },

  phone: (message = 'Nomor telepon tidak valid') => (value) => {
    if (value === null || value === undefined || value === '') return null;
    const re = /^(\+?\d{1,3}[- ]?)?\d{8,14}$/;
    return re.test(String(value).replace(/[\s-]/g, '')) ? null : message;
  },

  number: (message = 'Harus berupa angka') => (value) => {
    if (value === null || value === undefined || value === '') return null;
    return !isNaN(Number(value)) ? null : message;
  },

  min: (min, message) => (value) => {
    if (value === null || value === undefined || value === '') return null;
    return Number(value) >= min ? null : (message || 'Minimal ' + min);
  },

  max: (max, message) => (value) => {
    if (value === null || value === undefined || value === '') return null;
    return Number(value) <= max ? null : (message || 'Maksimal ' + max);
  },

  matches: (otherField, message = 'Konfirmasi tidak cocok') => (value, values) => {
    return value === values[otherField] ? null : message;
  },

  custom: (fn) => fn,
};

/* ------------------------------- Validasi form ------------------------------ */

export function validateField(fieldRules, value, allValues) {
  for (const rule of fieldRules) {
    const error = rule(value, allValues);
    if (error) return error;
  }
  return null;
}

export function validateForm(schema, values) {
  const errors = {};
  let valid = true;

  for (const field of Object.keys(schema)) {
    const error = validateField(schema[field], values[field], values);
    if (error) {
      errors[field] = error;
      valid = false;
    }
  }

  return { valid, errors };
}

/* --------------------- Mapping error API -> error form --------------------- */

/**
 * Menyeragamkan error dari REST API menjadi { form: string, fields: {field: message} }.
 * Mendukung format response umum:
 *  - { message: '...' }
 *  - { errors: { email: ['Email sudah dipakai'] } }  (Laravel / DRF style)
 *  - { detail: '...' }                               (DRF style)
 *  - { error: '...' }
 */
export function mapApiErrorToForm(apiError) {
  const result = { form: '', fields: {} };

  if (!apiError) {
    result.form = 'Terjadi kesalahan. Coba lagi.';
    return result;
  }

  // axios error object atau response biasa
  const data = (apiError.response && apiError.response.data) || apiError.data || apiError;

  if (data && typeof data === 'object') {
    if (data.errors && typeof data.errors === 'object') {
      for (const field of Object.keys(data.errors)) {
        const msgs = data.errors[field];
        result.fields[field] = Array.isArray(msgs) ? String(msgs[0]) : String(msgs);
      }
    }
    result.form =
      data.message ||
      data.detail ||
      data.error ||
      (Object.keys(result.fields).length ? '' : 'Terjadi kesalahan pada server.');
  } else if (typeof data === 'string') {
    result.form = data;
  } else {
    result.form = apiError.message || 'Terjadi kesalahan jaringan.';
  }

  if (!result.form && Object.keys(result.fields).length === 0) {
    result.form = 'Terjadi kesalahan. Coba lagi.';
  }

  return result;
}

export function hasErrors(errors) {
  return Object.values(errors || {}).some(Boolean);
}

export default { rules, validateField, validateForm, mapApiErrorToForm, hasErrors };
