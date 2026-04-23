import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { ApiError, mapDatabaseError } from "../utils/api-error";
import { createComponentLogger } from "../utils/logger";

const errorLogger = createComponentLogger("http:error");

const knownBadRequestCodes = new Set([
    "FORBIDDEN_ASSIGN",
    "FORBIDDEN_LEAD_EDIT",
    "ADMIN_ASSIGNED_LEAD_READ_ONLY",
    "INVALID_SALES_STATUS",
    "INVALID_RESULT_STATUS",
    "SALES_STATUS_REQUIRES_ACCEPTED",
    "SALES_STATUS_TOO_EARLY",
    "CLOSING_FIELDS_REQUIRE_CLOSING_STATUS",
    "CLOSING_FIELDS_REQUIRE_AKAD_STATUS",
    "CLOSING_FIELDS_REQUIRED",
    "REJECT_REASON_REQUIRES_BATAL_STATUS",
    "REJECT_REASON_REQUIRED",
    "CANCEL_REASON_REQUIRED",
    "CANCEL_NOTES_REQUIRED",
    "CANCEL_REASON_REQUIRES_CANCEL_STATUS",
    "INVALID_CANCEL_REASON",
    "CANCEL_REASON_FIELDS_REQUIRED",
    "LEAD_NOT_FOUND",
    "LEAD_ACCEPT_REQUIRES_ASSIGNED",
    "LEAD_ALREADY_ASSIGNED",
    "LEAD_NOT_STARTABLE",
    "INVALID_QUEUE_PAYLOAD",
    "QUEUE_EMPTY",
    "QUEUE_SIZE_MISMATCH",
    "UNKNOWN_SALES_IN_QUEUE",
    "QUEUE_ITEM_NOT_FOUND",
    "INVALID_ASSIGNED_SALES",
    "CROSS_CLIENT_ASSIGNMENT_FORBIDDEN",
    "FAILED_TO_CREATE_USER",
    "UNIT_FIELDS_REQUIRED",
    "INVALID_INTEREST_UNIT",
    "INTEREST_UNIT_REQUIRES_ACCEPTED",
    "DOMICILE_REQUIRES_ACCEPTED",
    "CUSTOMER_PIPELINE_ONLY_AFTER_ACCEPTED",
    "CUSTOMER_PIPELINE_STEP_INVALID",
    "CUSTOMER_PIPELINE_FOLLOW_UP_LOCKED",
    "CUSTOMER_PIPELINE_NOTE_REQUIRED",
    "INVALID_DISTRIBUTION_ACK_TIMEOUT",
    "INVALID_OPERATIONAL_TIMEZONE",
    "INVALID_OPERATIONAL_TIME",
    "INVALID_OPERATIONAL_TIME_RANGE",
    "OUTSIDE_OFFICE_REPLY_REQUIRED",
    "BROADCAST_STATUS_EMPTY",
    "BROADCAST_INTERVAL_INVALID",
    "INVALID_MEDIA_DATA_URL",
    "MEDIA_TYPE_NOT_SUPPORTED",
    "MEDIA_EMPTY",
    "BROADCAST_CONTENT_EMPTY",
    "BROADCAST_NO_TARGET",
    "IMPORT_FILE_EMPTY",
    "IMPORT_HEADER_INVALID",
    "SALES_CLIENT_NOT_FOUND",
    "TARGET_SALES_CLIENT_NOT_FOUND",
    "LEADS_EXPORT_ACCESS_CODE_REQUIRED",
    "LEADS_EXPORT_ACCESS_CODE_INVALID",
    "LEADS_EXPORT_ACCESS_CODE_NOT_CONFIGURED",
    "SALES_PROFILE_PHONE_READ_ONLY",
    "DAILY_TASK_TYPE_MISMATCH",
    "DAILY_TASK_SCREENSHOT_REQUIRED",
    "DAILY_TASK_INVALID_SALES_STATUS",
    "INVALID_UPLOAD_IMAGE_DATA",
    "IMAGEKIT_MEDIA_TYPE_NOT_SUPPORTED",
    "IMAGEKIT_MEDIA_TOO_LARGE",
    "IMAGEKIT_MEDIA_EMPTY",
    "UPLOAD_IMAGE_REQUIRED",
    "PENALTY_COMPENSATION_REASON_REQUIRED",
    "INVALID_SUPERVISOR",
    "SUPERVISOR_HAS_ACTIVE_SALES",
    "ADMIN_PASSWORD_REQUIRED",
    "ADMIN_PASSWORD_INVALID",
]);

