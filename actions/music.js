"use server";
import { z } from "zod";
import { query, one } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { safe, fail, refresh } from "@/lib/crud";

// Lucifer Music stores METADATA ONLY. These actions accept titles/names/sizes — never audio bytes or server paths.
const track = z.object({ title: z.string().trim().min(1).max(300), artist: z.string().trim().max(200).default(""), album: z.string().trim().max(200).default(""), duration_sec: z.number().int().min(0).max(86400).nullable().default(null), file_name: z.string().trim().min(1).max(300), file_size: z.number().int().min(0).max(1e11), fingerprint: z.string().min(1).max(400) });

export async function upsertTracks(list) {
  return safe(async () => {
    const uid = await requireUserId(); const t = z.array(track).max(100).parse(list); if (!t.length) return [];
    const rows = await query(`INSERT INTO music_tracks(user_id,title,artist,album,duration_sec,file_name,file_size,fingerprint)
      SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::bigint[], $8::text[])
      ON CONFLICT (user_id, fingerprint) DO UPDATE SET duration_sec = COALESCE(music_tracks.duration_sec, EXCLUDED.duration_sec)
      RETURNING id, title, artist, album, duration_sec, file_name, file_size, fingerprint, favorite`,
      [uid, t.map((x) => x.title), t.map((x) => x.artist), t.map((x) => x.album), t.map((x) => x.duration_sec), t.map((x) => x.file_name), t.map((x) => x.file_size), t.map((x) => x.fingerprint)]);
    refresh(); return rows;
  });
}
export async function toggleFavoriteTrack(id) { return safe(async () => { const uid = await requireUserId(); const r = await one("UPDATE music_tracks SET favorite = NOT favorite WHERE id=$1 AND user_id=$2 RETURNING favorite", [id, uid]); if (!r) throw fail("Track not found"); refresh(); return r.favorite; }); }
export async function deleteTrack(id) { return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM music_tracks WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; }); }
const name = z.string().trim().min(1, "Enter a name").max(80);
export async function createPlaylist(n) { return safe(async () => { const uid = await requireUserId(); const r = await one("INSERT INTO music_playlists(user_id,name) VALUES($1,$2) RETURNING id, name", [uid, name.parse(n)]); refresh(); return r; }); }
export async function renamePlaylist(id, n) { return safe(async () => { const uid = await requireUserId(); const r = await one("UPDATE music_playlists SET name=$3, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id", [id, uid, name.parse(n)]); if (!r) throw fail("Playlist not found"); refresh(); return true; }); }
export async function deletePlaylist(id) { return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM music_playlists WHERE id=$1 AND user_id=$2", [id, uid]); refresh(); return true; }); }
export async function addToPlaylist(playlistId, trackIds) {
  return safe(async () => {
    const uid = await requireUserId(); const ids = z.array(z.string().uuid()).min(1).max(500).parse(trackIds);
    const pl = await one("SELECT id FROM music_playlists WHERE id=$1 AND user_id=$2", [playlistId, uid]); if (!pl) throw fail("Playlist not found");
    const r = await query(`INSERT INTO music_playlist_tracks(playlist_id, track_id, user_id, position)
      SELECT $1, t.id, $2, COALESCE((SELECT max(position) FROM music_playlist_tracks WHERE playlist_id=$1),0) + row_number() OVER () FROM music_tracks t WHERE t.user_id=$2 AND t.id = ANY($3::uuid[])
      ON CONFLICT (playlist_id, track_id) DO NOTHING RETURNING track_id`, [playlistId, uid, ids]);
    await query("UPDATE music_playlists SET updated_at=now() WHERE id=$1", [playlistId]); refresh(); return { added: r.length };
  });
}
export async function removeFromPlaylist(playlistId, trackId) { return safe(async () => { const uid = await requireUserId(); await query("DELETE FROM music_playlist_tracks WHERE playlist_id=$1 AND track_id=$2 AND user_id=$3", [playlistId, trackId, uid]); refresh(); return true; }); }
// Re-write positions from the full ordered id list (playlists are small); ownership enforced per row.
export async function reorderPlaylist(playlistId, orderedIds) {
  return safe(async () => { const uid = await requireUserId(); const ids = z.array(z.string().uuid()).max(2000).parse(orderedIds);
    await query("UPDATE music_playlist_tracks p SET position = v.pos FROM (SELECT unnest($1::uuid[]) AS tid, generate_series(1, $2::int) AS pos) v WHERE p.track_id=v.tid AND p.playlist_id=$3 AND p.user_id=$4", [ids, ids.length, playlistId, uid]); refresh(); return true; });
}
