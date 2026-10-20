import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OriginBadge } from "@/components/origin-badge";
import { PlainText } from "@/components/plain-text";
import { Bars } from "@/components/bars";
import { Dialog, UiProvider, useConfirm, useToast } from "@/components/ui/primitives";

describe("PlainText (untrusted content)", () => {
  it("renders markup-looking text as text, never as HTML", () => {
    const { container } = render(
      <PlainText
        text={
          '<img src=x onerror="alert(1)"> <script>alert(1)</script>\n\n## Heading\n\n- one\n- two'
        }
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/onerror/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("OriginBadge", () => {
  it("labels offline output honestly", () => {
    render(<OriginBadge origin="heuristic" />);
    expect(screen.getByText("Offline heuristics")).toBeInTheDocument();
    expect(screen.getByTitle(/No AI model was used/)).toBeInTheDocument();
  });
  it("distinguishes local and hosted AI", () => {
    render(
      <>
        <OriginBadge origin="local-ai" />
        <OriginBadge origin="hosted-ai" />
      </>,
    );
    expect(screen.getByText("Local AI")).toBeInTheDocument();
    expect(screen.getByText("Hosted AI")).toBeInTheDocument();
  });
});

describe("Bars", () => {
  it("exposes each value to assistive technology", () => {
    render(
      <Bars
        label="Reviews"
        data={[
          { label: "Mon", count: 3 },
          { label: "Tue", count: 0 },
        ]}
      />,
    );
    expect(screen.getByLabelText("Mon: 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Tue: 0")).toBeInTheDocument();
  });
});

describe("Dialog", () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button>outside</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Hello">
          <button>inside</button>
        </Dialog>
      </>
    );
  }
  it("is labelled, moves focus in, and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Hello" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("useConfirm and toasts", () => {
  function Demo({ onResult }: { onResult: (v: boolean) => void }) {
    const confirm = useConfirm();
    const toast = useToast();
    return (
      <>
        <button
          onClick={async () =>
            onResult(
              await confirm({
                title: "Sure?",
                message: "Really delete it?",
                confirmLabel: "Yes",
                danger: true,
              }),
            )
          }
        >
          ask
        </button>
        <button onClick={() => toast("Saved!", "good")}>toast</button>
      </>
    );
  }
  it("resolves true on confirm and false on cancel", async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(
      <UiProvider>
        <Demo onResult={(v) => results.push(v)} />
      </UiProvider>,
    );
    await user.click(screen.getByText("ask"));
    expect(screen.getByText("Really delete it?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(results).toEqual([true]));
    await user.click(screen.getByText("ask"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(results).toEqual([true, false]));
  });
  it("announces toasts politely", async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <Demo onResult={vi.fn()} />
      </UiProvider>,
    );
    await user.click(screen.getByText("toast"));
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
