import type { Service } from "./service.js";
export type Reminder = {
  id: string;
  title: string;
  dueDate: string;
  kind: "contractual" | "internal";
};
// Future HA/email adapters implement this interface. No external transport is mandatory.
export interface NotificationChannel {
  send(reminder: Reminder): Promise<void>;
}
export function reminders(service: Service): Reminder[] {
  const { deadlines, activeTasks, today } = service.dashboard();
  const prewarning = Number(
    service.db.list("settings").find((s) => s.title === "reminder_days")
      ?.value ?? 14,
  );
  const days = (date: string) =>
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
    86400000;
  return [
    ...deadlines
      .filter((d) => days(String(d.due_date)) <= Number(d.reminder_days ?? 14))
      .map((d) => ({
        id: d.id,
        title: String(d.title),
        dueDate: String(d.due_date),
        kind: "contractual" as const,
      })),
    ...activeTasks
      .filter((t) => t.due_date && days(String(t.due_date)) <= prewarning)
      .map((t) => ({
        id: t.id,
        title: String(t.title),
        dueDate: String(t.due_date),
        kind: "internal" as const,
      })),
  ];
}
