# Shared music history for a future guessing game

All listeners contribute to one global catalog/history. The game uses songs heard
by anyone, weighted by total qualifying plays. There is no personal listening
profile or per-guest filtering. Guest IDs are only used transiently to validate
progress; neither guest names nor guest IDs are saved in music history.

## Database

- `music_songs`: YouTube ID, original title, separate song-only title, artist,
  duration and thumbnail.
- `music_playbacks`: anonymous playback UUID, video ID, room session ID, heard
  milliseconds and timestamps. No listener foreign key.
- `music_song_stats`: global play count, heard time and last-heard timestamp.
- `music_quiz_candidates`: global qualified songs, song-only names, play counts
  and bounds for a future ten-second audio clip.

A playback qualifies at 30 seconds. Cumulative updates are idempotent; pause/resume
or retries do not add extra plays. Different devices contribute independently.
Seek distance, loading and paused time are excluded. Sparse media events can
undercount time; this is client-observed playback, not a tamper-proof measurement.

`song_title` comes from explicit yt-dlp `track` metadata, or an operator correction
with `title_source='manual'`. Unknown names remain NULL and are excluded until
enriched/reviewed. Manual corrections survive subsequent extraction. Prefetched
songs may appear in the catalog, but only heard songs enter quiz candidates.

Candidates must last more than 30 seconds. Clip start bounds are 10 seconds to
`duration_seconds - 20`, leaving ten seconds at both ends for a ten-second clip.
The future game needs four distinct normalized song names and must display only
`song_title`. No game or audio clipping is implemented.

## Reset

The password-protected **Xóa database** button now backs up and atomically clears
`listening_sessions`, `session_artist_listening`, `music_songs`, `music_playbacks`.
Views become empty automatically. A failed backup aborts deletion. The private
compressed backup stays outside the public website. Active rooms can subsequently
write data again; reset is not a recording pause. Account/configuration tables remain.

The migration removes the former `music_listeners` table and per-listener view,
and changes playbacks to anonymous records. The one-time production conversion
backs up old listening data before migration/reset as requested. Historical songs
cannot be reconstructed from the older artist-only totals.

Playback records include short/unqualified listens; they are not all counted as
qualified plays. The game still needs at least four distinct eligible song names
and is not implemented.

# Album tracks (2026-09-22)

Follow-up user correction: all ten Sloth tracks now have explicit play_count=1
in album_tracks, credited once with listen_credit=user-confirmed-album-listen-20260922.
music_catalog exposes those individual counts and quiz candidates prefer them
over source popularity (play_count_basis=track). Other uncredited albums retain
the source-weight fallback described below. This is a one-time confirmed credit,
not automatic inference of per-track listens from future album checkpoints.
Original source playback rows/time and artist ranking remain unchanged. The album
remains only the source in the expanded catalog; no extra album candidate exists.

Sloth's `dEulL3SPdzI` (Khi Mà, Full Album Experience) is curated into ten catalog
entries from the user's tracklist. Persisted `music_songs.album_tracks` JSON stores
each title/start/end; `music_catalog` expands them into independent rows with
stable `track_id` values videoId:0 through videoId:9. The parent remains the audio
source and is omitted from this expanded catalog, avoiding a duplicate album
entry. Source metadata refreshes preserve album_tracks. Query music_catalog when
listing individual songs; music_songs still represents source videos.

Starts: Phất Phơ 0:00; Ngủ Quên 3:21; Để Rồi Xa Chốn Này 6:26; Một Ngày 9:36;
Về Với Tôi 13:11; Thuở Mới Tấm Bé 15:45; Thả Mình 18:58;
Chết Tay Ai Tôi Đâu Đoái Hoài 21:56; Khi Mà 25:20; Vẫn Vậy 28:08.
The final end is the stored source duration, 1908.141 seconds.

The two original album playbacks and artist ranking are unchanged. Historical
checkpoints do not contain per-position intervals: chapter play_count/listened_ms
are NULL, rather than invented individual listen totals. source_play_count and
source_listened_ms explicitly refer to the parent video; do not sum these across
chapter rows. Quiz candidates now expose track_id and absolute source clip bounds.
For album tracks their existing play_count field is a source-popularity weight,
labelled play_count_basis=source_video, not verified individual track listens.
Ten-second clips leave ten seconds at both chapter edges. Consumers should use
track_id for distinct answers and absolute clip bounds for the shared source.

No media files were cut or duplicated. Existing full reset truncates music_songs
and therefore clears album tracks, and its SELECT * backup includes tracklists.

# Live artist leaderboard (2026-09-22)

The leaderboard now reads `music_playbacks.listened_ms` joined to
`music_songs.artist`, including ongoing rooms. It no longer reads legacy
session_artist_listening or requires room:end. Successful history commits schedule
a coalesced leaderboard:updated notification after one second; browser history
normally reports every ten seconds (background suspension can delay reporting).
Ending a room still produces its summary but the default end handler does not
persist the old leaderboard, avoiding double counting.

Ranking remains by total heard milliseconds, now summed across all anonymous
listener playbacks in the shared history. Channel suffix aliases are normalized;
explicit feat/ft/featuring credits each receive the heard duration, with band
ampersands preserved. Attribution depends on stored artist metadata; no extra
YouTube requests are made. The top three are computed on each leaderboard read,
so metadata corrections and resets are reflected without a second copied table.

Xóa database still backs up then clears all four music/listening tables. Users,
authentication configuration and hosting logs are not deleted. Active rooms may
write listening data again after a reset, as described in the existing dialog.
