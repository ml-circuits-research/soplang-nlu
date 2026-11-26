:- module(coordinated_effects,[coordinated_effects/2]).
:- use_module(library(lists)).

coordinated_effects(Q,Proofs) :-
    ( get_dict(coordinatedEffects,Q,Packet) ->
      findall(Proof,(member(Frame,Packet.frames),
        parts(Frame,Packet,0,End,Family,Owner,Predicate,Lead,Effects,[]),
        length(Packet.keys,End),distinct_properties(Effects),
        Base=_{family:Family,owner:Owner,effects:Effects},
        (var(Predicate) -> WithPredicate=Base ; WithPredicate=Base.put(predicate,Predicate)),
        (var(Lead) -> Proof=WithPredicate ; Proof=WithPredicate.put(lead,Lead))),Raw),
      sort(Raw,Proofs)
    ; Proofs=[] ).

distinct_properties(Effects) :-
    Effects=[_,_|_], findall(Key,member([_,_,Key,_],Effects),Keys),
    sort(Keys,Unique),same_length(Keys,Unique).

parts([],_,End,End,_,_,_,_,Tail,Tail).
parts([Role|More],P,At,End,F,O,Predicate,Lead,Effects,Tail) :-
    ( is_list(Role) -> append(Prefix,Rest,P.keys),length(Prefix,At),append(Role,_,Rest),
      length(Role,N),Next is At+N,Effects=After
    ; Role=="bundle" -> between(2,5,Count),bundle(P,At,Next,F,Count,Effects,After)
    ; member([At,Next,Role,Family,Key,Value],P.events),
      ( Role=="owner" -> F=Family,O=[At,Next],Effects=After
      ; Role=="assignment" -> Predicate=[At,Next],Effects=After
      ; Role=="lead" -> Lead=[At,Next],Effects=After
      ; memberchk(Role,["join","article"]) -> Effects=After
      ; F=Family,Effects=[[At,Next,Key,Value]|After] ) ),
    parts(More,P,Next,End,F,O,Predicate,Lead,After,Tail).

bundle(_,At,At,_,0,Tail,Tail).
bundle(P,At,End,F,Count,[[At,Next,Key,Value]|More],Tail) :-
    Count>0,
    member([At,Next,"declared_effect",F,Key,Value],P.events),
    Remaining is Count-1,
    (Following=Next ; Remaining>0,member([Next,Following,"bundle_join",_,_,_],P.events)),
    bundle(P,Following,End,F,Remaining,More,Tail).
