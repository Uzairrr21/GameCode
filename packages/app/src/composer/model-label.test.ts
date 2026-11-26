import { expect, test } from "bun:test"
import { GAMECODE_MODEL_LABEL, GAMECODE_PROVIDER_LABEL } from "../providers/models/display-label"
import { composerModelLabelKey, composerModelLabels, composerProviderName } from "./model-label"

const catalog: Map<
  string,
  { id: string; models: Record<string, { id: string; name?: string; speed?: { base: string } }> }
> = new Map([
  [
    "opencode",
    {
      id: "opencode",
      models: {
        modelA: { id: "modelA", name: "Private model name" },
        modelB: { id: "modelB", name: "Another private model name", speed: { base: "modelA" } },
      },
    },
  ],
  [
    "openrouter",
    {
      id: "openrouter",
      models: { modelC: { id: "modelC", name: "Another provider model" } },
    },
  ],
])

test("uses GameCode labels for all models without exposing provider or model names", () => {
  const labels = composerModelLabels(catalog)

  expect(composerProviderName("openrouter", catalog)).toBe(GAMECODE_PROVIDER_LABEL)
  expect(labels.get(composerModelLabelKey("opencode", "modelA"))).toEqual({
    provider: GAMECODE_PROVIDER_LABEL,
    model: GAMECODE_MODEL_LABEL,
  })
  expect(labels.get(composerModelLabelKey("opencode", "modelB"))).toEqual({
    provider: GAMECODE_PROVIDER_LABEL,
    model: GAMECODE_MODEL_LABEL,
  })
  expect(labels.get(composerModelLabelKey("openrouter", "modelC"))).toEqual({
    provider: GAMECODE_PROVIDER_LABEL,
    model: GAMECODE_MODEL_LABEL,
  })
})

test("does not display models from disconnected providers", () => {
  const labels = composerModelLabels(catalog, ["opencode"])

  expect(labels.has(composerModelLabelKey("opencode", "modelA"))).toBe(true)
  expect(labels.has(composerModelLabelKey("openrouter", "modelC"))).toBe(false)
})
