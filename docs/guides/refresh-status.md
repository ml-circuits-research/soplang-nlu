[Home](../README.md) › [How-to guides](README.md) › Refresh the status page

# Refresh the status page and check the docs

This page: how to rebuild the generated status page after a measurement, and how to check the links and format of this documentation. Kind: How-to guide.

The [status page](../STATUS.md) is the only page of the documentation that holds current numbers. It is generated: never edit `docs/STATUS.md`, `docs/status.html` or the section pages it writes under `docs/status/` (`benchmark.md`, `progress.md`, `speed.md`, `dataset.md`, `agreement.md`, `journal.md`, `commits.md`) by hand, since every build overwrites them.

## Step 1: record a judged measurement

After the verdicts of a measurement are in and published ([Run the benchmark](run-benchmark.md)), edit the two hand-written inputs of the page:

- `docs/status/history.json`: add one row per measurement, with the time, the formalizer, GOAL as a percentage (the share of messages at L8, L9 or L10), the commit, a note and the sample. A row for an experiment on a copy of a formalizer also has `"trial": true`.
- `docs/status/now.md`: the "Working on now" text: the latest steps, what comes next and what is not measured yet. Write no scores in it: they would go stale, and the computed sections hold them. The build marks the text as possibly behind when `history.json` holds a measurement newer than the file.

A real row of `history.json`:

```json
{
  "time": "2026-11-27 16:39",
  "strategy": "vss",
  "goal": 65.9,
  "commit": "9f57aa3",
  "sample": "random 1%",
  "note": "First full judging of the random 1% benchmark."
}
```

## Step 2: rebuild

```sh
node docs/status/build.mjs
```

It writes `docs/status.html`, one page with charts for a browser, and the same content in Markdown for GitHub: `docs/STATUS.md`, a short page with the main figures of each section, and one page per section under `docs/status/` with the full tables, which `STATUS.md` links. It reads the repositories as they are and the two hand-written files, and computes the rest every time: the levels of the benchmark run, the speed of each formalizer, the size of the model files, the labels of the dataset, the agreement between VSS and spaCy, the audit of the batch conversion, the journal and the recent commits of both repositories. A section that cannot be computed says so, and the others are still written.

It changes one more file, `docs/status/last-build.json`: the numbers of the last build that changed. The next build compares against it to write the line "Since the build of …" at the top of the page.

The page's layout is set in `build.mjs`. What the status page records about the repositories (the commit, the uncommitted paths, the "Since" line) is described in [Folders and repositories](../reference/folders.md).

## Step 3: check the documentation

```sh
node docs/tools/check-docs.mjs
```

The check treats the documentation as code: Markdown files in the repository with relative links, checked by a script with no dependencies. It reads every `.md` file under `docs/` and the repository's `README.md`; it skips `docs/status/now.md`, which is an input of the status page. It prints a short report; `--verbose` also lists every warning.

It fails (exit code 1) on:

- a relative link to a file that does not exist, or to a heading anchor that is not there (anchors as GitHub computes them; in an HTML file, an `id`);
- a table with more than two columns;
- a page under `docs/` whose first line is not a breadcrumb starting with `[Home](…README.md)`, or with no `Next:` or `Up:` link at its end (the home page needs neither the breadcrumb nor `Up:`);
- a page under `docs/` that cannot be reached from `docs/README.md` by following links.

It warns on:

- a table whose first column holds more than 20 characters of visible text;
- a page with no "This page: … Kind: …" line near the top;
- a page shorter than 60 or longer than 180 lines (pointer pages, and the generated pages whose length follows the data, such as the copy of the journal, are exempt);
- a line of a code block longer than 70 characters (a circuit in a `sop` block is exempt, since it may be copied from the code).

Since `STATUS.md` and the pages under `docs/status/` are checked too, rebuild the status page (step 2) before you run the check. A fault in them is mended in `build.mjs` or in `now.md`, never in the generated page.

## Step 4: commit

Commit `docs/STATUS.md`, `docs/status.html` and the changed files under `docs/status/` (the section pages, `history.json`, `now.md`, `last-build.json`) together with the measurement they record ([decision D14](../project/decisions.md#d14)).

## Pitfalls

- **The live table reads one folder.** `build.mjs` computes the benchmark table from `eval-results/2026-11-27-syntax-benchmark-random`, with the formalizer files that stand in it now, including reruns. The formalizer files of the first judging are kept in that folder's `first-run/`.
- **`status.html` on GitHub shows its source.** GitHub shows the HTML of a private repository as text; open the file in a browser from a local checkout.
- **Hand-written numbers age.** `now.md` and the journal are written by hand; the computed sections of the page are recomputed at every build. Keep scores out of `now.md`.

Next: [Convert in batch](batch-conversion.md) · Up: [How-to guides](README.md)
