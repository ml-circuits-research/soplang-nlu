; smt/axioms.smt2 — Core declarative w.request formalisation laws in Z3 SMT-LIB2.
; These pure logical predicates govern act/mood/mode, target mode/fill, the lookup law,
; and selector-vs-result phase separation across every tab without procedural JS hacks.

; 1. Finer act mode compatibility (w.request/WORLD.md § Finer acts and mode)
(define-fun valid-act-mode ((a Act) (m ActMode)) Bool
  (or
    (= m MODE_NONE)
    (and (= a ACT_PLACE) (= m MODE_ARRANGE))
    (and (= a ACT_GROUP) (= m MODE_MERGE))
    (and (= a ACT_TAKE_APART) (or (= m MODE_UNGROUP) (= m MODE_SPLIT) (= m MODE_DISCONNECT)))
    (and (= a ACT_CHANGE) (or (= m MODE_REVERSE) (= m MODE_SET)))
    (and (= a ACT_COPY) (= m MODE_REPEAT))
  )
)

; 2. Mood, Act, Question, and Asked-Key coherence
(define-fun valid-mood-act ((mood Mood) (a Act) (q Question) (asked Int)) Bool
  (and
    ; Only questions/checks have non-empty question or asked attributes
    (=> (= mood MOOD_DO) (and (= q Q_NONE) (= asked (- 1)) (not (= a ACT_ASK))))
    (=> (= mood MOOD_PROPOSE) (and (= q Q_NONE) (= asked (- 1))))
    (=> (= mood MOOD_ASK) (and (= a ACT_ASK) (not (= q Q_NONE))))
    (=> (= mood MOOD_CHECK) (= a ACT_ASK))
    (=> (= a ACT_ASK) (or (= mood MOOD_ASK) (= mood MOOD_CHECK)))
    (=> (>= asked 0) (= a ACT_ASK))
  )
)

; 3. Act -> TargetMode coherence
; Creation acts create new targets; edits/removals/moves/queries act on existing/bound targets.
; Connect can either create a new link (TM_NEW) or modify an existing link; default allowed both.
(define-fun valid-act-target-mode ((a Act) (tm TargetMode)) Bool
  (and
    (=> (= a ACT_MAKE) (= tm TM_NEW))
    (=> (or (= a ACT_CHANGE) (= a ACT_REMOVE) (= a ACT_PLACE) (= a ACT_PICK)
            (= a ACT_COPY) (= a ACT_GROUP) (= a ACT_TAKE_APART)
            (= a ACT_UNDO) (= a ACT_REDO) (= a ACT_DESELECT) (= a ACT_ASK)
            (= a ACT_SEND) (= a ACT_SAVE) (= a ACT_LOAD)
            (= a ACT_GREET) (= a ACT_THANK) (= a ACT_FAREWELL))
        (not (= tm TM_NEW)))
  )
)

; 3b. Verbless request discipline: without an explicit verb predicate (ppos = -1),
; only make (noun-phrase fragment), change (property/degree fragment), place (region/direction fragment),
; or ask (question fragment) may be inferred — never arbitrary save/send/load/undo/remove/group.
(define-fun valid-verbless-act ((ppos Int) (a Act)) Bool
  (=> (< ppos 0)
      (or (= a ACT_MAKE) (= a ACT_CHANGE) (= a ACT_PLACE) (= a ACT_ASK)))
)

; 4. TargetMode, TargetFill, and Determiner coherence
(define-fun valid-target-fill ((tm TargetMode) (tf TargetFill) (lk Bool)) Bool
  (and
    ; A new target never has a fill strategy or a thing-lookup
    (=> (= tm TM_NEW) (and (= tf TF_NONE) (not lk)))
    ; An existing/bound target always specifies how it is filled
    (=> (not (= tm TM_NEW)) (not (= tf TF_NONE)))
    ; Fill=all selects every matching thing and needs no lookup
    (=> (= tf TF_ALL) (not lk))
  )
)

; 5. The Lookup Necessity Law (w.request / webmeet-dataset/tools/check.mjs line 140)
; Any existing target that no words identify (and is not fill=all) MUST emit w.request.lookup key=thing.
(define-fun lookup-law ((tm TargetMode) (tf TargetFill) (identified Bool) (lk Bool)) Bool
  (=> (and (not (= tm TM_NEW)) (not (= tf TF_ALL)) (not identified)) lk)
)

; 6. Phase Law (selector vs result)
; On a new target, non-anchor constraints describe the desired result.
(define-fun phase-new-law ((tm TargetMode) (is_anchor Bool) (ph Phase)) Bool
  (=> (and (= tm TM_NEW) (not is_anchor)) (= ph PH_RESULT))
)

; 7. Span containment inside a request
(define-fun span-in-req ((rstart Int) (rend Int) (hs Int) (he Int)) Bool
  (and (<= rstart hs) (<= he rend))
)

; 8. Span strictly outside a request (for content-bearing external filler remarks)
(define-fun span-outside-req ((rstart Int) (rend Int) (hs Int) (he Int)) Bool
  (or (< he rstart) (> hs rend))
)
