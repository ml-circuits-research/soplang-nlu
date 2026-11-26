:- module(roles, [index_roles/3, reset_role_cache/0, nominal_prefix/3, native_nominal_prefix/5, direct_target/5, direct_reference/4, target_determiner/6, attached_roles/10, constraint_phase/8, set_phase/3, role_fit/8]).
:- use_module(library(http/json)).
:- use_module(library(ordsets)).
:- use_module(library(pcre)).

% A worker processes one request at a time. Cache the ordered answers and
% clear them whenever the next query's hit lists are built.
:- dynamic attached_cache/4.
:- dynamic anchor_cache/3.

reset_role_cache :-
    retractall(attached_cache(_,_,_,_)),
    retractall(anchor_cache(_,_,_)).

index_roles(Q, Hits, Indexed) :-
    role_hits(Hits, Acts, Targets, Constraints, Markers, References, Frames),
    Indexed = Q.put(_{actHits:Acts, targetHits:Targets, constraintHits:Constraints,
                      markerHits:Markers, referenceHits:References, frameHits:Frames}).

role_hits([], [], [], [], [], [], []).
role_hits([H|Hits], Acts, Targets, Constraints, Markers, References, Frames) :-
    H = [_,_,[Role|_],_],
    ( Role == "act" -> Acts=[H|A], Targets=T, Constraints=C, Markers=M, References=R, Frames=F
    ; Role == "target" -> Acts=A, Targets=[H|T], Constraints=C, Markers=M, References=R, Frames=F
    ; Role == "constraint" -> Acts=A, Targets=T, Constraints=[H|C], Markers=M, References=R, Frames=F
    ; Role == "marker" -> Acts=A, Targets=T, Constraints=C, Markers=[H|M], References=R, Frames=F
    ; Role == "reference" -> Acts=A, Targets=T, Constraints=C, Markers=M, References=[H|R], Frames=F
    ; Role == "frame" -> Acts=A, Targets=T, Constraints=C, Markers=M, References=R, Frames=[H|F]
    ; Acts=A, Targets=T, Constraints=C, Markers=M, References=R, Frames=F ),
    role_hits(Hits,A,T,C,M,R,F).

% A nominal in an oblique phrase is a potential anchor, even if its kind is
% also licensed as the direct object of this act.
direct_target(Q, Act, PS-PE, S-E, DetStart) :-
    ( E =< PS ; S >= PE ),
    \+ reference_hit(Q, S-E),
    \+ ( marker(Q, Act, M-N, Role, _, Specific), M >= PE, N =< DetStart,
         ( Specific == yes
         ; Role == "spatial",
           ( prior_nominal(Q, Act, PE, M) ; direct_reference(Q, Act, PE, _-R), R =< M ) ) ).

reference_hit(Q, S-E) :- member([S,E,["reference",_,_,_,_],_], Q.referenceHits).

direct_reference(Q, Act, PredicateEnd, S-E) :-
    string_length(Q.text, Limit),
    next_token(Q, PredicateEnd, Limit, S),
    reference_hit(Q, S-E),
    \+ ( reference_hit(Q,S-Longer), Longer > E ),
    \+ ( member([S,E,Det],Q.determiners), next_token(Q,E,Limit,Next),
         following_nominal(Q, Act, Det, Next) ).

following_nominal(Q, Act, _, Next) :-
    member([Nominal,_,["target",Licence,_,_,_,_],_],Q.targetHits),
    Nominal >= Next, (Licence == "*" ; Licence == Act),
    nominal_prefix(Q,Next,Nominal).
% The noun can be declared even when the requested act cannot operate on it.
following_nominal(Q, _, "demonstrative", Next) :-
    member([Nominal,_],Q.nominalHeads), Nominal >= Next,
    nominal_prefix(Q,Next,Nominal).

prior_nominal(Q, Act, From, To) :-
    member([A,B,["target",Licence,_,_,_,_],_], Q.targetHits),
    A >= From, B =< To, (Licence == "*" ; Licence == Act), !.

marker(Q, Act, M-N, Role, Relation, Specific) :-
    member([M,N,["marker",Licence,Role,Relation,_],_], Q.markerHits),
    ( Licence == Act -> Specific = yes
    ; Licence == "*", Specific = no,
      \+ member([M,N,["marker",Act,_,_,_],_], Q.markerHits) ),
    \+ ( member([A,B,["marker",Longer,_,_,_],_], Q.markerHits),
         (Longer == "*" ; Longer == Act), A =< M, B >= N, B-A > N-M ).

