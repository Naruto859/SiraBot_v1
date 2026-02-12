/**
 * Flexible captcha configuration reader.
 *
 * Reads captcha provider settings from config without hardcoding any
 * specific provider. Users can dynamically add any captcha service
 * (CapSolver, 2Captcha, AntiCaptcha, etc.) with arbitrary parameters.
 */

import type { CaptchaConfig, CaptchaProviderConfig } from "./types.js";

/**
 * Parse captcha configuration from a raw config object.
 *
 * Expected format in config.json:
 * ```json
 * {
 *   "drission": {
 *     "captcha": {
 *       "enabled": true,
 *       "providers": [
 *         {
 *           "provider": "capsolver",
 *           "apiKey": "CAP-xxx",
 *           "appId": "optional-app-id"
 *         },
 *         {
 *           "provider": "2captcha",
 *           "apiKey": "abc123"
 *         }
 *       ]
 *     }
 *   }
 * }
 * ```
 *
 * Or simplified single-provider format:
 * ```json
 * {
 *   "drission": {
 *     "captcha": {
 *       "provider": "capsolver",
 *       "apiKey": "CAP-xxx"
 *     }
 *   }
 * }
 * ```
 */
export function parseCaptchaConfig(
    raw: Record<string, unknown> | undefined | null,
): CaptchaConfig | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    // Check if it's a multi-provider config
    if (Array.isArray(raw.providers)) {
        const providers = (raw.providers as Record<string, unknown>[])
            .filter((p) => p && typeof p === "object" && typeof p.provider === "string")
            .map((p) => normalizeProvider(p));

        return {
            enabled: raw.enabled !== false,
            providers,
        };
    }

    // Single-provider shorthand: { provider: "...", apiKey: "..." }
    if (typeof raw.provider === "string") {
        return {
            enabled: raw.enabled !== false,
            providers: [normalizeProvider(raw)],
        };
    }

    return null;
}

/**
 * Normalize a raw provider object into a CaptchaProviderConfig.
 * All keys are passed through dynamically — nothing is hardcoded.
 */
function normalizeProvider(raw: Record<string, unknown>): CaptchaProviderConfig {
    const provider = String(raw.provider ?? "").trim();
    const apiKey = String(raw.apiKey ?? "").trim();

    if (!provider) {
        throw new Error("Captcha provider name is required");
    }

    // Pass through all extra keys dynamically
    const config: CaptchaProviderConfig = { provider, apiKey };
    for (const [key, value] of Object.entries(raw)) {
        if (key !== "provider" && key !== "apiKey" && value !== undefined) {
            config[key] = value;
        }
    }

    return config;
}

/**
 * Get the first enabled captcha provider config, or null if none.
 */
export function getActiveCaptchaProvider(
    config: CaptchaConfig | null,
): CaptchaProviderConfig | null {
    if (!config?.enabled || config.providers.length === 0) {
        return null;
    }
    return config.providers[0] ?? null;
}

/**
 * Get a specific captcha provider by name.
 */
export function getCaptchaProvider(
    config: CaptchaConfig | null,
    providerName: string,
): CaptchaProviderConfig | null {
    if (!config?.enabled) {
        return null;
    }
    return (
        config.providers.find(
            (p) => p.provider.toLowerCase() === providerName.toLowerCase(),
        ) ?? null
    );
}

/**
 * Validate that a captcha config has at least one provider with an API key.
 */
export function validateCaptchaConfig(
    config: CaptchaConfig | null,
): { valid: boolean; error?: string } {
    if (!config) {
        return { valid: true }; // No config = valid (just disabled)
    }
    if (!config.enabled) {
        return { valid: true };
    }
    if (config.providers.length === 0) {
        return { valid: false, error: "Captcha enabled but no providers configured" };
    }
    const withKey = config.providers.filter((p) => p.apiKey);
    if (withKey.length === 0) {
        return {
            valid: false,
            error: "Captcha enabled but no providers have an API key",
        };
    }
    return { valid: true };
}
