import { GAMECODE_MODEL_LABEL, GAMECODE_PROVIDER_LABEL } from "@/providers/models/display-label"

export type ComposerModelLabel = { provider?: string; model: string }

type Provider = {
  id: string
  models: Readonly<Record<string, { id: string }>>
}

export function composerModelLabelKey(providerID: string, modelID: string) {
  return JSON.stringify([providerID, modelID])
}

export function composerProviderName(
  _providerID: string,
  _catalog: ReadonlyMap<string, Provider>,
  _connected?: readonly string[],
) {
  return GAMECODE_PROVIDER_LABEL
}

export function composerModelLabels(
  catalog: ReadonlyMap<string, Provider>,
  connected?: readonly string[],
): ReadonlyMap<string, ComposerModelLabel> {
  const active = connected && new Set(connected)
  const providers = [...catalog.values()].filter((provider) => !active || active.has(provider.id))
  return new Map(
    providers.flatMap((provider) =>
      Object.values(provider.models).map((model) => [
        composerModelLabelKey(provider.id, model.id),
        { provider: GAMECODE_PROVIDER_LABEL, model: GAMECODE_MODEL_LABEL },
      ] as const),
    ),
  )
}