% Marker spans determine where direct value attachment stops. Ground the
% anchor only when there is a nominal reading, keeping its descriptive words
% as evidence for the page lookup.
% A preposed destination must end at the comma and the affected nominal
% must finish the command. Both spans use offsets in the original utterance.
attached_roles(Q, Act, _, Mode, End, Wires, Bounds, Bounds, Fit, Next) :-
    get_dict(frontedDestination,Q,Clause), !,
    memberchk(Act,Clause.acts),
    forall((member([Key,_,Start,_],Q.tokens), Start>=End), memberchk(Key,[".","!"])),
    marker(Q,Act,M-N,Role,Relation,_), memberchk(Role,["place","spatial"]), Relation \== "",
    findall(Key,(member([Key,_,_,Finish],Q.tokens), Finish=<M),Prefix),
    ( Prefix=[] ; memberchk(Prefix,Clause.modifiers) ),
    nominal_anchor(Q,N,Clause.comma,_,AnchorEnd), AnchorEnd=:=Clause.anchorEnd,
    attachment(Q,Act,Mode,M-N,Clause.comma,none,Wires,Bounds,_,Fit,1,Next),
    Wires=[_,_].
attached_roles(Q, Act, Family, Mode, End, Wires, Bounds, Blocked, Bonus, FirstConstraint) :-
    scope_limit(Q,Limit),
    ( attached_cache(Act-Family-Limit,Mode,End,Options) -> true
    ; findall(Option, candidate_attachment(Q,Act,Family,Mode,End,Option), Options),
      assertz(attached_cache(Act-Family-Limit,Mode,End,Options)) ),
    member(attachment(Wires,Bounds,Blocked,Bonus,FirstConstraint),Options).

candidate_attachment(Q,Act,Family,Mode,End,attachment(Wires,Bounds,Blocked,Bonus,FirstConstraint)) :-
    ( Q.allowConstraints == true ->
      findall(M-N, (marker(Q,Act,M-N,_,_,_), M >= End,
                     scope_limit(Q,Limit), N =< Limit,
                     \+ tuple_marker(Q,Act,Family,M-N)), Raw),
      sort(Raw, Markers),
      % Keep the preferred reading and one alternate per genuinely
      % ambiguous attachment, without forming every combination of phases.
      ( Override = none
      ; Mode \== "new",
        member(Override,Markers),
        marker(Q,Act,Override,_,Relation,yes), Relation \== "" ),
      attachments(Markers,Q,Act,Mode,Override,Wires,Bounds,Blocked,Bonus,1,FirstConstraint)
    ; Wires=[], Bounds=[], Blocked=[], Bonus=0, FirstConstraint=1 ).

scope_limit(Q,Limit) :-
    ( get_dict(scopeEnd,Q,Limit) -> true ; string_length(Q.text,Limit) ).

tuple_marker(Q, Act, Family, M-N) :-
    member([S,E,["constraint",Act,Family,Bodies,_],_], Q.constraintHits),
    is_list(Bodies), S =< M, E >= N.

attachments([], _, _, _, _, [], [], [], 0, I, I).
attachments([M-N|Rest], Q, Act, Mode, Override, Wires, Bounds, Blocked, Bonus, I, Count) :-
    ( Rest = [Limit-_|_] -> true ; scope_limit(Q,Limit) ),
    attachment(Q,Act,Mode,M-N,Limit,Override,Here,Used,Block,Fit,I,Next),
    append(Here,Later,Wires), append(Used,LaterBounds,Bounds), append(Block,LaterBlocked,Blocked),
    attachments(Rest,Q,Act,Mode,Override,Later,LaterBounds,LaterBlocked,TailFit,Next,Count),
    Bonus is Fit + TailFit.

attachment(Q, Act, Mode, M-N, Limit, Override, Wires, Used, Blocked, Fit, I, Next) :-
    ( once((marker(Q,Act,M-N,_,Relation,Specific), Relation \== "")),
      nominal_anchor(Q,N,Limit,Start,End) ->
      ( Act == "ask" -> Override == none, Phase = "selector", Fit = 2
      ; spatial_phase(Mode,Specific,M-N,Override,Phase,Fit) ),
      text_span(Q.text,Start,End,Anchor), text_span(Q.text,M,End,Words),
      atom_json_term(EncodedAnchor,Anchor,[as(string)]), atom_json_term(EncodedWords,Words,[as(string)]),
      atom_json_term(EncodedRelation,Relation,[as(string)]),
      format(string(Constraint),'@r1.c~d w.request.constraint request=$r1 on=place operator=relation phase=~s relation=~s value=~s words=~s',
             [I,Phase,EncodedRelation,EncodedAnchor,EncodedWords]),
      format(string(Lookup),'@r1.a~d w.request.lookup request=$r1 constraint=$r1.c~d key=thing from=page',[I,I]),
      Wires = [Constraint,Lookup], Used = [M-End], Blocked = Used, Next is I+1
    ; Override \== M-N,
      ( marker(Q,Act,M-N,"value",_,yes) -> Blocked = [] ; Blocked = [M-Limit] ),
      Wires = [], Used = [], Fit = 0, Next = I ).

