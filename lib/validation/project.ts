import { z } from "zod";

import { INPUT_MODES, MOTION_STYLES, TARGET_SECONDS } from "@/lib/db/app-schema";

export const BRIEF_MAX = 1000;
export const TITLE_MAX = 80;

/** One schema for the Create Project form (client hints) and the server action (the real check). */
export const createProjectSchema = z
  .object({
    title: z.string().trim().min(1, "Give your project a title.").max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    inputMode: z.enum(INPUT_MODES),
    brief: z.string().trim().max(BRIEF_MAX, `Keep it under ${BRIEF_MAX} characters.`),
    motionStyle: z.enum(MOTION_STYLES, { error: "Pick a motion style." }),
    targetSeconds: z.coerce
      .number()
      .refine((n): n is (typeof TARGET_SECONDS)[number] => (TARGET_SECONDS as readonly number[]).includes(n), "Pick a duration."),
  })
  .superRefine((value, ctx) => {
    // An idea can be one line; a pasted script needs at least a few lines' worth to be a script.
    const min = value.inputMode === "script" ? 40 : 10;
    if (value.brief.length < min) {
      ctx.addIssue({
        code: "custom",
        path: ["brief"],
        message: value.inputMode === "script" ? "Paste the whole script — it looks too short." : "Describe your idea in a sentence or two.",
      });
    }
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateProjectField = keyof CreateProjectInput;
