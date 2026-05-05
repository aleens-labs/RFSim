const { z } = require("zod");

const registerSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(12),
  fullName: z.string().min(1).max(120).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1),
});

const projectCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().default(""),
  state: z.any().optional().default({}),
  schemaVersion: z.number().int().nonnegative().optional(),
  clientSavedAt: z.string().datetime({ offset: true }).optional(),
});

const projectUpdateSchema = projectCreateSchema.partial().extend({
  revision: z.number().int().nonnegative(),
});

const snapshotSchema = z.object({
  label: z.string().min(1).max(120),
  state: z.any().optional(),
});

module.exports = {
  loginSchema,
  projectCreateSchema,
  projectUpdateSchema,
  registerSchema,
  snapshotSchema,
};
