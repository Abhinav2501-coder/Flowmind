import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder",
);

export async function uploadAvatar(userId, file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size must be less than 5MB.');
  }
  const ext = file.name.split(".").pop();
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
