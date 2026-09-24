# Native audio on Android Chrome

Room playback now uses one persistent HTML audio element and Media Session controls.
Search and recommendations still use YouTube. The player displays the song thumbnail.
Tap Play once if Chrome requires a user gesture before producing sound.

The server extracts audio with yt-dlp and proxies it over IPv4, including HTTP Range
requests for seeking. Audio now has a bounded shared disk cache (see September 21
update below). Source links are cached for ten minutes (at most 30 entries); extraction concurrency is capped at two. Stream
tickets require the app login and are scoped to one video, separate from login tokens.
Expired upstream links are refreshed once. Extraction failures show a retry message.

## Deployment

Requires Node, Python 3 and the yt-dlp Python executable. Set `YTDLP_PATH` to its
absolute path, or use the installed default `~/audio-experiment/yt-dlp`.
The tested version is 2026.08.19. The extractor uses Node for YouTube JavaScript
challenges and permits the official yt-dlp EJS component download.
No ffmpeg or database migration is required.

Background playback and track transitions have been confirmed working on Android
while the screen is off.

## Startup latency optimization (2026-09-18)

The server prepares the next queued song's source URL when the queue changes,
playback resumes, or the current song changes. This does not rely on phone timers.
Ticket creation also starts source extraction without waiting for it to finish.
Requests for the same video share a single extraction. Up to two extractors run;
background preparation uses at most one slot. Playback takes priority over queued
background work, with a bounded waiting queue of 30 jobs. Running work is not killed.
Prefetch failures are ignored; playback can retry normally.

Preparation caches URLs only, with the existing ten-minute lifetime and quality.
An expired source or a newly selected song still needs extraction.
The next source can also expire during a long song or pause.

`[audio:extract]` logs extraction time. `[audio:stream]` and the `Server-Timing`
response header report source wait and upstream response-header time (including
one expired-source retry). These are server measurements, not time to audible playback.
Signed URLs and tickets are not logged by these measurements.

## Early automatic queue preparation (2026-09-18)

With autoplay enabled, a server timer checks active rooms every second. When the
last queued song has ten seconds or less remaining, it starts finding one YouTube
recommendation, appends it without changing current playback, and prepares its
audio URL. The host reports actual duration and position when native playback
starts or resumes; the server estimates elapsed playback from that point. Song
card duration is the fallback. Unknown durations retain end-of-track autoplay.
Buffering and network delays can affect the exact timing; ten seconds is a head
start, not a guarantee that the next source will finish preparing in time.

Manual queued songs take priority. Pause, seek, disabling autoplay, ending the room
or an empty room cancels pending preparation. Late results are rechecked before
insertion. If playback ends during the request, normal autoplay shares that request.
Failed early preparation is retried through the existing end-of-track fallback.

This is an unofficial extraction path; YouTube changes can break it. Android may
also suspend Chrome under battery/memory pressure. It is not a guarantee of
uninterrupted background playback under every device setting.

## Preserve playback on returning to the page (2026-09-18)

Reproduced an unwanted seek in the actual RoomPage and audio hook with React test
renderer and a simulated media element: visibility return moved playback from
60s to the server estimate of 65s; socket reconnect moved 90s to 94s. Both host
and guest were affected. Queue updates alone did not seek.

Room snapshots now preserve position when the same healthy source remains in
playing state. Explicit seek commands, paused-player synchronization, and new
tracks still apply the requested position.

## Retry and skip recovery (2026-09-18)

Production logs showed repeated extraction failures across multiple videos, followed
by successful requests. The old logs did not include extractor failure reasons;
the exact upstream cause is unconfirmed. A public Range probe for `tm00NhBXafE`
subsequently returned HTTP 206 with 4096 bytes, and an SSH-host extraction of
`CufIAJDVZvo` succeeded. Neither test establishes why the earlier requests failed.

The player now remembers failed play promises even when the browser does not set
`audio.error`, and reloads a source/ticket on retry. Failed ticket requests retain
the video ID so the hook's play method can also retry. Browser gesture restrictions
still retry play without reloading a healthy source.
Next can immediately consume a manually queued track while recommendations are
pending; a late recommendation result cannot replace that track. Host-only skip
permissions are unchanged and the button explains this restriction.
Extraction logs now include a sanitized reason category without signed URLs.

## Source cooldown and bounded recovery (2026-09-21)

Production investigation found 67 of 75 extractions failed on September 21 with
the upstream_rate_limit category (429/too-many-requests or bot confirmation).
This establishes source refusals, but does not establish the cause of all stutter.

Source failures now have short per-video negative caching (15 seconds, or five
minutes for unavailable videos). Upstream refusal opens a shared cooldown starting
at 30 seconds and doubling to five minutes on repeated failures. Jobs recheck the
guard when extraction starts; already running jobs finish. Valid cached sources
remain usable. Source links retain their existing lifetime and audio quality.

