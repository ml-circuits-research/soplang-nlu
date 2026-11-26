:- module(properties, [property_constraints/2]).
:- use_module(library(apply)).
:- use_module(library(http/json)).
:- use_module(library(lists)).
:- use_module(library(pcre)).

property_constraints(Q, Hits) :-
    ( get_dict(allowConstraints, Q, true), get_dict(properties, Q, Labels) ->
        findall(Hit, (member(Label, Labels), property_hit(Q.text, Label, Hit)), Hits)
    ; Hits = [] ).

property_hit(Text, [Start, KeyEnd, Property],
             [Start, End, ["constraint", Act, Family, Bodies, 0], 0]) :-
    Property.kind == "tuple", !,
    Act = Property.act, Family = Property.family,
    property_outside_quotes(Text, Start),
    KeyLength is KeyEnd - Start,
    sub_string(Text, Start, KeyLength, _, KeyWords),
    ( get_dict(assignments, Property, Assignments) ->
        End = Property.end,
        maplist(labelled_numeric_body(KeyWords), Property.keys, Assignments, Bodies)
    ; sub_string(Text, KeyEnd, _, 0, Suffix),
      property_prefix(Suffix, PrefixLength, Tail),
      tuple_values(Tail, Length, First, Second),
      End is KeyEnd + PrefixLength + Length,
      maplist(numeric_body(KeyWords), Property.keys, [First,Second], Bodies) ).

property_hit(Text, [CueStart, End, Property],
             [Start, End, ["constraint", "*", Family, Body, 0], 0]) :-
    Property.kind == "postfix_number", !,
    Family = Property.family,
    property_outside_quotes(Text, CueStart),
    sub_string(Text, 0, CueStart, _, Prefix),
    % Anchor the complete number. Never take a suffix of a date, ID or decimal.
    re_matchsub("(?:^|[ \\t(])(?<whole>(?<value>[+-]?[0-9]+(?:\\.[0-9]+)?)[ \\t]+)$", Prefix, Groups, []),
    string_length(Groups.whole, Length), Start is CueStart - Length,
    CueLength is End - CueStart, sub_string(Text,CueStart,CueLength,_,Cue),
    numeric_body(Cue,Property.attribute,Groups.value,Base),
    ( get_dict(unit,Property,Unit) ->
        maplist(property_quote,[Unit,Groups.value],[EncodedUnit,Amount]),
        format(string(Body),'~s unit=~s measure_words=~s',[Base,EncodedUnit,Amount])
    ; Body=Base ).

property_hit(Text, [Start, KeyEnd, Property],
             [Start, End, ["constraint", "*", Family, Body, 0], 0]) :-
    Family = Property.family,
    property_outside_quotes(Text, Start),
    KeyLength is KeyEnd - Start,
    sub_string(Text, Start, KeyLength, _, KeyWords),
    sub_string(Text, KeyEnd, _, 0, Suffix),
    property_value(Property.kind, Suffix, Consumed, Value, Words),
    End is KeyEnd + Consumed,
    maplist(property_quote, [Property.attribute, Value, KeyWords], [Attribute, Encoded, KeyEvidence]),
    ( Words == Value -> Evidence = ""
    ; property_quote(Words, ValueEvidence), format(string(Evidence), ' words=~s', [ValueEvidence]) ),
    format(string(Body),
           'on=attribute attribute=~s value=~s operator=eq phase=result key_words=~s~s',
           [Attribute, Encoded, KeyEvidence, Evidence]).

tuple_values(Tail, Length, First, Second) :-
    Number = "[+-]?[0-9]+(?:\\.[0-9]+)?",
    format(string(Pair), '(?<first>~s)[ \\t]*,[ \\t]*(?<second>~s)', [Number,Number]),
    % A third number after a comma or conjunction makes this a list.
    Boundary = "(?=$|[ \\t;!?]|[,.](?=$|[ \\t]))(?![ \\t]*(?:,[ \\t]*(?:and[ \\t]+)?|and[ \\t]+)(?:\\([ \\t]*)?[+-]?[0-9])",
    ( sub_string(Tail,0,1,_,"(") ->
      format(string(Pattern), '^(?<whole>\\([ \\t]*~s[ \\t]*\\))~s', [Pair,Boundary])
    ; format(string(Pattern), '^(?<whole>~s)~s', [Pair,Boundary]) ),
    re_matchsub(Pattern,Tail,Groups,[]),
    string_length(Groups.whole,Length), First=Groups.first, Second=Groups.second.

numeric_body(KeyWords, Key, Value, Body) :-
    maplist(property_quote, [Key, Value, KeyWords], [Attribute, Encoded, Cue]),
    format(string(Body), 'on=attribute attribute=~s value=~s operator=eq phase=result key_words=~s',
           [Attribute,Encoded,Cue]).

labelled_numeric_body(Cue, Key, [Label,Value], Body) :-
    numeric_body(Cue, Key, Value, Base),
    property_quote(Label, Encoded),
    format(string(Body), '~s key_words=~s', [Base,Encoded]).

property_value("number", Suffix, Consumed, Value, Value) :-
    property_prefix(Suffix, Start, Tail),
    re_matchsub("^(?<value>[+-]?[0-9]+(?:\\.[0-9]+)?)(?=$|[ \\t;!?\\])}]|[,.](?:[ \\t]|$))",
                Tail, Groups, []),
    Value = Groups.value,
    string_length(Value, Length),
    Consumed is Start + Length.
property_value("quoted", Suffix, Consumed, Value, Words) :-
    property_prefix(Suffix, Start, Tail),
    ( re_matchsub("^(?<value>\"(?:[^\"\\\\\\r\\n]|\\\\.)+\")(?=$|[ \\t;!?.,\\])}])", Tail, Groups, []) ->
        Words = Groups.value,
        atom_string(Json, Words),
        catch(atom_json_term(Json, Value, [value_string_as(string)]), _, fail)
    ; re_matchsub("^(?<whole>“(?<value>[^”\\r\\n]+)”)(?=$|[ \\t;!?.,\\])}])", Tail, Groups, []),
      Words = Groups.whole, Value = Groups.value
    ),
    string_length(Words, Length),
    Consumed is Start + Length.

property_outside_quotes(Text, Start) :-
    sub_string(Text, 0, Start, _, Prefix),
    re_match("^(?:[^\"“”]|\"(?:[^\"\\\\\\r\\n]|\\\\.)*\"|“[^”\\r\\n]*”)*$", Prefix).

% The separator may be whitespace, a colon, or an equals sign on the same line.
property_prefix(Suffix, Length, Tail) :-
    re_matchsub("^(?<separator>[ \\t]*[:=][ \\t]*|[ \\t]+)", Suffix, Groups, []),
    string_length(Groups.separator, Length),
    sub_string(Suffix, Length, _, 0, Tail).

property_quote(Value, Encoded) :-
    atom_json_term(Encoded, Value, [as(string)]).
