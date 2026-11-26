import { TextAttributes } from "@opentui/core"
import { For, Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { gamecode } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const banner = createMemo(() => gamecode.banner(dimensions().width - 4))

  return (
    <box flexDirection="column" gap={0} alignItems="center">
      <Show when={dimensions().height >= 12}>
        <Show
          when={dimensions().height >= 17 && banner().length > 0}
          fallback={
            <Show
              when={dimensions().width >= 20}
              fallback={
                <text fg={theme.text.base} attributes={TextAttributes.BOLD} selectable={false}>
                  {gamecode.shortName}
                </text>
              }
            >
              <text
                fg={theme.text.base}
                attributes={TextAttributes.BOLD | TextAttributes.ITALIC}
                selectable={false}
              >
                {gamecode.name.toUpperCase().split("").join(" ")}
              </text>
            </Show>
          }
        >
          <For each={banner()}>
            {(line, index) => (
              <text
                fg={index() % 2 === 0 ? theme.text.muted : theme.text.base}
                attributes={TextAttributes.BOLD}
                selectable={false}
              >
                {line}
              </text>
            )}
          </For>
          <text
            fg={theme.text.base}
            attributes={TextAttributes.BOLD | TextAttributes.ITALIC}
            selectable={false}
          >
            {gamecode.name}
          </text>
        </Show>
      </Show>
    </box>
  )
}
