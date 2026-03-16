/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHistoryInlinePicker } from "./GitHistoryPanelPickers";

describe("GitHistoryPanelPickers", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens inline picker dropdown without runtime reference errors", () => {
    const onSelect = vi.fn();

    render(
      <GitHistoryInlinePicker
        label="Target branch"
        value="main"
        options={[
          { value: "main", label: "main" },
          { value: "feature/demo", label: "feature/demo", description: "demo branch" },
        ]}
        searchPlaceholder="Search branches"
        emptyText="No branches"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Target branch" }));
    expect(screen.getByPlaceholderText("Search branches")).toBeTruthy();
  });
});
