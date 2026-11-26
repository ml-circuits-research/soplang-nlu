; smt/prelude.smt2 — Declarative SOP Lang (w.request) sorts for Z3 MaxSMT formalisation.
; Every constructor maps 1-to-1 to sop-knowledge-worlds/docs/worlds/w.request/schema.sop.

(declare-datatypes ((Act 0)) (
  (
    (ACT_MAKE)
    (ACT_CHANGE)
    (ACT_PLACE)
    (ACT_REMOVE)
    (ACT_ASK)
    (ACT_CONNECT)
    (ACT_GROUP)
    (ACT_TAKE_APART)
    (ACT_PICK)
    (ACT_COPY)
    (ACT_UNDO)
    (ACT_REDO)
    (ACT_SAVE)
    (ACT_LOAD)
    (ACT_SEND)
    (ACT_DESELECT)
    (ACT_GREET)
    (ACT_THANK)
    (ACT_FAREWELL)
  )
))

(declare-datatypes ((ActMode 0)) (
  (
    (MODE_NONE)
    (MODE_ARRANGE)
    (MODE_MERGE)
    (MODE_UNGROUP)
    (MODE_SPLIT)
    (MODE_DISCONNECT)
    (MODE_REVERSE)
    (MODE_SET)
    (MODE_REPEAT)
  )
))

(declare-datatypes ((Mood 0)) (
  (
    (MOOD_DO)
    (MOOD_ASK)
    (MOOD_CHECK)
    (MOOD_PROPOSE)
  )
))

(declare-datatypes ((Question 0)) (
  (
    (Q_NONE)
    (Q_COUNT)
    (Q_EXISTS)
    (Q_LIST)
    (Q_WHAT)
    (Q_WHICH)
    (Q_WHERE)
    (Q_WHEN)
    (Q_WHO)
    (Q_DESCRIBE)
    (Q_WHY)
    (Q_HOW)
    (Q_HOW_MUCH)
    (Q_COMPARE)
    (Q_TOTAL)
    (Q_AVERAGE)
    (Q_MAX)
    (Q_MIN)
    (Q_DIFFERENCE)
    (Q_PERCENT)
  )
))

(declare-datatypes ((TargetMode 0)) (
  (
    (TM_NEW)
    (TM_EXISTING)
    (TM_BOUND)
  )
))

(declare-datatypes ((TargetFill 0)) (
  (
    (TF_NONE)
    (TF_WRITTEN)
    (TF_CONTEXT)
    (TF_DESCRIPTION)
    (TF_ALL)
    (TF_JOURNAL_STEP)
  )
))

(declare-datatypes ((Det 0)) (
  (
    (DET_NONE)
    (DET_DEFINITE)
    (DET_INDEFINITE)
    (DET_QUANTIFIED)
    (DET_POSSESSIVE)
    (DET_DEMONSTRATIVE)
  )
))

(declare-datatypes ((Phase 0)) (
  (
    (PH_RESULT)
    (PH_SELECTOR)
  )
))

(declare-datatypes ((Want 0)) (
  (
    (W_YES)
    (W_NO)
    (W_NOT_ALL)
  )
))
