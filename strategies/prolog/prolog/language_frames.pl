:- module(language_frames, [frame_proofs/2]).
:- use_module(library(apply)).
:- use_module(library(assoc)).
:- use_module(library(lists)).
:- use_module(library(pairs)).

frame_proofs(Query, Proofs) :-
    Length = Query.length,
    findall((Kind-Value)-(Start-End),
        ( member([Start,End,Kind,Value], Query.events),
          integer(Start), integer(End), Start >= 0, Start < End, End =< Length ),
        RawEvents),
    sort(RawEvents, Events),
    group_pairs_by_key(Events, Groups),
    list_to_assoc(Groups, Index),
    empty_assoc(Empty),
    put_assoc(Length, Empty, proof(none, []), Finish),
    findall(Proof,
        ( member(Frame, Query.frames),
          frame_proof(Frame, Index, states(Finish, Empty), Proof) ),
        Proofs).

frame_proof(Frame, Index, Finish, Proof) :-
    Parts = Frame.parts,
    forall((member([Kind,Value,false], Parts), Kind \== "role"),
           get_assoc(Kind-Value, Index, _)),
    reverse(Parts, Reverse),
    foldl(prepend_part(Index), Reverse, Finish, states(_, Bound)),
    get_assoc(0, Bound, proof(Predicate, Roles)),
    Proof = _{frame:Frame.name, act:Frame.act, predicate:Predicate, roles:Roles}.

% Work backward from the required end of input. Each suffix records one proof
% per start and separately tracks whether a verb has been consumed.
prepend_part(Index, [Kind,Value,Optional], After, Before) :-
    ( Optional == true -> Skipped = After
    ; empty_assoc(Empty), Skipped = states(Empty, Empty)
    ),
    attach_part(Kind, Value, Index, After, Skipped, Before).

attach_part("role", Role, _, states(No, Yes), states(SkipNo, SkipYes), states(BeforeNo, BeforeYes)) :-
    !,
    attach_role(Role, No, SkipNo, BeforeNo),
    attach_role(Role, Yes, SkipYes, BeforeYes).
attach_part("verb", Value, Index, After, states(SkipNo, SkipYes), states(SkipNo, BeforeYes)) :-
    !,
    event_spans(Index, "verb", Value, Spans),
    foldl(attach_verb(After), Spans, SkipYes, BeforeYes).
attach_part(Kind, Value, Index, states(No, Yes), states(SkipNo, SkipYes), states(BeforeNo, BeforeYes)) :-
    memberchk(Kind, ["lead", "det", "word"]),
    event_spans(Index, Kind, Value, Spans),
    foldl(attach_literal(No), Spans, SkipNo, BeforeNo),
    foldl(attach_literal(Yes), Spans, SkipYes, BeforeYes).

event_spans(Index, Kind, Value, Spans) :-
    ( get_assoc(Kind-Value, Index, Found) -> Spans = Found ; Spans = [] ).

attach_literal(After, Start-End, Skipped, Before) :-
    ( get_assoc(End, After, Proof) -> put_assoc(Start, Skipped, Proof, Before)
    ; Before = Skipped
    ).

attach_verb(states(No, Yes), Start-End, Skipped, Before) :-
    ( ( get_assoc(End, Yes, proof(_, Roles)) ; get_assoc(End, No, proof(_, Roles)) ) ->
        put_assoc(Start, Skipped, proof([Start,End], Roles), Before)
    ; Before = Skipped
    ).

% Use the longest viable role span. Every position before the largest suffix
% start can match that suffix without enumerating shorter spans.
attach_role(Role, After, Skipped, Before) :-
    ( max_assoc(After, End, Proof), End > 0 ->
        Last is End - 1,
        numlist(0, Last, Starts),
        foldl(bind_role(Role, End, Proof), Starts, Skipped, Before)
    ; Before = Skipped
    ).

bind_role(Role, End, proof(Predicate, Roles), Start, Acc, Result) :-
    RoleProof = _{role:Role, range:[Start,End]},
    put_assoc(Start, Acc, proof(Predicate, [RoleProof|Roles]), Result).
