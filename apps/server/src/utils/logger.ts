import util from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../../logs");
const HANDLED_ERROR_FLAG = Symbol.for("property-lounge.handled-error");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? "info" : "debug");

type UnknownRecord = Record<string | symbol, unknown>;

function serializeError(error: Error, seen: WeakSet<object>) {
    const serialized: Record<string, unknown> = {
        name: error.name,
        message: error.message,
        stack: error.stack,
    };

    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
        serialized.cause = serializeLogValue(cause, seen);
    }

    for (const key of Object.keys(error)) {
        const value = (error as unknown as UnknownRecord)[key];
        if (value !== undefined) {
            serialized[key] = serializeLogValue(value, seen);
        }
    }

    return serialized;
}

function serializeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
    ) {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value instanceof Error) {
        if (seen.has(value)) {
            return { message: value.message, circular: true };
        }
        seen.add(value);
        return serializeError(value, seen);
    }

    if (Buffer.isBuffer(value)) {
        return `<Buffer ${value.length} bytes>`;
    }

    if (Array.isArray(value)) {
        return value.map((item) => serializeLogValue(item, seen));
    }

    if (typeof value === "object") {
        if (seen.has(value as object)) {
            return "[Circular]";
        }
        seen.add(value as object);

        const output: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            if (nestedValue !== undefined) {
                output[key] = serializeLogValue(nestedValue, seen);
            }
        }
        return output;
    }

    return String(value);
}

const normalizeLogFormat = winston.format((info: winston.Logform.TransformableInfo) => {
    const normalized = serializeLogValue(info);
    if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
        return normalized as winston.Logform.TransformableInfo;
    }
    return info;
});

function formatConsoleMeta(meta: Record<string, unknown>) {
    const normalized = serializeLogValue(meta);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
        return "";
    }

    const keys = Object.keys(normalized);
    if (keys.length === 0) {
        return "";
    }

    return `\n${util.inspect(normalized, {
        colors: true,
        depth: 6,
        compact: false,
        breakLength: 120,
        sorted: true,
    })}`;
}

const devConsoleFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.colorize({ level: true }),
    winston.format.printf((info: winston.Logform.TransformableInfo & { timestamp?: string }) => {
        const { timestamp, level, message, component, service, ...meta } = info as winston.Logform.TransformableInfo & {
            timestamp?: string;
            component?: string;
            service?: string;
        };

        const scope = component ? ` [${component}]` : "";
        return `${timestamp || ""} ${level}${scope} ${String(message)}${formatConsoleMeta(meta)}`.trim();
    })
);

const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    normalizeLogFormat(),
    winston.format.json()
);

const transports: winston.transport[] = [
    new winston.transports.Console({
        format: IS_PRODUCTION ? jsonFormat : devConsoleFormat,
    }),
    new DailyRotateFile({
        level: "error",
        dirname: LOG_DIR,
        filename: "error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxFiles: "14d",
        maxSize: "20m",
        format: jsonFormat,
    }),
    new DailyRotateFile({
        dirname: LOG_DIR,
        filename: "combined-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxFiles: "14d",
        maxSize: "20m",
        format: jsonFormat,
    }),
];

export const logger = winston.createLogger({
    level: LOG_LEVEL,
    defaultMeta: { service: "property-lounge-api" },
    format: winston.format.combine(normalizeLogFormat(), winston.format.splat()),
    transports,
});

export function createComponentLogger(component: string) {
    return logger.child({ component });
}

export function markErrorAsHandled(error: unknown) {
    if (error && typeof error === "object") {
        (error as UnknownRecord)[HANDLED_ERROR_FLAG] = true;
    }
}

export function isErrorMarkedHandled(error: unknown) {
    return Boolean(
        error &&
        typeof error === "object" &&
        (error as UnknownRecord)[HANDLED_ERROR_FLAG] === true
    );
}

let processHandlersRegistered = false;

export function registerGlobalProcessErrorHandlers() {
    if (processHandlersRegistered) {
        return;
    }
    processHandlersRegistered = true;

    const processLogger = createComponentLogger("process");

    process.on("uncaughtException", (error) => {
        if (isErrorMarkedHandled(error)) {
            return;
        }

        processLogger.error("Unhandled process exception", {
            fatal: true,
            error,
        });

        const exitTimer = setTimeout(() => process.exit(1), 1000);
        exitTimer.unref?.();
    });

    process.on("unhandledRejection", (reason) => {
        if (isErrorMarkedHandled(reason)) {
            return;
        }

        processLogger.error("Unhandled promise rejection", {
            error: reason instanceof Error ? reason : undefined,
            reason: reason instanceof Error ? undefined : reason,
        });
    });
}
