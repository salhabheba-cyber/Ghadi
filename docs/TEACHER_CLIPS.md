# Lip-synced teacher clips

The teacher's fixed sentences can be played as short videos of the teacher's face saying exactly those words.
Anything without a clip falls back to the still photo plus the browser's built-in voice, so nothing breaks while clips are missing.

## What gets a clip
`docs/teacher-lines.json` lists every fixed sentence (lesson explanations, questions, hints, corrections, encouragement, goodbye).
Not covered (no clip, photo + browser voice instead): the greeting (contains the child's name), the recap (contains scores),
AI-worded lines, text from parent uploads, and French/Arabic until those lessons are reviewed and approved.

## Make the clips
1. For each entry in `docs/teacher-lines.json`, record or generate the speech for `text` (a natural voice in `language`), then render a
   lip-synced video of the teacher photo (`public/teacher/teacher.jpg`) speaking that exact audio.
2. Save the video as `public/teacher/lines/<key>.mp4` (the `key` from the JSON, e.g. `0a972e9a8b0d78.mp4`).
   Recommended: H.264 video + AAC audio, square 480-640 px, 24-30 fps, under about 1 MB each, with a clean start and end on a closed mouth.
3. Run `pnpm lines:export`. It rebuilds `public/teacher/lines/manifest.json` from the files present and prints how many are still missing.
4. Redeploy. The app only plays a clip whose file is listed in the manifest.

If the sentence text in a lesson changes, its key changes and the old clip stops being used (a clip never plays for different words).
Re-run `pnpm lines:export` after any lesson edit to get the new list.

## Honest limits
- This is pre-rendered video, not a real-time avatar. It cannot speak new sentences.
- Check every clip before use: lip-sync quality depends on the tool that made it, and the voice must match the language.
- The photo owner must consent to their likeness being animated and used in the product. The teacher is still labelled as AI on screen.
- The app never records audio or video of the child.
