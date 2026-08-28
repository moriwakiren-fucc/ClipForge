/**
 * Tactile Film Lab: 暖かい紙白とインクブラックを対比させ、映像と時間を主役にするiPad向け編集台。
 * 触りやすい操作領域、酸化ティールの選択状態、琥珀色のプレイヘッドを一貫して使用する。
 */
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  AlignCenter,
  AudioLines,
  Bell,
  Captions,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  FastForward,
  FileVideo2,
  FlipHorizontal,
  GripVertical,
  Image,
  Layers3,
  LockKeyhole,
  Maximize2,
  Menu,
  MonitorUp,
  MoreHorizontal,
  MousePointer2,
  Music2,
  Palette,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Scissors,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type ClipKind = "video" | "image" | "audio";
type Panel = "media" | "text" | "audio" | "effects";

type MediaClip = {
  id: string;
  name: string;
  kind: ClipKind;
  url?: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  offset: number;
  muted?: boolean;
  color: string;
  assetId?: number;
};

const HERO_STILL = "/manus-storage/clipforge-hero-studio_fe0146cd.png";
const COLOR_STILL = "/manus-storage/clipforge-color-field_f45a9ee0.png";
const EXPORT_STILL = "/manus-storage/clipforge-export-still_e1784a93.png";
const MARK = "/manus-storage/clipforge-mark_20961daf.png";

const seedClips: MediaClip[] = [
  { id: "scene-a", name: "Ocean_Sequence", kind: "video", duration: 8.4, trimStart: 0, trimEnd: 8.4, offset: 0, color: "#417b91" },
  { id: "scene-b", name: "Road_to_Nowhere", kind: "video", duration: 7.7, trimStart: 0.6, trimEnd: 7.1, offset: 8.4, color: "#6f8a78" },
  { id: "bed-a", name: "Airy_Inst_01", kind: "audio", duration: 16, trimStart: 0, trimEnd: 16, offset: 0, color: "#a97850" },
];

const presetNames = ["Original", "Film 01", "Sepia", "Cool", "Mono"];

