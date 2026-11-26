export * as Agent from "./agent.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Array, Context, Effect, Layer, Types } from "effect"
import { Agent } from "@opencode/schema/agent"
import { Bus } from "./bus.js"
import { State } from "./state.js"
import { Access } from "./gamecode/access.js"

export const ID = Agent.ID
export type ID = typeof ID.Type
export const Name = Agent.Name
export type Name = Agent.Name
export const defaultID = ID.make("build")

export const Color = Agent.Color

export const Info = Agent.Info
export type Info = Agent.Info

export { Event } from "@opencode/schema/agent"

export interface Selection {
  readonly id: ID
  readonly info: Info | undefined
}

type Data = {
  agents: Map<ID, Types.DeepMutable<Info>>
  prompts: Map<ID, () => string>
  default?: ID
}

export type Editor = {
  list: () => readonly Types.DeepMutable<Info>[]
  get: (id: ID) => Types.DeepMutable<Info> | undefined
  default: (id: ID | undefined) => void
  update: (id: ID, fn: (agent: Types.DeepMutable<Info>) => void) => void
  prompt: (id: ID, decrypt: () => string) => void
  remove: (id: ID) => void
}

export interface Interface extends State.Transformable<Editor> {
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  readonly resolve: (id?: ID | string) => Effect.Effect<Info | undefined>
  readonly select: (id?: ID) => Effect.Effect<Selection>
  readonly list: () => Effect.Effect<Info[]>
  readonly activate: (id: ID) => Effect.Effect<Info | undefined>
  readonly deactivate: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Agent") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const selectable = (agent: Info | undefined) =>
      agent && agent.mode !== "subagent" && !agent.hidden ? agent : undefined
    const selectedDefault = (data: Data) => {
      const configured = data.default ? selectable(data.agents.get(data.default)) : undefined
      if (configured) return configured
      const build = selectable(data.agents.get(defaultID))
      if (build) return build
      for (const agent of data.agents.values()) {
        const fallback = selectable(agent)
        if (fallback) return fallback
      }
    }
    const list = (data: Data) => {
      if (Access.expired()) return []
      const agents = Array.fromIterable(data.agents.values()).filter(
        (agent) => Access.canUse() || agent.id === "build" || agent.id === "plan",
      )
      const selected = selectedDefault(
        Access.canUse()
          ? data
          : {
              ...data,
              agents: new Map(agents.map((agent) => [agent.id, agent])),
            },
      )
      if (!selected) return agents
      return [selected, ...agents.filter((agent) => agent.id !== selected.id)]
    }
    const state = State.create<Data, Editor>({
      name: "agent",
      initial: () => ({ agents: new Map(), prompts: new Map() }),
      editor: (editor) => ({
        list: () => Array.fromIterable(editor.agents.values()),
        get: (id) => editor.agents.get(id),
        default: (id) => {
          editor.default = id
        },
        update: (id, fn) => {
          const current = editor.agents.get(id) ?? (Info.default(id) as Types.DeepMutable<Info>)
          if (!editor.agents.has(id)) editor.agents.set(id, current)
          fn(current)
          current.id = id
        },
        prompt: (id, decrypt) => {
          editor.prompts.set(id, decrypt)
          const current = editor.agents.get(id)
          if (current) current.system = undefined
        },
        remove: (id) => {
          editor.agents.delete(id)
          editor.prompts.delete(id)
        },
      }),
      notify: State.changes(list, () => bus.publish(Agent.Event.Updated, {}).pipe(Effect.asVoid)),
    })

    const activate = Effect.fn("Agent.activate")(function* (id: ID) {
      if (!Access.canUseCoreAgents() || (!Access.hasApiKey() && id !== "build" && id !== "plan")) return undefined
      const data = state.get()
      const info = data.agents.get(id)
      if (!info) return undefined
      const prompt = data.prompts.get(id)
      return prompt === undefined ? info : { ...info, system: prompt() }
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      get: Effect.fn("Agent.get")(function* (id) {
        return yield* activate(id)
      }),
      resolve: Effect.fnUntraced(function* (id) {
        const selected = id !== undefined ? ID.make(id) : selectedDefault(state.get())?.id
        return selected ? yield* activate(selected) : undefined
      }),
      select: Effect.fn("Agent.select")(function* (id) {
        if (id !== undefined) return { id, info: state.get().agents.get(id) }
        const info = selectedDefault(state.get())
        return { id: info?.id ?? defaultID, info }
      }),
      list: Effect.fn("Agent.list")(function* () {
        return list(state.get())
      }),
      activate,
      deactivate: () => Effect.void,
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Bus.node] })
