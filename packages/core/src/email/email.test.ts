import { describe, expect, it, vi } from "vitest";
import { inviteEmail, passwordResetEmail } from "./templates";
import { MemoryEmailSender } from "./memory";
import { ResendEmailSender } from "./resend";
import { createEmailSender, parseEmailMode } from "./registry";

/**
 * Verify T85: почта работает без ключа (складывается в память), с ключом
 * уходит в транспорт, а отказ по существу не превращается в три попытки.
 */

describe("email templates", () => {
  it("приглашение несёт ссылку, агентство и роль", () => {
    const message = inviteEmail({
      to: "colleague@agency.test",
      agencyName: "Northwind Studio",
      role: "member",
      inviteUrl: "https://app.test/invite/abc123",
      invitedByName: "Dana",
    });

    expect(message.to).toBe("colleague@agency.test");
    expect(message.subject).toContain("Northwind Studio");
    expect(message.text).toContain("https://app.test/invite/abc123");
    expect(message.text).toContain("Dana");
    expect(message.html).toContain("https://app.test/invite/abc123");
  });

  it("письмо о сбросе пароля говорит, что бездействие ничего не меняет", () => {
    const message = passwordResetEmail({
      to: "owner@agency.test",
      resetUrl: "https://app.test/reset-password?token=xyz",
    });

    expect(message.text).toContain("https://app.test/reset-password?token=xyz");
    // Человек, который письма не ждал, должен понять, что делать: ничего.
    expect(message.text).toMatch(/ignore this email/i);
  });

  it("имя агентства в HTML экранируется", () => {
    const message = inviteEmail({
      to: "colleague@agency.test",
      agencyName: '<script>alert("x")</script>',
      role: "admin",
      inviteUrl: "https://app.test/invite/abc123",
    });

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});

describe("MemoryEmailSender", () => {
  it("складывает письма и отдаёт последнее адресату", async () => {
    const sender = new MemoryEmailSender();

    await sender.send({ to: "a@test", subject: "First", text: "one" });
    await sender.send({ to: "b@test", subject: "Other", text: "two" });
    await sender.send({ to: "a@test", subject: "Second", text: "three" });

    expect(sender.sent).toHaveLength(3);
    expect(sender.lastTo("a@test")?.subject).toBe("Second");
    expect(sender.lastTo("nobody@test")).toBeUndefined();
  });
});

describe("ResendEmailSender", () => {
  function okResponse(id: string): Response {
    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("отправляет письмо и возвращает идентификатор", async () => {
    const fetchImpl = vi.fn(async () => okResponse("msg_1"));

    const sender = new ResendEmailSender({
      apiKey: "test-key",
      from: "Citeworthy <noreply@test>",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await sender.send({ to: "x@test", subject: "Hi", text: "body" });

    expect(result.id).toBe("msg_1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { from: string; to: string[] };
    expect(payload.from).toBe("Citeworthy <noreply@test>");
    expect(payload.to).toEqual(["x@test"]);
  });

  it("повторяет попытку на 500 и добивается ответа", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream error", { status: 500 }))
      .mockResolvedValueOnce(okResponse("msg_2"));

    const sender = new ResendEmailSender({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });

    await expect(sender.send({ to: "x@test", subject: "Hi", text: "body" })).resolves.toEqual({
      id: "msg_2",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("неверный ключ не повторяется, а сразу объясняет причину", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid api key", { status: 401 }));

    const sender = new ResendEmailSender({
      apiKey: "wrong",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });

    await expect(sender.send({ to: "x@test", subject: "Hi", text: "body" })).rejects.toThrow(
      /401/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("без ключа не создаётся", () => {
    expect(() => new ResendEmailSender({ apiKey: "" })).toThrow(/RESEND_API_KEY/);
  });
});

describe("createEmailSender", () => {
  it("по умолчанию письма никуда не уходят", async () => {
    const sender = createEmailSender({});
    expect(sender).toBeInstanceOf(MemoryEmailSender);

    await sender.send({ to: "x@test", subject: "Hi", text: "body" });
    expect((sender as MemoryEmailSender).sent).toHaveLength(1);
  });

  it("живой режим без ключа — понятная ошибка, а не тихий лог", () => {
    expect(() => createEmailSender({ EMAIL_MODE: "live" })).toThrow(/RESEND_API_KEY/);
  });

  it("живой режим с ключом даёт транспорт", () => {
    const sender = createEmailSender({ EMAIL_MODE: "live", RESEND_API_KEY: "k" });
    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it("непонятное значение режима отвергается", () => {
    expect(() => parseEmailMode("maybe")).toThrow(/EMAIL_MODE/);
  });
});
