:- module(dependency_normalization,[normalize_dependencies/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).

% Dependency labels are hypotheses. Only a structurally and lexically
% licensed repair changes a head or role. Original token spans do not change.
normalize_dependencies(Q,Normalized) :-
    maplist(normalize(Q),Q.tokens,Tokens),
    Normalized=Q.put(tokens,Tokens).

normalize(Q,T,Normalized) :-
    ( repair(Q,T,Properties) -> Normalized=T.put(Properties)
    ; Normalized=T ).

child(Q,T,C) :- member(C,Q.tokens), C.head=:=T.i,C.i=\=T.i.
token(Q,I,T) :- nth0(I,Q.tokens,T).
previous(Q,T,P) :- I is T.i-1,token(Q,I,P).
next(Q,T,N) :- I is T.i+1,token(Q,I,N).
surface(T,Lower) :- string_lower(T.text,Lower).

repair(Q,T,Properties) :-
    memberchk(T.dep,["amod","advmod"]), memberchk(T.tag,["JJR","JJS","RBR","RBS"]),
    token(Q,T.head,Noun),Noun.i<T.i,
    object_scope(Q,Noun,Matrix),
    memberchk(Matrix.lemma,["make","want","set","keep","leave","render","paint","turn"]),
    \+ postmodifier_follower(Q,T),
    Properties=_{head:Matrix.i,dep:"oprd"}, !.
repair(Q,T,Properties) :-
    memberchk(T.dep,["appos","npadvmod"]),memberchk(T.lemma,["px","pixel","step","space","inch","foot","meter","metre",
      "millimeter","millimetre","centimeter","centimetre"]),
    child(Q,T,Number),Number.dep=="nummod",Number.i<T.i,
    token(Q,T.head,Head),
    ( T.dep=="appos" -> Head.i<Number.i,Head.dep=="dobj",token(Q,Head.head,Matrix)
    ; Matrix=Head ),
    memberchk(Matrix.lemma,["move","shift","slide","offset","push","pull","raise","lower"]),
    Properties=_{head:Matrix.i,dep:"measure"}, !.
repair(Q,T,Properties) :-
    T.dep=="acl",T.tag=="VBG",T.lemma=="face",
    token(Q,T.head,Landmark),Landmark.dep=="pobj",
    token(Q,Landmark.head,Preposition),memberchk(Preposition.lemma,["along","under","behind","beside","near","against"]),
    token(Q,Preposition.head,Reduced),Reduced.dep=="acl",
    memberchk(Reduced.lemma,["line","stand","sit","lie","arrange","place"]),
    token(Q,Reduced.head,Antecedent), Properties=_{head:Antecedent.i,dep:"acl"}, !.
repair(Q,T,Properties) :-
    keyboard_command(Q,Verb,Key),
    ( T.i=:=Verb.i -> Properties=_{head:Verb.i,dep:"ROOT",pos:"VERB",tag:"VB",lemma:Verb.lemma}
    ; T.i=:=Key.i -> Properties=_{head:Verb.i,dep:"dobj",pos:"PROPN"}
    ; T.head=:=Key.i,T.dep=="prep" -> Properties=_{head:Verb.i} ), !.
repair(Q,T,Properties) :-
    measured_coordination(Q,First,Value,Conjunction,Second,Of),
    ( T.i=:=Conjunction.i -> Properties=_{head:First.i}
    ; T.i=:=Second.i -> Properties=_{head:First.i}
    ; T.i=:=Of.i,T.head=:=Value.i -> Properties=_{head:Second.i} ), !.

object_scope(Q,T,Matrix) :-
    T.dep=="dobj",token(Q,T.head,Matrix), !.
object_scope(Q,T,Matrix) :-
    T.dep=="pobj",token(Q,T.head,Prep),Prep.lemma=="on",
    token(Q,Prep.head,Object),Object.dep=="dobj",token(Q,Object.head,Matrix).

postmodifier_follower(Q,T) :-
    next(Q,T,N),memberchk(N.pos,["NOUN","PROPN"]),N.head=:=T.head.

keyboard_command(Q,Verb,Key) :-
    member(Key,Q.tokens),Key.dep=="ROOT",memberchk(Key.pos,["NOUN","PROPN","VERB"]),
    surface(Key,Text),
    memberchk(Text,["backspace","cancel","delete","enter","escape","home","insert","return","save","submit","tab","undo","redo"]),
    previous(Q,Key,Verb),memberchk(Verb.dep,["compound","nsubj"]),Verb.head=:=Key.i,
    surface(Verb,VerbWord),memberchk(VerbWord,["press","click","tap","hit"]),
    ( Verb.i=:=0 ; previous(Q,Verb,Polite),surface(Polite,"please") ), !.

measured_coordination(Q,First,Value,Conjunction,Second,Of) :-
    member(First,Q.tokens), dimension(First),
    child(Q,First,From),surface(From,"of"),
    child(Q,From,Value),Value.pos=="NUM",
    next(Q,Value,Conjunction),surface(Conjunction,"and"),Conjunction.dep=="cc",
    next(Q,Conjunction,Second),dimension(Second),Second.dep=="conj",Second.head=:=Value.i,
    next(Q,Second,Of),surface(Of,"of"),
    child(Q,Of,Target),Target.pos=="NUM", !.

dimension(T) :-
    memberchk(T.lemma,["height","width","length","depth","radius","diameter","spacing","size","duration"]).
