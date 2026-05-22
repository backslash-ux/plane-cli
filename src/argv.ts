const COMMAND_PATHS = [
	["issues", "bulk-create"],
	["issues", "bulk-update"],
	["issues", "list"],
	["issue", "comments", "update"],
	["issue", "comments", "delete"],
	["issue", "comments", "list"],
	["issue", "worklogs", "add"],
	["issue", "worklogs", "list"],
	["issue", "link", "remove"],
	["issue", "link", "add"],
	["issue", "link", "list"],
	["issue", "get"],
	["issue", "create"],
	["issue", "update"],
	["issue", "delete"],
	["issue", "comment"],
	["issue", "activity"],
	["cycles", "issues", "list"],
	["cycles", "issues", "add"],
	["cycles", "list"],
	["cycles", "create"],
	["cycles", "update"],
	["cycles", "delete"],
	["modules", "issues", "list"],
	["modules", "issues", "add"],
	["modules", "issues", "remove"],
	["modules", "list"],
	["modules", "create"],
	["modules", "delete"],
	["pages", "list"],
	["pages", "get"],
	["pages", "create"],
	["pages", "update"],
	["pages", "delete"],
	["pages", "archive"],
	["pages", "unarchive"],
	["pages", "lock"],
	["pages", "unlock"],
	["pages", "duplicate"],
	["labels", "list"],
	["labels", "create"],
	["labels", "delete"],
	["intake", "list"],
	["intake", "accept"],
	["intake", "reject"],
	["states", "list"],
	["members", "list"],
	["projects", "list"],
	["projects", "current"],
	["projects", "use"],
	["project", "context"],
	["stats"],
	["init"],
	["."],
] as const;

const BOOLEAN_OPTIONS = new Set([
	"--help",
	"-h",
	"--version",
	"--json",
	"--xml",
	"--wizard",
	"--no-assignee",
	"--include-archived",
	"--global",
	"-g",
	"--local",
	"-l",
	"--dry-run",
	"--stdin",
	"--lock",
]);

export function normalizeArgv(argv: ReadonlyArray<string>): string[] {
	const prefix = argv.slice(0, 2);
	const args = argv.slice(2);
	const commandPath = findCommandPath(args);
	if (!commandPath) return [...argv];

	const command = args.slice(0, commandPath.length);
	const rest = args.slice(commandPath.length);
	if (rest.length < 2 || rest.includes("--help") || rest.includes("-h")) {
		return [...argv];
	}

	const options: string[] = [];
	const positionals: string[] = [];
	for (let i = 0; i < rest.length; i += 1) {
		const token = rest[i];
		if (!isOptionToken(token)) {
			positionals.push(token);
			continue;
		}
		options.push(token);
		if (token.includes("=") || BOOLEAN_OPTIONS.has(token)) {
			continue;
		}
		const value = rest[i + 1];
		if (value !== undefined && !isOptionToken(value)) {
			options.push(value);
			i += 1;
		}
	}

	return [...prefix, ...command, ...options, ...positionals];
}

function isOptionToken(token: string): boolean {
	return /^-{1,2}[A-Za-z]/.test(token);
}

function findCommandPath(
	args: ReadonlyArray<string>,
): readonly string[] | null {
	let best: readonly string[] | null = null;
	for (const path of COMMAND_PATHS) {
		if (
			path.every(
				(segment, index) =>
					args[index]?.toLowerCase() === segment.toLowerCase(),
			) &&
			(!best || path.length > best.length)
		) {
			best = path;
		}
	}
	return best;
}
