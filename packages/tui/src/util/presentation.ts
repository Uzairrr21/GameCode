import { gamecode } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

function wordmark(pad = "") {
  return [`${pad}${dim}Game${reset}${bold}Code${reset}`]
}

export type SessionEpilogue = { readonly title: string; readonly sessionID?: string }

// Printed after the TUI closes.
export function epilogue(input: { readonly session?: SessionEpilogue; readonly updatedVersion?: string }) {
  if (!input.session && !input.updatedVersion) return
  const row = (label: string, value: string) => `  ${dim}${label.padEnd(10, " ")}${reset}${bold}${value}${reset}`
  return [
    ...wordmark("  "),
    "",
    ...(input.updatedVersion
      ? [`  ${dim}Run GameCode again to use ${reset}${bold}${input.updatedVersion}${reset}`, ""]
      : []),
    ...(input.session
      ? [row("Session", input.session.title), row("Continue", `${gamecode.name} session ${input.session.sessionID}`), ""]
      : []),
  ].join("\n")
}
