import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

const getZshPath = () => {
	if (process.env.PI_USER_BASH_SHELL) {
		return process.env.PI_USER_BASH_SHELL;
	}
	if (process.env.SHELL && basename(process.env.SHELL) === "zsh") {
		return process.env.SHELL;
	}
	return "/bin/zsh";
};

export default function zshUserBash(pi: ExtensionAPI) {
	const local = createLocalBashOperations();

	pi.on("user_bash", () => ({
		operations: {
			async exec(command, cwd, options) {
				// Run zsh as a non-interactive shell. `-i` sources ~/.zshrc, which may
				// start prompt integrations like gitstatus/powerlevel10k. Pi executes
				// user bash commands without a real interactive job-control terminal,
				// so those integrations can emit warnings such as:
				//   setopt: can't change option: monitor
				//   gitstatus failed to initialize
				//
				// Pi prepends shellCommandPrefix to the command string. When zsh receives
				// that whole string via `zsh -c`, aliases defined by the prefix are not
				// available to later lines because the complete string is parsed before
				// the prefix executes. Running the resolved command as a temporary script
				// lets zsh parse subsequent lines after the prefix has sourced aliases.
				const tempDir = await mkdtemp(join(tmpdir(), "pi-zsh-user-bash-"));
				const scriptPath = join(tempDir, "command.zsh");
				await writeFile(scriptPath, `${command}\n`, { mode: 0o600 });

				try {
					const zshCommand = `exec ${shellQuote(getZshPath())} -f ${shellQuote(scriptPath)}`;
					return await local.exec(zshCommand, cwd, options);
				} finally {
					await rm(tempDir, { force: true, recursive: true });
				}
			},
		},
	}));
}