nominal_anchor(Q, From, Limit, Start, End) :-
    ( anchor_cache(From,Limit,Anchor) -> true
    ; ( find_nominal_anchor(Q,From,Limit,A,B) -> Anchor = A-B ; Anchor = none ),
      assertz(anchor_cache(From,Limit,Anchor)) ),
    Anchor = Start-End.

find_nominal_anchor(Q, From, Limit, Start, End) :-
    member([_,_,Start,_], Q.tokens), Start >= From, !,
    findall(E, (member([S,E,["target",_,_,_,_,_],_], Q.targetHits), S >= Start, E =< Limit,
                nominal_prefix(Q, Start, S)), Ends),
    sort(Ends, Sorted), last(Sorted, End).

nominal_prefix(Q, Start, End) :- reachable_prefix(Q, nominal, [Start], End).
native_nominal_prefix(Q, Act, Family, Start, End) :-
    reachable_prefix(Q, native_nominal(Act,Family), [Start], End).

% Offsets strictly increase. Visit the smallest pending offset once and
% collapse duplicate edges from overlapping world bindings and ambiguous word senses.
reachable_prefix(_, _, [End|_], End) :- !.
reachable_prefix(Q, Scope, [Start|Pending], End) :-
    findall(Next, (modifier_end(Q,Scope,Start,F), next_token(Q,F,End,Next), Next > Start), Edges),
    sort(Edges, Unique),
    ord_union(Pending, Unique, Frontier),
    reachable_prefix(Q,Scope,Frontier,End).

modifier_end(Q, nominal, Start, End) :-
    ( member([Start,End,_], Q.determiners)
    ; member([Start,End,["constraint",_,_,Body,_],_], Q.constraintHits), string(Body) ).
modifier_end(Q, native_nominal(Act,Family), Start, End) :-
    ( member([Start,End,_], Q.determiners)
    ; modifier_end(Q, family(Act,Family), Start, End)
    ; get_dict(splitPredicate,Q,_), member([Start,End],Q.splitNumbers) ).
modifier_end(Q, family(Act,Family), Start, End) :-
    member([Start,End,["constraint",Licence,Family,Body,_],_], Q.constraintHits), string(Body),
    ( Licence == "*" ; Licence == Act ).

next_token(Q, From, Limit, Start) :-
    member([_,_,Start,_],Q.tokens), Start >= From, !,
    Start =< Limit.

target_determiner(Q, Act, Family, Target, PS-PE, Start-Det) :-
    findall(S-D, (member([S,E,D],Q.determiners), (E =< PS ; S >= PE),
                  next_token(Q,E,Target,Next), modifier_scope(Q,Act,Family,Next,Target)), Dets),
    ( sort(Dets, Sorted), last(Sorted, Start-Det) -> true ; Start = Target, Det = "" ).

modifier_scope(Q, Act, Family, Start, End) :-
    reachable_prefix(Q, family(Act,Family), [Start], End).

spatial_phase("new", _, _, _, "result", 2).
spatial_phase(Mode, Specific, Marker, Override, Phase, Fit) :-
    Mode \== "new",
    ( Marker == Override -> Phase = "selector", Fit = 0
    ; Specific == yes -> Phase = "result", Fit = 2
    ; Phase = "selector", Fit = 2 ).

constraint_phase(Q, Act, Family, Mode, TS-TE, S-E, Body, PhaseBody) :-
    ( E =< TS ->
      next_token(Q,E,TS,Next), once(modifier_scope(Q,Act,Family,Next,TS)),
      ( Mode == "new" -> Phase = "result" ; Phase = "selector" )
    ; S >= TE, Phase = "result" ),
    set_phase(Body,Phase,PhaseBody).

set_phase(Body,Phase,PhaseBody) :-
    % Ignore any appearance of phase= within a quoted attribute value.
    Pattern = "^(?<prefix>(?:[^\" ]|\"(?:[^\"\\\\]|\\\\.)*\"| (?!phase=))*) phase=(?:selector|result)(?<suffix>.*)$",
    ( re_matchsub(Pattern,Body,Parts,[]) ->
      format(string(PhaseBody),'~s phase=~s~s',[Parts.prefix,Phase,Parts.suffix])
    ; format(string(PhaseBody),'~s phase=~s',[Body,Phase]) ).

role_fit(Q, Act, PS-PE, Mode, Det, TE, ValueBounds, Bonus) :-
    ( member([PS,PE,["frame",Act,"value",_,_],_],Q.frameHits) ->
      ( member(S-_,ValueBounds), S >= TE -> Bonus = 3 ; Bonus = -3 )
    ; Mode == "new", memberchk(Det,["definite","possessive","demonstrative"]) -> Bonus = -2
    ; Bonus = 0 ).

text_span(Text,S,E,Value) :- Length is E-S, sub_string(Text,S,Length,_,Value).
