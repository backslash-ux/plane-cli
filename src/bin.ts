import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { cli } from "./app.js";

Effect.suspend(() => cli(process.argv)).pipe(
	Effect.provide(Layer.mergeAll(NodeContext.layer)),
	NodeRuntime.runMain,
);
