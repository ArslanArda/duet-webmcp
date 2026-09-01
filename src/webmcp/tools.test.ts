import { describe, expect, it } from "vitest";
import { webMCPTools } from "./tools";

describe("WebMCP contracts",()=>{
  it("registers exactly ten focused tools",()=>{expect(webMCPTools).toHaveLength(10);expect(webMCPTools.filter((tool)=>tool.annotations?.readOnlyHint)).toHaveLength(3);expect(new Set(webMCPTools.map((tool)=>tool.name)).size).toBe(10);});
  it("keeps every object schema closed",()=>{webMCPTools.forEach((tool)=>expect(tool.inputSchema).toMatchObject({type:"object",additionalProperties:false}));});
  it("returns a compact project summary",async()=>{const tool=webMCPTools.find((item)=>item.name==="get_project_state")!;const result=await tool.execute({}) as Record<string,unknown>;expect(result.ok).toBe(true);expect(result).toHaveProperty("notesSummary");expect(result).not.toHaveProperty("notes");});
  it("returns self-correcting range errors",async()=>{const tool=webMCPTools.find((item)=>item.name==="set_selection")!;const result=await tool.execute({trackId:"melody",startBar:15,endBar:20}) as {ok:boolean;error:{hint:string}};expect(result.ok).toBe(false);expect(result.error.hint).toContain("endBar");});
});
