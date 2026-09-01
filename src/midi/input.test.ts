import { describe, expect, it } from "vitest";
import { parseMidiMessage } from "./input";
describe("MIDI parser",()=>{it("recognizes note on",()=>{expect(parseMidiMessage([0x90,60,100])).toMatchObject({isNoteOn:true,isNoteOff:false,pitch:60,velocity:100});});it("treats velocity zero as note off",()=>{expect(parseMidiMessage([0x91,64,0])).toMatchObject({isNoteOn:false,isNoteOff:true,channel:1});});});
