import { ComposerEditor } from "./editor/editor"
import { formatKeybind, useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import type { ComposerModel } from "./model"
import { GAMECODE_MODEL_LABEL } from "@/providers/models/display-label"

export function Composer(props: {
  class?: string
  model: ComposerModel
  borderUnderlay?: boolean
  readOnly?: boolean
  suggestionBoundary?: () => HTMLElement | undefined
}) {
  const command = useCommand()
  const language = useLanguage()

  return (
    <div class="flex flex-col gap-3">
      <ComposerEditor
        controller={props.model}
        borderUnderlay={props.borderUnderlay}
        readOnly={props.readOnly}
        class={props.class}
        modelControlsVisible={!props.model.model.loading || !!props.model.model.preview}
        attachKeybind={command.keybindParts("file.attach")}
        attachShortcut={command.keybind("file.attach")}
        alternateKeybind={[formatKeybind("mod", language.t), "↵"]}
        queueFirstKeybind={[formatKeybind("alt", language.t), "↵"]}
        queueFirstLabel={language.t("session.queue.first")}
        exitShellKeybind={[formatKeybind("esc", language.t)]}
        suggestionBoundary={props.suggestionBoundary}
        modelSelectionLocked
        modelControl={<span class="min-w-0 truncate text-v2-text-text-faint">{GAMECODE_MODEL_LABEL}</span>}
      />
    </div>
  )
}
