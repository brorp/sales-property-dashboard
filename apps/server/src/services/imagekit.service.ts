const IMAGEKIT_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

function assertImageKitConfigured() {
    if (
        !process.env.IMAGEKIT_PUBLIC_KEY ||
        !process.env.IMAGEKIT_PRIVATE_KEY ||
        !process.env.IMAGEKIT_URL_ENDPOINT
    ) {
        throw new Error("IMAGEKIT_NOT_CONFIGURED");
    }
}

function sanitizeFileName(fileName: string) {
    const trimmed = String(fileName || "proof").trim();
    const normalized = trimmed.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
    return normalized || "proof";
}

export function validateImageMimeType(mimeType: string) {
    return ALLOWED_IMAGE_MIME_TYPES.has(String(mimeType || "").trim().toLowerCase());
}

export function parseImageDataUrl(dataUrl: string) {
    const trimmed = String(dataUrl || "").trim();
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error("INVALID_UPLOAD_IMAGE_DATA");
    }

    const mimeType = match[1].trim().toLowerCase();
    if (!validateImageMimeType(mimeType)) {
        throw new Error("IMAGEKIT_MEDIA_TYPE_NOT_SUPPORTED");
    }

    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) {
        throw new Error("IMAGEKIT_MEDIA_EMPTY");
    }

    if (buffer.length > IMAGEKIT_MAX_BYTES) {
        throw new Error("IMAGEKIT_MEDIA_TOO_LARGE");
    }

    return {
        mimeType,
        buffer,
    };
}

export async function uploadToImageKit(params: {
    file: Buffer;
    fileName: string;
    folder: string;
    mimeType: string;
}) {
    assertImageKitConfigured();

    if (!validateImageMimeType(params.mimeType)) {
        throw new Error("IMAGEKIT_MEDIA_TYPE_NOT_SUPPORTED");
    }

    if (!params.file?.length) {
        throw new Error("IMAGEKIT_MEDIA_EMPTY");
    }

    if (params.file.length > IMAGEKIT_MAX_BYTES) {
        throw new Error("IMAGEKIT_MEDIA_TOO_LARGE");
    }

    const endpoint = String(process.env.IMAGEKIT_URL_ENDPOINT || "").replace(/\/+$/, "");
    const formData = new FormData();
    const safeFileName = sanitizeFileName(params.fileName);
    formData.append(
        "file",
        new Blob([new Uint8Array(params.file)], { type: params.mimeType })
    );
    formData.append("fileName", safeFileName);
    formData.append("folder", params.folder);
    formData.append("useUniqueFileName", "true");

    const basicToken = Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method: "POST",
        headers: {
            Authorization: `Basic ${basicToken}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`IMAGEKIT_UPLOAD_FAILED:${response.status}:${text}`);
    }

    const payload = await response.json();
    const url = typeof payload?.url === "string" ? payload.url.trim() : "";
    if (!url) {
        throw new Error("IMAGEKIT_UPLOAD_URL_EMPTY");
    }

    if (!endpoint || !url.startsWith(endpoint)) {
        return url;
    }

    return url;
}

export async function uploadImageDataUrl(params: {
    dataUrl: string;
    fileName: string;
    folder: string;
}) {
    const parsed = parseImageDataUrl(params.dataUrl);
    return uploadToImageKit({
        file: parsed.buffer,
        fileName: params.fileName,
        folder: params.folder,
        mimeType: parsed.mimeType,
    });
}
