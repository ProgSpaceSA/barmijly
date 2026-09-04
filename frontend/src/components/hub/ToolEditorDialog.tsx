"use client";
import { useState } from "react";
import { Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogActions, Field, MeetingDialogShell } from "@/components/meetings/MeetingDialogShell";
import { useToolActions, type Tool } from "@/hooks/useTools";
import { HUB_LABELS, TOOL_CATEGORY_LABELS, TOOL_TEAM_LABELS } from "@/lib/constants";

const CATEGORIES = Object.entries(TOOL_CATEGORY_LABELS);
const TEAMS = Object.entries(TOOL_TEAM_LABELS);

/**
 * Ask for a tool, or fix one already in the catalogue.
 *
 * One component for both because the fields are identical — an edit that lost a
 * field the request form had is how a catalogue row ends up with no starting
 * steps.
 */
export function ToolEditorDialog({
  tool,
  onClose,
}: {
  tool?: Tool;
  onClose: () => void;
}) {
  const actions = useToolActions();
  const editing = !!tool;

  const [form, setForm] = useState({
    name: tool?.name ?? "",
    website: tool?.website ?? "",
    description: tool?.description ?? "",
    gettingStarted: tool?.gettingStarted ?? "",
  });
  const [categories, setCategories] = useState<string[]>(tool?.categories ?? []);
  const [teams, setTeams] = useState<string[]>(tool?.teams ?? []);

  const pending = actions.request.isPending || actions.update.isPending;
  const ready = Boolean(
    form.name.trim() &&
      form.website.trim() &&
      form.description.trim() &&
      form.gettingStarted.trim() &&
      categories.length &&
      teams.length,
  );

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleCategory = (value: string) =>
    setCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value].slice(0, 4),
    );

  const toggleTeam = (value: string) =>
    setTeams((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value].slice(0, 5),
    );

  const submit = async () => {
    if (!ready || pending) return;
    const payload = {
      name: form.name.trim(),
      website: form.website.trim(),
      description: form.description.trim(),
      gettingStarted: form.gettingStarted.trim(),
      categories,
      teams,
    };
    if (editing) await actions.update.mutateAsync({ id: tool.id, ...payload });
    else await actions.request.mutateAsync(payload);
    onClose();
  };

  return (
    <MeetingDialogShell
      title={editing ? HUB_LABELS.editTool : HUB_LABELS.newTool}
      icon={Wrench}
      pending={pending}
      onClose={onClose}
      footer={
        <DialogActions
          confirmLabel={HUB_LABELS.save}
          pendingLabel={HUB_LABELS.saving}
          pending={pending}
          disabled={!ready}
          onConfirm={submit}
          onClose={onClose}
        />
      }
    >
      <Field label={HUB_LABELS.toolName}>
        <Input
          value={form.name}
          aria-label={HUB_LABELS.toolName}
          onChange={(e) => set("name", e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={HUB_LABELS.toolWebsite} hint={HUB_LABELS.toolWebsiteHint}>
        <Input
          value={form.website}
          aria-label={HUB_LABELS.toolWebsite}
          onChange={(e) => set("website", e.target.value)}
          className="h-9 text-sm ltr-isolate"
          placeholder="https://"
          disabled={pending}
        />
      </Field>

      <Field label={HUB_LABELS.toolDescription} hint={HUB_LABELS.toolDescriptionHint}>
        <Textarea
          value={form.description}
          aria-label={HUB_LABELS.toolDescription}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className="text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={HUB_LABELS.toolGettingStarted} hint={HUB_LABELS.toolGettingStartedHint}>
        <Textarea
          value={form.gettingStarted}
          aria-label={HUB_LABELS.toolGettingStarted}
          onChange={(e) => set("gettingStarted", e.target.value)}
          rows={4}
          className="text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={HUB_LABELS.toolCategories} hint={HUB_LABELS.toolCategoriesHint}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={HUB_LABELS.toolCategories}>
          {CATEGORIES.map(([value, label]) => {
            const on = categories.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleCategory(value)}
                disabled={pending}
                aria-pressed={on}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
                style={{
                  background: on ? "rgba(79,70,229,0.12)" : "transparent",
                  color: on ? "#818CF8" : "var(--muted-foreground)",
                  border: `1px solid ${on ? "rgba(79,70,229,0.35)" : "var(--border)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={HUB_LABELS.toolTeams} hint={HUB_LABELS.toolTeamsHint}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={HUB_LABELS.toolTeams}>
          {TEAMS.map(([value, label]) => {
            const on = teams.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleTeam(value)}
                disabled={pending}
                aria-pressed={on}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
                style={{
                  background: on ? "rgba(14,165,233,0.12)" : "transparent",
                  color: on ? "#38BDF8" : "var(--muted-foreground)",
                  border: `1px solid ${on ? "rgba(14,165,233,0.35)" : "var(--border)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>
    </MeetingDialogShell>
  );
}
