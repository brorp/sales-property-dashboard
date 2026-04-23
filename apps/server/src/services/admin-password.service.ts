import { verifyCredentialPasswordForUser } from "../auth/credential-account";

type AdminPasswordVerificationInput = {
    actorUserId: string;
    actorRole: string;
    password: string;
};

export async function assertAdminPasswordConfirmation(
    input: AdminPasswordVerificationInput
) {
    if (input.actorRole !== "root_admin" && input.actorRole !== "client_admin") {
        throw new Error("FORBIDDEN");
    }

    const normalizedPassword = String(input.password || "").trim();
    if (!normalizedPassword) {
        throw new Error("ADMIN_PASSWORD_REQUIRED");
    }

    const isValid = await verifyCredentialPasswordForUser(
        input.actorUserId,
        normalizedPassword
    );

    if (!isValid) {
        throw new Error("ADMIN_PASSWORD_INVALID");
    }
}
