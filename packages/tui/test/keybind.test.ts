import { expect, test } from "bun:test"
import { TuiKeybind } from "../src/config/keybind"

test("binds agent cycling to Tab and keeps the agent picker disabled", () => {
  expect(TuiKeybind.Definitions["agent.cycle"].default).toBe("tab")
  expect(TuiKeybind.Definitions["agent.list"].default).toBe("none")
  expect(TuiKeybind.Definitions["agent.cycle.reverse"].default).toBe("none")
})
