// Groups the rejections that still stand after a step by what their notes name, for the choice of the next repairs.
//   node group.mjs <notes file> [group name]      (a group name lists its items)
// The notes file: for each standing rejection a line "<set>\t<n> <grade> <text>" and a line with the note, as written by
//   for s in fresh freshb freshc vibe audit; do node audit.mjs still <dir> $s <circuits> | awk -v s=$s '/^## /{sub(/^## /,""); h=$0; getline; print s"\t"h; print "\t"$0}'; done
// The nominal group is subdivided: the value said of a thing merged into its nominal, a name after a common noun, a
// compound noun split, list items merged, numbers, a word that grades a linking word, quoted data.
import {readFileSync} from 'node:fs'
const lines = readFileSync(process.argv[2], 'utf8').split('\n')
const items = []
for (let i = 0; i < lines.length; i++) if (/^\w+\t/.test(lines[i])) items.push({set: lines[i].split('\t')[0], head: lines[i].split('\t')[1], note: (lines[i + 1] ?? '').trim()})
const NOMINAL = /split|merged|merg|one nominal|wrong head|made the head|is the head|head is|as a dependent of|dependents? of '/i
const K = [
  ['comparison before a noun / "one more"', /one more|than the .*(dependent|description)|than .* held as dependent/i],
  ['phrase after a dash put in the aside', /dash|aside/i],
  ['then/next/also/again/instead/finally/yet held in a nominal or wrong clause', /'(then|next|also|again|instead|finally|yet|first|still|too|later|now|tomorrow|this time|meanwhile|afterwards|after|before|once)'/i],
  ['thanks / please / words to the listener', /thank|said to the listener|'pls'|'please'|'cheers'|'sorry'/i],
  ['command written inside another clause', /command (cannot|can't|inside)|inside the (infinitive|relation|participle)|commands? .*(put|held|written|stand) inside|coordinated with the clause inside|with the commands? .* coordinated/i],
  ['question/statement form', /interrogative|declarative|asks a question|is a question|question/i],
  ['command verb lost (held as noun/dependent/discourse)', /(command|imperative)[^.]*?(held as|lost|loses)|command verb|verb [^.]*held as (a |the )?(noun|nominal|dependent|discourse|modifier|head|complement)|held as a noun|loses its (command )?verb|can be a verb/i],
  ['noun/name/adjective read as a verb', /(written|made) as the verb|written as (the )?verb|made (the |a )?verb|written as an? (imperative|nonfinite|finite)[^.]*(clause)/i],
  ['participle / infinitive without its clause', /participle|infinitive|no clause has it/i],
  // the nominal group, subdivided (before the measure group: a value with a number is a nominal fault)
  ['nominal: quoted data (JSON)', /"label"|"data"|label": "/i, NOMINAL],
  ['nominal: a word that grades a linking word held in a nominal', /grades the linking word|grades '(to|in|on|from)'|which grades/i, NOMINAL],
  ['nominal: two or more numbers merged', /two numbers|numbers .* merged|values are merged|'\d+, \d+'|separate numbers/i, NOMINAL],
  ['nominal: list items merged', /list items|items|texts merged|names '[^']*, [^']*' are merged|'[^' ]+, [^' ]+(, [^' ]+)*' (are|is) merged|are merged into one nominal with head '[^']*'.*(items|the list)|r1' is not a conjunct/i, NOMINAL],
  ['nominal: value said of the thing merged into it (a setting)', /says how|should (be|become)|what it should|what the .* should|the size is stated|value set|part of the description|stated of the colour|is made the head of the nominal|merged with '[^']*' as head|head is the colou?r|head (is )?'(neon|none|forward|tiny|lime|time|sunset|level|opacity|width|default|iron|triangles|centre|plum|hazel|metal|cyan|orange|blue|grey|gray|yellow|pink|red)'|with head '(neon|none|forward|tiny|lime|time|sunset|level|opacity|width|default|iron|triangles|centre|plum|hazel|metal|cyan|Notes|Math|navy|bench)'|colou?r ('[^']*' )?(is )?(split|merged)|'(dark|metal|mustard|navy|cherry)[^']*' is split|and '(level|\d+% opacity|medium width|weathered)/i, NOMINAL],
  ['nominal: name after a common noun split or merged', /the name|name '|names? .* (split|merged)|'(Intro|Core|Rough|Roadmap|Take|Village|Check|Start|Proposal|Hub|Hiring|Fail|Lunch|Deep)[^']*' (is|are) |label '1\.\.\*'/i, NOMINAL],
  ['nominal: compound noun split (a noun held as modifier or apart)', /noun '[^']*' is held as a modifier|is held as a modifier of the clause, splitting|held as (a )?(clause )?modifiers?, splitting|is split into (two|the) (nominals|complements)|split into '[^']*' and '[^']*'|is split: '[^']*' is held as a modifier|'[^' ]+ [^' ]+' is split into|with '[^']*' held as a modifier|the head '[^']*' is (split off|held)|splitting (the|one) nominal/i, NOMINAL],
  ['nominal: other', NOMINAL],
  ['measure, direction and pairing', /pair|direction|measure|how far|'by'|'x'|across|wide|high|each group/i],
  ['words that say how a thing should be (settings)', /says how|say how|which says how|how .* should be/i],
  ['part with no verb / fragment tied to nothing / ellipsis', /tied to nothing|part with no verb|ellipsis|fragment/i],
  ['coordination wrong', /coordinat|conjunct/i],
  ['relation starts/ends at the wrong word', /starts at|ends at|wrong end|start(s)? from|relation marked/i],
  ['linking word held as modifier/dependent', /linking word|marker/i],
  ['word in the wrong clause', /clause of/i],
]
const groups = new Map(K.map(([k]) => [k, []])); groups.set('other', [])
for (const it of items) { const k = K.find(([, re, also]) => re.test(it.note) && (!also || also.test(it.note)))?.[0] ?? 'other'; groups.get(k).push(it) }
const bySet = list => ['fresh', 'freshb', 'freshc', 'vibe', 'audit'].map(s => (s.startsWith('fresh') && s !== 'fresh' ? 'f' + s.slice(5) : s.slice(0, 1)) + list.filter(i => i.set === s).length).join(' ')
for (const [k, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(String(list.length).padStart(4), k, '(' + bySet(list) + ')')
if (process.argv[3]) for (const it of groups.get(process.argv[3]) ?? []) console.log(it.set, it.head.slice(0, 140), '\n   ', it.note.slice(0, 260))
