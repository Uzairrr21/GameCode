export const logo = {
  left: ["Game"],
  right: ["Code"],
}

const block = {
  G: ["███", "█  ", "█ █", "███"],
  A: [" █ ", "█ █", "███", "█ █"],
  M: ["█ █", "███", "█ █", "█ █"],
  E: ["███", "██ ", "█  ", "███"],
  C: ["███", "█  ", "█  ", "███"],
  O: ["███", "█ █", "█ █", "███"],
  D: ["██ ", "█ █", "█ █", "██ "],
} as const

export const gamecode = {
  name: "GameCode",
  shortName: "GC",
  banner(width: number) {
    type Letter = keyof typeof block
    const words: Letter[][] =
      width >= 31
        ? [["G", "A", "M", "E", "C", "O", "D", "E"]]
        : width >= 15
          ? [
              ["G", "A", "M", "E"],
              ["C", "O", "D", "E"],
            ]
          : []
    if (!words.length) return []
    return words.flatMap((word) =>
      Array.from({ length: 4 }, (_, row) => word.map((letter) => block[letter][row]).join(" ")),
    )
  },
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}