const knownConflictCodes = new Set([
    "EMAIL_ALREADY_EXISTS",
    "BROADCAST_ALREADY_RUNNING",
    "SALES_ALREADY_IN_QUEUE",
    "SALES_SUSPENDED_FROM_QUEUE",
    "DAILY_TASK_NOT_ACTIONABLE",
    "DAILY_TASK_NO_LONGER_ELIGIBLE",
    "CUSTOMER_PIPELINE_MANUAL_DISABLED",
]);

const knownForbiddenCodes = new Set([
    "FORBIDDEN_ASSIGN",
    "FORBIDDEN_LEAD_EDIT",
    "ADMIN_ASSIGNED_LEAD_READ_ONLY",
    "FORBIDDEN_LEAD_ACCEPT",
    "FORBIDDEN_CUSTOMER_PIPELINE_UPDATE",
    "FORBIDDEN_DAILY_TASK",
    "FORBIDDEN_LEAD_DELETE",
]);

const knownNotFoundCodes = new Set([
    "SALES_NOT_FOUND",
    "TARGET_SALES_NOT_FOUND",
    "DAILY_TASK_NOT_FOUND",
    "PENALTY_NOT_FOUND",
    "TEAM_MEMBER_NOT_FOUND",
]);

function getRequestContext(req: Request) {
    const authReq = req as AuthenticatedRequest;

    return {
        requestId: authReq.requestId || null,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        userId: authReq.user?.id || null,
        userRole: authReq.user?.role || null,
        clientId: authReq.user?.clientId || null,
    };
}

function sendErrorResponse(
    res: Response,
    req: Request,
    statusCode: number,
    payload: { error: string; message: string }
) {
    if (res.headersSent) {
        return;
    }

    const requestId = (req as AuthenticatedRequest).requestId || undefined;
    res.status(statusCode).json({
        ...payload,
        ...(requestId ? { requestId } : {}),
    });
}

export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    const requestContext = getRequestContext(req);

    if (err instanceof ApiError) {
        const logPayload = {
            ...requestContext,
            statusCode: err.statusCode,
            errorCode: err.code,
            error: err,
        };

        if (err.statusCode >= 500) {
            errorLogger.error("API error", logPayload);
        } else {
            errorLogger.warn("API error", logPayload);
        }

        sendErrorResponse(res, req, err.statusCode, {
            error: err.code,
            message: err.message,
        });
        return;
    }

    const dbError = mapDatabaseError(err);
    if (dbError) {
        errorLogger.warn("Database error mapped", {
            ...requestContext,
            statusCode: dbError.statusCode,
            errorCode: dbError.code,
            error: err,
        });

        sendErrorResponse(res, req, dbError.statusCode, {
            error: dbError.code,
            message: dbError.message,
        });
        return;
    }

    if (err instanceof Error) {
        if (knownForbiddenCodes.has(err.message)) {
            errorLogger.warn("Handled business rule error", {
                ...requestContext,
                statusCode: 403,
                errorCode: err.message,
                error: err,
            });
            sendErrorResponse(res, req, 403, { error: err.message, message: err.message });
            return;
        }

        if (knownConflictCodes.has(err.message)) {
            errorLogger.warn("Handled business rule error", {
                ...requestContext,
                statusCode: 409,
                errorCode: err.message,
                error: err,
            });
            sendErrorResponse(res, req, 409, { error: err.message, message: err.message });
            return;
        }

        if (knownNotFoundCodes.has(err.message)) {
            errorLogger.warn("Handled business rule error", {
                ...requestContext,
                statusCode: 404,
                errorCode: err.message,
                error: err,
            });
            sendErrorResponse(res, req, 404, { error: err.message, message: err.message });
            return;
        }

        if (knownBadRequestCodes.has(err.message)) {
            errorLogger.warn("Handled business rule error", {
                ...requestContext,
                statusCode: 400,
                errorCode: err.message,
                error: err,
            });
            sendErrorResponse(res, req, 400, { error: err.message, message: err.message });
            return;
        }
    }

    errorLogger.error("Unhandled request error", {
        ...requestContext,
        error: err,
    });

    sendErrorResponse(res, req, 500, {
        error: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
    });
}
