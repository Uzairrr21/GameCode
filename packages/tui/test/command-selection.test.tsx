import { expect, test } from "bun:test"
import { directory, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"
import { createAppFixture } from "./fixture/app"

test("only Tab changes agents; model and variant selection keybindings stay locked", async () => {
  await using state = await tmpdir()
  let agentCatalogLoaded = false
  const location = { directory, project: { id: "project", directory, canonical: directory } }
  const session = {
    id: `ses_${crypto.randomUUID()}`,
    projectID: "project",
    title: "Command selection fixture",
    agent: "build",
    model: { providerID: "demo", id: "first" },
    location: { directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
  }
  await using setup = await createAppFixture({
    state: state.path,
    config: {
      animations: false,
      keybinds: { "agent.cycle": "f6", "variant.cycle": "f7", "model.list": "f8" },
    },
    args: { sessionID: session.id },
    fetch: async (url, request) => {
      if (url.pathname === "/api/location") return json(location)
      if (url.pathname === "/api/agent") {
        agentCatalogLoaded = true
        return json({
          location,
          data: ["build", "plan"].map((id) => ({ id, mode: "primary", hidden: false, permissions: [] })),
        })
      }
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "demo", name: "Demo" }] })
      if (url.pathname === "/api/model")
        return json({
          location,
          data: ["first", "second"].map((id) => ({
            id,
            providerID: "demo",
            name: `${id} model`,
            variants: [{ id: "low" }, { id: "high" }],
            cost: [],
            time: { released: 0 },
          })),
        })
      if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
      if (/^\/api\/session\/[^/]+\/(message|inbox|permission)$/.test(url.pathname))
        return json({ data: [], cursor: {} })
      if (!/^\/api\/session\/[^/]+\/(agent|model|command)$/.test(url.pathname)) return
      return new Response(null, { status: 204 })
    },
  })
  await setup.ready
  await setup.waitFor(() => agentCatalogLoaded)
  await setup.waitForFrame((frame) => frame.includes("Build ·"))
  setup.mockInput.pressKey("F6")
  await setup.renderOnce()
  expect(setup.captureCharFrame()).toContain("Build ·")
  setup.mockInput.pressKey("F8")
  await setup.renderOnce()
  expect(setup.captureCharFrame()).not.toContain("Select model")
  setup.mockInput.pressKey("F7")
  await setup.renderOnce()
  expect(setup.captureCharFrame()).not.toContain("Select variant")
  setup.mockInput.pressTab()
  await setup.renderOnce()
  await setup.waitForFrame((frame) => frame.includes("Plan ·"))
})
