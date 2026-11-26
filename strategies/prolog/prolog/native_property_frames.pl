:- module(native_property_frames,[native_property_frames/2]).
:- use_module(library(lists)).
:- use_module(library(solution_sequences)).

native_property_frames(Q,Proofs) :-
    ( get_dict(nativeProperties,Q,Packet), is_dict(Packet) ->
      findnsols(97,Proof,distinct(Proof,property_frame(Packet,Proof)),Found),
      ( length(Found,N), N=<96 -> Proofs=Found ; Proofs=[] )
    ; Proofs=[] ).

property_frame(Packet,Proof) :-
    member(Frame,Packet.frames),
    length(Packet.words,End),
    walk(Frame.pattern,Packet,0,End,Frame.act,Family,_Key,Roles),
    ( Frame.implicitOwner == true ->
      Owner=_{family:Family,fill:"context",implicit:true}
    ; memberchk("thing"-Owner,Roles) ),
    memberchk("predicate"-Predicate,Roles),
    Base=_{act:Frame.act,frame:Frame.name,owner:Owner,predicate:Predicate},
    ( get_dict(questions,Frame,Questions) ->
      memberchk("attribute"-Attribute,Roles),
      ( Frame.numberOnly == false ; Attribute.numeric == true ),
      Proof=Base.put(_{attribute:Attribute,questionKinds:Questions})
    ; ( Frame.implicitOwner == true ->
        memberchk("context_attribute"-Attribute,Roles), memberchk("context_value"-Value,Roles),
        ( Frame.numberOnly == false ; Value.numeric == true ),
        ( Frame.finiteOnly == false ; Value.closed == true ),
        Assign=Base.put(attribute,Attribute)
      ; memberchk("qualitative"-Value,Roles) -> Assign=Base
      ; memberchk("attribute"-Attribute,Roles), memberchk("value"-Value,Roles),
        ( Frame.numberOnly == false ; Value.numeric == true ),
        Assign=Base.put(attribute,Attribute) ),
      ( Packet.question == false ; memberchk("lead"-_,Roles) ),
      put_dict(value,Assign,Value,Proof) ).

walk([],_,End,End,_,_,_,[]).
walk([Part|Rest],Packet,At,End,Act,Family,Key,Roles) :-
    ( get_dict(role,Part,Role) ->
      event(Role,Packet,At,Act,Family,Key,Event), Next=Event.b, Roles=[Role-Event|Tail]
    ; Part.optional == true, Next=At, Roles=Tail
    ; member(Words,Part.forms), eat(Words,Packet.words,At,Next),
      ( get_dict(mark,Part,Mark) -> Roles=[Mark-[At,Next]|Tail] ; Roles=Tail ) ),
    walk(Rest,Packet,Next,End,Act,Family,Key,Tail).

event("thing",Packet,At,Act,Family,_,Event) :-
    member(Event,Packet.owners), Event.a=:=At, Event.act==Act, Family=Event.family.
event("attribute",Packet,At,_,Family,Key,Event) :-
    member(Event,Packet.attrs), Event.a=:=At, Family=Event.family, Key=Event.key.
event("value",Packet,At,_,Family,Key,Event) :-
    member(Event,Packet.values), Event.a=:=At, Family=Event.family, Key=Event.key.
event("qualitative",Packet,At,_,Family,Key,Event) :-
    member(Event,Packet.qualitative), Event.a=:=At, Family=Event.family, Key=Event.key.
event("context_attribute",Packet,At,_,Family,Key,Event) :-
    member(Event,Packet.contextAttrs), Event.a=:=At, Family=Event.family, Key=Event.key.
event("context_value",Packet,At,_,Family,Key,Event) :-
    member(Event,Packet.contextValues), Event.a=:=At, Family=Event.family, Key=Event.key.

eat([],_,At,At).
eat([Word|Rest],Input,At,End) :-
    nth0(At,Input,Word), Next is At+1, eat(Rest,Input,Next,End).
