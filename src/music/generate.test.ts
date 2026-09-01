import { describe, expect, it } from "vitest";
import { createDemoProject } from "../store/seed";
import { TICKS_PER_BEAT } from "../types";
import { generateLine } from "./generate";

describe("deterministic line generation", () => {
  it("creates the same bass line for the same project", () => { const project=createDemoProject();expect(generateLine(project,"bass",0,4,"flowing")).toEqual(generateLine(project,"bass",0,4,"flowing")); });
  it("places simple bass notes on strong beats", () => { const line=generateLine(createDemoProject(),"bass",0,4,"simple");expect(line.length).toBeGreaterThan(0);expect(line.every((note)=>note.startTick%TICKS_PER_BEAT===0)).toBe(true); });
  it("keeps pads in the chord register", () => { const line=generateLine(createDemoProject(),"pad",0,2,"simple");expect(line.every((note)=>note.pitch>=52&&note.pitch<=76)).toBe(true); });
});