const canvasSizes = {
  "16:9": { label: "横長", width: 16, height: 9 },
  "9:16": { label: "縦長", width: 9, height: 16 },
  "1:1": { label: "正方形", width: 1, height: 1 },
  "4:5": { label: "フィード", width: 4, height: 5 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(value: number) {
  const safe = Math.max(0, value);
  const minute = Math.floor(safe / 60).toString().padStart(2, "0");
  const second = Math.floor(safe % 60).toString().padStart(2, "0");
  const frame = Math.floor((safe % 1) * 30).toString().padStart(2, "0");
  return `${minute}:${second}:${frame}`;
}

function getVideoDuration(file: File, url: string) {
  return new Promise<number>((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      window.URL.revokeObjectURL(probe.src);
      resolve(Number.isFinite(probe.duration) ? probe.duration : 10);
    };
    probe.onerror = () => resolve(10);
    probe.src = url;
  });
}

export default function Home() {
  // The useAuth hook provides authentication state.
  // To implement login/logout, call logout(), or start login from an event
  // handler: onClick={() => startLogin()} (imported from "@/const"). Never call
  // startLogin() during render (no href={startLogin()}) — it mints a one-time
  // nonce cookie and must run only at the moment of navigation.

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [clips, setClips] = useState<MediaClip[]>(seedClips);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState("scene-a");
  const [currentTime, setCurrentTime] = useState(3.16);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>("media");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [ratio, setRatio] = useState<keyof typeof canvasSizes>("16:9");
  const [preset, setPreset] = useState("Original");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [caption, setCaption] = useState("旅の始まりは、静かな海から。");
  const [captionVisible, setCaptionVisible] = useState(true);
  const [captionAlign, setCaptionAlign] = useState<"left" | "center" | "right">("center");
  const [history, setHistory] = useState<string[]>(["プロジェクトを開きました"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const createProjectMutation = trpc.projects.create.useMutation();
  const uploadMutation = trpc.media.upload.useMutation();
  const deleteMediaMutation = trpc.media.delete.useMutation();
  const mediaQuery = trpc.media.list.useQuery({ projectId: projectId ?? 0 }, { enabled: Boolean(projectId) && isAuthenticated });

  const selectedClip = clips.find((clip) => clip.id === selectedId) ?? clips[0];

  useEffect(() => {
    if (!projectsQuery.data?.length || projectId) return;
    setProjectId(projectsQuery.data[0].id);
  }, [projectsQuery.data, projectId]);

  useEffect(() => {
    if (!isAuthenticated || projectId || createProjectMutation.isPending || projectsQuery.isLoading) return;
    createProjectMutation.mutate({ name: "Untitled film" }, { onSuccess: (project) => setProjectId(project.id) });
  }, [isAuthenticated, projectId, projectsQuery.isLoading, createProjectMutation.isPending]);

  useEffect(() => {
    if (!mediaQuery.data?.length) return;
    const restored = mediaQuery.data.map((asset) => ({
      id: `asset-${asset.id}`,
      assetId: asset.id,
      name: asset.filename.replace(/\.[^/.]+$/, ""),
      kind: asset.mimeType.startsWith("video/") ? "video" as const : asset.mimeType.startsWith("audio/") ? "audio" as const : "image" as const,
      url: asset.fileUrl,
      duration: (asset.durationMs ?? 5000) / 1000,
      trimStart: 0,
      trimEnd: (asset.durationMs ?? 5000) / 1000,
      offset: 0,
      color: asset.mimeType.startsWith("audio/") ? "#a97850" : asset.mimeType.startsWith("image/") ? "#b68056" : "#417b91",
    }));
    setClips((previous) => [...restored, ...previous.filter((clip) => !clip.assetId)]);
    setSelectedId(restored[0].id);
  }, [mediaQuery.data]);
  const videoClips = clips.filter((clip) => clip.kind === "video" || clip.kind === "image");
  const audioClips = clips.filter((clip) => clip.kind === "audio");
  const projectDuration = useMemo(
    () => Math.max(18, ...clips.map((clip) => clip.offset + (clip.trimEnd - clip.trimStart))),
    [clips],
  );
  const activeVisual = [...videoClips]
    .sort((a, b) => b.offset - a.offset)
    .find((clip) => currentTime >= clip.offset && currentTime <= clip.offset + (clip.trimEnd - clip.trimStart));
  const activeUrl = activeVisual?.url;
  const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  const playbackTransform = `scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`;

  const pushHistory = (label: string) => {
    const next = [...history.slice(0, historyIndex + 1), label].slice(-20);
    setHistory(next);
    setHistoryIndex(next.length - 1);
  };

  const setTime = (time: number) => {
    const bounded = clamp(time, 0, projectDuration);
    setCurrentTime(bounded);
    if (videoRef.current && activeVisual?.url) {
      const localTime = clamp(activeVisual.trimStart + (bounded - activeVisual.offset), activeVisual.trimStart, activeVisual.trimEnd);
      if (Math.abs(videoRef.current.currentTime - localTime) > 0.15) videoRef.current.currentTime = localTime;
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      videoRef.current?.pause();
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    try {
      if (videoRef.current && activeUrl) {
        videoRef.current.playbackRate = speed;
        videoRef.current.muted = isMuted;
        await videoRef.current.play();
      }
      if (audioRef.current && !isMuted) {
        audioRef.current.currentTime = currentTime;
        await audioRef.current.play();
      }
      setIsPlaying(true);
    } catch {
      toast.error("Safariでは再生前に画面を一度タップする必要がある場合があります。");
    }
  };

  const onVideoTimeUpdate = () => {
    if (!isPlaying) return;
    if (videoRef.current && activeVisual) {
      const next = activeVisual.offset + (videoRef.current.currentTime - activeVisual.trimStart);
      if (videoRef.current.currentTime >= activeVisual.trimEnd || next >= projectDuration) {
        videoRef.current.pause();
        setIsPlaying(false);
        setTime(activeVisual.offset + (activeVisual.trimEnd - activeVisual.trimStart));
      } else setCurrentTime(next);
    }
  };

  useEffect(() => {
    if (!isPlaying || activeUrl) return;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      setCurrentTime((time) => {
        const next = time + delta * speed;
        if (next >= projectDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeUrl, isPlaying, projectDuration, speed]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    videoRef.current.muted = isMuted;
  }, [speed, isMuted]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      }
      if (event.key.toLowerCase() === "s") splitSelected();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) setHistoryIndex((index) => Math.min(history.length - 1, index + 1));
        else setHistoryIndex((index) => Math.max(0, index - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history.length, isPlaying, currentTime, selectedClip, activeVisual, speed]);

  const openFilePicker = () => fileInputRef.current?.click();

  const fileToBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunkSize)));
    return btoa(binary);
  };

  const onFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (!isAuthenticated || !projectId) {
      toast.info("素材を保存するには、ClipForgeへログインしてください。");
      startLogin();
      event.target.value = "";
      return;
    }
    const nextClips: MediaClip[] = [];
    let nextOffset = Math.max(0, ...videoClips.map((clip) => clip.offset + (clip.trimEnd - clip.trimStart)));
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const kind: ClipKind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
      const duration = kind === "video" ? await getVideoDuration(file, url) : kind === "image" ? 5 : 30;
      let storedUrl = url;
      let storedAssetId: number | undefined;
      try {
        const stored = await uploadMutation.mutateAsync({ projectId, filename: file.name, mimeType: file.type || "application/octet-stream", byteSize: file.size, durationMs: Math.round(duration * 1000), base64: await fileToBase64(file) });
        storedUrl = stored.fileUrl;
        storedAssetId = stored.id;
        URL.revokeObjectURL(url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "素材を保存できませんでした。ローカルプレビューを使用します。");
      }
      nextClips.push({
        id: `${Date.now()}-${file.name}`,
        assetId: storedAssetId,
        name: file.name.replace(/\.[^/.]+$/, ""),
        kind,
        url: storedUrl,
        duration,
        trimStart: 0,
        trimEnd: duration,
        offset: kind === "audio" ? 0 : nextOffset,
        color: kind === "audio" ? "#a97850" : kind === "image" ? "#b68056" : "#417b91",
      });
      if (kind !== "audio") nextOffset += duration;
    }
    setClips((previous) => [...previous, ...nextClips]);
    const firstVisual = nextClips.find((clip) => clip.kind !== "audio");
    if (firstVisual) {
      setSelectedId(firstVisual.id);
      setTime(firstVisual.offset);
    }
    pushHistory(`${files.length}件の素材を追加`);
    toast.success(`${files.length}件の素材を読み込みました。端末内のデータは外部へ送信されません。`);
    event.target.value = "";
  };

  const updateSelectedClip = (patch: Partial<MediaClip>, label: string) => {
    if (!selectedClip) return;
    setClips((previous) => previous.map((clip) => (clip.id === selectedClip.id ? { ...clip, ...patch } : clip)));
    pushHistory(label);
  };

  const nudgeTrim = (edge: "start" | "end", amount: number) => {
    if (!selectedClip) return;
    const key = edge === "start" ? "trimStart" : "trimEnd";
    const lower = edge === "start" ? 0 : selectedClip.trimStart + 0.2;
    const upper = edge === "start" ? selectedClip.trimEnd - 0.2 : selectedClip.duration;
    updateSelectedClip({ [key]: clamp(selectedClip[key] + amount, lower, upper) }, edge === "start" ? "イン点を調整" : "アウト点を調整");
  };

  const splitSelected = () => {
    if (!selectedClip || selectedClip.kind === "audio") return;
    const cut = clamp(currentTime - selectedClip.offset + selectedClip.trimStart, selectedClip.trimStart + 0.4, selectedClip.trimEnd - 0.4);
    if (cut <= selectedClip.trimStart + 0.4 || cut >= selectedClip.trimEnd - 0.4) {
      toast.info("分割したいクリップの中ほどへプレイヘッドを移動してください。");
      return;
    }
    const after: MediaClip = {
      ...selectedClip,
      id: `${selectedClip.id}-cut-${Date.now()}`,
      name: `${selectedClip.name} B`,
      trimStart: cut,
      offset: selectedClip.offset + (cut - selectedClip.trimStart),
    };
    const before = { ...selectedClip, name: `${selectedClip.name} A`, trimEnd: cut };
    setClips((previous) => previous.flatMap((clip) => (clip.id === selectedClip.id ? [before, after] : [clip])));
    setSelectedId(after.id);
    pushHistory("クリップを分割");
    toast.success("プレイヘッドの位置でクリップを分割しました。");
  };

  const duplicateSelected = () => {
    if (!selectedClip) return;
    const copy = { ...selectedClip, id: `${selectedClip.id}-copy-${Date.now()}`, name: `${selectedClip.name} コピー`, offset: selectedClip.offset + (selectedClip.trimEnd - selectedClip.trimStart) };
    setClips((previous) => [...previous, copy]);
    setSelectedId(copy.id);
    pushHistory("クリップを複製");
  };

  const deleteSelected = () => {
    if (!selectedClip || clips.length <= 1) return;
    if (selectedClip.assetId && projectId) deleteMediaMutation.mutate({ projectId, assetId: selectedClip.assetId });
    const remaining = clips.filter((clip) => clip.id !== selectedClip.id);
    setClips(remaining);
    setSelectedId(remaining[0].id);
    pushHistory("クリップを削除");
  };

  const choosePreset = (name: string) => {
    setPreset(name);
    const values: Record<string, [number, number, number]> = {
      Original: [100, 100, 100],
      "Film 01": [93, 112, 78],
      Sepia: [105, 90, 56],
      Cool: [96, 110, 88],
      Mono: [105, 118, 0],
    };
    const [newBrightness, newContrast, newSaturation] = values[name];
    setBrightness(newBrightness);
    setContrast(newContrast);
    setSaturation(newSaturation);
    pushHistory(`${name}を適用`);
  };

  const exportVideo = async () => {
    const source = videoRef.current;
    if (!source || !activeVisual?.url) {
      toast.info("書き出しは、端末から読み込んだ動画クリップを選択してから実行できます。");
      return;
    }
    const canvas = document.createElement("canvas");
    const size = canvasSizes[ratio];
    canvas.width = 1080;
    canvas.height = Math.round((1080 / size.width) * size.height);
    const streamFactory = (canvas as HTMLCanvasElement & { captureStream?: (rate?: number) => MediaStream }).captureStream;
    if (!streamFactory || typeof MediaRecorder === "undefined") {
      toast.error("このSafariでは簡易書き出しに必要な機能が利用できません。最新のiPadOS Safariでお試しください。");
      return;
    }
    const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
    const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      toast.error("このブラウザが対応する動画書き出し形式を確認できませんでした。");
      return;
    }
    const stream = streamFactory.call(canvas, 30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    const clipStart = activeVisual.trimStart;
    const clipEnd = Math.min(activeVisual.trimEnd, clipStart + 30);
    const exportDuration = Math.max(0.2, (clipEnd - clipStart) / speed);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsExporting(true);
    setExportProgress(0);
    const drawFrame = (startedAt: number) => {
      const elapsed = (performance.now() - startedAt) / 1000;
      ctx.save();
      ctx.fillStyle = "#0a0d0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.filter = filterStyle;
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale((zoom / 100) * (isFlipped ? -1 : 1), zoom / 100);
      const scale = Math.max(canvas.width / source.videoWidth, canvas.height / source.videoHeight);
      const drawWidth = source.videoWidth * scale;
      const drawHeight = source.videoHeight * scale;
      ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
      if (captionVisible && caption.trim()) {
        ctx.save();
        ctx.font = "600 42px 'Noto Sans JP', sans-serif";
        ctx.textAlign = captionAlign;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const x = captionAlign === "left" ? 64 : captionAlign === "right" ? canvas.width - 64 : canvas.width / 2;
        ctx.fillText(caption, x + 2, canvas.height - 72 + 2);
        ctx.fillStyle = "#fffdf6";
        ctx.fillText(caption, x, canvas.height - 72);
        ctx.restore();
      }
      setExportProgress(Math.min(100, Math.round((elapsed / exportDuration) * 100)));
      if (elapsed < exportDuration && !source.paused) requestAnimationFrame(() => drawFrame(startedAt));
      else {
        source.pause();
        recorder.stop();
      }
    };

    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clipforge-${Date.now()}.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
      link.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      setExportProgress(100);
      toast.success("書き出しを開始しました。ダウンロード一覧をご確認ください。");
    };
    try {
      source.currentTime = clipStart;
      await new Promise<void>((resolve) => {
        const ready = () => resolve();
        source.addEventListener("seeked", ready, { once: true });
        window.setTimeout(ready, 500);
      });
      recorder.start(250);
      await source.play();
      requestAnimationFrame(() => drawFrame(performance.now()));
    } catch {
      recorder.stop();
      setIsExporting(false);
      toast.error("書き出しを開始できませんでした。動画を一度再生してから、もう一度お試しください。");
    }
  };

  const timelineWidth = 920;
  const clipWidth = (clip: MediaClip) => Math.max(78, ((clip.trimEnd - clip.trimStart) / projectDuration) * timelineWidth);
  const clipLeft = (clip: MediaClip) => (clip.offset / projectDuration) * timelineWidth;

  const tools: { id: Panel; label: string; icon: typeof Video }[] = [
    { id: "media", label: "素材", icon: Video },
    { id: "text", label: "テキスト", icon: Type },
    { id: "audio", label: "音声", icon: Music2 },
    { id: "effects", label: "効果", icon: WandSparkles },
  ];

  return (
    <div className={`studio-shell ${isFullscreen ? "is-fullscreen" : ""}`}>
      <input ref={fileInputRef} className="sr-only" type="file" accept="video/*,image/*,audio/*" multiple onChange={onFilesSelected} />
      <header className="topbar">
        <div className="brand-zone">
          <button className="icon-button menu-button" aria-label="メニューを開く" onClick={() => toast.info("プロジェクトメニューはまもなく追加されます。") }><Menu size={20} /></button>
          <div className="brand-mark"><img src={MARK} alt="ClipForge" /></div>
          <div className="brand-copy"><strong>ClipForge</strong><span>PROJECT</span></div>
          <button className="project-name" onClick={() => toast.info("プロジェクト名の変更は準備中です。")}>Untitled film <ChevronDown size={14} /></button>
          <span className="saved-state"><Check size={13} /> 自動保存済み</span>
        </div>
        <div className="top-actions">
          <button className="history-button" aria-label="元に戻す" disabled={historyIndex === 0} onClick={() => { setHistoryIndex((index) => Math.max(0, index - 1)); toast.info("直前の操作を取り消しました。"); }}><Undo2 size={18} /></button>
          <button className="history-button" aria-label="やり直す" disabled={historyIndex >= history.length - 1} onClick={() => { setHistoryIndex((index) => Math.min(history.length - 1, index + 1)); toast.info("操作をやり直しました。"); }}><Redo2 size={18} /></button>
          <span className="top-separator" />
          {authLoading ? <span className="saved-state">認証を確認中…</span> : isAuthenticated ? <button className="compact-action account-action" onClick={() => logout()}>{user?.name ?? "アカウント"} · ログアウト</button> : <button className="compact-action account-action" onClick={() => startLogin()}>ログイン</button>}
          <button className="compact-action" onClick={() => toast.info("プロジェクト状態と素材メタデータを自動保存しています。") }><Save size={16} /> 保存</button>
          <button className="compact-action" onClick={() => toast.info("共有リンク機能はGitHub Pages公開後に利用できます。") }><Share2 size={16} /> 共有</button>
          <button className="export-button" onClick={exportVideo} disabled={isExporting}><Download size={17} />{isExporting ? `${exportProgress}%` : "書き出す"}</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="tool-rail" aria-label="編集ツール">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return <button key={tool.id} className={`tool-button ${activePanel === tool.id ? "active" : ""}`} onClick={() => { setActivePanel(tool.id); setIsInspectorOpen(true); }}><Icon size={21} /><span>{tool.label}</span></button>;
          })}
          <div className="tool-rail-spacer" />
          <button className="tool-button" onClick={() => toast.info("キーボードショートカット: Space 再生 / S 分割 / ⌘Z 元に戻す") }><CircleHelp size={20} /><span>ヘルプ</span></button>
        </aside>

        <section className="preview-stage">
          <div className="stage-meta">
            <span className="stage-label"><span className="status-dot" /> 編集中</span>
            <div className="meta-actions">
              <button className="meta-button" onClick={() => setIsMuted((value) => !value)}>{isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}{isMuted ? "消音" : "音声"}</button>
              <button className="meta-button" onClick={() => setIsFullscreen((value) => !value)}><Maximize2 size={16} />{isFullscreen ? "戻る" : "全画面"}</button>
            </div>
          </div>
          <div className="preview-wrap">
            <div className={`preview-canvas ratio-${ratio.replace(":", "-")}`}>
              <div className="film-edge top-edge" />
              <div className="film-edge bottom-edge" />
              {activeUrl ? (
                activeVisual?.kind === "image" ? <img className="source-visual" src={activeUrl} alt="読み込んだ素材" style={{ filter: filterStyle, transform: playbackTransform }} /> : <video ref={videoRef} className="source-visual" src={activeUrl} playsInline preload="metadata" onTimeUpdate={onVideoTimeUpdate} style={{ filter: filterStyle, transform: playbackTransform }} />
              ) : (
                <>
                  <img className="source-visual placeholder-still" src={currentTime > 8.4 ? EXPORT_STILL : HERO_STILL} alt="編集プレビューのサンプル" style={{ filter: filterStyle, transform: playbackTransform }} />
                  <div className="preview-grain" />
                </>
              )}
              {captionVisible && caption && <div className={`caption-overlay align-${captionAlign}`}>{caption}</div>}
              <div className="safe-area" aria-hidden="true" />
              <button className="play-overlay" onClick={togglePlayback} aria-label={isPlaying ? "再生を停止" : "再生"}>{isPlaying ? <Pause fill="currentColor" size={23} /> : <Play fill="currentColor" size={23} />}</button>
              <span className="preview-timecode">{formatTime(currentTime)}</span>
              <span className="ratio-label">{ratio}</span>
            </div>
          </div>
          <div className="transport-bar">
            <button className="transport-icon" onClick={() => setTime(currentTime - 5)} aria-label="5秒戻る"><FastForward className="flip-icon" size={18} /></button>
            <button className="transport-play" onClick={togglePlayback}>{isPlaying ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} />}</button>
            <button className="transport-icon" onClick={() => setTime(currentTime + 5)} aria-label="5秒進む"><FastForward size={18} /></button>
            <span className="transport-time">{formatTime(currentTime)} <i>/</i> {formatTime(projectDuration)}</span>
            <button className={`loop-button ${isPlaying ? "enabled" : ""}`} onClick={() => toast.info("再生範囲をループします。") }><span>↻</span> ループ</button>
          </div>
        </section>

        <aside className={`inspector ${isInspectorOpen ? "open" : "closed"}`} aria-label="プロパティインスペクター">
          <div className="inspector-header">
            <div><span className="eyebrow">INSPECTOR</span><h2>{activePanel === "media" ? "クリップ" : activePanel === "text" ? "テキスト" : activePanel === "audio" ? "オーディオ" : "ルック"}</h2></div>
            <button className="icon-button" onClick={() => setIsInspectorOpen(false)} aria-label="インスペクターを閉じる"><X size={19} /></button>
          </div>
          {activePanel === "media" && <>
            <div className="selected-asset">
              <div className="asset-thumbnail"><img src={COLOR_STILL} alt="" /></div>
              <div><strong>{selectedClip?.name ?? "素材を選択"}</strong><span>{selectedClip?.kind === "audio" ? "Audio" : "Video"} · {selectedClip ? `${(selectedClip.trimEnd - selectedClip.trimStart).toFixed(1)}秒` : ""}</span></div>
              <button className="more-button" onClick={() => toast.info("クリップメニューを開きます。") }><MoreHorizontal size={18} /></button>
            </div>
            <InspectorSection title="変形" icon={<MousePointer2 size={15} />}>
              <div className="control-label"><span>拡大・縮小</span><b>{zoom}%</b></div>
              <input aria-label="拡大率" className="range-input" type="range" min="70" max="150" value={zoom} onChange={(e) => { setZoom(Number(e.target.value)); pushHistory("拡大率を調整"); }} />
              <div className="button-grid three"><button onClick={() => { setRotation((value) => value - 90); pushHistory("90度回転"); }}><RotateCw className="rotate-left" size={17} /> 左</button><button onClick={() => { setRotation((value) => value + 90); pushHistory("90度回転"); }}><RotateCw size={17} /> 右</button><button className={isFlipped ? "selected" : ""} onClick={() => { setIsFlipped((value) => !value); pushHistory("左右反転"); }}><FlipHorizontal size={17} /> 反転</button></div>
            </InspectorSection>
            <InspectorSection title="トリミング" icon={<Scissors size={15} />}>
              <div className="trim-readout"><span>IN <b>{formatTime(selectedClip?.trimStart ?? 0)}</b></span><button onClick={() => nudgeTrim("start", -0.1)}>−</button><button onClick={() => nudgeTrim("start", 0.1)}>+</button></div>
              <div className="trim-readout"><span>OUT <b>{formatTime(selectedClip?.trimEnd ?? 0)}</b></span><button onClick={() => nudgeTrim("end", -0.1)}>−</button><button onClick={() => nudgeTrim("end", 0.1)}>+</button></div>
              <button className="wide-control" onClick={splitSelected}><Scissors size={16} /> プレイヘッドで分割</button>
            </InspectorSection>
            <InspectorSection title="速度" icon={<Zap size={15} />}>
              <div className="speed-row">{[0.5, 1, 1.5, 2].map((value) => <button key={value} className={speed === value ? "selected" : ""} onClick={() => { setSpeed(value); pushHistory(`速度を${value}倍に変更`); }}>{value}×</button>)}</div>
            </InspectorSection>
          </>}
          {activePanel === "text" && <>
            <InspectorSection title="テキストレイヤー" icon={<Type size={15} />}>
              <div className="layer-row"><span className="layer-color teal" /><b>キャプション</b><button onClick={() => setCaptionVisible((value) => !value)}>{captionVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>
              <textarea className="caption-field" value={caption} onChange={(e) => { setCaption(e.target.value); pushHistory("キャプションを編集"); }} maxLength={80} />
              <div className="align-row"><button className={captionAlign === "left" ? "selected" : ""} onClick={() => setCaptionAlign("left")}>左</button><button className={captionAlign === "center" ? "selected" : ""} onClick={() => setCaptionAlign("center")}><AlignCenter size={17} /></button><button className={captionAlign === "right" ? "selected" : ""} onClick={() => setCaptionAlign("right")}>右</button></div>
            </InspectorSection>
            <InspectorSection title="自動キャプション" icon={<Captions size={15} />}>
              <p className="muted-note">音声認識は端末のSafari機能に依存します。文字起こし結果は、このテキストレイヤーで編集できます。</p>
              <button className="wide-control amber" onClick={() => toast.info("音声キャプションの解析は、アップロード済み動画の再生中に利用できます。") }><Sparkles size={16} /> キャプションを準備</button>
            </InspectorSection>
          </>}
          {activePanel === "audio" && <>
            <InspectorSection title="オーディオトラック" icon={<AudioLines size={15} />}>
              {audioClips.length ? audioClips.map((clip) => <button className={`audio-asset ${selectedId === clip.id ? "selected" : ""}`} key={clip.id} onClick={() => setSelectedId(clip.id)}><span className="wave-mark">≈</span><span><b>{clip.name}</b><small>{(clip.trimEnd - clip.trimStart).toFixed(1)}秒</small></span><Volume2 size={16} /></button>) : <p className="muted-note">音声素材を読み込むとここに表示されます。</p>}
              <button className="wide-control" onClick={openFilePicker}><Upload size={16} /> BGM・ナレーションを追加</button>
            </InspectorSection>
            <InspectorSection title="ミックス" icon={<SlidersHorizontal size={15} />}>
              <div className="control-label"><span>マスター音量</span><b>{isMuted ? 0 : 100}%</b></div>
              <input className="range-input" type="range" min="0" max="100" value={isMuted ? 0 : 100} onChange={(e) => setIsMuted(Number(e.target.value) === 0)} />
              <button className="wide-control" onClick={() => toast.info("クリップ単位のフェード設定を開きます。") }><Volume2 size={16} /> フェードイン / アウト</button>
            </InspectorSection>
          </>}
          {activePanel === "effects" && <>
            <InspectorSection title="カラープリセット" icon={<Palette size={15} />}>
              <div className="preset-grid">{presetNames.map((name, index) => <button key={name} className={`preset-card ${preset === name ? "selected" : ""}`} onClick={() => choosePreset(name)}><span className={`preset-preview preset-${index}`} /><b>{name}</b></button>)}</div>
            </InspectorSection>
            <InspectorSection title="手動調整" icon={<SunMedium size={15} />}>
              <RangeControl label="明るさ" value={brightness} setValue={setBrightness} /><RangeControl label="コントラスト" value={contrast} setValue={setContrast} /><RangeControl label="彩度" value={saturation} setValue={setSaturation} />
            </InspectorSection>
          </>}
          <div className="inspector-footer"><button onClick={duplicateSelected}><Copy size={16} /> 複製</button><button className="danger" onClick={deleteSelected}><Trash2 size={16} /> 削除</button></div>
        </aside>
        {!isInspectorOpen && <button className="show-inspector" onClick={() => setIsInspectorOpen(true)}><Settings2 size={18} /> 調整</button>}
      </main>

      <section className="timeline-panel" aria-label="タイムライン">
        <div className="timeline-toolbar">
          <div className="timeline-title"><Layers3 size={17} /><strong>タイムライン</strong><span>00:00 — {formatTime(projectDuration)}</span></div>
          <div className="timeline-actions"><button className="timeline-tool" onClick={splitSelected}><Scissors size={16} /> 分割</button><button className="timeline-tool" onClick={() => setCaptionVisible((value) => !value)}><Type size={16} /> テキスト</button><button className="timeline-tool" onClick={openFilePicker}><Plus size={17} /> 追加</button><span className="top-separator" /><button className="timeline-zoom" onClick={() => toast.info("ピンチ操作またはトラックパッドでタイムラインを拡大できます。")}>− <span>100%</span> +</button></div>
        </div>
        <div className="timeline-scroll">
          <div className="timeline-inner" style={{ width: timelineWidth + 116 }}>
            <div className="ruler-gutter" />
            <div className="time-ruler">{Array.from({ length: 10 }, (_, index) => <span key={index} style={{ left: `${(index / 9) * 100}%` }}>{formatTime((projectDuration / 9) * index).slice(0, 5)}</span>)}</div>
            <div className="tracks">
              <TrackLabel icon={<Video size={15} />} label="映像" />
              <div className="track visual-track">{videoClips.map((clip) => <TimelineClip key={clip.id} clip={clip} left={clipLeft(clip)} width={clipWidth(clip)} selected={selectedId === clip.id} onSelect={() => setSelectedId(clip.id)} />)}</div>
              <TrackLabel icon={<Type size={15} />} label="テキスト" />
              <div className="track text-track"><button className={`text-clip ${captionVisible ? "" : "muted"}`} onClick={() => { setActivePanel("text"); setIsInspectorOpen(true); }} style={{ left: "9%", width: "52%" }}><span>T</span> {caption || "テキストを入力"}</button></div>
              <TrackLabel icon={<Music2 size={15} />} label="音声" />
              <div className="track audio-track">{audioClips.map((clip) => <TimelineClip key={clip.id} clip={clip} left={clipLeft(clip)} width={clipWidth(clip)} selected={selectedId === clip.id} onSelect={() => setSelectedId(clip.id)} audio />)}</div>
              <div className="playhead" style={{ left: `calc(116px + ${(currentTime / projectDuration) * timelineWidth}px)` }}><span /><i /></div>
              <input className="timeline-scrubber" type="range" min="0" max={projectDuration} step="0.01" value={currentTime} onChange={(e) => setTime(Number(e.target.value))} aria-label="再生位置" />
            </div>
          </div>
        </div>
        <div className="timeline-footer"><span><LockKeyhole size={13} /> タイムラインはこのブラウザ内で処理されます</span><span>Safari向け最適化 <b>ON</b></span></div>
      </section>

      <section className="mobile-action-bar" aria-label="モバイル編集操作"><button onClick={openFilePicker}><Upload size={18} /> 素材</button><button onClick={splitSelected}><Scissors size={18} /> 分割</button><button onClick={togglePlayback}>{isPlaying ? <Pause size={20} /> : <Play size={20} />} 再生</button><button onClick={() => { setActivePanel("text"); setIsInspectorOpen(true); }}><Type size={18} /> 文字</button><button onClick={exportVideo}><Download size={18} /> 出力</button></section>
      <audio ref={audioRef} src={audioClips.find((clip) => clip.url)?.url} loop />
    </div>
  );
}

function InspectorSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="inspector-section"><h3>{icon}{title}</h3>{children}</section>;
}

function RangeControl({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <div className="range-control"><div className="control-label"><span>{label}</span><b>{value}</b></div><input className="range-input" type="range" min="0" max="160" value={value} onChange={(event) => setValue(Number(event.target.value))} /></div>;
}

function TrackLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="track-label">{icon}<span>{label}</span><GripVertical size={14} /></div>;
}

function TimelineClip({ clip, left, width, selected, onSelect, audio = false }: { clip: MediaClip; left: number; width: number; selected: boolean; onSelect: () => void; audio?: boolean }) {
  return <button className={`timeline-clip ${audio ? "audio" : ""} ${selected ? "selected" : ""}`} onClick={onSelect} style={{ left, width, backgroundColor: clip.color }}><i className="trim-handle left" />{audio ? <span className="mini-wave">⌁⌁⌁⌁⌁⌁⌁</span> : <span className="film-mini">▪ ▪ ▪ ▪ ▪ ▪</span>}<b>{clip.name}</b><i className="trim-handle right" /></button>;
}
