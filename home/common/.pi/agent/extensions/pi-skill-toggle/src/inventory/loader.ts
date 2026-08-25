import { dirname } from "node:path";

import type { SkillLocator } from "../discovery/skill-locator.ts";
import type { FrontmatterCodec } from "../frontmatter/parser.ts";
import { deriveSkillMetadata } from "../frontmatter/validation.ts";
import type { FileSystem } from "../ports/fs.ts";
import type { SkillRecord } from "../types.ts";
import { classifyInvocationMode } from "./classifier.ts";

export interface SkillInventory {
  load(cwd: string): Promise<SkillRecord[]>;
}

export class DefaultSkillInventory implements SkillInventory {
  private readonly codec: FrontmatterCodec;
  private readonly fs: FileSystem;
  private readonly locator: SkillLocator;

  constructor(locator: SkillLocator, fs: FileSystem, codec: FrontmatterCodec) {
    this.codec = codec;
    this.fs = fs;
    this.locator = locator;
  }

  async load(cwd: string): Promise<SkillRecord[]> {
    const located = await this.locator.findSkillFiles(cwd);
    const records: SkillRecord[] = [];

    for (const file of located) {
      try {
        const raw = await this.fs.readFile(file.filePath);
        const doc = this.codec.parse(raw);
        const metadata = deriveSkillMetadata(file.filePath, doc);
        records.push({
          baseDir: dirname(file.filePath),
          description: metadata.description,
          diagnostics: metadata.diagnostics,
          editable:
            file.editable &&
            doc.hasFrontmatter &&
            !metadata.diagnostics.some(
              (diagnostic) => diagnostic.severity === "error"
            ),
          filePath: file.filePath,
          id: file.filePath,
          mode: classifyInvocationMode(doc),
          name: metadata.name,
          source: file.source,
        });
      } catch (error) {
        records.push({
          baseDir: dirname(file.filePath),
          description: "",
          diagnostics: [
            {
              message: error instanceof Error ? error.message : String(error),
              severity: "error",
            },
          ],
          editable: false,
          filePath: file.filePath,
          id: file.filePath,
          mode: "agent-invocable",
          name: file.filePath.split("/").at(-2) ?? file.filePath,
          source: file.source,
        });
      }
    }

    return records.toSorted(
      (a, b) =>
        a.name.localeCompare(b.name) || a.filePath.localeCompare(b.filePath)
    );
  }
}
