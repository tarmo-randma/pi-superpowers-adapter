import assert from "node:assert/strict";
import test from "node:test";
import superpowersAdapter from "../src/index.ts";

function createFakePi() {
  const tools: Record<string, any> = {};
  return {
    tools,
    pi: {
      on() {},
      registerTool(tool: any) {
        tools[tool.name] = tool;
      },
      registerCommand() {},
    },
  };
}

const theme = {
  bold(text: string) {
    return text;
  },
  fg(_name: string, text: string) {
    return text;
  },
};

function trimRight(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

test("skill tool renderer hides successful skill content while collapsed", () => {
  const { pi, tools } = createFakePi();
  superpowersAdapter(pi as any);

  const tool = tools.skill;
  assert.equal(typeof tool.renderCall, "function");
  assert.equal(typeof tool.renderResult, "function");

  const call = tool.renderCall({ name: "brainstorming" }, theme, { expanded: false });
  const renderedCall = trimRight(call.render(120));
  assert.deepEqual(renderedCall, ["[skill] brainstorming (tool output toggle to expand)"]);
  assert.ok(!renderedCall[0]?.includes("\x1b"), "renderer should not hard-code ANSI escapes");

  const result = tool.renderResult(
    { content: [{ type: "text", text: "---\nname: brainstorming\n---\n\n# Brainstorming Ideas Into Designs" }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false },
  );
  assert.deepEqual(trimRight(result.render(120)), []);
});

test("skill tool renderer shows content when expanded and errors even while collapsed", () => {
  const { pi, tools } = createFakePi();
  superpowersAdapter(pi as any);

  const tool = tools.skill;
  const expanded = tool.renderResult(
    { content: [{ type: "text", text: "# Brainstorming" }] },
    { expanded: true, isPartial: false },
    theme,
    { isError: false },
  );
  const renderedExpanded = expanded.render(12);
  assert.ok(renderedExpanded.length > 1);
  assert.ok(renderedExpanded.every((line: string) => line.length <= 12));

  const error = tool.renderResult(
    { content: [{ type: "text", text: "Superpowers skill not found: nope" }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: true },
  );
  assert.deepEqual(trimRight(error.render(120)), ["Superpowers skill not found: nope"]);
});
