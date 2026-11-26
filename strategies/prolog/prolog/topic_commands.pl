:- module(topic_commands,[topic_commands/2]).
:- use_module(library(solution_sequences)).

topic_commands(Q,Proofs) :-
    ( get_dict(topicCommands,Q,Packet), is_dict(Packet) ->
        findall(P,distinct(P,unify_topic(Packet,P)),Proofs)
    ; Proofs=[]
    ).

unify_topic(Packet,_{role:Role,owner:Owner,value:Value}) :-
    member(Owner,Packet.owners),
    Family=Owner.family,
    member(Role,Packet.roles),
    Family=Role.family,
    Owner.act=Role.act,
    member(Value,Packet.values),
    Family=Value.family,
    Role.attribute=Value.attribute,
    Owner.end < Role.start,
    Role.operandStart=Value.start.
