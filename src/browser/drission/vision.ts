/**
 * Hybrid Vision Logic for DrissionPage engine.
 *
 * Determines whether the connected AI model has vision capabilities:
 * - Vision mode:  screenshot → send to AI → get (x, y) → clickXY
 * - Text mode:    DOM scan → numbered elements → AI picks ID → click element
 */

import type { DrissionBridge } from "./bridge-client.js";
import type { DomElement, DomMapResult, ScreenshotResult, VisionClickResult } from "./types.js";

export type VisionConfig = {
    /** Whether the connected AI model supports vision/image input. */
    visionModelAvailable: boolean;
};

/**
 * Format a DOM map into a numbered, human-readable list for text-only AI.
 *
 * Example output:
 * ```
 * [1] button "Log In"
 * [2] link "Sign Up" (href: /signup)
 * [3] input:text "Email" (placeholder: Enter email)
 * ```
 */
export function formatDomMapForAI(domMap: DomMapResult): string {
    if (!domMap.elements || domMap.elements.length === 0) {
        return "(No interactive elements found on page)";
    }

    const lines = [
        `Page: ${domMap.title}`,
        `URL: ${domMap.url}`,
        `Interactive elements (${domMap.elements.length}):`,
        "",
    ];

    for (const el of domMap.elements) {
        const textPart = el.text ? ` "${el.text}"` : "";
        lines.push(`[${el.id}] ${el.type}${textPart}`);
    }

    return lines.join("\n");
}

/**
 * Find a DOM element by its assigned numeric ID.
 */
export function findElementById(
    domMap: DomMapResult,
    elementId: number,
): DomElement | undefined {
    return domMap.elements.find((el) => el.id === elementId);
}

/**
 * Perform a vision-mode click:
 * 1. Take screenshot
 * 2. (Caller sends screenshot to AI, gets x/y back)
 * 3. Click at coordinates
 */
export async function visionScreenshot(bridge: DrissionBridge): Promise<ScreenshotResult> {
    return bridge.screenshot({ format: "png", fullPage: false });
}

/**
 * Perform a text-mode interaction:
 * 1. Scan DOM for interactive elements
 * 2. Return numbered element map for AI to choose from
 */
export async function textModeScan(bridge: DrissionBridge): Promise<{
    domMap: DomMapResult;
    formatted: string;
}> {
    const domMap = await bridge.getDomMap();
    const formatted = formatDomMapForAI(domMap);
    return { domMap, formatted };
}

/**
 * Execute a click based on AI's response.
 *
 * In vision mode: AI provides (x, y) coordinates.
 * In text mode: AI provides element ID from the numbered list.
 */
export async function executeAIClick(
    bridge: DrissionBridge,
    config: VisionConfig,
    params:
        | { mode: "vision"; x: number; y: number; description?: string }
        | { mode: "text"; elementId: number; domMap: DomMapResult; description?: string },
): Promise<VisionClickResult> {
    if (params.mode === "vision") {
        await bridge.clickXY(params.x, params.y);
        return {
            mode: "vision",
            targetDescription: params.description ?? `Click at (${params.x}, ${params.y})`,
            x: params.x,
            y: params.y,
        };
    }

    // Text mode: find element by ID and click its selector
    const element = findElementById(params.domMap, params.elementId);
    if (!element) {
        throw new Error(
            `Element ID [${params.elementId}] not found. Valid IDs: ${params.domMap.elements.map((e) => e.id).join(", ")}`,
        );
    }

    await bridge.clickElement(element.selector);
    return {
        mode: "text",
        targetDescription: params.description ?? `${element.type} "${element.text}"`,
        elementId: params.elementId,
    };
}

/**
 * Determine the interaction mode based on config.
 */
export function resolveInteractionMode(config: VisionConfig): "vision" | "text" {
    return config.visionModelAvailable ? "vision" : "text";
}

/**
 * High-level helper: prepare the page state for AI interaction.
 *
 * - Vision model → returns screenshot (base64)
 * - Text model → returns formatted DOM element list
 */
export async function prepareForAI(
    bridge: DrissionBridge,
    config: VisionConfig,
): Promise<
    | { mode: "vision"; screenshot: ScreenshotResult }
    | { mode: "text"; domMap: DomMapResult; formatted: string }
> {
    const mode = resolveInteractionMode(config);

    if (mode === "vision") {
        const screenshot = await visionScreenshot(bridge);
        return { mode: "vision", screenshot };
    }

    const { domMap, formatted } = await textModeScan(bridge);
    return { mode: "text", domMap, formatted };
}
