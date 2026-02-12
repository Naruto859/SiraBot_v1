/**
 * TypeScript bridge client for the DrissionPage Python subprocess.
 *
 * Spawns `drission_bridge.py` as a child process, communicates via
 * JSON-RPC over stdin/stdout, and provides typed async methods.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import type {
    BridgeRequest,
    BridgeResponse,
    ClickResult,
    DomMapResult,
    ExecuteJsResult,
    NavigateResult,
    ScreenshotResult,
    StealthConfig,
    TypeResult,
} from "./types.js";

const BRIDGE_SCRIPT = path.join(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1")),
    "drission_bridge.py",
);

/** Default timeout for bridge RPC calls (ms). */
const DEFAULT_TIMEOUT_MS = 30_000;

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/**
 * Finds the best available Python executable.
 */
function findPython(): string {
    // Prefer explicit env var
    const envPython = process.env.OPENCLAW_PYTHON_PATH?.trim();
    if (envPython) {
        return envPython;
    }

    // On Windows, try `python` first (py launcher), then `python3`
    if (process.platform === "win32") {
        return "python";
    }

    return "python3";
}

export class DrissionBridge {
    private process: ChildProcess | null = null;
    private rl: readline.Interface | null = null;
    private nextId = 1;
    private pending = new Map<number, PendingRequest>();
    private ready = false;
    private readyPromise: Promise<void> | null = null;
    private closed = false;

    /**
     * Start the Python bridge subprocess.
     */
    async start(): Promise<void> {
        if (this.process) {
            return;
        }

        const python = findPython();

        this.process = spawn(python, [BRIDGE_SCRIPT], {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });

        this.process.on("error", (err: Error) => {
            if (err.message.includes("ENOENT")) {
                const errorMsg = `Python not found (tried: ${python}). Install Python 3.9+ or set OPENCLAW_PYTHON_PATH.`;
                // Reject all pending
                for (const [, req] of this.pending) {
                    clearTimeout(req.timer);
                    req.reject(new Error(errorMsg));
                }
                this.pending.clear();
            }
        });

        this.process.on("exit", (code: number | null) => {
            if (!this.closed) {
                const msg = `DrissionPage bridge exited unexpectedly (code ${code})`;
                for (const [, req] of this.pending) {
                    clearTimeout(req.timer);
                    req.reject(new Error(msg));
                }
                this.pending.clear();
            }
            this.process = null;
            this.rl = null;
            this.ready = false;
        });

        // Capture stderr for diagnostics
        this.process.stderr?.on("data", (chunk: { toString(): string }) => {
            const text = chunk.toString().trim();
            if (text) {
                // eslint-disable-next-line no-console
                console.error(`[drission-bridge] ${text}`);
            }
        });

        // Read JSON lines from stdout
        this.rl = readline.createInterface({
            input: this.process.stdout!,
            crlfDelay: Infinity,
        });

        this.readyPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("DrissionPage bridge did not become ready within 15s"));
            }, 15_000);

            this.rl!.once("line", (line: string) => {
                clearTimeout(timeout);
                try {
                    const msg = JSON.parse(line);
                    if (msg.ready) {
                        this.ready = true;
                        resolve();
                    } else {
                        reject(new Error(`Unexpected first message: ${line}`));
                    }
                } catch {
                    reject(new Error(`Invalid ready message: ${line}`));
                }
            });
        });

        this.rl.on("line", (line: string) => {
            if (!this.ready) {
                return; // First line handled above
            }
            this.handleResponse(line);
        });

        await this.readyPromise;
    }

    /**
     * Send a JSON-RPC request and await the response.
     */
    private rpc<T = unknown>(
        method: string,
        params?: Record<string, unknown>,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.process?.stdin?.writable) {
                reject(new Error("Bridge process not running"));
                return;
            }

            const id = this.nextId++;
            const req: BridgeRequest = { id, method, params };

            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Bridge RPC timeout after ${timeoutMs}ms: ${method}`));
            }, timeoutMs);

            this.pending.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timer,
            });

            const line = JSON.stringify(req) + "\n";
            this.process.stdin.write(line);
        });
    }

    /**
     * Handle a response line from the Python process.
     */
    private handleResponse(line: string): void {
        let resp: BridgeResponse;
        try {
            resp = JSON.parse(line);
        } catch {
            return; // Ignore non-JSON lines
        }

        const pending = this.pending.get(resp.id);
        if (!pending) {
            return;
        }

        this.pending.delete(resp.id);
        clearTimeout(pending.timer);

        if (resp.error) {
            pending.reject(
                new Error(`[drission] ${resp.error.message} (code: ${resp.error.code})`),
            );
        } else {
            pending.resolve(resp.result);
        }
    }

    // ── Public API Methods ──

    /** Initialize the browser with stealth config. */
    async init(stealth?: StealthConfig): Promise<{ status: string }> {
        return this.rpc("init", { stealth: stealth ?? {} }, 60_000);
    }

    /** Navigate to a URL. */
    async navigate(url: string): Promise<NavigateResult> {
        return this.rpc("navigate", { url });
    }

    /** Click an element by CSS selector. */
    async clickElement(selector: string): Promise<ClickResult> {
        return this.rpc("click_element", { selector });
    }

    /** Click at (x, y) coordinates — for vision mode. */
    async clickXY(x: number, y: number): Promise<ClickResult> {
        return this.rpc("click_xy", { x, y });
    }

    /** Type text into an element. */
    async type(
        selector: string,
        text: string,
        opts?: { clear?: boolean; humanTyping?: boolean },
    ): Promise<TypeResult> {
        return this.rpc("type_text", {
            selector,
            text,
            clear: opts?.clear ?? true,
            humanTyping: opts?.humanTyping ?? true,
        });
    }

    /** Take a screenshot. */
    async screenshot(opts?: {
        format?: "png" | "jpeg";
        fullPage?: boolean;
    }): Promise<ScreenshotResult> {
        return this.rpc("screenshot", {
            format: opts?.format ?? "png",
            fullPage: opts?.fullPage ?? false,
        });
    }

    /** Get DOM map of interactive elements (for text-mode AI). */
    async getDomMap(): Promise<DomMapResult> {
        return this.rpc("get_dom_map", {});
    }

    /** Scroll the page. */
    async scroll(direction: "up" | "down" | "top" | "bottom", amount = 300): Promise<void> {
        await this.rpc("scroll", { direction, amount });
    }

    /** Wait for a condition or duration. */
    async wait(opts: { ms?: number; selector?: string }): Promise<{ success: boolean }> {
        return this.rpc("wait", opts);
    }

    /** Execute JavaScript on the page. */
    async executeJs(code: string): Promise<ExecuteJsResult> {
        return this.rpc("execute_js", { code });
    }

    /** Get current page info. */
    async getPageInfo(): Promise<{ url: string; title: string; ready: boolean }> {
        return this.rpc("get_page_info", {});
    }

    /** Close the browser and stop the bridge process. */
    async close(): Promise<void> {
        this.closed = true;
        try {
            await this.rpc("close", {}, 5_000);
        } catch {
            // Ignore errors during close
        }

        for (const [, req] of this.pending) {
            clearTimeout(req.timer);
            req.reject(new Error("Bridge closing"));
        }
        this.pending.clear();

        this.rl?.close();
        this.rl = null;
        this.process?.kill();
        this.process = null;
        this.ready = false;
    }

    /** Check if the bridge is running and ready. */
    isReady(): boolean {
        return this.ready && this.process !== null;
    }
}
