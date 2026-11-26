:- module(member_actions, [member_actions/2]).
:- use_module(library(lists)).
:- use_module(library(solution_sequences)).

member_actions(Query, Proofs) :-
    ( get_dict(memberActions, Query, Frames) ->
        findall(Proof,
            ( member(Frame, Frames),
              once(findnsols(2, Members, distinct(Members, frame_members(Frame, Members)), Answers)),
              Answers = [List],
              Base = _{family:Frame.family, act:Frame.act, mode:Frame.mode, key:Frame.key,
                       phase:Frame.phase, predicate:Frame.predicate, members:List},
              include_frame_field(noun, Frame, Base, WithNoun),
              include_frame_field(effectKey, Frame, WithNoun, WithEffect),
              include_frame_field(adjunct, Frame, WithEffect, Proof)
            ), Proofs)
    ; Proofs = [] ).

include_frame_field(Key, Frame, In, Out) :-
    ( get_dict(Key, Frame, Value) -> put_dict(Key, In, Value, Out) ; In = Out ).

frame_members(Frame, Members) :-
    named_member(Frame.input, Rest, First),
    separator(Frame.separators, Rest, Next),
    member_list(Next, Frame.separators, Frame.suffixes, Tail, 7),
    Members = [First|Tail],
    maplist(string_lower, Members, Lower),
    sort(Lower, Unique), same_length(Unique, Lower).

member_list(Input, Separators, Suffixes, [Name|Tail], Remaining) :-
    Remaining > 0,
    named_member(Input, Rest, Name),
    ( Tail = [], suffix(Suffixes, Rest)
    ; separator(Separators, Rest, Next),
      More is Remaining - 1,
      member_list(Next, Separators, Suffixes, Tail, More)
    ).

named_member([[_, Text, "solo"|_]|Rest], Rest, Text).
named_member([[_, First, "word"|_]|Input], Rest, Name) :-
    member_words(Input, Rest, First, Name, 4).

member_words(Rest, Rest, Name, Name, _).
member_words([[_, Word, "word", Gap|_]|Input], Rest, Prefix, Name, Remaining) :-
    Remaining > 0,
    string_concat(Prefix, Gap, Start),
    string_concat(Start, Word, Joined),
    More is Remaining - 1,
    member_words(Input, Rest, Joined, Name, More).

separator(Forms, Tokens, Rest) :-
    member(Form, Forms),
    eat(Form, Tokens, Rest).

suffix(_, []).
suffix(Forms, Tokens) :-
    member(Form, Forms),
    eat(Form, Tokens, []).

eat([], Tokens, Tokens).
eat([Key|Keys], [[Key, _, "", _|_]|Input], Rest) :-
    eat(Keys, Input, Rest).
