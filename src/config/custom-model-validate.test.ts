import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { validateCustomModelEndpoint } from "./custom-model-validate.js";

/**
 * Creates a tiny HTTP server that responds to GET /models with a configurable
 * payload. Used to test the validator without any real external dependency.
 */
function createMockServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    const server = http.createServer(handler);
    const listening = new Promise<string>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(`http://127.0.0.1:${addr.port}`);
        });
    });
    const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    return { listening, close };
}

describe("validateCustomModelEndpoint", () => {
    describe("with mock server", () => {
        let baseUrl: string;
        let closeFn: () => Promise<void>;

        afterEach(async () => {
            if (closeFn) {
                await closeFn();
            }
        });

        it("returns ok:true when endpoint returns valid /models response", async () => {
            const mock = createMockServer((_req, res) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        data: [
                            { id: "llama-3.1-8b", object: "model" },
                            { id: "llama-3.1-70b", object: "model" },
                        ],
                    }),
                );
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            const result = await validateCustomModelEndpoint({ endpointUrl: baseUrl });
            expect(result.ok).toBe(true);
            expect(result.status).toBe(200);
            expect(result.models).toEqual(["llama-3.1-8b", "llama-3.1-70b"]);
            expect(result.error).toBeUndefined();
        });

        it("works without api key (no Authorization header sent)", async () => {
            let receivedAuthHeader: string | undefined;
            const mock = createMockServer((req, res) => {
                receivedAuthHeader = req.headers["authorization"] as string | undefined;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ data: [] }));
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            const result = await validateCustomModelEndpoint({ endpointUrl: baseUrl });
            expect(result.ok).toBe(true);
            expect(receivedAuthHeader).toBeUndefined();
        });

        it("sends Authorization header when apiKey is provided", async () => {
            let receivedAuthHeader: string | undefined;
            const mock = createMockServer((req, res) => {
                receivedAuthHeader = req.headers["authorization"] as string | undefined;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ data: [] }));
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            await validateCustomModelEndpoint({ endpointUrl: baseUrl, apiKey: "sk-test-123" });
            expect(receivedAuthHeader).toBe("Bearer sk-test-123");
        });

        it("returns ok:false when endpoint returns non-200 status", async () => {
            const mock = createMockServer((_req, res) => {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "unauthorized" }));
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            const result = await validateCustomModelEndpoint({ endpointUrl: baseUrl });
            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
            expect(result.error).toContain("401");
        });

        it("returns ok:false when response is not valid JSON", async () => {
            const mock = createMockServer((_req, res) => {
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("not json");
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            const result = await validateCustomModelEndpoint({ endpointUrl: baseUrl });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("not valid JSON");
        });

        it("returns ok:true with empty models when data array has no id fields", async () => {
            const mock = createMockServer((_req, res) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ data: [{ name: "no-id" }] }));
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            const result = await validateCustomModelEndpoint({ endpointUrl: baseUrl });
            expect(result.ok).toBe(true);
            expect(result.models).toEqual([]);
        });

        it("strips trailing slash from endpoint URL", async () => {
            let requestPath: string | undefined;
            const mock = createMockServer((req, res) => {
                requestPath = req.url;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ data: [] }));
            });
            baseUrl = await mock.listening;
            closeFn = mock.close;

            await validateCustomModelEndpoint({ endpointUrl: `${baseUrl}/` });
            expect(requestPath).toBe("/models");
        });
    });

    it("returns ok:false when endpoint is unreachable", async () => {
        const result = await validateCustomModelEndpoint({
            endpointUrl: "http://127.0.0.1:1",
            timeoutMs: 2000,
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it("returns ok:false on timeout", async () => {
        // Use a non-routable IP to force timeout
        const result = await validateCustomModelEndpoint({
            endpointUrl: "http://192.0.2.1:9999",
            timeoutMs: 500,
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
