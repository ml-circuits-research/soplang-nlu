[Home](../README.md) › [VSS in depth](README.md) › Rule catalogue

# The rule catalogue in brief

This page: a summary of VSS's hand-written rules by group, with the marks for their thresholds, the rules added after the report, and where the full catalogue is. Kind: Reference.

## What this page holds

The rules are those of the code at commit `fa46cb7`, grouped as in the VSS report (section 9), which lists every rule with an example. This page gives 3 to 6 representative rules per group. Rules added after `fa46cb7` are summarised at the end, one line each with their commit. The full catalogue is in the report ([The full reports](../project/reports.md)).

## Marks

Each rule below ends with a mark:

| Mark | Meaning |
| --- | --- |
| T | A threshold that the repository says was chosen from counts in this dataset. |
| n | A count or ratio whose origin the code does not record; most are "seen at least 3 times". |
| — | No number. |

The three thresholds marked T, with their values and recorded evidence at `fa46cb7`:

- `SURELY_A_THING = 20` (`src/reader.mjs`): "meeting" was seen as a thing 104 times, "coming" 6 times by chance.
- `SURELY_A_VERB = 20` (`src/links.mjs`, added in `fa46cb7`): "excuse" 121 times, "chose" 38, while "warm" (6) and "empty" (10) also say how things are.
- `UNLIKE = 0.3` (`src/links.mjs`): measured on the first conversion round, where items of a list scored 0.6 or more and a day or hour set off after a phrase about 0.

## Lettered rules

The rules found in the calendar analysis carry a letter: A, B, G, L, O, T, U, W. They can be switched off one by one to measure them: `createVssReader(model, {without: 'A,G'})` ([VSS commands and options](options.md)).

## The groups

### Tokens and observations

- A date, a clock time or a decimal is one token; a clitic is split off: "don't" → "do" + "n't". —
- A hyphenated word, or digits joined by a comma, is one observation: "soft-focus", "260,180". —
- A compound of the legend is one observation, longest first: "in front of". —
- A learned spelling variant is looked up as its common word: "shoudl" → "should". n
- (rule L) A capital inside a sentence makes a symbol of its own unless the legend lists the word: "the title Second". —

### Decoding constraints

