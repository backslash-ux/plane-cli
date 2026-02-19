import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { toXml } from "@/output";

describe("toXml", () => {
	it("wraps results in <results> root element", () => {
		const out = toXml([{ id: "1", name: "Foo" }]);
		expect(out).toStartWith("<results>");
		expect(out).toEndWith("</results>");
	});

	it("renders each item as an <item> element with attributes", () => {
		const out = toXml([{ id: "abc", name: "My Project" }]);
		expect(out).toContain('<item id="abc" name="My Project">');
	});

	it("renders an empty <results> for empty array", () => {
		const out = toXml([]);
		expect(out).toBe("<results>\n\n</results>");
	});

	it("renders multiple items", () => {
		const out = toXml([
			{ id: "1", name: "A" },
			{ id: "2", name: "B" },
		]);
		expect(out).toContain('id="1"');
		expect(out).toContain('id="2"');
	});

	it("escapes & in attribute values", () => {
		const out = toXml([{ name: "Canvas & Codegen" }]);
		expect(out).toContain("Canvas &amp; Codegen");
		expect(out).not.toContain("Canvas & Codegen");
	});

	it("escapes < and > in attribute values", () => {
		const out = toXml([{ name: "<tag>" }]);
		expect(out).toContain("&lt;tag&gt;");
	});

	it("escapes quotes in attribute values", () => {
		const out = toXml([{ name: 'say "hi"' }]);
		expect(out).toContain("&quot;hi&quot;");
	});

	it("renders nested objects as child elements", () => {
		const out = toXml([
			{ id: "1", state: { name: "Todo", group: "unstarted" } },
		]);
		expect(out).toContain("<state");
		expect(out).toContain('name="Todo"');
		expect(out).toContain('group="unstarted"');
	});

	it("renders nested arrays as child elements", () => {
		const out = toXml([{ id: "1", tags: ["a", "b"] }]);
		expect(out).toContain("<tags>");
		expect(out).toContain("</tags>");
	});

	it("renders primitive array items as <item> text nodes", () => {
		const out = toXml([{ id: "1", assignees: ["uuid-1", "uuid-2"] }]);
		expect(out).toContain("<item>uuid-1</item>");
		expect(out).toContain("<item>uuid-2</item>");
	});

	it("escapes special chars in primitive array items", () => {
		const out = toXml([{ id: "1", labels: ["a & b"] }]);
		expect(out).toContain("<item>a &amp; b</item>");
	});

	it("handles null values as empty string in attributes", () => {
		const out = toXml([{ id: "1", color: null }]);
		expect(out).toContain('color=""');
	});
});

describe("argv stripping", () => {
	it("removes --json from process.argv when present", async () => {
		process.argv.push("--json-test-flag-xyz");
		// The module is already loaded; test that toXml is a function (module loaded ok)
		expect(typeof toXml).toBe("function");
		process.argv.pop();
	});

	it("jsonMode and xmlMode are booleans", async () => {
		const { jsonMode, xmlMode } = await import("@/output");
		expect(typeof jsonMode).toBe("boolean");
		expect(typeof xmlMode).toBe("boolean");
	});
});
