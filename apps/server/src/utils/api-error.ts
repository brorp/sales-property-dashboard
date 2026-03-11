/**
 * Custom error class for API errors with HTTP status codes.
 *
 * Usage:
 *   throw new ApiError(400, "FIELD_REQUIRED", "name is required");
 *   throw ApiError.badRequest("FIELD_REQUIRED", "name is required");
 *   throw ApiError.notFound("Lead not found");
 *   throw ApiError.conflict("EMAIL_ALREADY_EXISTS", "Email already exists");
 */
export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor(statusCode: number, code: string, message?: string) {
        super(message || code);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "ApiError";
    }

    static badRequest(code: string, message?: string) {
        return new ApiError(400, code, message);
    }

    static unauthorized(message = "Unauthorized") {
        return new ApiError(401, "UNAUTHORIZED", message);
    }

    static forbidden(code: string, message?: string) {
        return new ApiError(403, code, message);
    }

    static notFound(message = "Not found") {
        return new ApiError(404, "NOT_FOUND", message);
    }

    static conflict(code: string, message?: string) {
        return new ApiError(409, code, message);
    }
}

/**
 * Maps well-known Postgres error codes to user-friendly ApiError responses.
 * Drizzle ORM surfaces raw Postgres errors; this function catches them.
 */
export function mapDatabaseError(error: unknown): ApiError | null {
    if (!error || typeof error !== "object") return null;

    const pgError = error as Record<string, unknown>;

    // Postgres error codes — see https://www.postgresql.org/docs/current/errcodes-appendix.html
    const pgCode =
        pgError.code ?? (pgError as any).cause?.code ?? null;

    if (typeof pgCode !== "string") return null;

    // 23505 = unique_violation
    if (pgCode === "23505") {
        const detail = String(pgError.detail || pgError.message || "");
        const constraint = String(pgError.constraint_name || pgError.constraint || "");

        if (constraint.includes("email") || detail.toLowerCase().includes("email")) {
            return ApiError.conflict("EMAIL_ALREADY_EXISTS", "Email sudah terdaftar");
        }
        if (constraint.includes("phone") || detail.toLowerCase().includes("phone")) {
            return ApiError.conflict("PHONE_ALREADY_EXISTS", "Nomor telepon sudah terdaftar");
        }
        if (constraint.includes("queue_order") || detail.toLowerCase().includes("queue_order")) {
            return ApiError.conflict("QUEUE_ORDER_CONFLICT", "Urutan antrian sudah dipakai");
        }
        if (constraint.includes("sales_id") || detail.toLowerCase().includes("sales_id")) {
            return ApiError.conflict("SALES_ALREADY_IN_QUEUE", "Sales sudah ada di antrian");
        }
        if (constraint.includes("meta_lead_id") || detail.toLowerCase().includes("meta_lead_id")) {
            return ApiError.conflict("DUPLICATE_META_LEAD", "Lead Meta Ads sudah pernah masuk");
        }
        if (constraint.includes("provider_id") || detail.toLowerCase().includes("provider_message_id")) {
            return ApiError.conflict("DUPLICATE_WA_MESSAGE", "Pesan WhatsApp sudah tercatat");
        }

        return ApiError.conflict(
            "DUPLICATE_ENTRY",
            `Data duplikat: ${detail || constraint || "unique constraint violated"}`
        );
    }

    // 23503 = foreign_key_violation
    if (pgCode === "23503") {
        const detail = String(pgError.detail || pgError.message || "");
        if (detail.toLowerCase().includes("user") || detail.toLowerCase().includes("sales")) {
            return ApiError.badRequest("INVALID_USER_REFERENCE", "User/Sales yang direferensikan tidak ditemukan");
        }
        if (detail.toLowerCase().includes("lead")) {
            return ApiError.badRequest("INVALID_LEAD_REFERENCE", "Lead yang direferensikan tidak ditemukan");
        }
        return ApiError.badRequest(
            "INVALID_REFERENCE",
            `Referensi tidak valid: ${detail || "foreign key constraint violated"}`
        );
    }

    // 23502 = not_null_violation
    if (pgCode === "23502") {
        const column = String(pgError.column_name || pgError.column || "");
        return ApiError.badRequest(
            "FIELD_REQUIRED",
            column ? `Field '${column}' wajib diisi` : "Field yang wajib belum diisi"
        );
    }

    // 23514 = check_violation
    if (pgCode === "23514") {
        return ApiError.badRequest("VALIDATION_FAILED", "Data tidak memenuhi validasi database");
    }

    // 22P02 = invalid_text_representation (e.g. invalid UUID, invalid enum)
    if (pgCode === "22P02") {
        return ApiError.badRequest("INVALID_DATA_FORMAT", "Format data tidak valid");
    }

    return null;
}
