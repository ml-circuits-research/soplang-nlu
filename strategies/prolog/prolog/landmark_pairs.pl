:- module(landmark_pairs, [landmark_pair_plans/2]).

landmark_pair_plans(Packet, Plans) :-
    findall(Plan, landmark_pair_plan(Packet, Plan), Raw),
    sort(Raw, Plans).

landmark_pair_plan(Packet, _{head:[0,Start],marker:[Start,FirstStart],
                             first:[FirstStart,FirstEnd],second:[SecondStart,End],mode:Mode}) :-
    member([Marker,Mode,Joiner], Packet.markers),
    append(Head, Rest, Packet.tokens), Head=[_|_],
    append(Marker, Tail, Rest),
    \+ ( member([Long,_,Joiner], Packet.markers), append(Extra,Marker,Long), Extra=[_|_],
         append(_,Extra,Head) ),
    append(First,[Joiner|Second],Tail),
    nominal(First,Packet.blocked), nominal(Second,Packet.blocked),
    length(Head,Start), length(Marker,Width), FirstStart is Start+Width,
    length(First,N), FirstEnd is FirstStart+N, SecondStart is FirstEnd+1,
    length(Second,M), End is SecondStart+M.

nominal(Words,Blocked) :-
    length(Words,N), N>=1, N=<8,
    \+ (member(Word,Words), memberchk(Word,Blocked)).
