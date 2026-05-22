import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { jsonMode, jsonOption } from "../output.js";
import { getLocalProjectContextFilePath } from "../project-context.js";
import { resolveProject } from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription("Project identifier. Omit to use @current."),
	Args.withDefault("@current"),
);

export function projectContextHandler({ project }: { project: string }) {
	return Effect.gen(function* () {
		const snapshot = yield* Effect.tryPromise({
			try: async () => {
				const { readFile } = await import("node:fs/promises");
				return JSON.parse(
					await readFile(getLocalProjectContextFilePath(), "utf8"),
				) as {
					project?: { identifier?: string; name?: string };
					features?: Record<string, boolean>;
					helpers?: {
						states?: { total?: number };
						labels?: { total?: number };
						estimate?: { enabled?: boolean; points?: unknown[] };
					};
				};
			},
			catch: (error) =>
				error instanceof Error ? error : new Error(String(error)),
		});
		const requested = yield* resolveProject(project);
		const snapshotKey = snapshot.project?.identifier?.toUpperCase();
		if (snapshotKey && snapshotKey !== requested.key) {
			return yield* Effect.fail(
				new Error(
					`Local project context is for ${snapshotKey}, but ${requested.key} was requested. Run 'plane init --local' to refresh this directory.`,
				),
			);
		}
		if (jsonMode) {
			yield* Console.log(JSON.stringify(snapshot, null, 2));
			return;
		}
		const features = Object.entries(snapshot.features ?? {})
			.map(([name, enabled]) => `${name}=${enabled ? "enabled" : "disabled"}`)
			.join(" ");
		yield* Console.log(
			[
				`${snapshot.project?.identifier ?? requested.key}  ${snapshot.project?.name ?? ""}`.trim(),
				`Features: ${features}`,
				`States: ${snapshot.helpers?.states?.total ?? 0}`,
				`Labels: ${snapshot.helpers?.labels?.total ?? 0}`,
				`Estimate: ${
					snapshot.helpers?.estimate?.enabled
						? `${snapshot.helpers.estimate.points?.length ?? 0} points`
						: "disabled"
				}`,
			].join("\n"),
		);
	});
}

export const projectContext = Command.make(
	"context",
	{ project: projectArg, json: jsonOption },
	projectContextHandler,
).pipe(
	Command.withDescription(
		"Print the local .plane/project-context.json snapshot. Omit PROJECT to use @current.",
	),
);

export const project = Command.make("project").pipe(
	Command.withDescription("Inspect project-local Plane context."),
	Command.withSubcommands([projectContext]),
);
