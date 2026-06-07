import { basename } from "node:path";
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
			exec(command, cwd, options) {
				// Run zsh as a non-interactive shell. `-i` sources ~/.zshrc, which may
				// start prompt integrations like gitstatus/powerlevel10k. Pi executes
				// user bash commands without a real interactive job-control terminal,
				// so those integrations can emit warnings such as:
				//   setopt: can't change option: monitor
				//   gitstatus failed to initialize
				const zshCommand = `exec ${shellQuote(getZshPath())} -fc ${shellQuote(command)}`;
				return local.exec(zshCommand, cwd, options);
			},
		},
	}));
}
