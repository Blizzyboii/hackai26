import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockGraph } from "./data/mockGraph";
import { PeopleDrawer } from "./PeopleDrawer";
import { PeopleHoverCard } from "./PeopleHoverCard";

describe("people interaction components", () => {
  const edge = mockGraph.edges.find((entry) => entry.id === "e-acm-jp");

  if (!edge) {
    throw new Error("Expected e-acm-jp edge in mock data");
  }

  it("shows hover preview with people rows", () => {
    render(
      <PeopleHoverCard
        title="ACM → JPMorgan"
        subtitle="Alumni Path"
        people={edge.people}
        countLabel="2 weighted alumni"
        point={{ x: 200, y: 200 }}
        viewport={{ width: 1200, height: 800 }}
        onInspect={() => {}}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
      />,
    );

    expect(screen.getByText("ACM → JPMorgan")).toBeInTheDocument();
    expect(screen.getByText("2 weighted alumni")).toBeInTheDocument();
    expect(screen.getByText("Zara Li")).toBeInTheDocument();
    expect(screen.getByText("Aarav Shah")).toBeInTheDocument();
  });

  it("executes inspect action from hover card", () => {
    const onInspect = vi.fn();

    render(
      <PeopleHoverCard
        title="ACM → JPMorgan"
        subtitle="Alumni Path"
        people={edge.people}
        point={{ x: 200, y: 200 }}
        viewport={{ width: 1200, height: 800 }}
        onInspect={onInspect}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(onInspect).toHaveBeenCalledTimes(1);
  });

  it("renders all people in drawer and context action", () => {
    const onContextAction = vi.fn();

    render(
      <PeopleDrawer
        title="ACM"
        subtitle="Club members and outcomes"
        people={mockGraph.nodes.find((node) => node.id === "club-acm")?.people ?? []}
        contextActionLabel="Mark club unavailable"
        onContextAction={onContextAction}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark club unavailable" }));

    expect(onContextAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Zara Li")).toBeInTheDocument();
    expect(screen.getByText("Jonathan Reeves")).toBeInTheDocument();
  });
});
