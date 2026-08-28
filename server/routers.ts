import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createMediaAsset, createProject, deleteMediaAsset, getMediaAssetsByOwner, getProjectsByOwner } from "./db";
import { storagePut } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  projects: router({
    list: protectedProcedure.query(({ ctx }) => getProjectsByOwner(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160) })).mutation(({ ctx, input }) => createProject({ ownerId: ctx.user.id, name: input.name })),
  }),
  media: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(({ ctx, input }) => getMediaAssetsByOwner(ctx.user.id, input.projectId)),
    upload: protectedProcedure.input(z.object({
      projectId: z.number().int().positive(),
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().regex(/^(video|audio|image)\//),
      byteSize: z.number().int().positive().max(250 * 1024 * 1024),
      durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
      base64: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const projects = await getProjectsByOwner(ctx.user.id);
      if (!projects.some((project) => project.id === input.projectId)) throw new TRPCError({ code: "FORBIDDEN", message: "このプロジェクトへ保存する権限がありません。" });
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const data = Buffer.from(input.base64, "base64");
      if (data.byteLength !== input.byteSize) throw new TRPCError({ code: "BAD_REQUEST", message: "ファイルサイズの検証に失敗しました。" });
      const stored = await storagePut(`${ctx.user.id}/projects/${input.projectId}/${Date.now()}-${safeName}`, data, input.mimeType);
      return createMediaAsset({ ownerId: ctx.user.id, projectId: input.projectId, fileKey: stored.key, fileUrl: stored.url, filename: input.filename, mimeType: input.mimeType, byteSize: input.byteSize, durationMs: input.durationMs });
    }),
    delete: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), assetId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const assets = await getMediaAssetsByOwner(ctx.user.id, input.projectId);
      if (!assets.some((asset) => asset.id === input.assetId)) throw new TRPCError({ code: "FORBIDDEN", message: "この素材を削除する権限がありません。" });
      return deleteMediaAsset(ctx.user.id, input.assetId);
    }),
  }),
});

export type AppRouter = typeof appRouter;
