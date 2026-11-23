"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AudioLinesIcon, CheckIcon, ClockIcon, FileTextIcon, PlayIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Brief } from "@/lib/agent/briefs/types";
import type { Example } from "@/lib/agent/examples/types";
import { TARGET_SECONDS, type InputMode, type MotionStyle, type TargetSeconds } from "@/lib/db/app-schema";
import { STYLE_ART, formatDuration } from "@/lib/styles";
import { ApiError, createProjectMutationFn, projectKeys } from "@/lib/api";
import { BRIEF_MAX, TITLE_MAX, type CreateProjectField } from "@/lib/validation/project";
import { cn } from "@/lib/utils";

type StyleOption = Pick<Brief, "id" | "name">;
type ExampleInfo = Pick<Example, "style" | "title" | "seconds">;

const DURATION_LABEL: Record<TargetSeconds, string> = { 30: "30s", 45: "45s", 60: "1m" };

const PLACEHOLDER: Record<InputMode, string> = {
  idea: "e.g. A night-shift nurse is stuck on the 14th floor when the whole city goes dark. Day 1 of a survival serial.",
  script: "Paste your script here. One short line per caption works best; a blank line starts a new scene.",
};

/**
 * Create Project (_design/create-screen.jpg). Submits through TanStack Query
 * (createProjectMutationFn → POST /api/projects); the API validates and returns field errors.
 */
