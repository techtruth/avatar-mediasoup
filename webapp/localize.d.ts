// NOTE: if you are drastically changing the language files, reloading of IDE tools like Volar may be slow.
// May have to restart it (command: Volar: Restart Vue Server).
// Normal edits to it are fine though.

type LocaleStrings =
  | typeof import("@stage/locales/en.json")
  | typeof import("@stage/locales/ko.json");
type RootLocaleStrings = keyof LocaleStrings;
declare const localize: <K extends RootLocaleStrings>(
  key: K
) => LocaleStrings[K];
