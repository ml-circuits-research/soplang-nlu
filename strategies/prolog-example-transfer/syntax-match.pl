:- use_module(library(lists)).
:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(library(solution_sequences)).
:- initialization(main, main).

% Unifies the words of one message with templates. A template is a list of literal words
% and slots. A word comes as [Lower, Kind, Quote]: Kind is "number", "quoted", "name" or
% "word". The answer names each template that takes every word, with the words of each
% pattern element as [First, Next).
main :-
    read_line_to_string(user_input, Line),
    ( Line == end_of_file -> true
    ; atom_json_dict(Line, Query, []),
      findnsols(8, Match, matching_template(Query, Match), Matches), !,
      json_write_dict(current_output, Matches, [width(0)]),
      nl, flush_output,
      main ).

matching_template(Query, _{index:Index, bounds:Bounds}) :-
    member(Template, Query.templates),
    Index = Template.index,
    call_with_inference_limit(
        ( match_pattern(Template.pattern, Query.words, 0, Found) -> Outcome = found(Found) ; Outcome = none ),
        100000, Result),
    Result \== inference_limit_exceeded,
    Outcome = found(Bounds).

match_pattern([], [], _, []).
match_pattern([Literal|Pattern], [[Literal,_,_]|Words], Index, [[Index,Next]|Bounds]) :-
    string(Literal), !,
    Next is Index + 1,
    match_pattern(Pattern, Words, Next, Bounds).
match_pattern([Slot|Pattern], Words, Index, [[Index,Next]|Bounds]) :-
    is_dict(Slot),
    length(Words, Remaining), length(Pattern, MinimumTail),
    Limit is min(Slot.max, Remaining - MinimumTail),
    between(Slot.min, Limit, Width),
    length(Captured, Width), append(Captured, Tail, Words),
    fills(Slot.kind, Captured, Tail),
    Next is Index + Width,
    match_pattern(Pattern, Tail, Next, Bounds).

% A slot takes words of its own kind only. A quotation is taken whole.
fills("number", [[_,"number",_]], _).
fills("name", Captured, _) :- forall(member([_,Kind,_], Captured), Kind == "name").
fills("quoted", Captured, Tail) :-
    Captured = [[_,"quoted",Quote]|_],
    forall(member([_,Kind,Q], Captured), ( Kind == "quoted", Q == Quote )),
    \+ Tail = [[_,"quoted",Quote]|_].