Ticket requests now await the shared extraction and return HTTP 503 with
Retry-After and a structured delay when it fails. This replaces the earlier
immediate-ticket behavior; preparation of the next queued source still applies.
The browser retries up to three times, honors cooldowns, and resumes its local
position after media errors or a buffer wait of 20 seconds. Pause, track changes,
end and unmount cancel timers. Gesture restrictions still require tapping Play.
Thirty seconds of playback advancement restores the automatic retry budget.
Background browser timer suspension can delay recovery.

Server logs now include stream body byte counts/completion and interrupted-body
errors, plus upstream HTTP failures. Browser console records recovery reason and
attempt; browser diagnostics are not uploaded to server logs. No signed URLs logged.

## Shared audio data cache (2026-09-21)

The ticket now prepares a shared download through response headers. Upstream audio
is requested in sequential ranges of at most 1 MiB, with exact range/total-length
validation before joining bytes. Listeners read
independently from a growing file, including byte ranges/suffix ranges; they need
not wait for the whole file. Next-track prefetch now downloads audio data, not just
the source URL. One download per video is shared across rooms/listeners. A listener
disconnect does not cancel preparation. No transcoding or quality change occurs.

Cache directory is `~/.cache/ytm-audio-cache`, private and outside public assets.
Admission reserves 32 MiB per entry against a 256 MiB budget (up to eight entries).
Completed entries without readers are evicted least-recently-used first. Two
downloads run at most, including at most one background job, with the existing
bounded priority queue. Downloads have a two-minute total deadline and the existing
20-second upstream idle timeout. Oversized/unknown-length audio uses the earlier
proxy path; it is not cached/shared. Seeking beyond downloaded data waits for it.

This implementation assumes a single application process owning the cache folder.
Startup discards this module's previous UUID-named cache files; it does not reuse
files across restarts. Failed partial downloads are removed after readers release
them, and retried from the source rather than joining potentially different media.

Extraction reasons now separate rate limits, bot verification, token requirements,
region restrictions and account-required content. Rate/bot failures have shared
cooldowns; restricted/unavailable videos have per-video cooldowns. Existing cached
audio remains usable during an extraction outage. No cookies/token bypass added.

Logs include cache hits, shared in-progress reads, completed download byte counts,
and failed downloads without signed URLs. Existing browser recovery remains.
A whole-file download trial failed with ECONNRESET, which prompted the
bounded-range downloader.

## Playback diagnostics (2026-09-22)

`[audio:diagnostic]` records structured UTC timestamps. Each new source load has
a random `playbackId` passed from the browser through the ticket and signed stream
claim. Each stream request also has a `streamId`. Shared extraction/download
events correlate by videoId and time because multiple listeners share that work.

Browser events include load/ticket outcome, waiting/stalled/playing, media error
code, pause/end, seeks, visibility, connectivity, retries and observed progress
gaps. Snapshots include media position, seconds buffered ahead, ready/network
state, elapsed load time and buffer-wait duration. A progress gap is evidence of
timing discrepancy, not proof of audible stutter; background suspension and main
thread delays can affect measurements. Offline events may not reach the server.
Requests are best effort with a five-second timeout; failures never trigger the
normal API logout interceptor or alter playback. No heartbeat/timeupdate logging:
only anomalies/events, capped at 40 per browser per minute and one per event type
per second. Server ingestion requires authentication, validates an allowlist and
caps at 60 requests per user and 600 total per minute, with bounded counters.

Extractor logs retain independent boolean evidence for 429, 403, bot checks,
signature/n challenge failures, killed runtimes, heap exhaustion, invalid cookies,
PO tokens and missing formats. They include exit code/signal and Node-process RSS
(not total account memory and not proof of OOM). Raw stderr, URLs, cookies,
credentials, usernames and user-agent strings are not recorded. Cache completion
and failure logs include duration/bytes and failures include upstream status,
selected network/disk error codes and deadline state. Stream close records bytes,
timings and completion; incomplete reads can be normal browser range cancellation.

Logs use existing alwaysdata site stdout logs, not the listening-history database.
Locate the relevant site log by date under `~/admin/logs/sites/`, then filter
`[audio:diagnostic]`, `[audio:cache]`, `[audio:extract]` and the video/playback ID.
Browser metrics are untrusted observations, sanitized by the server. Existing
hosting retention applies; no new unbounded log files or database writes added.

## Restore the earlier player

The private `.deploy-local/NATIVE-AUDIO-ROLLBACK.md` documents the local and remote
baseline archives and `.deploy-local/rollback-native-audio.ps1` restores the deployed
application. Restart the alwaysdata site afterward. The database is unchanged.
