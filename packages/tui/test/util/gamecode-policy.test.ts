import { expect, test } from "bun:test"
import {
  isGameCodeLockedKeymapCommand,
  isGameCodeLockedSlashCommand,
  withoutAgentMentions,
} from "../../src/util/gamecode-policy"

test("locks model, variant, speed, and agent picker keymap commands but allows Tab cycling", () => {
  for (const command of ["agent.list", "model.list", "model.dialog.favorite", "variant.cycle", "speed.list"]) {
    expect(isGameCodeLockedKeymapCommand(command)).toBe(true)
  }
  expect(isGameCodeLockedKeymapCommand("agent.cycle")).toBe(false)
  expect(isGameCodeLockedKeymapCommand("session.new")).toBe(false)
})

test("recognizes locked slash command names and aliases", () => {
  for (const command of ["/agent", "agents", "/model", "models", "/variant", "speeds:mcp"]) {
    expect(isGameCodeLockedSlashCommand(command)).toBe(true)
  }
  expect(isGameCodeLockedSlashCommand("/compact")).toBe(false)
})

test("removes agent mentions from submitted prompt parts", () => {
  expect(
    withoutAgentMentions([
      { type: "file", url: "file:///readme.md" },
      { type: "agent", name: "custom-agent" },
      { type: "skill", id: "review" },
    ]),
  ).toEqual([
    { type: "file", url: "file:///readme.md" },
    { type: "skill", id: "review" },
  ])
})
