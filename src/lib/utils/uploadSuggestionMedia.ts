/**
 * 건의 게시판 미디어 업로드 (이미지/동영상 통합)
 * - uploadChatMedia.ts(287) 와 동일 로직, 버킷만 suggestion-media(499)
 * - 이미지: 5MB 제한, 1920px로 압축
 * - 동영상: 50MB / 30초 제한, 압축 없음 (트랜스코딩 무거움). 메타 못 읽어도 업로드는 진행
 * - 경로: {auth.uid()}/{timestamp}-{rand}.{ext}
 */

import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ChatMediaItem, ChatMediaType } from "@/types/database";

export const SUGGESTION_IMAGE_MAX_MB = 5;
export const SUGGESTION_VIDEO_MAX_MB = 50;
export const SUGGESTION_VIDEO_MAX_SECONDS = 30;
export const SUGGESTION_MEDIA_MAX_COUNT = 4;

function isImage(file: File) {
  return file.type.startsWith("image/");
}

function isVideo(file: File) {
  return file.type.startsWith("video/");
}

/** 이미지 압축 (Canvas) */
async function compressImage(file: File, maxWidth = 1920, quality = 0.82): Promise<File> {
  if (!isImage(file) || file.type === "image/gif") return file;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("compress failed"));
              return;
            }
            resolve(
              new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              })
            );
          },
          file.type,
          quality
        );
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** 동영상 메타데이터 (길이, 해상도) */
function getVideoMeta(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const meta = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("video metadata failed"));
    };
    video.src = url;
  });
}

/** 이미지 메타데이터 (해상도) */
function getImageMeta(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const meta = { width: img.width, height: img.height };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image metadata failed"));
    };
    img.src = url;
  });
}

/**
 * 단일 파일 업로드 (이미지/동영상 자동 분기)
 * @returns ChatMediaItem (실패 시 null) — 건의 미디어도 동일 shape을 써서
 *          ChatMediaGrid/ChatImageViewer를 그대로 재사용한다.
 */
export async function uploadSuggestionMedia(
  file: File,
  userId: string
): Promise<ChatMediaItem | null> {
  const supabase = createClient();

  try {
    let uploadFile = file;
    let type: ChatMediaType;
    let extra: { width?: number; height?: number; duration?: number } = {};

    if (isImage(file)) {
      type = "image";
      uploadFile = await compressImage(file);
      if (uploadFile.size > SUGGESTION_IMAGE_MAX_MB * 1024 * 1024) {
        toast.error(`이미지는 ${SUGGESTION_IMAGE_MAX_MB}MB 이하만 가능합니다`);
        return null;
      }
      try {
        const meta = await getImageMeta(uploadFile);
        extra.width = meta.width;
        extra.height = meta.height;
      } catch {
        /* 메타 실패해도 업로드 진행 */
      }
    } else if (isVideo(file)) {
      type = "video";
      if (file.size > SUGGESTION_VIDEO_MAX_MB * 1024 * 1024) {
        toast.error(`동영상은 ${SUGGESTION_VIDEO_MAX_MB}MB 이하만 가능합니다`);
        return null;
      }
      // 메타(길이/해상도)는 있으면 좋고 없어도 업로드는 진행한다.
      // 아이폰 HEVC 등 일부 코덱은 브라우저가 메타를 못 읽어(onerror) — 예전엔 여기서
      // 무조건 차단해 "동영상이 아예 안 올라가는" 버그였음. 길이 제한은 메타 읽힐 때만 적용.
      try {
        const meta = await getVideoMeta(file);
        if (meta.duration && meta.duration > SUGGESTION_VIDEO_MAX_SECONDS) {
          toast.error(`동영상 길이는 ${SUGGESTION_VIDEO_MAX_SECONDS}초 이하만 가능합니다`);
          return null;
        }
        extra = meta;
      } catch {
        console.warn("[uploadSuggestionMedia] 동영상 메타 읽기 실패 — 메타 없이 업로드 진행");
        /* 메타 실패해도 업로드는 진행 (크기 제한으로 이미 보호됨) */
      }
    } else {
      toast.error("지원하지 않는 파일 형식입니다");
      return null;
    }

    const ext = (uploadFile.name.split(".").pop() || "bin").toLowerCase();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${userId}/${Date.now()}-${rand}.${ext}`;

    const { error } = await supabase.storage
      .from("suggestion-media")
      .upload(path, uploadFile, { upsert: false });

    if (error) {
      console.error("[uploadSuggestionMedia] storage error", error);
      // 실제 사유 노출 (형식 미허용·용량 초과 등 원인 파악)
      const msg = error.message || "";
      if (/mime|content type|not allowed/i.test(msg)) {
        toast.error("지원하지 않는 동영상 형식이에요 (mp4·mov·webm만)");
      } else if (/exceeded|too large|size/i.test(msg)) {
        toast.error(`파일이 너무 커요 (동영상 ${SUGGESTION_VIDEO_MAX_MB}MB 이하)`);
      } else {
        toast.error(`업로드 실패: ${msg || "알 수 없는 오류"}`);
      }
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("suggestion-media").getPublicUrl(path);

    return {
      type,
      url: publicUrl,
      ...extra,
    };
  } catch (e) {
    console.error("[uploadSuggestionMedia] error", e);
    toast.error("미디어 처리 중 오류가 발생했습니다");
    return null;
  }
}