- The verb budget: one verb per clause, with the exceptions on [Reading](reading.md). —
- The words of a learned opener are kept off the verb stations, unless anchored or surely a verb: "quick one: …"; "excuse me, …". T n
- The occurrence lift: each emission × exp(4 × cosine with the station's prototype). n
- (rule G) A word seen as a thing at least 20 times in fixed frames, never as a verb, and at least 3 times more as a thing than as a quality, is no verb, unless a form of "be" or a subject-only pronoun stands right before it: "the Intro meeting" vs "we are meeting Ana". T
- A word seen only as a quality, and never as a verb, is no verb: "max 3". n

### Where a nominal begins and ends, and its head

- The last noun is the head; nouns before it are compounds; a describing word is a compound or a modifier by the learned habit: "the bottom left corner". n
- With no noun, the last describing word stands for the thing; a lone determiner that can be a pronoun is a pronoun: "the red"; "delete that". —
- A describing word right after a plural noun begins the next nominal: "the markers small circles". —
- Owner, "'s", owned thing: the owned nominal with a possessor: "Jan's office chair". —
- (rule T) A day word right before a bare lower-case noun forms one nominal with it: "tomorrow morning". —
- After a preposition, a determiner-led nominal runs on to a following lone word shown as a thing: "on the budget pie". n

### Verb or not

- (rule O) The word that opens a clause, with only bare nouns between it and a finite helping verb, is the subject: "Sam is travelling". —
- (rule B) Right after a preposition, the -ing form of a known verb with a thing after it is a verb: "by removing it". n
- (rule A) An auxiliary that needs a bare verb, opening its clause before a group with no verb, takes the group's last word as its verb: "Could Main work as the name". n
- A word listed both as a preposition and as a verb is the verb only after its subject, an auxiliary or "to": "I would like a chart". —
- A bare verb right after a nominal that a verb or preposition already holds, seen as a thing at least 3 times, is not a verb: "can I get a cinnamon stick?". n
- (`fa46cb7`) The word that opens a sentence with no verb is the verb when seen as a verb at least 20 times and never as a thing: "excuse me". T

### Clauses: helping verbs, subject, start

- An auxiliary before its subject joins the verb after the subject: "could you increase the mouth". —
- "have" before a bare verb makes its object do something; it is not a perfect: "have the fan become …". —
- The subject is the nominal before the verb; phrases with prepositions between them hang on the subject: "the box on the left moves". —
- Other material before the first verb, or a sentence with no verb, is a fragment clause: "a fireplace". —
- (`fa46cb7`) An embedded question clause states, also before "?": "tell me which events are scheduled". —

### Words after the verb

- The first bare nominal is the object; after "be", the predicative nominal; in a fragment, the topic: "delete the last row". —
- A recipient pronoun, or a verb that gives, makes the first nominal the indirect object: "give me a hand". —
- A value right after a nominal that the verb does not take is tied to that nominal: "x 120". —
- A particle-marked word right after the verb or its object is a particle: "put it back". —
- After the object, a colon spells the object out: "a picnic spot: a blanket, a basket". —

### Coordination

- Gapping: after a joiner, a segment built like the one before it is a fragment that shares the verb: "make the second box blue and the first one green". —
- After "but", "then" or "so", what follows is a clause of its own. —
- A listed nominal joins the earlier nominal most like it: "a blanket, a basket and a boy". n
- A determiner-led nominal unlike every candidate is not joined to the end of a phrase: "at 10:00 and the room to Cedar room". T
- (rule U) A comma series closed by a conjunction begins with the nominal before its first comma: "for Ana, Mihai and me". —
- (`fa46cb7`) Two main clauses that only a comma separates form a coordination: "I cannot see it, drag it to the corner". —

### Clause to clause

- "to" and a verb: a nonfinite clause that completes the verb before: "I want to delete it". —
- "to" after a nominal that is not directed: what the thing is for: "a button to close the window". —
- A bare verb form right after a nominal describes it: "a man wearing a hat". —
- A clause opened by a marker is tied to the clause before it; "if" after a verb that asks is what is asked: "tell me if it fits". —
- A clause that opens the sentence with its marker hangs on the next main clause: "while you're there, thin the lines". —

### Where a relation starts

- "of" starts at the nominal before it: "the level of Intro". —
- Two literals one against the other: the relation starts at the first: "resize it to 240 by 160". —
- In a fragment: the nominal before or one it is placed by, by learned holding, at most 4 steps: "a boy with a happy face next to the table". n
- Otherwise the clause and the nominals of the chain compete; a margin below 0.5 gives the clause with `attachment=ambiguous`: "put the cat on the table". n

### Writing

- Words that grade together form one modifier run: "a little longer". —
- A verb form used as the linking word of a relation to a nominal is the verb of a nonfinite clause: "a group called g2". —
- A sign right after a number belongs to that number: "30%". —
- A fragment holding only modifiers or words said in passing joins the clause after it: "next, add a title". —
- Every word left over joins the clause it stands in as a discourse word. —

## How the rules were found

Most of the 42 VSS commits of 2026-11-27 up to `fa46cb7` add rules. Three analyses of VSS's faults by area (calendar; diagram and document; drawing) each read a sample of VSS circuits and proposed general rules, which were checked against about 8,000 accepted circuits of the dataset. Some rules of `fa46cb7` were found in the benchmark's rejected circuits, so the benchmark is no longer an unseen sample ([Limits of the measurements](../evaluation/validity.md)). The rule batches and their checks: [Results as first measured](../project/first-results.md).

## Rules added after `fa46cb7`

From the commit messages:

- `83fce90`: a causative verb + object + bare verb makes a nonfinite clause whose subject is the object.
- `83fce90`: every part of a sentence still untied gets an unmarked relation from its main clause.
- `83fce90`: a noun describing the next noun stays in the nominal; a capitalised name runs on through lower-case nouns.
- `83fce90`: the opening word of a sentence part is a command verb; one or two words before a dash or comma are a heading.
- `83fce90`: a participle after a comma describes the first thing the clause acts on that is not a pronoun.
- `71f0dd2`: a verb in -s right after a thing that opens its clause is its verb when the text shows that thing as singular and the word as a verb.
- `71f0dd2`: a clause opened by a subordinator at the start, or after a dash, semicolon or colon, hangs on the part after its comma.
- `71f0dd2`: a single nominal set off by a comma is tied to the thing before it when the clause holds that thing ("make a house, size 80").
- `71f0dd2`: "one", "ones" and a count word after a describing word head their nominal; relative clauses without "that".
- `85de0bb`: a past participle right after a held noun, before a linking word, number, break or end, describes it ("size keyed to revenue").
- `85de0bb`: a bare verb form right after a known singular noun with no helping verb is not its verb ("a horizontal bar chart").
- `85de0bb`: a nominal between a verb and a finite helping verb is the subject of the clause after it ("I think you should place").

Their measured effect on the benchmark: [STATUS.md, Progress over time](../STATUS.md#progress-over-time). Current work: [STATUS.md, Working on now](../STATUS.md#working-on-now).

## Adding a rule

Rules may name only function words; word sets go into the legend as marked lists. The steps and the checks: [Add a rule to VSS](../guides/add-vss-rule.md). What each kind of part is (learned or declared): [Learned and declared](learned-and-declared.md).

---

Next: [Learned and declared](learned-and-declared.md) · Up: [VSS in depth](README.md)