export function CreateProjectForm({
  styles,
  examples,
  initialStyle,
}: {
  styles: StyleOption[];
  examples: ExampleInfo[];
  initialStyle: MotionStyle;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("idea");
  const [brief, setBrief] = useState("");
  const [targetSeconds, setTargetSeconds] = useState<TargetSeconds>(45);
  const [motionStyle, setMotionStyle] = useState<MotionStyle>(initialStyle);
  // Fields the user has edited since the last failed submit: their error is stale, so hide it.
  const [edited, setEdited] = useState<ReadonlySet<CreateProjectField>>(new Set());

  // A style card links here with ?style=; follow it when the (preserved) form gets a new one.
  const [styleFromLink, setStyleFromLink] = useState(initialStyle);
  if (styleFromLink !== initialStyle) {
    setStyleFromLink(initialStyle);
    setMotionStyle(initialStyle);
  }

  // Set once a project is created; the form is cleared when the page is hidden (below).
  const resetOnHide = useRef(false);

  const createProject = useMutation({
    mutationFn: createProjectMutationFn,
    onSuccess: async ({ id }) => {
      resetOnHide.current = true;
      await queryClient.invalidateQueries({ queryKey: projectKeys.list() });
      toast.success("Project created. Connect Claude Code next.");
      router.push(`/dashboard/projects/${id}?tab=claude`);
    },
  });

  // Next 16 (cacheComponents) keeps visited pages alive in <Activity> instead of unmounting them, so
  // coming back here would show the last project's fields and a "Creating…" button. Once a project
  // is created, start fresh when the page is hidden (node_modules/next/dist/docs/01-app/02-guides/
  // preserving-ui-state.md). An unsent draft is still kept.
  const { reset: resetMutation } = createProject;
  useLayoutEffect(
    () => () => {
      if (!resetOnHide.current) return;
      resetOnHide.current = false;
      setTitle("");
      setBrief("");
      setInputMode("idea");
      setTargetSeconds(45);
      setEdited(new Set());
      resetMutation();
    },
    [resetMutation],
  );

  const markEdited = (field: CreateProjectField) => setEdited((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const apiError = createProject.error instanceof ApiError ? createProject.error : null;
  const errors = Object.fromEntries(
    Object.entries(apiError?.errors ?? {}).filter(([field]) => !edited.has(field as CreateProjectField)),
  ) as Partial<Record<CreateProjectField, string>>;
  // A field-level 400 is shown on the fields; anything else gets the banner.
  const bannerMessage = createProject.error && !apiError?.errors ? (apiError?.message ?? "Couldn't create the project. Try again.") : null;
  const pending = createProject.isPending || createProject.isSuccess; // keep the button busy through the redirect
  const example = examples.find((e) => e.style === motionStyle);
  const selected = styles.find((s) => s.id === motionStyle);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEdited(new Set());
    createProject.mutate({ title, inputMode, brief, motionStyle, targetSeconds });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 items-start gap-6 @5xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        {bannerMessage && (
          <Alert variant="destructive">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}

        {/* Prompt / Script */}
        <Card>
          <CardHeader>
            <CardTitle className="section-heading text-lg font-semibold">Prompt / Script</CardTitle>
            <CardAction>
              <ToggleGroup
                variant="segment"
                value={[inputMode]}
                onValueChange={(value) => value[0] && (setInputMode(value[0] as InputMode), markEdited("brief"))}
                aria-label="What are you giving Claude Code?"
              >
                <ToggleGroupItem value="idea">
                  <SparklesIcon data-icon="inline-start" />
                  Describe idea
                </ToggleGroupItem>
                <ToggleGroupItem value="script">
                  <FileTextIcon data-icon="inline-start" />
                  Paste script
                </ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!errors.title}>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input
                  id="title"
                  name="title"
                  value={title}
                  onChange={(e) => (setTitle(e.target.value), markEdited("title"))}
                  maxLength={TITLE_MAX}
                  placeholder="e.g. The Blackout — Day 1"
                  className="h-11"
                  aria-invalid={!!errors.title}
                />
                <FieldError>{errors.title}</FieldError>
              </Field>

              <Field data-invalid={!!errors.brief}>
                <FieldLabel htmlFor="brief" className="sr-only">
                  {inputMode === "idea" ? "Your idea" : "Your script"}
                </FieldLabel>
                <InputGroup className="h-auto">
                  <InputGroupTextarea
                    id="brief"
                    name="brief"
                    value={brief}
                    onChange={(e) => (setBrief(e.target.value), markEdited("brief"))}
                    maxLength={BRIEF_MAX}
                    placeholder={PLACEHOLDER[inputMode]}
                    className={cn("text-[15px] leading-relaxed", inputMode === "script" ? "min-h-48" : "min-h-28")}
                    aria-invalid={!!errors.brief}
                  />
                  <InputGroupAddon align="block-end" className="justify-end">
                    <InputGroupText className="text-xs text-faint tabular-nums">
                      {brief.length}/{BRIEF_MAX}
                    </InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError>{errors.brief}</FieldError>
              </Field>

              <Field orientation="horizontal" data-invalid={!!errors.targetSeconds}>
                <FieldLabel className="flex-none gap-2 text-muted-foreground">
                  <ClockIcon className="size-4" aria-hidden />
                  Duration:
                </FieldLabel>
                <ToggleGroup
                  variant="chip"
                  value={[String(targetSeconds)]}
                  onValueChange={(value) => value[0] && setTargetSeconds(Number(value[0]) as TargetSeconds)}
                  aria-label="Target length"
                >
                  {TARGET_SECONDS.map((seconds) => (
                    <ToggleGroupItem key={seconds} value={String(seconds)}>
                      {DURATION_LABEL[seconds]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        {/* 2D Motion Style */}
        <Card>
          <CardHeader>
            <CardTitle className="section-heading text-lg font-semibold">2D Motion Style</CardTitle>
            <CardDescription>Choose a visual style for your video</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={motionStyle}
              onValueChange={(value) => setMotionStyle(value as MotionStyle)}
              aria-label="Motion style"
              className="grid grid-cols-2 gap-3 @3xl:grid-cols-4"
            >
              {styles.map((style) => {
                const art = STYLE_ART[style.id];
                return (
                  <label
                    key={style.id}
                    className="group/style relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40 has-data-checked:border-2 has-data-checked:border-brand has-data-checked:bg-brand-soft has-data-checked:p-[11px] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                  >
                    {/* The real radio, visually hidden. The wrapper hides it: RadioGroupItem's own
                        `relative size-4` would beat `sr-only` and leave a gap above the image. */}
                    <span className="sr-only">
                      <RadioGroupItem value={style.id} />
                    </span>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                      <Image src={art.image} alt="" fill sizes="(min-width: 1280px) 180px, 45vw" className="object-cover" />
                      <span
                        aria-hidden
                        className="absolute top-2 right-2 hidden size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card group-has-data-checked/style:flex"
                      >
                        <CheckIcon className="size-3.5" strokeWidth={3} />
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[15px] font-semibold text-foreground">{style.name}</span>
                      <span className="text-[13px] leading-snug text-muted-foreground">{art.blurb}</span>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        <Alert>
          <AudioLinesIcon />
          <AlertDescription>
            Voiceovers will be generated via <span className="font-medium text-foreground">Fish Audio MCP</span> inside Claude Code.
          </AlertDescription>
        </Alert>
      </div>

      {/* Preview: a real still from the selected style's worked example. */}
      <Card className="@5xl:sticky @5xl:top-6">
        <CardHeader>
          <CardTitle className="section-heading text-lg font-semibold">Preview</CardTitle>
          <CardAction>
            <Badge variant="outline" className="h-7 px-3 text-xs">
              9:16 Portrait
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <figure className="mx-auto flex w-full max-w-[300px] flex-col gap-2.5">
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
              <Image
                key={motionStyle}
                src={STYLE_ART[motionStyle].shot}
                alt={example ? `Example frame from “${example.title}”, a ${selected?.name} short` : ""}
                fill
                priority
                sizes="300px"
                className="object-cover animate-in fade-in duration-300"
              />
              {example && (
                <div className="absolute inset-x-2 top-2 flex items-center justify-between">
                  <Badge variant="overlay">
                    <PlayIcon data-icon="inline-start" className="fill-current" />
                    {formatDuration(example.seconds)}
                  </Badge>
                  <Badge variant="overlay">Example</Badge>
                </div>
              )}
            </div>
            {example && (
              <figcaption className="text-center text-xs text-muted-foreground">
                {selected?.name} example · <span className="font-medium text-foreground">{example.title}</span>
              </figcaption>
            )}
          </figure>

          <Button type="submit" size="lg" disabled={pending} className="h-12 w-full text-[15px]">
            {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            {pending ? "Creating…" : "Create Project"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
