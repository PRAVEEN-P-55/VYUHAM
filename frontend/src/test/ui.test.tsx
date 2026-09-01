import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, ConfidenceMeter, Drawer, PipelineStepper } from "../components/ui";

describe("shared investigative UI", () => {
  it("exposes an accessible button name and click behavior", () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Inspect evidence</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("pairs confidence values with review language", () => {
    render(<ConfidenceMeter value={68} />);
    expect(screen.getByText("68% confidence")).toBeInTheDocument();
    expect(screen.getByText("Human review recommended")).toBeInTheDocument();
  });

  it("communicates the active pipeline step", () => {
    render(<PipelineStepper steps={["Uploaded", "OCR", "Graph Update"]} current={1} />);
    expect(screen.getByRole("list", { name: "Document processing progress" })).toBeInTheDocument();
    expect(screen.getByText("Processing now")).toBeInTheDocument();
  });

  it("closes the entity drawer with Escape", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} title="Entity profile"><button>Evidence record</button></Drawer>);
    expect(screen.getByRole("dialog", { name: "Entity profile" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
