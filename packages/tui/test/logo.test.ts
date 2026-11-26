import { expect, test } from "bun:test"
import { gamecode } from "../src/logo"

test("wordmark uses a single block-letter row when it fits", () => {
  const rows = gamecode.banner(31)

  expect(rows).toHaveLength(4)
  expect(rows.every((row) => row.length === 31)).toBe(true)
})

test("wordmark stacks into two block-letter rows on narrower terminals", () => {
  const rows = gamecode.banner(15)

  expect(rows).toHaveLength(8)
  expect(rows.every((row) => row.length === 15)).toBe(true)
})

test("wordmark falls back when even the stacked layout will not fit", () => {
  expect(gamecode.banner(14)).toEqual([])
})
