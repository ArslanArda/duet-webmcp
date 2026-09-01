import "@testing-library/jest-dom/vitest";

if (!("document" in globalThis)) {
  Object.defineProperty(globalThis, "document", {
    value: {},
    configurable: true,
  });
}

if (!("localStorage" in globalThis)) {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
    configurable: true,
  });
}
