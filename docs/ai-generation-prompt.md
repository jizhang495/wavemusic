# AI Generation Prompt

The canonical system prompt lives in
[../prompts/wavemusic-json-system-prompt.txt](../prompts/wavemusic-json-system-prompt.txt).
The web UI imports that same file for the "Copy prompt" button, so the prompt
rules are not duplicated in `main.ts`.

The copied prompt has this wrapper:

```text
Generate a JSON file for a four-part WaveMusic music piece.
Follow the schema and system prompt exactly.

<system prompt>
contents of ../prompts/wavemusic-json-system-prompt.txt
</system prompt>

<user input>
the text from Describe your music
</user input>
```

When changing AI generation rules, edit only the canonical prompt text file,
then rebuild the web app so the imported prompt is bundled into the UI.
