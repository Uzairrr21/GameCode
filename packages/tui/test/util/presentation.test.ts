import { expect, test } from "bun:test"
import { epilogue } from "../../src/util/presentation"

const rows = (text: string | undefined) =>
  Bun.stripANSI(text ?? "")
    .split("\n")
    .filter((line) => line.trim() && !/[▀▄█]/.test(line))

test("prints nothing without a session or update", () => {
  expect(epilogue({})).toBeUndefined()
})

test("formats a branded session continuation summary", () => {
  expect(rows(epilogue({ session: { title: "A session", sessionID: "ses_123" } }))).toEqual([
    "  GameCode",
    "  Session   A session",
    "  Continue  GameCode session ses_123",
  ])
})

test("tells the user to start GameCode again after an update", () => {
  expect(rows(epilogue({ updatedVersion: "2.0.0" }))).toEqual(["  GameCode", "  Run GameCode again to use 2.0.0"])
})

test("keeps the session continuation after an update", () => {
  expect(rows(epilogue({ session: { title: "A session", sessionID: "ses_123" }, updatedVersion: "2.0.0" }))).toEqual([
    "  GameCode",
    "  Run GameCode again to use 2.0.0",
    "  Session   A session",
    "  Continue  GameCode session ses_123",
  ])
})
