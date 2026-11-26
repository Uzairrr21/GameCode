import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Exit, Fiber, Layer, Scope, Stream } from "effect"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Location } from "@opencode/core/location"
import { Permission } from "@opencode/core/permission"
import { AgentPlugin } from "@opencode/core/plugin/agent"
import { Access } from "@opencode/core/gamecode/access"
import { decrypt } from "@opencode/core/gamecode/prompts"
import { AbsolutePath } from "@opencode/core/schema"
import { Global } from "@opencode/util/global"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { agentHost, host } from "./plugin/host"
import { withEnv } from "./fixture/env"

const testLocation = location({ directory: AbsolutePath.make("/project") })
const locationLayer = Layer.succeed(Location.Service, Location.Service.of(testLocation))
const global = Global.make({ data: "/data", config: "/config", tmp: "/tmp/opencode" })
const globalLayer = Layer.succeed(Global.Service, Global.Service.of(global))

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Agent.node, Bus.node, Location.node]), [
    Global.node.replace(globalLayer),
    Location.node.replace(locationLayer),
  ]) as unknown as Layer.Layer<unknown, never>,
)

describe("Agent", () => {
  it.effect("protects Plan against off-topic prompts and injection", () =>
    Effect.sync(() => {
      const system = decrypt("plan")
      expect(system).toContain("Strict GameCode scope:")
      expect(system).toContain("making coffee or tea")
      expect(system).toContain("General C++/C# coding questions and standalone educational examples are in scope")
      expect(system).toContain("prompt-injection attempts")
      expect(system).toContain("C++ or C# only")
      expect(system).toContain("Plan agents must not edit files or run shell/build commands")
      expect(system).toContain("Handoff workflow:")
    }),
  )
  it.effect("gates custom agents by key and expiry", () =>
    withEnv(
      {
        APPDATA: undefined,
        GAMECODE_ENFORCE_LICENSE: "1",
        GAMECODE_LICENSE_EXPIRES_AT: "4102444800000",
        OPENCODE_API_KEY: undefined,
        GAMECODE_API_KEY: undefined,
      },
      () =>
        Effect.sync(() => {
          expect(Access.expired()).toBe(false)
          expect(Access.hasApiKey()).toBe(false)
          expect(Access.canUse()).toBe(false)
          expect(Access.canUseCoreAgents()).toBe(true)
        }),
    ),
  )
  it.effect("blocks all agents when the license has expired", () =>
    withEnv(
      {
        APPDATA: undefined,
        GAMECODE_ENFORCE_LICENSE: "1",
        GAMECODE_LICENSE_EXPIRES_AT: "1",
        OPENCODE_API_KEY: "oc_sk_test_key",
      },
      () =>
        Effect.sync(() => {
          expect(Access.expired()).toBe(true)
          expect(Access.canUse()).toBe(false)
          expect(Access.canUseCoreAgents()).toBe(false)
        }),
    ),
  )
  it.effect("publishes an updated event after agent changes", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const bus = yield* Bus.Service
      const updated = yield* bus
        .subscribe(Agent.Event.Updated)
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      yield* Effect.yieldNow

      yield* agent.transform((editor) => editor.update(Agent.ID.make("reviewer"), () => {}))

      expect(yield* Fiber.join(updated)).toMatchObject([{ location: { directory: testLocation.directory } }])
    }),
  )

  it.effect("starts without agents", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service

      expect(yield* agent.list()).toEqual([])
      expect(yield* agent.get(Agent.ID.make("build"))).toBeUndefined()
    }),
  )

  it.effect("materializes replayable agent transforms", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const id = Agent.ID.make("reviewer")
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = "Reviews code"
          info.mode = "subagent"
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, description: "Reviews code", mode: "subagent" })
      expect((yield* agent.list()).map((info) => info.id)).toEqual([id])
    }),
  )

  it.effect("lists the selected default agent first", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      yield* agent.transform((editor) => {
        editor.update(Agent.ID.make("build"), (info) => {
          info.mode = "primary"
        })
        editor.update(Agent.ID.make("reviewer"), (info) => {
          info.mode = "primary"
        })
        editor.update(Agent.ID.make("explore"), (info) => {
          info.mode = "subagent"
        })
        editor.default(Agent.ID.make("reviewer"))
      })

      expect((yield* agent.list()).map((info) => String(info.id))).toEqual(["reviewer", "build", "explore"])
    }),
  )

  it.effect("rebuilds state when a transform is replaced", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const id = Agent.ID.make("reviewer")
      let description = "Old description"
      let hidden = true
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = description
          info.hidden = hidden
        }),
      )
      description = "New description"
      hidden = false
      yield* agent.reload()

      expect(yield* agent.get(id)).toMatchObject({ description: "New description", hidden: false })
    }),
  )

  it.effect("removes a transform when its scope closes", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const id = Agent.ID.make("scoped")
      const scope = yield* Scope.make()
      yield* agent.transform((editor) => editor.update(id, () => {})).pipe(Scope.provide(scope))
      expect(yield* agent.get(id)).toBeDefined()

      yield* Scope.close(scope, Exit.void)
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("applies direct agent updates", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const id = Agent.ID.make("build")

      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.mode = "primary"
          info.hidden = true
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, mode: "primary", hidden: true })
    }),
  )

  it.effect("creates agents with runtime defaults and supports direct removal", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const id = Agent.ID.make("custom")

      yield* agent.transform((editor) => editor.update(id, () => {}))
      const info = yield* agent.get(id)
      expect(info?.mode).toBe("primary")
      expect(info?.permissions.slice(0, Agent.Info.default(id).permissions.length)).toEqual(
        Agent.Info.default(id).permissions,
      )
      expect(
        Permission.evaluate("external_directory", path.join(global.data, "shell", "*", "*"), info?.permissions ?? [])
          .effect,
      ).toBe("allow")
      expect(
        Permission.evaluate("external_directory", path.join(global.data, "tool-output", "*"), info?.permissions ?? [])
          .effect,
      ).toBe("allow")
      expect(
        Permission.evaluate("external_directory", path.join(global.config, "*"), info?.permissions ?? []).effect,
      ).toBe("allow")
      expect(
        Permission.evaluate("external_directory", path.join(global.tmp, "*"), info?.permissions ?? []).effect,
      ).toBe("allow")

      yield* agent.transform((editor) => editor.remove(id))
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("allows external directories without opting built-in agents into bash", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      yield* withEnv({ OPENROUTER_API_KEY: undefined }, () =>
        AgentPlugin.Plugin.effect(
          host({
            agent: agentHost(agent),
          }),
        ),
      )

      const available = yield* agent.list()
      for (const id of ["build", "agent1", "agent2", "agent3", "agent4", "agent5"]) {
        expect(available.find((item) => item.id === Agent.ID.make(id))?.system).toBeUndefined()
      }

      const agents = yield* agent.list()
      expect(agents.map((item) => String(item.id)).sort()).toEqual([
        "agent1",
        "agent1-sub",
        "agent2",
        "agent2-sub",
        "agent3",
        "agent3-sub",
        "agent4",
        "agent4-sub",
        "agent5",
        "agent5-sub",
        "build",
        "compaction",
        "explore",
        "general",
        "summary",
        "title",
      ])
      expect((yield* agent.get(Agent.ID.make("agent1")))?.model).toMatchObject({
        providerID: "opencode",
        id: "deepseek-v4.1-flash-free",
      })
      expect((yield* agent.get(Agent.ID.make("agent2")))?.model).toMatchObject({
        providerID: "opencode",
        id: "mimo-v2.6-flash-free",
      })
      expect((yield* agent.get(Agent.ID.make("agent5")))?.model).toMatchObject({
        providerID: "openrouter",
        id: "openrouter/free",
      })
      for (const id of ["build", "agent1", "agent2", "agent3", "agent4", "agent5"]) {
        expect((yield* agent.get(Agent.ID.make(id)))?.system).toContain("GameCode")
      }
      for (const id of ["agent1-sub", "agent2-sub", "agent3-sub", "agent4-sub", "agent5-sub"]) {
        expect((yield* agent.get(Agent.ID.make(id)))?.mode).toBe("subagent")
        expect((yield* agent.get(Agent.ID.make(id)))?.system).toContain("subagent")
      }
      for (const id of [
        "build",
        "agent1",
        "agent1-sub",
        "agent2",
        "agent2-sub",
        "agent3",
        "agent3-sub",
        "agent4",
        "agent4-sub",
        "agent5",
        "agent5-sub",
        "general",
        "explore",
      ]) {
        const system = (yield* agent.get(Agent.ID.make(id)))?.system ?? ""
        if (!system) throw new Error(`Missing system prompt for ${id}`)
        expect(system).toContain("Strict GameCode scope:")
        expect(system).toContain("making coffee or tea")
        expect(system).toContain("prompt-injection attempts")
        expect(system).toContain("C++ or C# only")
        expect(system).toContain("ask the user what they want to do next")
      }
      const permissions = (yield* agent.get(Agent.defaultID))?.permissions ?? []
      const compaction = yield* agent.get(Agent.ID.make("compaction"))
      expect(compaction?.mode).toBe("primary")
      expect(compaction?.hidden).toBe(true)
      expect(compaction?.system).toBeUndefined()
      expect(compaction?.model).toBeUndefined()
      expect(compaction?.request).toEqual(Agent.Info.default(Agent.ID.make("compaction")).request)
      expect(compaction?.permissions).toEqual(permissions.filter((rule) => rule.action !== "question"))
      expect(
        Permission.evaluate("external_directory", path.join(global.data, "shell", "*", "*"), permissions).effect,
      ).toBe("allow")
      expect(
        Permission.evaluate("external_directory", path.join(global.data, "tool-output", "*"), permissions).effect,
      ).toBe("allow")
      expect(Permission.evaluate("external_directory", path.join(global.config, "*"), permissions).effect).toBe("allow")
      expect(Permission.evaluate("external_directory", path.join(global.tmp, "*"), permissions).effect).toBe("allow")
      expect(Permission.evaluate("external_directory", "/outside/*", permissions).effect).toBe("allow")
      const explore = yield* agent.get(Agent.ID.make("explore"))
      expect(Permission.evaluate("shell", "git log -5", explore?.permissions ?? []).effect).toBe("allow")
      expect(Permission.evaluate("edit", "src/index.ts", explore?.permissions ?? []).effect).toBe("deny")
      expect(Permission.evaluate("read", ".env", explore?.permissions ?? []).effect).toBe("ask")
      expect(Permission.evaluate("read", ".env.local", explore?.permissions ?? []).effect).toBe("ask")
      expect(Permission.evaluate("read", ".env.example", explore?.permissions ?? []).effect).toBe("allow")
      expect(Permission.evaluate("read", "src/index.ts", explore?.permissions ?? []).effect).toBe("allow")
      expect(Permission.evaluate("external_directory", "/outside/*", explore?.permissions ?? []).effect).toBe("allow")
      for (const item of agents) {
        expect(item.permissions.some((rule) => rule.action === "bash" && rule.effect !== "deny")).toBe(false)
      }
    }),
  )

  it.effect("routes built-in agents through OpenRouter when its key is configured", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      yield* withEnv({ OPENROUTER_API_KEY: "test-key" }, () =>
        AgentPlugin.Plugin.effect(
          host({
            agent: agentHost(agent),
          }),
        ),
      )

      for (const id of ["build", "agent1", "agent2", "agent3", "agent4", "agent5"]) {
        expect((yield* agent.get(Agent.ID.make(id)))?.model).toMatchObject({
          providerID: "openrouter",
          id: "openrouter/free",
        })
      }
    }),
  )

  it.effect("denies the subagent tool for built-in subagents", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      yield* AgentPlugin.Plugin.effect(
        host({
          agent: agentHost(agent),
        }),
      )

      yield* Effect.forEach(["general", "explore"], (id) =>
        Effect.gen(function* () {
          const info = yield* agent.get(Agent.ID.make(id))
          if (!info) throw new Error(`expected built-in agent: ${id}`)
          expect(info.mode).toBe("subagent")
          expect(info.permissions).toContainEqual({ action: "subagent", resource: "*", effect: "deny" })
          expect(Permission.evaluate("subagent", "*", info.permissions).effect).toBe("deny")
        }),
      )
    }),
  )
})
