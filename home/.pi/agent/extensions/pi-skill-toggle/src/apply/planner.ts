import type { FrontmatterCodec } from "../frontmatter/parser.ts";
import type { FrontmatterPatcher } from "../frontmatter/patcher.ts";
import { classifyInvocationMode } from "../inventory/classifier.ts";
import type { FileSystem } from "../ports/fs.ts";
import type { SkillChange, SkillDraft, SkillRecord } from "../types.ts";

export interface SkillTogglePlanner {
	plan(records: SkillRecord[], drafts: SkillDraft[]): Promise<SkillChange[]>;
}

export class DefaultSkillTogglePlanner implements SkillTogglePlanner {
	private readonly codec: FrontmatterCodec;
	private readonly fs: FileSystem;
	private readonly patcher: FrontmatterPatcher;

	constructor(
		fs: FileSystem,
		codec: FrontmatterCodec,
		patcher: FrontmatterPatcher,
	) {
		this.codec = codec;
		this.fs = fs;
		this.patcher = patcher;
	}

	async plan(
		records: SkillRecord[],
		drafts: SkillDraft[],
	): Promise<SkillChange[]> {
		const recordById = new Map(records.map((record) => [record.id, record]));
		const changes: SkillChange[] = [];

		for (const draft of drafts) {
			const record = recordById.get(draft.skill.id);
			if (!record || !record.editable) {
				continue;
			}

			const raw = await this.fs.readFile(record.filePath);
			const doc = this.codec.parse(raw);
			if (!doc.hasFrontmatter) {
				continue;
			}

			const currentMode = classifyInvocationMode(doc);
			if (currentMode === draft.desiredMode) {
				continue;
			}

			const patch = this.patcher.patchInvocationMode(doc, draft.desiredMode);
			if (patch.oldText === patch.newText) {
				continue;
			}

			changes.push({
				filePath: record.filePath,
				from: currentMode,
				patch,
				skill: { ...record, mode: currentMode },
				to: draft.desiredMode,
			});
		}

		return changes;
	}
}
