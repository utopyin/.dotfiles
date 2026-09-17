import { homedir } from "node:os";
import { delimiter, join } from "node:path";

type ToolPathEnvironment = Readonly<Record<string, string | undefined>>;

export const withToolPaths = (environment: ToolPathEnvironment): string => {
  const home = environment.HOME ?? homedir();
  const dataHome = environment.XDG_DATA_HOME ?? join(home, ".local", "share");
  const miseDataDir = environment.MISE_DATA_DIR ?? join(dataHome, "mise");
  const current = (environment.PATH ?? "").split(delimiter).filter(Boolean);
  const extra = [join(home, ".local", "bin"), join(miseDataDir, "shims")];
  return [
    ...current,
    ...extra.filter((entry) => !current.includes(entry)),
  ].join(delimiter);
};
