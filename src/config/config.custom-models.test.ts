import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "./types.js";
import { applyModelDefaults } from "./defaults.js";
import { validateConfigObject, validateConfigObjectWithPlugins } from "./validation.js";

describe("customModels schema", () => {
    it("accepts a valid customModels entry", () => {
        const raw = {
            models: {
                customModels: {
                    "my-local-llm": {
                        name: "Local LLM",
                        endpointUrl: "http://localhost:11434/v1",
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.config.models?.customModels?.["my-local-llm"]?.name).toBe("Local LLM");
        }
    });

    it("accepts customModels with apiKey and modelId", () => {
        const raw = {
            models: {
                customModels: {
                    "remote-model": {
                        name: "Remote Model",
                        endpointUrl: "https://my-server.example.com/v1",
                        apiKey: "sk-test-123",
                        modelId: "llama-3.1-70b",
                        validated: true,
                        active: true,
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
            const entry = result.config.models?.customModels?.["remote-model"];
            expect(entry?.apiKey).toBe("sk-test-123");
            expect(entry?.modelId).toBe("llama-3.1-70b");
            expect(entry?.validated).toBe(true);
            expect(entry?.active).toBe(true);
        }
    });

    it("accepts config with no customModels (backwards compatible)", () => {
        const raw = {
            models: {
                providers: {
                    myproxy: {
                        baseUrl: "https://proxy.example/v1",
                        models: [{ id: "gpt-5.2", name: "GPT-5.2" }],
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(true);
    });

    it("rejects customModels entry without name", () => {
        const raw = {
            models: {
                customModels: {
                    "bad-entry": {
                        endpointUrl: "http://localhost:11434/v1",
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(false);
    });

    it("rejects customModels entry with invalid URL", () => {
        const raw = {
            models: {
                customModels: {
                    "bad-url": {
                        name: "Bad URL",
                        endpointUrl: "not-a-url",
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(false);
    });

    it("rejects customModels entry with unknown keys", () => {
        const raw = {
            models: {
                customModels: {
                    "extra-keys": {
                        name: "Extra Keys",
                        endpointUrl: "http://localhost:11434/v1",
                        unknownField: true,
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(false);
    });

    it("accepts multiple customModels entries", () => {
        const raw = {
            models: {
                customModels: {
                    "model-a": {
                        name: "Model A",
                        endpointUrl: "http://localhost:11434/v1",
                    },
                    "model-b": {
                        name: "Model B",
                        endpointUrl: "http://localhost:8080/v1",
                        apiKey: "key-b",
                    },
                },
            },
        };
        const result = validateConfigObject(raw);
        expect(result.ok).toBe(true);
    });
});

describe("customModels with applyModelDefaults", () => {
    it("preserves customModels through applyModelDefaults", () => {
        const cfg = {
            models: {
                customModels: {
                    "my-llm": {
                        name: "My LLM",
                        endpointUrl: "http://localhost:11434/v1",
                    },
                },
            },
        } satisfies OpenClawConfig;

        const next = applyModelDefaults(cfg);
        expect(next.models?.customModels?.["my-llm"]?.name).toBe("My LLM");
    });

    it("preserves customModels alongside provider defaults", () => {
        const cfg = {
            models: {
                providers: {
                    myproxy: {
                        baseUrl: "https://proxy.example/v1",
                        api: "openai-completions",
                        models: [{ id: "gpt-5.2", name: "GPT-5.2" }],
                    },
                },
                customModels: {
                    "local-llm": {
                        name: "Local",
                        endpointUrl: "http://localhost:11434/v1",
                    },
                },
            },
        } satisfies OpenClawConfig;

        const next = applyModelDefaults(cfg);
        // Provider defaults applied
        expect(next.models?.providers?.myproxy?.models?.[0]?.reasoning).toBe(false);
        // Custom models preserved untouched
        expect(next.models?.customModels?.["local-llm"]?.name).toBe("Local");
    });
});
