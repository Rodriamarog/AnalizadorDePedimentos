import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { GET } from "@/app/api/v1/jobs/[job_id]/route";
import { withOrg } from "@/lib/db/withOrg";
import { pedimentoJobs } from "@/lib/db/schema";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function call(jobId: string, token: string) {
  return GET(buildRequest(`/api/v1/jobs/${jobId}`, { headers: authHeaders(token) }), {
    params: Promise.resolve({ job_id: jobId }),
  });
}

describe("/api/v1/jobs/[job_id]", () => {
  let orgId: string;
  let token: string;
  let otherOrgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg({ withFacturapi: false });
    token = await createApiKey(orgId);
    otherOrgId = await createTestOrg({ withFacturapi: false });
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
    await cleanupOrg(otherOrgId);
  });

  it("rejects requests with no Authorization header", async () => {
    const res = await GET(buildRequest("/api/v1/jobs/anything"), { params: Promise.resolve({ job_id: "anything" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a job id that doesn't exist", async () => {
    const res = await call(randomUUID(), token);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not_found");
  });

  it("returns pending status for a freshly created job", async () => {
    const jobId = await withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(pedimentoJobs)
        .values({ orgId, status: "pending", sourceFilename: "test.pdf" })
        .returning({ id: pedimentoJobs.id });
      return row.id;
    });

    const res = await call(jobId, token);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({ job_id: jobId, status: "pending", created_at: expect.any(String) })
    );
    expect(json.finished_at).toBeUndefined();
    expect(json.pedimento_id).toBeUndefined();
    expect(json.error).toBeUndefined();
  });

  it("includes pedimento_id and duplicate flag once done", async () => {
    const jobId = await withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(pedimentoJobs)
        .values({
          orgId,
          status: "done",
          sourceFilename: "done.pdf",
          duplicate: true,
          finishedAt: new Date(),
        })
        .returning({ id: pedimentoJobs.id });
      return row.id;
    });

    const res = await call(jobId, token);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("done");
    expect(json.duplicate).toBe(true);
    expect(json.finished_at).toEqual(expect.any(String));
    expect(json.pedimento_id).toBeNull();
  });

  it("includes an error object once failed", async () => {
    const jobId = await withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(pedimentoJobs)
        .values({
          orgId,
          status: "failed",
          sourceFilename: "bad.pdf",
          errorCode: "parse_error",
          errorMessage: "Could not read the PDF",
          finishedAt: new Date(),
        })
        .returning({ id: pedimentoJobs.id });
      return row.id;
    });

    const res = await call(jobId, token);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("failed");
    expect(json.error).toEqual({ code: "parse_error", message: "Could not read the PDF" });
  });

  it("returns 404 for a job id that belongs to a different org", async () => {
    const jobId = await withOrg(otherOrgId, async (tx) => {
      const [row] = await tx
        .insert(pedimentoJobs)
        .values({ orgId: otherOrgId, status: "pending", sourceFilename: "other-org.pdf" })
        .returning({ id: pedimentoJobs.id });
      return row.id;
    });

    const res = await call(jobId, token);
    expect(res.status).toBe(404);
  });
});
