"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/upload";

interface DjEditFormProps {
  dj: {
    slug: string;
    display_name: string;
    bio: string | null;
    photo_url: string | null;
    soundcloud_url: string | null;
  };
}

export function DjEditForm({ dj }: DjEditFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(dj.photo_url);
  const [bio, setBio] = useState(dj.bio ?? "");
  const [soundcloudUrl, setSoundcloudUrl] = useState(dj.soundcloud_url ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingImage(true);
    try {
      const uploadFile = file.type.startsWith("image/") ? await compressImage(file, 1024, 0.8) : file;
      if (uploadFile.size > 5 * 1024 * 1024) {
        toast.error("이미지는 5MB 이하만 업로드 가능합니다");
        return;
      }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const ext = (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/photo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("dj-photos")
        .upload(path, uploadFile, { contentType: uploadFile.type || "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("dj-photos").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "사진 업로드에 실패했어요");
    } finally {
      setUploadingImage(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_dj_profile", {
        p_bio: bio.trim() || null,
        p_photo_url: photoUrl,
        p_soundcloud_url: soundcloudUrl.trim() || null,
      });
      if (error) throw error;
      toast.success("저장됐어요");
      router.push(`/dj/${dj.slug}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="relative w-24 h-24">
          <div className="relative w-full h-full rounded-full overflow-hidden bg-muted ring-2 ring-border">
            {photoUrl ? (
              <Image src={photoUrl} alt={dj.display_name} fill sizes="96px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-foreground/60 text-4xl font-black">
                {dj.display_name.charAt(0)}
              </div>
            )}
            {uploadingImage && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-bold text-foreground">
                업로드 중...
              </span>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            aria-label="프로필 사진 변경"
            className="absolute right-0.5 bottom-0.5 w-7 h-7 rounded-full bg-inverse flex items-center justify-center text-inverse-foreground ring-2 ring-background disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={uploadingImage}
            className="hidden"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">소개</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="나를 소개해보세요"
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-amber-500/50"
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">사운드클라우드 (선택)</label>
        <input
          value={soundcloudUrl}
          onChange={(e) => setSoundcloudUrl(e.target.value)}
          placeholder="https://soundcloud.com/your_name"
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
        />
      </div>

      <button
        onClick={save}
        disabled={saving || uploadingImage}
        className="w-full py-3 rounded-xl bg-amber-500 text-black font-black text-[14px] hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        저장하기
      </button>
    </div>
  );
}
