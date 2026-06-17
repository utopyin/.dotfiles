import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const writeTempTextFile = async (
  prefix: string,
  fileName: string,
  content: string
): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const outputPath = join(dir, fileName);
  await writeFile(outputPath, content, "utf-8");
  return outputPath;
};
