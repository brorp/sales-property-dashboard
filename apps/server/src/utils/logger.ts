import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../../logs");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? "info" : "debug");

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/** Serialise Error objects so stack traces appear in the log output. */
const enumerateErrorFormat = winston.format((info: winston.Logform.TransformableInfo) => {
    if (info instanceof Error) {
        Object.assign(info, { message: info.message, stack: info.stack });
    }
    // Also handle `error` field passed as metadata
    if ((info as any).error instanceof Error) {
        (info as any).error = {
            message: (info as any).error.message,
            stack: (info as any).error.stack,
            name: (info as any).error.name,
        };
    }
    return info;
});

/** Pretty console format for local dev. */
const devConsoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }: winston.Logform.TransformableInfo & { timestamp?: string }) => {
        const metaStr = Object.keys(meta).length
            ? `  ${JSON.stringify(meta)}`
            : "";
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })
);

/** Structured JSON format for production / log files. */
const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const transports: winston.transport[] = [
    // Console — always enabled
    new winston.transports.Console({
        format: IS_PRODUCTION ? jsonFormat : devConsoleFormat,
    }),
];

// File transports — always enabled (useful even in dev to inspect after the fact)
const errorFileTransport: DailyRotateFile = new DailyRotateFile({
    level: "error",
    dirname: LOG_DIR,
    filename: "error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxFiles: "14d",
    maxSize: "20m",
    format: jsonFormat,
});

const combinedFileTransport: DailyRotateFile = new DailyRotateFile({
    dirname: LOG_DIR,
    filename: "combined-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxFiles: "14d",
    maxSize: "20m",
    format: jsonFormat,
});

transports.push(errorFileTransport, combinedFileTransport);

// ---------------------------------------------------------------------------
// Logger instance
// ---------------------------------------------------------------------------

export const logger = winston.createLogger({
    level: LOG_LEVEL,
    defaultMeta: { service: "property-lounge-api" },
    format: winston.format.combine(
        enumerateErrorFormat(),
        winston.format.splat()
    ),
    transports,
});

// ---------------------------------------------------------------------------
// Global unhandled-error safety-nets
// ---------------------------------------------------------------------------

process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception", { error });
    // Give Winston time to flush before exiting
    setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection", {
        error: reason instanceof Error ? reason : new Error(String(reason)),
    });
});
