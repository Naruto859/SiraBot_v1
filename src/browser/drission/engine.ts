/**
 * DrissionPage Engine — main integration layer for Sirabot.
 *
 * Wraps the Python bridge with Sirabot-compatible session/lifecycle
 * management and provides a unified API for browser automation.
 */

import { DrissionBridge } from "./bridge-client.js";
import { parseCaptchaConfig, validateCaptchaConfig } from "./captcha-config.js";
import type {
    CaptchaConfig,
    ClickResult,
    DomMapResult,
    DrissionBrowserConfig,
    ExecuteJsResult,
    NavigateResult,
    ScreenshotResult,
    StealthConfig,
    TypeResult,
} from "./types.js";
import { prepareForAI, executeAIClick, resolveInteractionMode, type VisionConfig } from "./vision.js";

export type DrissionEngineStatus = {
    running: boolean;
    url?: string;
    title?: string;
    mode: "vision" | "text";
    captchaEnabled: boolean;
};

export class DrissionEngine {
    private bridge: DrissionBridge;
    private config: DrissionBrowserConfig;
    private captchaConfig: CaptchaConfig | null = null;
    private started = false;

    constructor(config?: DrissionBrowserConfig) {
        this.config = config ?? {};
        this.bridge = new DrissionBridge();

        // Parse captcha config
        if (this.config.captcha) {
            this.captchaConfig = parseCaptchaConfig(
                this.config.captcha as unknown as Record<string, unknown>,
            );
            const validation = validateCaptchaConfig(this.captchaConfig);
            if (!validation.valid) {
                // eslint-disable-next-line no-console
                console.warn(`[drission-engine] Captcha config warning: ${validation.error}`);
            }
        }
    }

    /**
     * Start the DrissionPage engine: launch Python bridge + init browser.
     */
    async start(): Promise<void> {
        if (this.started) {
            return;
        }

        await this.bridge.start();
        await this.bridge.init(this.config.stealth);
        this.started = true;
    }

    /**
     * Stop the engine and close the browser.
     */
    async stop(): Promise<void> {
        if (!this.started) {
            return;
        }
        await this.bridge.close();
        this.started = false;
    }

    /**
     * Check if the engine is running.
     */
    isRunning(): boolean {
        return this.started && this.bridge.isReady();
    }

    /**
     * Get engine status.
     */
    async status(): Promise<DrissionEngineStatus> {
        if (!this.isRunning()) {
            return {
                running: false,
                mode: resolveInteractionMode(this.visionConfig()),
                captchaEnabled: this.captchaConfig?.enabled ?? false,
            };
        }

        const info = await this.bridge.getPageInfo();
        return {
            running: true,
            url: info.url,
            title: info.title,
            mode: resolveInteractionMode(this.visionConfig()),
            captchaEnabled: this.captchaConfig?.enabled ?? false,
        };
    }

    // ── Navigation ──

    async navigate(url: string): Promise<NavigateResult> {
        this.ensureRunning();
        return this.bridge.navigate(url);
    }

    // ── Interactions ──

    async click(selector: string): Promise<ClickResult> {
        this.ensureRunning();
        return this.bridge.clickElement(selector);
    }

    async clickXY(x: number, y: number): Promise<ClickResult> {
        this.ensureRunning();
        return this.bridge.clickXY(x, y);
    }

    async type(
        selector: string,
        text: string,
        opts?: { clear?: boolean; humanTyping?: boolean },
    ): Promise<TypeResult> {
        this.ensureRunning();
        return this.bridge.type(selector, text, opts);
    }

    async scroll(direction: "up" | "down" | "top" | "bottom", amount?: number): Promise<void> {
        this.ensureRunning();
        return this.bridge.scroll(direction, amount);
    }

    async wait(opts: { ms?: number; selector?: string }): Promise<{ success: boolean }> {
        this.ensureRunning();
        return this.bridge.wait(opts);
    }

    // ── Vision / AI ──

    async screenshot(): Promise<ScreenshotResult> {
        this.ensureRunning();
        return this.bridge.screenshot();
    }

    async getDomMap(): Promise<DomMapResult> {
        this.ensureRunning();
        return this.bridge.getDomMap();
    }

    /**
     * Prepare the page for AI interaction.
     * Returns screenshot (vision mode) or numbered DOM list (text mode).
     */
    async prepareForAI() {
        this.ensureRunning();
        return prepareForAI(this.bridge, this.visionConfig());
    }

    /**
     * Execute an AI-directed click.
     */
    async executeAIClick(
        params:
            | { mode: "vision"; x: number; y: number; description?: string }
            | { mode: "text"; elementId: number; domMap: DomMapResult; description?: string },
    ) {
        this.ensureRunning();
        return executeAIClick(this.bridge, this.visionConfig(), params);
    }

    /**
     * Get the current interaction mode.
     */
    getInteractionMode(): "vision" | "text" {
        return resolveInteractionMode(this.visionConfig());
    }

    // ── JavaScript ──

    async executeJs(code: string): Promise<ExecuteJsResult> {
        this.ensureRunning();
        return this.bridge.executeJs(code);
    }

    // ── Page Info ──

    async getPageInfo(): Promise<{ url: string; title: string }> {
        this.ensureRunning();
        return this.bridge.getPageInfo();
    }

    // ── Config Accessors ──

    getCaptchaConfig(): CaptchaConfig | null {
        return this.captchaConfig;
    }

    getStealthConfig(): StealthConfig | undefined {
        return this.config.stealth;
    }

    getRawConfig(): Record<string, unknown> | undefined {
        return this.config.rawConfig;
    }

    // ── Internal Helpers ──

    private visionConfig(): VisionConfig {
        return {
            visionModelAvailable: this.config.visionModelAvailable ?? false,
        };
    }

    private ensureRunning(): void {
        if (!this.isRunning()) {
            throw new Error(
                "DrissionPage engine is not running. Call start() first.",
            );
        }
    }
}
