'use strict';

/**
 * src/validators/dbg.schema.js
 * Skema validasi Zod (v3) untuk entitas 'dbg' + middleware validasi Express,
 * format error response konsisten, dan helper pagination. Siap jalan.
 *
 * Instal dependensi: npm install zod@^3.22.0
 */

const { z } = require('zod');

// ---------------------------------------------------------------------------
// Konstanta domain
// ---------------------------------------------------------------------------
const DBG_STATUSES = ['draft', 'active', 'archived'];
const DBG_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SORTABLE_FIELDS = ['name', 'status', 'priority', 'createdAt', 'updatedAt'];

// ---------------------------------------------------------------------------
// Primitif
// ---------------------------------------------------------------------------
const uuidSchema = z.string().uuid('id harus UUID v4 yang valid');

const nameSchema = z
  .string({ required_error: 'name wajib diisi', invalid_type_error: 'name harus string' })
  .trim()
  .min(3, 'name minimal 3 karakter')
  .max(100, 'name maksimal 100 karakter');

const descriptionSchema = z
  .string({ invalid_type_error: 'description harus string' })
  .trim()
  .max(1000, 'description maksimal 1000 karakter')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const statusSchema = z.enum(DBG_STATUSES, {
  errorMap: () => ({ message: 'status harus salah satu dari: ' + DBG_STATUSES.join(', ') }),
});

const prioritySchema = z.enum(DBG_PRIORITIES, {
  errorMap: () => ({ message: 'priority harus salah satu dari: ' + DBG_PRIORITIES.join(', ') }),
});

const tagsSchema = z
  .array(z.string().trim().min(1, 'tag tidak boleh kosong').max(30, 'setiap tag maksimal 30 karakter'))
  .max(10, 'maksimal 10 tag')
  .optional()
  .default([]);

const dueDateSchema = z
  .string()
  .datetime({ offset: true, message: 'dueDate harus ISO 8601 dengan offset, contoh: 2025-01-31T00:00:00Z' })
  .nullable()
  .optional();

const metadataSchema = z.record(z.unknown()).optional();

// ---------------------------------------------------------------------------
// Skema entitas dbg
// ---------------------------------------------------------------------------
const dbgCreateSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema,
    status: statusSchema.optional().default('draft'),
    priority: prioritySchema.optional().default('medium'),
    tags: tagsSchema,
    dueDate: dueDateSchema,
    metadata: metadataSchema,
  })
  .strict();

const dbgUpdateSchema = dbgCreateSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'minimal satu field harus disertakan untuk update',
    path: ['body'],
  });

const dbgIdParamsSchema = z.object({ id: uuidSchema }).strict();

// ---------------------------------------------------------------------------
// Pagination & query list
// ---------------------------------------------------------------------------
const paginationSchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'page harus angka' })
    .int('page harus bilangan bulat')
    .min(1, 'page minimal 1')
    .default(1),
  limit: z.coerce
    .number({ invalid_type_error: 'limit harus angka' })
    .int('limit harus bilangan bulat')
    .min(1, 'limit minimal 1')
    .max(100, 'limit maksimal 100')
    .default(10),
});

const dbgListQuerySchema = paginationSchema.extend({
  sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  q: z.string().trim().max(100, 'q maksimal 100 karakter').optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
});

// ---------------------------------------------------------------------------
// Format error konsisten
// ---------------------------------------------------------------------------
function formatZodError(zodError) {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Payload tidak valid. Periksa kembali data yang dikirim.',
      details: zodError.issues.map((issue) => ({
        field: issue.path.length ? issue.path.join('.') : '_root',
        message: issue.message,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Middleware validasi Express
// Pemakaian: router.post('/', validate({ body: dbgCreateSchema }), handler)
// Hasil parse tersedia di req.validatedBody / req.validatedQuery / req.validatedParams
// ---------------------------------------------------------------------------
function validate(schemas) {
  const { body, query, params } = schemas || {};
  return function validateMiddleware(req, res, next) {
    try {
      if (params) req.validatedParams = params.parse(req.params || {});
      if (query) req.validatedQuery = query.parse(req.query || {});
      if (body) req.validatedBody = body.parse(req.body || {});
      return next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(formatZodError(err));
      }
      return next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Helper meta pagination
// ---------------------------------------------------------------------------
function buildPaginationMeta(totalItems, page, limit) {
  const total = Number(totalItems) || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    totalItems: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = {
  DBG_STATUSES,
  DBG_PRIORITIES,
  SORTABLE_FIELDS,
  uuidSchema,
  dbgCreateSchema,
  dbgUpdateSchema,
  dbgIdParamsSchema,
  paginationSchema,
  dbgListQuerySchema,
  formatZodError,
  validate,
  buildPaginationMeta,
};
