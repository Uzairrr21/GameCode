import { expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const windows = test.skipIf(process.platform !== "win32")

// Matches the 16 hex characters the staged directory name takes from APP_64_HASH.
const payloadHash = "0123456789ABCDEF0123456789ABCDEF"

// The installer clears the uninstall entry of an install it moves; the tests point it at their own key.
const uninstallKey = "Software\\OpenCodeInstallerTest"

async function harness() {
  const { getMakeNsisPath, getNsisPluginsPath } = await import("app-builder-lib/out/toolsets/windows")
  const { nsisTemplatesDir } = await import("app-builder-lib/out/targets/nsis/nsisUtil")
  const { NsisScriptGenerator } = await import("app-builder-lib/out/targets/nsis/nsisScriptGenerator")
  const config = (await import("../electron-builder.config")).default
  const compiler = await getMakeNsisPath(config.toolsets?.nsis, config.nsis?.customNsisBinary)
  const plugins = await getNsisPluginsPath(config.toolsets?.nsis, config.nsis?.customNsisResources)
  const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-installer-"))
  // electron-builder generates the command-line flags such as ${isUpdated}.
  const flags = new NsisScriptGenerator()
  flags.flags(["updated"])
  const shortcutName = `OpenCode Installer Test ${path.basename(dir)}`

  const run = async (cmd: string[], env: Record<string, string> = {}) => {
    const result = Bun.spawn(cmd, {
      env: { ...process.env, ...compiler.env, APPDATA: dir, ...env },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, code] = await Promise.all([
      new Response(result.stdout).text(),
      new Response(result.stderr).text(),
      result.exited,
    ])

    return { stdout: stdout.trim(), stderr, code }
  }

  // Compiles the custom include with the template's flags and messages around one section body.
  const compile = async (name: string, section: string) => {
    const script = path.join(dir, `${name}.nsi`)
    const exe = path.join(dir, `${name}.exe`)
    await Bun.write(
      script,
      `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${exe}"
!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"
!addincludedir "${path.join(nsisTemplatesDir, "include")}"
!include LogicLib.nsh
!include StdUtils.nsh
${flags.build()}
LoadLanguageFile "\${NSISDIR}\\Contrib\\Language files\\English.nlf"
LangString appRunning \${LANG_ENGLISH} "running"
LangString appClosing \${LANG_ENGLISH} "closing"
LangString appCannotBeClosed \${LANG_ENGLISH} "cannot close"
!define APP_EXECUTABLE_FILENAME "OpenCode.exe"
!define APP_ID "ai.opencode.desktop"
!define APP_FILENAME "@opencodedesktop"
!define UNINSTALL_FILENAME "Uninstall OpenCode.exe"
!define UNINSTALL_REGISTRY_KEY "${uninstallKey}"
!define SHORTCUT_NAME "${shortcutName}"
!define GAMECODE_PROFILE_DIR "$EXEDIR\\GameCode"
!define APP_64 "${path.join(dir, "app.7z")}"
!define APP_64_HASH "${payloadHash}"
!define APP_64_UNPACKED_SIZE 1
!include "${config.nsis?.include}"
Section
${section}
SectionEnd
`,
    )
    const result = await run([compiler.path, script])
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

    return exe
  }

  return { dir, shortcutName, run, compile, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

windows(
  "installer grants sandbox access without changing unrelated permissions",
  async () => {
    const installer = await harness()

    const succeed = async (cmd: string[]) => {
      const result = await installer.run(cmd, { OPENCODE_INSTALLER_TEST_ROOT: installer.dir })
      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

      return result.stdout
    }

    const acl = (file: string) =>
      succeed([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Acl -LiteralPath (Join-Path $env:OPENCODE_INSTALLER_TEST_ROOT '${file}')).Sddl`,
      ])

    try {
      await Bun.write(path.join(installer.dir, "app/runtime/icudtl.dat"), "runtime fixture")
      await Bun.write(path.join(installer.dir, "unrelated.txt"), "outside the installation")
      await succeed(["icacls.exe", path.join(installer.dir, "app"), "/grant", "*S-1-15-2-999-999-999:(OI)(CI)(F)"])
      const parent = await acl(".")
      const unrelated = await acl("unrelated.txt")

      const exe = await installer.compile(
        "acl",
        `  StrCpy $INSTDIR "$EXEDIR\\app"
  !insertmacro customGrantSandboxAccess`,
      )

      await succeed([exe])
      const installed = await acl("app/runtime/icudtl.dat")
      expect(installed).toContain("(A;ID;0x1200a9;;;S-1-15-2-2)")
      expect(installed).toContain("S-1-15-2-999-999-999")
      await succeed([exe])
      expect(await acl("app/runtime/icudtl.dat")).toBe(installed)
      expect(await acl(".")).toBe(parent)
      expect(await acl("unrelated.txt")).toBe(unrelated)
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)

windows(
  "wires and embeds the dependency bootstrap in the Windows installer",
  async () => {
    const installer = await harness()

    try {
      const exe = await installer.compile("dependencies", "!insertmacro customInstall")
      expect((await Bun.file(exe).stat()).size).toBeGreaterThan(0)
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)

windows(
  "installs and removes shortcuts that launch the GameCode TUI",
  async () => {
    const installer = await harness()
    let programs: string | undefined
    let desktop: string | undefined

    try {
      const folders = await installer.run([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `[Environment]::GetFolderPath('Programs'); [Environment]::GetFolderPath('Desktop')`,
      ])
      expect(folders.code, `${folders.stdout}\n${folders.stderr}`).toBe(0)
      ;[programs, desktop] = folders.stdout.split(/\r?\n/)

      const install = await installer.compile(
        "shortcuts",
        `  StrCpy $INSTDIR "$EXEDIR\\app"
  !insertmacro createGameCodeShortcuts`,
      )

      expect((await installer.run([install])).code).toBe(0)

      const shortcuts = [
        path.join(programs!, `${installer.shortcutName}.lnk`),
        path.join(desktop!, `${installer.shortcutName}.lnk`),
      ]

      for (const shortcut of shortcuts) {
        expect(await Bun.file(shortcut).exists()).toBe(true)
        const details = await installer.run(
          [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$link = (New-Object -ComObject WScript.Shell).CreateShortcut($env:OPENCODE_TEST_SHORTCUT); "$($link.TargetPath)\`n$($link.Arguments)"`,
          ],
          { OPENCODE_TEST_SHORTCUT: shortcut },
        )
        expect(details.code, `${details.stdout}\n${details.stderr}`).toBe(0)
        expect(details.stdout.toLowerCase()).toContain("wscript.exe")
        expect(details.stdout).toContain("launch-gamecode.vbs")
      }

      expect(await Bun.file(path.join(installer.dir, "app/resources/launch-gamecode.vbs")).exists()).toBe(true)
      expect(await Bun.file(path.join(installer.dir, "app/resources/gamecode.ico")).exists()).toBe(true)

      const uninstall = await installer.compile(
        "shortcut-uninstall",
        `  StrCpy $INSTDIR "$EXEDIR\\app"
  !insertmacro customUnInstall`,
      )
      expect((await installer.run([uninstall])).code).toBe(0)
      for (const shortcut of shortcuts) expect(await Bun.file(shortcut).exists()).toBe(false)
    } finally {
      for (const folder of [programs, desktop]) {
        if (folder) await rm(path.join(folder, `${installer.shortcutName}.lnk`), { force: true })
      }
      await installer.cleanup()
    }
  },
  120_000,
)

windows(
  "removes GameCode license data on a full uninstall and preserves unrelated data",
  async () => {
    const installer = await harness()

    try {
      await Bun.write(path.join(installer.dir, "GameCode/license.key"), "test-key")
      await Bun.write(path.join(installer.dir, "GameCode/install.marker"), "")
      await Bun.write(path.join(installer.dir, "GameCode/installs/ai.opencode.desktop"), "")
      await Bun.write(path.join(installer.dir, "GameCode/keep.txt"), "unrelated user data")
      const exe = await installer.compile(
        "uninstall",
        `  StrCpy $INSTDIR "$EXEDIR\\app"
  !insertmacro customUnInstall`,
      )

      expect((await installer.run([exe])).code).toBe(0)
      expect(await Bun.file(path.join(installer.dir, "GameCode/license.key")).exists()).toBe(false)
      expect(await Bun.file(path.join(installer.dir, "GameCode/install.marker")).exists()).toBe(false)
      expect(await Bun.file(path.join(installer.dir, "GameCode/keep.txt")).text()).toBe("unrelated user data")
      expect(await Bun.file(path.join(installer.dir, "GameCode/installs")).exists()).toBe(false)
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)

windows(
  "preserves shared license data while another app channel remains installed",
  async () => {
    const installer = await harness()

    try {
      await Bun.write(path.join(installer.dir, "GameCode/license.key"), "test-key")
      await Bun.write(path.join(installer.dir, "GameCode/install.marker"), "")
      await Bun.write(path.join(installer.dir, "GameCode/installs/ai.opencode.desktop"), "")
      await Bun.write(path.join(installer.dir, "GameCode/installs/ai.opencode.desktop.beta"), "")
      const exe = await installer.compile(
        "uninstall-channel",
        `  StrCpy $INSTDIR "$EXEDIR\\app"
  !insertmacro customUnInstall`,
      )

      expect((await installer.run([exe])).code).toBe(0)
      expect(await Bun.file(path.join(installer.dir, "GameCode/license.key")).text()).toBe("test-key")
      expect(await Bun.file(path.join(installer.dir, "GameCode/install.marker")).exists()).toBe(true)
      expect(await Bun.file(path.join(installer.dir, "GameCode/installs/ai.opencode.desktop")).exists()).toBe(false)
      expect(await Bun.file(path.join(installer.dir, "GameCode/installs/ai.opencode.desktop.beta")).exists()).toBe(true)
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)

windows(
  "installs and rolls back an app-local Python and Graphifyy runtime",
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gamecode-runtime-"))
    const runtime = path.join(dir, "resources", "gamecode-runtime")
    const uv = path.join(dir, "uv.cmd")
    const log = path.join(dir, "uv.log")
    const script = path.join(import.meta.dir, "../resources/windows/install-dependencies.ps1")
    const run = async (architecture: "x64" | "arm64", env: Record<string, string> = {}) => {
      const result = Bun.spawn(
        [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
          "-InstallRoot",
          runtime,
          "-Architecture",
          architecture,
          "-UvExecutablePath",
          uv,
        ],
        {
          env: { ...process.env, GAMECODE_UV_TEST_LOG: log, ...env },
          stdout: "pipe",
          stderr: "pipe",
        },
      )

      const [stdout, stderr, code] = await Promise.all([
        new Response(result.stdout).text(),
        new Response(result.stderr).text(),
        result.exited,
      ])

      return { stdout, stderr, code }
    }

    try {
      await Bun.write(
        uv,
        [
          "@echo off",
          ">> \"%GAMECODE_UV_TEST_LOG%\" echo %*",
          "if /I \"%~1\"==\"python\" if /I \"%~2\"==\"install\" (",
          "  if not exist \"%UV_PYTHON_INSTALL_DIR%\" mkdir \"%UV_PYTHON_INSTALL_DIR%\"",
          "  >\"%UV_PYTHON_INSTALL_DIR%\\python.exe\" echo test",
          "  exit /b 0",
          ")",
          "if /I \"%~1\"==\"python\" if /I \"%~2\"==\"find\" (",
          "  echo %UV_PYTHON_INSTALL_DIR%\\python.exe",
          "  exit /b 0",
          ")",
          "if /I \"%~1\"==\"venv\" (",
          "  if not exist \"%~5\\Scripts\" mkdir \"%~5\\Scripts\"",
          "  >\"%~5\\Scripts\\python.exe\" echo test",
          "  >\"%~5\\Scripts\\pip.exe\" echo test",
          "  exit /b 0",
          ")",
          "if /I \"%~1\"==\"pip\" if /I \"%~2\"==\"install\" (",
          "  if not \"%GAMECODE_UV_TEST_FAIL_PIP%\"==\"\" exit /b 27",
          "  >\"%~dp4graphify.exe\" echo test",
          "  exit /b 0",
          ")",
          "exit /b 23",
          "",
        ].join("\r\n"),
      )

      const installed = await run("x64")
      expect(installed.code, `${installed.stdout}\n${installed.stderr}`).toBe(0)
      for (const file of [
        "python/python.exe",
        "venv/Scripts/python.exe",
        "venv/Scripts/pip.exe",
        "venv/Scripts/graphify.exe",
        "runtime.txt",
      ]) {
        expect(await Bun.file(path.join(runtime, file)).exists(), file).toBe(true)
      }
      expect(await Bun.file(path.join(runtime, "runtime.txt")).text()).toContain("graphifyy=0.9.120")
      expect(await Bun.file(path.join(runtime, ".bootstrap")).exists()).toBe(false)
      expect(await Bun.file(path.join(runtime, ".cache")).exists()).toBe(false)

      const firstLog = await Bun.file(log).text()
      const unchanged = await run("x64")
      expect(unchanged.code, `${unchanged.stdout}\n${unchanged.stderr}`).toBe(0)
      expect(await Bun.file(log).text()).toBe(firstLog)

      await Bun.write(path.join(runtime, "keep.txt"), "previous runtime")
      await rm(path.join(runtime, "runtime.txt"))
      const failed = await run("x64", { GAMECODE_UV_TEST_FAIL_PIP: "1" })
      expect(failed.code).not.toBe(0)
      expect(failed.stderr).toContain("rolled back")
      expect(await Bun.file(path.join(runtime, "keep.txt")).text()).toBe("previous runtime")
      expect(await Bun.file(path.join(runtime, "venv", "Scripts", "graphify.exe")).exists()).toBe(true)

      const arm64 = await run("arm64")
      expect(arm64.code, `${arm64.stdout}\n${arm64.stderr}`).toBe(0)
      expect(await Bun.file(path.join(runtime, "runtime.txt")).text()).toContain("graphifyy=0.9.120")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  120_000,
)

// The running app unpacks an update beside the install directory before the restart. The install takes it
// only when it belongs to this payload and the old version is gone, and never leaves a staged copy behind.
const stagedCases = [
  {
    name: "moves the staged app into the emptied install directory",
    installed: [],
    staged: { [`update-${payloadHash.slice(0, 16)}`]: ["OpenCode.exe", "resources/app.asar"] },
    moved: true,
    expected: ["OpenCode.exe", "resources/app.asar"],
  },
  {
    name: "keeps an install directory that still holds files",
    installed: ["locked.dll"],
    staged: { [`update-${payloadHash.slice(0, 16)}`]: ["OpenCode.exe"] },
    moved: false,
    expected: ["locked.dll"],
  },
  {
    name: "discards an update staged from another payload",
    installed: [],
    staged: { "update-FEDCBA9876543210": ["OpenCode.exe"] },
    moved: false,
    expected: [],
  },
  {
    name: "discards staging that never finished",
    installed: [],
    staged: { staging: ["OpenCode.exe"] },
    moved: false,
    expected: [],
  },
]

windows(
  "installs a staged update only into an emptied install directory",
  async () => {
    const installer = await harness()

    try {
      const exe = await installer.compile(
        "staged",
        `  InitPluginsDir
  SetOutPath $INSTDIR
  !insertmacro customInstallStagedApp
  \${If} $R0 == "installed"
    SetErrorLevel 0
  \${Else}
    SetErrorLevel 3
  \${EndIf}`,
      )

      for (const item of stagedCases) {
        const root = path.join(installer.dir, item.name.replaceAll(" ", "-"))
        const install = path.join(root, "app")
        await mkdir(install, { recursive: true })
        await Promise.all([
          ...item.installed.map((file) => Bun.write(path.join(install, file), "old")),
          ...Object.entries(item.staged).flatMap(([suffix, files]) =>
            files.map((file) => Bun.write(path.join(`${install}.${suffix}`, file), "new")),
          ),
        ])

        const result = await installer.run([exe, `/D=${install}`])
        const files = await readdir(install, { recursive: true, withFileTypes: true })

        expect(result.code, item.name).toBe(item.moved ? 0 : 3)
        expect(
          files
            .filter((entry) => entry.isFile())
            .map((entry) => path.relative(install, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
            .toSorted(),
          item.name,
        ).toEqual(item.expected)
        expect(await readdir(root), item.name).toEqual(["app"])
      }
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)

// Every channel used to install into one directory named after the package. Each channel now installs into
// a directory named after its app ID and leaves the shared one without touching the other channels' files.
const directoryCases = [
  {
    name: "a first install uses the app ID",
    from: "@opencodedesktop",
    shared: [],
    expected: "ai.opencode.desktop",
    left: undefined,
    uninstallKept: true,
  },
  {
    name: "leaving the shared directory keeps the other channels",
    from: "@opencodedesktop",
    shared: [
      "OpenCode.exe",
      "Uninstall OpenCode.exe",
      "OpenCode Beta.exe",
      "Uninstall OpenCode Beta.exe",
      "resources/app.asar",
    ],
    expected: "ai.opencode.desktop",
    left: ["OpenCode Beta.exe", "Uninstall OpenCode Beta.exe", "resources/app.asar"],
    uninstallKept: false,
  },
  {
    name: "the last channel removes the shared directory",
    from: "@opencodedesktop",
    shared: ["OpenCode.exe", "Uninstall OpenCode.exe", "resources/app.asar"],
    expected: "ai.opencode.desktop",
    left: undefined,
    uninstallKept: false,
  },
  {
    name: "an install elsewhere stays where it is",
    from: "custom",
    shared: ["OpenCode.exe", "Uninstall OpenCode.exe"],
    expected: "custom",
    left: ["OpenCode.exe", "Uninstall OpenCode.exe"],
    uninstallKept: true,
  },
]

windows(
  "installs each channel into a directory named after its app ID",
  async () => {
    const installer = await harness()
    const registry = (args: string[]) => installer.run(["reg.exe", ...args, "/f"])

    try {
      const exe = await installer.compile(
        "directory",
        `  !insertmacro customInit
  FileOpen $0 "$EXEDIR\\instdir.txt" w
  FileWrite $0 $INSTDIR
  FileClose $0
  !insertmacro leaveSharedInstall`,
      )

      for (const item of directoryCases) {
        const root = path.join(installer.dir, item.name.replaceAll(" ", "-"))
        const from = path.join(root, item.from)
        await mkdir(root, { recursive: true })
        await Promise.all(item.shared.map((file) => Bun.write(path.join(from, file), "old")))
        await registry(["add", `HKCU\\${uninstallKey}`, "/v", "UninstallString", "/d", "uninstall"])

        expect((await installer.run([exe, `/D=${from}`])).code, item.name).toBe(0)
        expect(await Bun.file(path.join(installer.dir, "instdir.txt")).text(), item.name).toBe(
          path.join(root, item.expected),
        )
        const left = (await readdir(from, { recursive: true, withFileTypes: true }).catch(() => undefined))
          ?.filter((entry) => entry.isFile())
          .map((entry) => path.relative(from, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
          .toSorted()
        expect(left, item.name).toEqual(item.left)
        const query = await installer.run(["reg.exe", "query", `HKCU\\${uninstallKey}`, "/v", "UninstallString"])
        expect(query.code === 0, item.name).toBe(item.uninstallKept)
      }
    } finally {
      await installer.run(["reg.exe", "delete", `HKCU\\${uninstallKey}`, "/f"])
      await installer.cleanup()
    }
  },
  120_000,
)

windows(
  "does not delete the active install when it still uses the shared directory",
  async () => {
    const installer = await harness()
    const install = path.join(installer.dir, "app")
    const files = ["OpenCode.exe", "Uninstall OpenCode.exe", "resources/app.asar"]

    try {
      await Promise.all(files.map((file) => Bun.write(path.join(install, file), "current install")))
      const exe = await installer.compile(
        "same-install",
        `  StrCpy $sharedInstallDir "$EXEDIR\\app"
  StrCpy $INSTDIR "$EXEDIR\\app"
  !insertmacro leaveSharedInstall`,
      )

      expect((await installer.run([exe])).code).toBe(0)
      for (const file of files) expect(await Bun.file(path.join(install, file)).text()).toBe("current install")
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)

// Stand-ins for the app are copies of ping.exe: it exits with 0 when it finishes and 1 when terminated.
const runningCases = [
  { name: "a manual install stops the app at once", args: [], pings: 30, exitCode: 1 },
  { name: "an update lets the quitting app exit by itself", args: ["--updated"], pings: 2, exitCode: 0 },
]

windows(
  "stops only the processes that run from the install directory",
  async () => {
    const installer = await harness()
    const ping = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "PING.EXE")

    try {
      const exe = await installer.compile("running", "  !insertmacro customCheckAppRunning")

      for (const item of runningCases) {
        const root = path.join(installer.dir, item.name.replaceAll(" ", "-"))
        const install = path.join(root, "app")
        // Shares the install directory's name as a prefix, so a match without the separator would stop it.
        const sibling = path.join(root, "app-sibling")
        await mkdir(path.join(install, "resources"), { recursive: true })
        await mkdir(sibling, { recursive: true })
        await copyFile(ping, path.join(install, "resources", "standin.exe"))
        await copyFile(ping, path.join(sibling, "standin.exe"))

        const app = Bun.spawn([path.join(install, "resources", "standin.exe"), "-n", String(item.pings), "127.0.0.1"], {
          stdout: "ignore",
        })

        const other = Bun.spawn([path.join(sibling, "standin.exe"), "-n", "30", "127.0.0.1"], { stdout: "ignore" })

        try {
          expect((await installer.run([exe, ...item.args, `/D=${install}`])).code, item.name).toBe(0)
          expect(other.exitCode, item.name).toBeNull()
          expect(await app.exited, item.name).toBe(item.exitCode)
        } finally {
          app.kill()
          other.kill()
          await Promise.all([app.exited, other.exited])
        }
      }
    } finally {
      await installer.cleanup()
    }
  },
  120_000,
)
