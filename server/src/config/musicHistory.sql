BEGIN;
SET LOCAL lock_timeout = '5s';
DROP VIEW IF EXISTS music_quiz_candidates;
DROP VIEW IF EXISTS music_catalog;
DROP VIEW IF EXISTS music_listener_song_stats;
DROP VIEW IF EXISTS music_song_stats;
CREATE TABLE IF NOT EXISTS music_songs (
  video_id VARCHAR(11) PRIMARY KEY CHECK (video_id ~ '^[a-zA-Z0-9_-]{11}$'),
  raw_title TEXT NOT NULL,
  song_title TEXT,
  title_source TEXT CHECK (title_source IN ('metadata', 'manual')),
  artist TEXT,
  duration_seconds DOUBLE PRECISION CHECK (duration_seconds > 0 AND duration_seconds < 604800),
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((song_title IS NULL) = (title_source IS NULL)),
  CHECK (song_title IS NULL OR length(trim(song_title)) > 0)
);
CREATE TABLE IF NOT EXISTS music_playbacks (
  playback_id UUID PRIMARY KEY,
  video_id VARCHAR(11) NOT NULL REFERENCES music_songs(video_id),
  room_session_id UUID NOT NULL,
  listened_ms BIGINT NOT NULL DEFAULT 0 CHECK (listened_ms BETWEEN 0 AND 86400000),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heard_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Track boundaries are curated metadata of a source video. Existing reset/backup
-- includes this column automatically; never fabricate separate YouTube IDs.
ALTER TABLE music_songs ADD COLUMN IF NOT EXISTS album_tracks JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(album_tracks) = 'array');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name='music_playbacks' AND column_name='listener_id') THEN
    ALTER TABLE music_playbacks DROP CONSTRAINT music_playbacks_pkey;
    ALTER TABLE music_playbacks DROP COLUMN listener_id;
    ALTER TABLE music_playbacks ADD PRIMARY KEY(playback_id);
  END IF;
END $$;
DROP TABLE IF EXISTS music_listeners;
CREATE INDEX IF NOT EXISTS music_playbacks_song_idx ON music_playbacks(video_id);
CREATE OR REPLACE VIEW music_song_stats AS
  SELECT video_id, COUNT(*) FILTER (WHERE listened_ms >= 30000) AS play_count,
    SUM(listened_ms) AS listened_ms, MAX(last_heard_at) AS last_heard_at
  FROM music_playbacks GROUP BY video_id;
CREATE OR REPLACE VIEW music_catalog AS
  SELECT s.video_id::text AS track_id, s.video_id, s.raw_title, s.song_title, s.artist,
    s.duration_seconds, 0::double precision AS source_start_seconds,
    s.duration_seconds AS source_end_seconds, false AS is_album_track,
    COALESCE(h.play_count,0) AS source_play_count,
    COALESCE(h.listened_ms,0) AS source_listened_ms,
    COALESCE(h.play_count,0) AS play_count, COALESCE(h.listened_ms,0) AS listened_ms
  FROM music_songs s LEFT JOIN music_song_stats h USING(video_id)
  WHERE jsonb_array_length(s.album_tracks)=0
  UNION ALL
  SELECT s.video_id || ':' || (t.ordinality - 1)::text, s.video_id, s.raw_title,
    t.value->>'title', s.artist,
    (t.value->>'end')::double precision - (t.value->>'start')::double precision,
    (t.value->>'start')::double precision, (t.value->>'end')::double precision, true,
    COALESCE(h.play_count,0), COALESCE(h.listened_ms,0),
    (t.value->>'play_count')::bigint, NULL::numeric
  FROM music_songs s CROSS JOIN LATERAL jsonb_array_elements(s.album_tracks) WITH ORDINALITY t(value,ordinality)
  LEFT JOIN music_song_stats h USING(video_id);
CREATE OR REPLACE VIEW music_quiz_candidates AS
  SELECT video_id, song_title, duration_seconds, COALESCE(play_count, source_play_count) AS play_count,
    source_start_seconds + 10 AS clip_start_min_seconds,
    source_end_seconds - 20 AS clip_start_max_seconds,
    track_id, source_start_seconds, source_end_seconds,
    CASE WHEN is_album_track AND play_count IS NULL THEN 'source_video' ELSE 'track' END AS play_count_basis
  FROM music_catalog
  WHERE COALESCE(play_count, source_play_count) > 0 AND song_title IS NOT NULL AND duration_seconds > 30;
COMMIT;
