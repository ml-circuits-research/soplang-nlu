:- module(set_exclusion, [exclusion_plans/2]).

% The ranges index original tokens. The JS bridge slices those spans without
% moving words around, so evidence for a fronted exception stays at the front.
exclusion_plans(Packet, Plans) :-
    findall(Plan,
            (member(Rule, Packet.rules), member(Marker, Rule.markers),
             append(Prefix, Rest, Packet.tokens), append(Marker, Tail, Rest),
             length(Prefix, Start), length(Marker, Size), After is Start+Size,
             clause_ranges(Rule.order, Prefix, Tail, After, Main, ExceptEnd),
             Plan=_{rule:Rule.index,main:Main,start:Start,after:After,end:ExceptEnd}),
            Raw),
    sort(Raw, Plans).

clause_ranges("after", Prefix, Tail, After, [0,Stop], End) :-
    Prefix=[_|_], Tail=[_|_],
    ( append(Main,[","],Prefix) -> true ; Main=Prefix ),
    length(Main,Stop), Stop>0, length(Tail,N), End is After+N.
clause_ranges("before", [], Tail, After, [Start,End], ExceptEnd) :-
    append(Operand,[","|Main],Tail), Operand=[_|_], Main=[_|_],
    \+ memberchk(",",Operand), length(Operand,N),
    ExceptEnd is After+N, Start is ExceptEnd+1, length(Main,M), End is Start+M.
