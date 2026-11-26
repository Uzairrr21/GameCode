import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const licensePath = () => {
  const appData = process.env.APPDATA
  if (!appData) return undefined
  return path.join(appData, "GameCode")
}

const license = () => {
  const directory = licensePath()
  if (!directory) return undefined
  const file = path.join(directory, "license.key")
  if (!existsSync(file)) return undefined
  const apiKey = readFileSync(file, "utf8").trim()
  if (apiKey && !process.env.OPENCODE_API_KEY) process.env.OPENCODE_API_KEY = apiKey
  const marker = path.join(directory, "install.marker")
  return {
    apiKey,
    installedAt: existsSync(marker) ? statSync(marker).mtimeMs : undefined,
  }
}

const isEnforced = () => process.env.GAMECODE_ENFORCE_LICENSE === "1" || license() !== undefined

const expiresAt = (installedAt?: number) => {
  const value = process.env.GAMECODE_LICENSE_EXPIRES_AT
  if (value) {
    const timestamp = Number(value)
    if (Number.isFinite(timestamp)) return timestamp
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return installedAt === undefined ? undefined : installedAt + 2 * 24 * 60 * 60 * 1000
}

const apiKeyConfigured = () => {
  const key = process.env.OPENCODE_API_KEY || process.env.GAMECODE_API_KEY || license()?.apiKey
  if (!key?.startsWith("oc_sk_") || key.length < 20) return false
  const expected = process.env.GAMECODE_API_KEY_SHA256
  if (!expected) return true
  return createHash("sha256").update(key).digest("hex") === expected.toLowerCase()
}

export const Access = {
  enforced: isEnforced,
  expired: () => {
    if (!isEnforced()) return false
    const expiry = expiresAt(license()?.installedAt)
    return expiry === undefined || Date.now() >= expiry
  },
  hasApiKey: () => !isEnforced() || apiKeyConfigured(),
  canUse: () => !Access.expired() && (!isEnforced() || apiKeyConfigured()),
  canUseCoreAgents: () => !isEnforced() || !Access.expired(),
}

export const unavailableMessage = () => {
  if (Access.expired()) return "GameCode license has expired"
  if (!Access.hasApiKey()) return "A valid OpenCode Console/Zen API key is required"
  return "GameCode access is unavailable"
}
