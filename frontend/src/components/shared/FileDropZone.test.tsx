import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileDropZone } from "./FileDropZone";
import { COMMENT_LABELS } from "@/lib/constants";

describe("FileDropZone", () => {
  it("passes dropped files to onFiles", () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone onFiles={onFiles}>
        <p>drop target</p>
      </FileDropZone>,
    );

    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    fireEvent.dragEnter(screen.getByText("drop target"));
    expect(screen.getByText(COMMENT_LABELS.dropHere)).toBeInTheDocument();
    expect(screen.getByText("drop target")).not.toBeVisible();

    fireEvent.drop(screen.getByText("drop target"), {
      dataTransfer: { files: [file] },
    });

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("filters by accept when provided", () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone accept="image/*" onFiles={onFiles}>
        <p>images only</p>
      </FileDropZone>,
    );

    const image = new File(["img"], "photo.png", { type: "image/png" });
    const doc = new File(["doc"], "note.txt", { type: "text/plain" });

    fireEvent.drop(screen.getByText("images only"), {
      dataTransfer: { files: [image, doc] },
    });

    expect(onFiles).toHaveBeenCalledWith([image]);
  });
});
