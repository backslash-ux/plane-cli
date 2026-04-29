import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { cli, isRootHelpRequest, renderRootHelp } from "./app.js";

const program = isRootHelpRequest(process.argv)
	? Effect.sync(() => {
			console.log(renderRootHelp());
		})
	: Effect.suspend(() => cli(process.argv));

program.pipe(
	Effect.provide(Layer.mergeAll(NodeContext.layer)),
	NodeRuntime.runMain,
);
