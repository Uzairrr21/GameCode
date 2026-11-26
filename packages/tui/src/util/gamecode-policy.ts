export function isGameCodeLockedKeymapCommand(id: string) {
  return (
    id === "agent.list" ||
    id.startsWith("model.") ||
    id.startsWith("variant.") ||
    id.startsWith("speed.")
  )
}

export function isGameCodeLockedSlashCommand(name: string) {
  const command = name.trim().replace(/^\/+/, "").toLowerCase().split(":")[0]
  return ["agent", "agents", "model", "models", "speed", "speeds", "variant", "variants"].includes(command)
}

export function withoutAgentMentions<T extends { type: string }>(parts: readonly T[]) {
  return parts.filter((part) => part.type !== "agent")
}
