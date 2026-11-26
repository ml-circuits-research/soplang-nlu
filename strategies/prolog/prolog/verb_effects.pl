:- module(verb_effects,[verb_effects/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).

% The effect must belong to the same observed act and predicate interval.
verb_effects(Q,Proofs) :-
    ( get_dict(verbEffects,Q,Rows), Rows\=[] ->
      findall([A,B,Act,Family,Key,Op,Value,Words],
        (member([Form,Act,Family,Key,Op,Value],Rows),
         member([A,B,["act",Act,Mood,_],_],Q.hits), memberchk(Mood,["","do"]),
         Len is B-A, sub_string(Q.text,A,Len,_,Words),
         string_lower(Words,Lower), normalize_space(string(Form),Lower)), Matches),
      sort(Matches,Unique), maplist(proof,Unique,Proofs)
    ; Proofs=[] ).
proof([_,_,Act,F,K,Op,V,W],_{act:Act,family:F,key:K,op:Op,value:V,words:W}).
