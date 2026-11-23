import type { Metadata } from "next";

import { ProjectsBrowser } from "./_components/projects-browser";

export const metadata: Metadata = { title: "Projects" };

/** Projects (_design/all-project-screen.jpg). Header, search, tabs and grid are one client view. */
export default function ProjectsPage() {
  return (
    <div className="@container mx-auto flex w-full max-w-300 flex-col gap-6 px-4 py-6 sm:px-6">
      <ProjectsBrowser />
    </div>
  );
}
