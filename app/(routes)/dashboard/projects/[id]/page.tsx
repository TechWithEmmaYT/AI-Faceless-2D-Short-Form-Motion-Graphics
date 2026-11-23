import type { Metadata } from "next";
import { Suspense } from "react";

import { Editor, EditorSkeleton } from "./_components/editor";

export const metadata: Metadata = { title: "Editor" };

/**
 * The project editor. It fills the shell's content area (no page scroll); the tabs column and the
 * stage scroll on their own. The client editor reads the URL (id, ?tab=), so it streams behind Suspense.
 */
export default function EditorPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<EditorSkeleton />}>
        <Editor />
      </Suspense>
    </div>
  );
}
