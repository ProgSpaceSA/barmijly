import { describe, it, expect } from "vitest";
import { notificationTitle } from "./constants";

describe("notificationTitle", () => {
  it("translates English titles that were stored before the copy switched", () => {
    expect(notificationTitle("COMMENT_ADDED", "You were mentioned in a comment")).toBe(
      "تمت الإشارة إليك في تعليق",
    );
    expect(notificationTitle("COMMENT_ADDED", "New comment on your ticket")).toBe(
      "تعليق جديد على تذكرتك",
    );
    expect(notificationTitle("TICKET_ASSIGNED", "New ticket assigned to you")).toBe(
      "أُسندت إليك تذكرة",
    );
  });

  it("keeps an Arabic mention title instead of the generic comment heading", () => {
    expect(notificationTitle("COMMENT_ADDED", "تمت الإشارة إليك في تعليق")).toBe(
      "تمت الإشارة إليك في تعليق",
    );
  });

  it("falls back to the type heading when leftover English is unknown", () => {
    expect(notificationTitle("TICKET_APPROVED", "Ticket approved somehow")).toBe(
      "تم اعتماد التذكرة",
    );
  });
});
