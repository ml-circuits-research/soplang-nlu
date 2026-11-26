:- use_module(library(lists)).
:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(library(pcre)).
:- use_module(library(solution_sequences)).
:- initialization(main, main).

main :-
    read_line_to_string(user_input, Line),
    ( Line == end_of_file -> true
    ; atom_json_dict(Line, Query, []),
      findnsols(96, Match, matching_template(Query, Match), Matches), !,
      json_write_dict(current_output, Matches, [width(0)]),
      nl, flush_output,
      main ).

matching_template(Query, _{index:Index, bounds:Bounds}) :-
    member(Template, Query.templates),
    Index = Template.index,
    call_with_inference_limit(
        findnsols(12, CandidateBounds, match_pattern(Template.pattern, Query.tokens, Query.text, 0, CandidateBounds), Matches),
        100000, Result),
    Result \== inference_limit_exceeded,
    member(Bounds, Matches).

match_pattern([], [], _, _, []).
match_pattern([Literal|Pattern], [[Literal,_,_,_]|Tokens], Text, Index, [[Index,Next]|Bounds]) :-
    string(Literal), !,
    Next is Index + 1,
    match_pattern(Pattern, Tokens, Text, Next, Bounds).
match_pattern([Slot|Pattern], Tokens, Text, Index, [[Index,Next]|Bounds]) :-
    is_dict(Slot),
    length(Tokens, Remaining),
    length(Pattern, MinimumTail),
    Limit is min(Slot.max, Remaining - MinimumTail),
    between(Slot.min, Limit, Width),
    length(Captured, Width),
    append(Captured, Tail, Tokens),
    Captured = [[_,_,Start,_]|_],
    last(Captured, [_,_,_,End]),
    Length is End - Start,
    sub_string(Text, Start, Length, _, Value),
    fits(Slot.kind, Value),
    ( get_dict(delimiter, Slot, Delimiter) -> \+ sub_string(Value, _, _, _, Delimiter) ; true ),
    Next is Index + Width,
    match_pattern(Pattern, Tail, Text, Next, Bounds).

fits("number", Text) :- re_match("^[+-]?[0-9]+(?:\\.[0-9]+)?$", Text).
fits("date", Text) :- re_match("^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$", Text).
fits("time", Text) :- re_match("^(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$", Text).
fits("quoted", Text) :- re_match("[\\p{L}\\p{N}]", Text).
fits("phrase", Text) :-
    re_match("^[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N}_'’ -]*$", Text),
    \+ re_match("\\b(?:not|never|without|then|instead|but)\\b"/i, Text).
