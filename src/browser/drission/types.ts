/**
 * Shared types for the DrissionPage browser engine.
 */

// ── JSON-RPC Bridge Protocol ──

export type BridgeRequest = {
    id: number;
    method: string;
    params?: Record<string, unknown>;
};

export type BridgeResponse = {
    id: number;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
};

// ── Stealth Config ──

export type StealthConfig = {
    /** Custom user-agent string. If omitted, DrissionPage uses its default stealth UA. */
    userAgent?: string;
    /** Browser window width (default: 1920). */
    windowWidth?: number;
    /** Browser window height (default: 1080). */
    windowHeight?: number;
    /** Minimum random delay between actions in ms (default: 200). */
    minDelayMs?: number;
    /** Maximum random delay between actions in ms (default: 800). */
    maxDelayMs?: number;
    /** Enable natural (Bézier) mouse movement (default: true). */
    naturalMouseMovement?: boolean;
    /** Disable navigator.webdriver detection flag (default: true). */
    disableWebdriverFlag?: boolean;
    /** Extra Chrome launch arguments. */
    extraArgs?: string[];
    /** Path to Chrome/Chromium executable. */
    executablePath?: string;
    /** Run headless (default: false). */
    headless?: boolean;
    /** Proxy server URL (e.g., "http://user:pass@host:port"). */
    proxy?: string;
};

// ── Vision / Hybrid Mode ──

export type DomElement = {
    /** Auto-assigned numeric ID for text-mode interaction. */
    id: number;
    /** CSS selector path. */
    selector: string;
    /** HTML tag name. */
    tag: string;
    /** Visible text content. */
    text: string;
    /** Element type ("button", "link", "input", etc.). */
    type: string;
    /** Bounding box on screen. */
    rect?: { x: number; y: number; width: number; height: number };
};

export type DomMapResult = {
    elements: DomElement[];
    url: string;
    title: string;
};

export type ScreenshotResult = {
    /** Base64-encoded image data. */
    base64: string;
    /** Image format. */
    format: "png" | "jpeg";
    /** Viewport width at time of capture. */
    width: number;
    /** Viewport height at time of capture. */
    height: number;
};

export type VisionClickResult = {
    mode: "vision" | "text";
    targetDescription: string;
    x?: number;
    y?: number;
    elementId?: number;
};

// ── Captcha Config ──

export type CaptchaProviderConfig = {
    /** Provider name (e.g., "capsolver", "2captcha", "anticaptcha"). */
    provider: string;
    /** API key for the provider. */
    apiKey: string;
    /** Any additional provider-specific parameters. */
    [key: string]: unknown;
};

export type CaptchaConfig = {
    /** Whether captcha solving is enabled. */
    enabled: boolean;
    /** List of configured captcha providers (tried in order). */
    providers: CaptchaProviderConfig[];
};

// ── DrissionPage Engine Config ──

export type DrissionBrowserConfig = {
    /** Stealth/anti-detection settings. */
    stealth?: StealthConfig;
    /** Captcha provider configuration. */
    captcha?: CaptchaConfig;
    /** Whether the connected AI model has vision capabilities. */
    visionModelAvailable?: boolean;
    /** Raw user-defined config passthrough. */
    rawConfig?: Record<string, unknown>;
};

// ── Bridge Action Results ──

export type NavigateResult = {
    url: string;
    title: string;
    status?: number;
};

export type ClickResult = {
    success: boolean;
    elementDescription?: string;
};

export type TypeResult = {
    success: boolean;
    fieldDescription?: string;
};

export type ExecuteJsResult = {
    result: unknown;
};
