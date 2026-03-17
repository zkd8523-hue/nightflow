import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

/**
 * 브라우저 Canvas API를 사용한 이미지 압축
 * @param file 원본 이미지 파일
 * @param maxWidth 최대 너비 (기본: 1920px)
 * @param quality 압축 품질 0-1 (기본: 0.8)
 * @returns 압축된 이미지 파일
 */
async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<File> {
  // 이미지 파일이 아니면 원본 반환
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 너비가 maxWidth를 초과하면 비율 유지하며 리사이징
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // 이미지 그리기
        ctx.drawImage(img, 0, 0, width, height);

        // Blob으로 변환
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              });

              // 압축률 로그 (개발 환경)
              const originalSize = (file.size / 1024).toFixed(0);
              const compressedSize = (compressedFile.size / 1024).toFixed(0);
              const ratio = ((1 - compressedFile.size / file.size) * 100).toFixed(0);
              logger.log(
                `[Upload] 압축 완료: ${originalSize}KB → ${compressedSize}KB (${ratio}% 절감)`
              );

              resolve(compressedFile);
            } else {
              reject(new Error('Image compression failed'));
            }
          },
          file.type,
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

interface UploadImageOptions {
  /** 최대 파일 크기 (MB, 기본: 5MB) */
  maxSizeMB?: number;
  /** Supabase Storage upsert 옵션 (기본: false) */
  upsert?: boolean;
  /** 이미지 압축 여부 (기본: true) */
  compress?: boolean;
  /** 압축 시 최대 너비 (기본: 1920px) */
  maxWidth?: number;
  /** 압축 품질 0-1 (기본: 0.8) */
  quality?: number;
}

/**
 * Supabase Storage에 이미지 업로드
 * @param file 업로드할 파일
 * @param folder Storage 내 폴더 경로 (예: "auctions", "club-thumbnails")
 * @param options 업로드 옵션
 * @returns 업로드된 이미지의 Public URL (실패 시 null)
 */
export async function uploadImage(
  file: File,
  folder: string,
  options: UploadImageOptions = {}
): Promise<string | null> {
  const {
    maxSizeMB = 5,
    upsert = false,
    compress = true,
    maxWidth = 1920,
    quality = 0.8,
  } = options;

  try {
    let uploadFile = file;

    // 압축 활성화 시
    if (compress && file.type.startsWith('image/')) {
      uploadFile = await compressImage(file, maxWidth, quality);
    }

    // 파일 크기 체크 (압축 후)
    if (uploadFile.size > maxSizeMB * 1024 * 1024) {
      toast.error(`이미지는 ${maxSizeMB}MB 이하만 가능합니다.`);
      return null;
    }

    const supabase = createClient();
    const ext = uploadFile.name.split('.').pop() || 'jpg';
    const path = `${folder}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('auction-images')
      .upload(path, uploadFile, { upsert });

    if (error) {
      logger.error('[Upload] Supabase error:', error);
      toast.error('이미지 업로드에 실패했습니다.');
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('auction-images').getPublicUrl(path);

    return publicUrl;
  } catch (error) {
    logger.error('[Upload] Unexpected error:', error);
    toast.error('이미지 처리 중 오류가 발생했습니다.');
    return null;
  }
}
