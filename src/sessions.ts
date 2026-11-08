import { lstat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

async function assertSessionFile(path: string) {
  if (!(await lstat(path)).isFile()) throw new Error("Session path is not a regular file.");
}

export async function renameSavedSession(path: string, name: string) {
  await assertSessionFile(path);
  const manager = SessionManager.open(path);
  if (!manager.getHeader() || resolve(manager.getSessionFile() ?? "") !== resolve(path)) throw new Error("Invalid session file.");
  manager.appendSessionInfo(name);
}

/** Called only after the resume dialog's explicit delete confirmation. No archive. */
export async function deleteSavedSession(path: string) {
  await assertSessionFile(path);
  await unlink(path);
}
