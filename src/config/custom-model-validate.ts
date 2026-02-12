/**
 * Connection validator for custom OpenAI-compatible model endpoints.
 *
 * Performs a lightweight check against the standard `/models` listing endpoint
 * to verify that the configured URL is reachable and responding correctly.
 *
 * This module is intentionally standalone — it does not import or modify any
 * existing OpenClaw logic.
 */

export type CustomModelValidationResult = {
    ok: boolean;
    /** HTTP status code returned by the endpoint, if any */
    status?: number;
    /** Model IDs discovered at the endpoint (from the /models response) */
    models?: string[];
    /** Human-readable error description on failure */
    error?: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Validate that a custom model endpoint is reachable and returns a valid
 * OpenAI-compatible `/models` response.
 *
 * - Sends a GET to `{endpointUrl}/models`
 * - Optionally attaches `Authorization: Bearer <apiKey>`
 * - Returns a structured result — never throws
 */
export async function validateCustomModelEndpoint(params: {
    endpointUrl: string;
    apiKey?: string;
    timeoutMs?: number;
}): Promise<CustomModelValidationResult> {
    const { endpointUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

    // Normalise: strip trailing slash before appending /models
    const base = endpointUrl.replace(/\/+$/, "");
    const url = `${base}/models`;

    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    if (apiKey?.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(url, {
                method: "GET",
                headers,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                error: `Endpoint returned HTTP ${response.status}`,
            };
        }

        // Try to parse the standard OpenAI /models response shape:
        //   { "data": [ { "id": "model-name", ... }, ... ] }
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            return {
                ok: false,
                status: response.status,
                error: "Response is not valid JSON",
            };
        }

        const models: string[] = [];
        if (body && typeof body === "object" && "data" in body && Array.isArray((body as { data: unknown }).data)) {
            for (const entry of (body as { data: Array<{ id?: string }> }).data) {
                if (typeof entry?.id === "string") {
                    models.push(entry.id);
                }
            }
        }

        return {
            ok: true,
            status: response.status,
            models,
        };
    } catch (err: unknown) {
        const message =
            err instanceof Error
                ? err.name === "AbortError"
                    ? `Connection timed out after ${timeoutMs}ms`
                    : err.message
                : String(err);

        return {
            ok: false,
            error: message,
        };
    }
}
