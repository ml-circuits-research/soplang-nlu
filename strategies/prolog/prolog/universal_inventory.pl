:- module(universal_inventory, [universal_inventory_plans/2]).

universal_inventory_plans(Q, Plans) :-
    ( get_dict(universalInventory, Q, Inventory) ->
      findall(Plan, universal_plan(Q, Inventory, Plan), Raw),
      sort(Raw, Plans)
    ; Plans=[] ).

universal_plan(Q, Inventory, _{actHit:ActHit,targetHit:TargetHit,requiresResult:RequiresResult}) :-
    Q.tokens = [[_,_,First,_]|_],
    member(ActHit, Q.actHits),
    ActHit=[First,PredicateEnd,["act",Act,Mood,_],_],
    memberchk(Mood,["","do","propose"]),
    memberchk([First,PredicateEnd,Act], Inventory.predicates),
    member([WS,WE,Intent,_], Q.scopes),
    memberchk(Intent,["action","proposal"]),
    First >= WS, PredicateEnd < WE,
    drop_predicate(Q.tokens, PredicateEnd, Tail),
    member([Form,Number], Inventory.forms),
    phrase(quantified_nominal(Form, Inventory.nouns, Number, Act, TargetHit), Tail, Rest),
    TargetHit=[_,End,["target",_,Family,_,_,_],_],
    End =< WE,
    \+ contains_exclusion(Inventory.exclusions, Rest),
    nominal_boundary(Q, Act, Rest),
    ( memberchk([Family,Act], Inventory.resultActions) -> RequiresResult=true ; RequiresResult=false ).

contains_exclusion(Forms, Tokens) :-
    append(_, Tail, Tokens),
    member(Form, Forms),
    phrase(words(Form), Tail, _).

drop_predicate([[_,_,_,End]|Rest], End, Rest) :- !.
drop_predicate([[_,_,_,After]|Rest], End, Tail) :-
    After < End,
    drop_predicate(Rest, End, Tail).

quantified_nominal(Form, Nouns, Number, Act, Target) -->
    words(Form),
    inventory_noun(Nouns, Number, Act, Target).

words([]) --> [].
words([Key|Keys]) --> [[Key,_,_,_]], words(Keys).

inventory_noun(Nouns, Number, Act, Target) -->
    [[_,_,Start,After]],
    { member([Number,Target],Nouns),
      Target=[Start,End,["target",Act,_,"existing",_,_],_],
      End >= After },
    noun_tail(After, End).

noun_tail(End, End) --> [].
noun_tail(After, End) -->
    { After < End },
    [[_,_,_,Next]],
    { Next =< End },
    noun_tail(Next, End).

nominal_boundary(_, _, []).
nominal_boundary(_, _, [[Key,_,_,_]]) :- memberchk(Key, [".","!"]).
nominal_boundary(Q, Act, [[_,_,Start,_]|_]) :-
    ( member([Start,_,["marker",Licence,Role,_,_],_], Q.markerHits),
      memberchk(Licence, ["*",Act]),
      memberchk(Role, ["source","spatial","place","value"])
    ; member([Start,_,["constraint",Licence,_,_,_],_], Q.constraintHits),
      memberchk(Licence, ["*",Act]) ).
