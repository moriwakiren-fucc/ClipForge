import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("media storage boundary", () => {
  it("rejects project listing without an authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects access to a project owned by another user", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 7,
      openId: "storage-test-user",
      name: "Storage Test",
      email: "storage@example.com",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));

    await expect(caller.media.upload({ projectId: 999999, filename: "clip.mp4", mimeType: "video/mp4", byteSize: 1, base64: "YQ==" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.media.delete({ projectId: 999999, assetId: 999999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const assets = await caller.media.list({ projectId: 999999 });
    expect(assets).toEqual([]);
  });

  it("rejects unsupported media types before storage upload", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 7,
      openId: "storage-test-user",
      name: "Storage Test",
      email: "storage@example.com",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));

    await expect(caller.media.upload({
      projectId: 1,
      filename: "note.txt",
      mimeType: "text/plain",
      byteSize: 1,
      base64: "YQ==",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
