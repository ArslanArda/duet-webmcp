/**
 * Development helper: `?mockAgent` installs a fake `document.modelContext`
 * so the real registration path runs in a plain browser. Registered tools
 * land on `window.__duetTools` and can be called from the console, e.g.
 *   __duetTools.set_chord_progression.execute({ startBar: 0, chords: ["Cm7", "Fm7"] })
 * Never active in production builds.
 */
export function installMockModelContext() {
  if (!import.meta.env.DEV || typeof document === "undefined") return false;
  if (!new URLSearchParams(window.location.search).has("mockAgent")) return false;
  if (document.modelContext) return false;
  const tools: Record<string, WebMCPTool> = {};
  const context: ModelContext = {
    registerTool: async (tool) => {
      tools[tool.name] = tool;
    },
    unregisterTool: (name) => {
      delete tools[name];
    },
  };
  Object.defineProperty(document, "modelContext", { value: context, configurable: true });
  (window as unknown as { __duetTools: Record<string, WebMCPTool> }).__duetTools = tools;
  console.info("[duet] mock modelContext installed; tools on window.__duetTools");
  return true;
}
