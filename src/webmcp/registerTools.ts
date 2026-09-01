import { webMCPTools } from "./tools";

const registered = new Set<string>();

export async function registerWebMCPTools() {
  const context = document.modelContext;
  if (typeof context?.registerTool !== "function")
    return { supported: false, count: 0, cleanup: () => undefined };
  for (const tool of webMCPTools) {
    if (registered.has(tool.name)) continue;
    await context.registerTool(tool);
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
