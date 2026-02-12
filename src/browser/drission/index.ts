/**
 * Barrel exports for the DrissionPage browser engine.
 */

// Core engine
export { DrissionEngine, type DrissionEngineStatus } from "./engine.js";

// Bridge client
export { DrissionBridge } from "./bridge-client.js";

// Vision / hybrid AI logic
export {
    executeAIClick,
    findElementById,
    formatDomMapForAI,
    prepareForAI,
    resolveInteractionMode,
    textModeScan,
    visionScreenshot,
    type VisionConfig,
} from "./vision.js";

// Captcha configuration
export {
    getActiveCaptchaProvider,
    getCaptchaProvider,
    parseCaptchaConfig,
    validateCaptchaConfig,
} from "./captcha-config.js";

// Types
export type {
    BridgeRequest,
    BridgeResponse,
    CaptchaConfig,
    CaptchaProviderConfig,
    ClickResult,
    DomElement,
    DomMapResult,
    DrissionBrowserConfig,
    ExecuteJsResult,
    NavigateResult,
    ScreenshotResult,
    StealthConfig,
    TypeResult,
    VisionClickResult,
} from "./types.js";
