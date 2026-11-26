export * as AgentPlugin from "./agent.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { Agent } from "../agent.js"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { decrypt } from "../gamecode/prompts.js"

export const Plugin = define({
  id: "opencode.agent",
  effect: Effect.fn(function* (ctx) {
    const agents = yield* Agent.Service
    const model = (id: string) =>
      process.env.OPENROUTER_API_KEY
        ? Model.Ref.make({ providerID: Provider.ID.make("openrouter"), id: Model.ID.make("openrouter/free") })
        : Model.Ref.make({ providerID: Provider.ID.opencode, id: Model.ID.make(id) })
    yield* ctx.agent.transform((editor) => {
      editor.update(Agent.defaultID, (item) => {
        item.name = Agent.Name.make("Build")
        item.description = "The default agent. Executes tools based on configured permissions."
        item.mode = "primary"
        if (process.env.OPENROUTER_API_KEY) item.model = model("openrouter/free")
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })

      editor.update(Agent.ID.make("agent1"), (item) => {
        item.name = Agent.Name.make("Agent1")
        item.description = "Coding orchestrator for implementation, debugging, and verification."
        item.mode = "primary"
        item.model = model("deepseek-v4.1-flash-free")
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })
      editor.update(Agent.ID.make("agent1-sub"), (item) => {
        item.name = Agent.Name.make("Agent1 Subagent")
        item.description = "Focused implementation and verification specialist for Agent1."
        item.mode = "subagent"
        item.model = model("glm-5.3-flash-free")
        item.permissions.push(
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "question", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("agent2"), (item) => {
        item.name = Agent.Name.make("Agent2")
        item.description = "Planning and implementation agent."
        item.mode = "primary"
        item.model = model("mimo-v2.6-flash-free")
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })
      editor.update(Agent.ID.make("agent2-sub"), (item) => {
        item.name = Agent.Name.make("Agent2 Subagent")
        item.description = "Focused review and debugging specialist for Agent2."
        item.mode = "subagent"
        item.model = model("big-pickle")
        item.permissions.push(
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "question", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("agent3"), (item) => {
        item.name = Agent.Name.make("Agent3")
        item.description = "Architecture and integration agent."
        item.mode = "primary"
        item.model = model("glm-5.3-flash-free")
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })
      editor.update(Agent.ID.make("agent3-sub"), (item) => {
        item.name = Agent.Name.make("Agent3 Subagent")
        item.description = "Focused test and quality specialist for Agent3."
        item.mode = "subagent"
        item.model = model("qwen3.6-plus-free")
        item.permissions.push(
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "question", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("agent4"), (item) => {
        item.name = Agent.Name.make("Agent4")
        item.description = "Analysis and refactoring agent."
        item.mode = "primary"
        item.model = model("kimi-k2.5-free")
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })
      editor.update(Agent.ID.make("agent4-sub"), (item) => {
        item.name = Agent.Name.make("Agent4 Subagent")
        item.description = "Focused code exploration specialist for Agent4."
        item.mode = "subagent"
        item.model = model("longcat-2.5-free")
        item.permissions.push(
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "question", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("agent5"), (item) => {
        item.name = Agent.Name.make("Agent5")
        item.description = "Fast general coding agent for routine implementation."
        item.mode = "primary"
        item.model = Model.Ref.make({
          providerID: Provider.ID.make("openrouter"),
          id: Model.ID.make("openrouter/free"),
        })
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })
      editor.update(Agent.ID.make("agent5-sub"), (item) => {
        item.name = Agent.Name.make("Agent5 Subagent")
        item.description = "Focused validation and troubleshooting specialist for Agent5."
        item.mode = "subagent"
        item.model = model("grok-code")
        item.permissions.push(
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "question", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("general"), (item) => {
        item.name = Agent.Name.make("General")
        item.description =
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel."
        item.mode = "subagent"
        item.permissions.push(
          { action: "question", resource: "*", effect: "deny" },
          { action: "subagent", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("explore"), (item) => {
        item.name = Agent.Name.make("Explore")
        item.description =
          'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.'
        item.mode = "subagent"
        item.permissions.push(
          { action: "*", resource: "*", effect: "deny" },
          { action: "shell", resource: "*", effect: "allow" },
          { action: "grep", resource: "*", effect: "allow" },
          { action: "glob", resource: "*", effect: "allow" },
          { action: "webfetch", resource: "*", effect: "allow" },
          { action: "websearch", resource: "*", effect: "allow" },
          { action: "read", resource: "*", effect: "allow" },
          { action: "read", resource: "*.env", effect: "ask" },
          { action: "read", resource: "*.env.*", effect: "ask" },
          { action: "read", resource: "*.env.example", effect: "allow" },
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "external_directory", resource: "*", effect: "allow" },
        )
      })

      editor.update(Agent.ID.make("compaction"), (item) => {
        item.name = Agent.Name.make("Compaction")
        item.mode = "primary"
        item.hidden = true
      })

      editor.update(Agent.ID.make("title"), (item) => {
        item.name = Agent.Name.make("Title")
        item.mode = "primary"
        item.hidden = true
        item.permissions.push({ action: "*", resource: "*", effect: "deny" })
      })

      editor.update(Agent.ID.make("summary"), (item) => {
        item.name = Agent.Name.make("Summary")
        item.mode = "primary"
        item.hidden = true
        item.permissions.push({ action: "*", resource: "*", effect: "deny" })
      })

      for (const id of [
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
      ]) {
        editor.update(Agent.ID.make(id), (item) => {
          item.permissions.push(
            { action: "edit", resource: "*", effect: "deny" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "patch", resource: "*", effect: "deny" },
            ...["*.cpp", "*.cc", "*.cxx", "*.h", "*.hpp", "*.cs", "*.md"].flatMap((resource) => [
              { action: "edit", resource, effect: "allow" as const },
              { action: "write", resource, effect: "allow" as const },
              { action: "patch", resource, effect: "allow" as const },
            ]),
          )
        })
      }
    })
    yield* agents.transform((editor) => {
      editor.prompt(Agent.defaultID, () => decrypt("build"))
      editor.prompt(Agent.ID.make("agent1"), () => decrypt("agent1"))
      editor.prompt(Agent.ID.make("agent1-sub"), () => decrypt("agent1Sub"))
      editor.prompt(Agent.ID.make("agent2"), () => decrypt("agent2"))
      editor.prompt(Agent.ID.make("agent2-sub"), () => decrypt("agent2Sub"))
      editor.prompt(Agent.ID.make("agent3"), () => decrypt("agent3"))
      editor.prompt(Agent.ID.make("agent3-sub"), () => decrypt("agent3Sub"))
      editor.prompt(Agent.ID.make("agent4"), () => decrypt("agent4"))
      editor.prompt(Agent.ID.make("agent4-sub"), () => decrypt("agent4Sub"))
      editor.prompt(Agent.ID.make("agent5"), () => decrypt("agent5"))
      editor.prompt(Agent.ID.make("agent5-sub"), () => decrypt("agent5Sub"))
      editor.prompt(Agent.ID.make("general"), () => decrypt("general"))
      editor.prompt(Agent.ID.make("explore"), () => decrypt("explore"))
      editor.prompt(Agent.ID.make("title"), () => decrypt("title"))
      editor.prompt(Agent.ID.make("summary"), () => decrypt("summary"))
      editor.prompt(Agent.ID.make("plan"), () => decrypt("plan"))
    })
  }),
})
