import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import MusicClient from "@/components/music/MusicClient";
export const metadata = { title: "Music" };
export default async function MusicPage() {
  const user = await requireUser();
  const [tracks, playlists] = await Promise.all([
    query("SELECT id, title, artist, album, duration_sec, file_name, file_size::float AS file_size, fingerprint, favorite FROM music_tracks WHERE user_id=$1 ORDER BY lower(title) LIMIT 5000", [user.id]),
    query(`SELECT p.id, p.name, COALESCE((SELECT array_agg(pt.track_id ORDER BY pt.position) FROM music_playlist_tracks pt WHERE pt.playlist_id=p.id AND pt.user_id=$1), '{}') AS track_ids FROM music_playlists p WHERE p.user_id=$1 ORDER BY p.created_at`, [user.id]),
  ]);
  return <MusicClient tracks={tracks} playlists={playlists} />;
}
