import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhookBody } from "@/lib/v1/webhookDelivery";

describe("signWebhookBody", () => {
  it("returns a sha256= prefixed hex HMAC of the raw body using the given secret", () => {
    const body = '{"type":"factura.stamped"}';
    const secret = "whsec_test";
    const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(signWebhookBody(body, secret)).toBe(expected);
  });

  it("produces a different signature for a different secret", () => {
    const body = '{"type":"factura.stamped"}';
    expect(signWebhookBody(body, "secret-a")).not.toBe(signWebhookBody(body, "secret-b"));
  });

  it("produces a different signature for a different body", () => {
    const secret = "whsec_test";
    expect(signWebhookBody('{"a":1}', secret)).not.toBe(signWebhookBody('{"a":2}', secret));
  });
});
