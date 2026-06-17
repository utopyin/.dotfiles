import { constants } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";

export interface DirectoryEntryInfo {
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  name: string;
}

export interface FileStatInfo {
  isDirectory: boolean;
  isFile: boolean;
  mode: number;
}

export interface FileSystem {
  access(path: string, mode?: number): Promise<boolean>;
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<DirectoryEntryInfo[]>;
  stat(path: string): Promise<FileStatInfo>;
  writeFileAtomic(path: string, content: string): Promise<void>;
}

const readFile = (path: string): Promise<string> => fs.readFile(path, "utf-8");

const writeFileAtomic = async (
  path: string,
  content: string
): Promise<void> => {
  const dir = dirname(path);
  const tmp = join(
    dir,
    `.pi-skill-toggle-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  );
  let mode: number | undefined;
  try {
    const stats = await fs.stat(path);
    ({ mode } = stats);
  } catch {
    mode = undefined;
  }

  await fs.writeFile(tmp, content, "utf-8");
  if (mode !== undefined) {
    await fs.chmod(tmp, mode);
  }
  await fs.rename(tmp, path);
};

const access = async (
  path: string,
  mode = constants.F_OK
): Promise<boolean> => {
  try {
    await fs.access(path, mode);
    return true;
  } catch {
    return false;
  }
};

const readdir = async (path: string): Promise<DirectoryEntryInfo[]> => {
  const entries = await fs.readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymbolicLink: entry.isSymbolicLink(),
    name: entry.name,
  }));
};

const stat = async (path: string): Promise<FileStatInfo> => {
  const stats = await fs.stat(path);
  return {
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    mode: stats.mode,
  };
};

export class NodeFileSystem implements FileSystem {
  access = access;
  readFile = readFile;
  readdir = readdir;
  stat = stat;
  writeFileAtomic = writeFileAtomic;
}
