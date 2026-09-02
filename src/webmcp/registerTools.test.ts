import { describe, expect, it, vi } from "vitest";
import { registerWebMCPTools } from "./registerTools";

describe("WebMCP registration", () => {
  it("gracefully skips browsers without modelContext", async () => {
    Object.defineProperty(document, "modelContext", { value: undefined, configurable: true });
    await expect(registerWebMCPTools()).resolves.toMatchObject({ supported: false, count: 0 });
  });
  it("registers all eighteen tools on the top-level document", async () => {
    const registerTool = vi.fn(async () => undefined);
    Object.defineProperty(document, "modelContext", { value: { registerTool }, configurable: true });
    const result = await registerWebMCPTools();
    expect(result).toMatchObject({ supported: true, count: 18 });
    expect(registerTool).toHaveBeenCalledTimes(18);
  });
});
