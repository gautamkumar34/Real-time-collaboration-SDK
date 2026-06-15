import { z } from 'zod/v4';

// --- Payload size limits ---
export const MAX_OPERATION_BYTES = 64 * 1024; // 64KB total operation
export const MAX_VALUE_BYTES = 32 * 1024;     // 32KB for the value field

// --- Room ID ---
const RoomIdSchema = z
  .string()
  .min(1, 'roomId must not be empty')
  .max(256, 'roomId must be at most 256 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'roomId must be alphanumeric, hyphens, or underscores');

// --- Path segment ---
const PathSegmentSchema = z.union([z.string(), z.number().int()]);

// --- Operation ---
const OperationSchema = z.object({
  id: z.string().min(1, 'id must not be empty'),
  path: z.array(PathSegmentSchema).min(1, 'path must have at least one segment'),
  op: z.enum(['set', 'del']),
  value: z.any().optional(),
  timestamp: z.number().positive('timestamp must be positive'),
  actorId: z.string().min(1, 'actorId must not be empty'),
  version: z.number().int().min(0),
});

export type ValidatedOperation = z.infer<typeof OperationSchema>;

// --- Validation results ---
export interface ValidationOk<T> {
  ok: true;
  data: T;
}

export interface ValidationErr {
  ok: false;
  error: string;
}

export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

// --- Validators ---

export function validateRoomId(roomId: unknown): ValidationResult<string> {
  const result = RoomIdSchema.safeParse(roomId);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid roomId' };
  }
  return { ok: true, data: result.data };
}

export function validateOperation(op: unknown): ValidationResult<ValidatedOperation> {
  // Check raw payload size first (fast reject before parsing)
  const rawSize = estimateJsonSize(op);
  if (rawSize > MAX_OPERATION_BYTES) {
    return { ok: false, error: `Operation payload exceeds ${MAX_OPERATION_BYTES} bytes (got ${rawSize})` };
  }

  const result = OperationSchema.safeParse(op);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid operation' };
  }

  // Check value size for 'set' operations
  if (result.data.op === 'set' && result.data.value !== undefined) {
    const valueSize = estimateJsonSize(result.data.value);
    if (valueSize > MAX_VALUE_BYTES) {
      return { ok: false, error: `Operation value exceeds ${MAX_VALUE_BYTES} bytes (got ${valueSize})` };
    }
  }

  return { ok: true, data: result.data };
}

/**
 * Fast JSON size estimation. Not byte-exact but good enough for
 * payload gating — we want to reject 100KB blobs, not argue about
 * whether something is 31999 or 32001 bytes.
 */
function estimateJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
