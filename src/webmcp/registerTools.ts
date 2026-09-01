import { instrumentTool } from "./activity";
import { webMCPTools } from "./tools";

const registered = new Set<string>();

/**
 * ChatGPT's browser exposes WebMCP as `document.modelContext`; the W3C draft
 * (Chrome) uses `navigator.modelContext` with the same registerTool shape.
 * Prefer the first, accept the second, and stay silent when neither exists.
 */
export function resolveModelContext(): ModelContext | null {
  if (typeof document !== "undefined" && typeof document.modelContext?.registerTool === "function")
    return document.modelContext;
  if (typeof navigator !== "undefined" && typeof navigator.modelContext?.registerTool === "function")
    return navigator.modelContext;
  return null;
}

export async function registerWebMCPTools() {
  const context = resolveModelContext();
  if (!context) return { supported: false, count: 0, cleanup: () => undefined };
  for (const tool of webMCPTools) {
    if (registered.has(tool.name)) continue;
    await context.registerTool(instrumentTool(tool));
    registered.add(tool.name);
  }
  return {
    supported: true,
    count: webMCPTools.length,
    cleanup: () => {
      if (typeof context.unregisterTool !== "function") return;
      for (const name of registered) {
        void context.unregisterTool(name);
        registered.delete(name);
      }
    },
  };
}
