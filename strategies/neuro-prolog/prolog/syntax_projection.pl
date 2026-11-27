:- module(syntax_projection,[syntax_wires/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).

% A dependency parse written as the wires of one `syntax` circuit.
% The parser gives every word a head, a relation to it, a part of speech and a tag. Each
% rule below turns one such relation into a place in a clause, a nominal, a relation or a
% coordination. No rule names a noun, an adjective or a kind of message. The only words
% named are function words: "to", "thank", "you" and words said to the listener.
%
% Wires: w(Id,Type,Fields). Fields: q(Key,From,To) quotes the tokens From..To-1,
% ref(Key,Id) points to a wire, a(Key,Value) is a plain value.

syntax_wires(Q,Json) :-
    findall(T,(member(T,Q.tokens),word(T),( T.dep=="ROOT" ; orphan(Q,T) )),Roots),
    maplist(root(Q),Roots,Bank), append(Bank,Wires),
    Wires\==[],
    maplist(json_wire,Wires,Json).

json_wire(w(Id,Type,Fields),[Id,Type,Json]) :- maplist(json_field,Fields,Json).
json_field(q(Key,S,E),[Key,quote,S,E]).
json_field(ref(Key,Id),[Key,ref,Id]).
json_field(a(Key,Value),[Key,atom,Value]).

% ---- tokens
% Every token is a word, except white space and the marks that the schema leaves out.
word(T) :- T.pos\=="SPACE", string_chars(T.text,Chars), \+ forall(member(Ch,Chars),mark_char(Ch)).
mark_char(Ch) :- memberchk(Ch,['.',',',';',':','!','?','(',')','[',']','{','}','"','\'','“','”','‘','’','«','»','—','–','-','…','/','\\']).
verbal(T) :- memberchk(T.pos,["VERB","AUX"]).
nominal_pos(T) :- memberchk(T.pos,["NOUN","PROPN","PRON","NUM","SYM","X"]).
lower(T,L) :- string_lower(T.text,L).
children(Q,T,Cs) :- findall(C,(member(C,Q.tokens),C.head=:=T.i,C.i=\=T.i,word(C)),Cs).
child(Q,T,C) :- member(C,Q.tokens), C.head=:=T.i, C.i=\=T.i, word(C).
leaf(Q,T) :- \+ child(Q,T,_).
id(Letter,T,Id) :- format(atom(Id),'~w~d',[Letter,T.i]).
tq(Key,T,q(Key,S,E)) :- S=T.i, E is S+1.
said_to_listener(T) :- lower(T,L), memberchk(L,["please","pls","thanks","thx","hey","hi","hello","ok","okay","alright","yes","yeah","no","sorry","cheers"]).
subtree(Q,T,[T|Rest]) :- children(Q,T,Cs), maplist(subtree(Q),Cs,Bank), append(Bank,Rest).

% A quotation stands as one nominal, whatever it contains.
quote_pair("\"","\""). quote_pair("“","”"). quote_pair("‘","’"). quote_pair("«","»").
quote_span(Q,T,S,E) :-
    member(Open,Q.tokens), Open.i<T.i, quote_pair(Open.text,Close),
    member(Shut,Q.tokens), Shut.i>T.i, Shut.text==Close,
    \+ ( member(X,Q.tokens), X.i>Open.i, X.i<Shut.i, (X.text==Close ; X.text==Open.text) ),
    S is Open.i+1, E=Shut.i, !.
quote_root(Q,T,S,E) :- quote_span(Q,T,S,E), ( T.head<S ; T.head>=E ; T.head=:=T.i ), !.
inside_quote(Q,T) :- quote_span(Q,T,S,E), \+ ( T.head<S ; T.head>=E ; T.head=:=T.i ).

% A word outside a quotation whose head the parser put inside one: nothing above it is written.
orphan(Q,T) :-
    T.dep\=="ROOT", \+ inside_quote(Q,T), nth0(T.head,Q.tokens,H),
    ( inside_quote(Q,H) ; quote_root(Q,H,S,E), \+ ( T.i>=S, T.i<E ) ), !.

% ---- the roots: one clause for each sentence of the parse
root(Q,T,Wires) :-
    ( inside_quote(Q,T) -> Wires=[]
    ; verbal(T), \+ quote_root(Q,T,_,_), \+ thanks(Q,T) -> node(Q,T,ctx(none,other),_,Wires,_)
    ; id(c,T,Id),
      ( thanks(Q,T) -> subtree(Q,T,Words), maplist(tq(discourse),Words,Fields), Sub=[]
      ; said_to_listener(T), leaf(Q,T) -> tq(discourse,T,F), Fields=[F], Sub=[]
      ; T.pos=="ADP", child(Q,T,O), memberchk(O.dep,["pobj","pcomp"]) ->
          % a phrase with a marker and nothing before it: the relation starts at the part itself
          phrase(Q,Id,clause,T,T.i,Fields,Sub)
      ; memberchk(T.pos,["ADJ","ADV","INTJ","ADP","PART","SCONJ","CCONJ","DET"]), \+ quote_root(Q,T,_,_) ->
          % a part with no verb and no nominal: its words modify nothing but the part itself
          ( T.pos=="INTJ" -> Key=discourse ; Key=modifier ), tq(Key,T,F),
          children(Q,T,Cs), foldl(clause_edge(Q,T,Id),Cs,[F]-[],Fields-Sub)
      ; node(Q,T,ctx(Id,arg),Ref,Sub,Up), Fields=[ref(complement,Ref)|Up] ),
      Wires=[w(Id,clause,[a(form,fragment)|Fields])|Sub] ).

% "thank you" and "thanks" alone are words said to the listener.
thanks(Q,T) :- lower(T,"thank"), children(Q,T,[You]), lower(You,"you"), leaf(Q,You).

% ---- a word with what is joined to it
% node(+Q,+Token,+Context,-Ref,-Wires,-Up). Context: ctx(Clause,Role), the clause the word
% belongs to and its role there (arg, pobj, other). Up: fields for that clause.
node(Q,T,Ctx,Ref,Wires,Up) :-
    ( quote_root(Q,T,S,E) -> id(n,T,Ref), Wires=[w(Ref,nominal,[q(head,S,E)])], Up=[]
    ; joined(Q,T,Members,Words), Members=[_,_|_] ->
        id(k,T,Ref),
        maplist(single(Q,Ctx),Members,Refs,Bank,Ups), append(Bank,Sub), append(Ups,Up),
        findall(ref(conjunct,R),member(R,Refs),Conjuncts),
        maplist(tq(conjunction),Words,Conjunctions),
        append(Conjuncts,Conjunctions,Fields),
        Wires=[w(Ref,coordination,Fields)|Sub]
    ; single(Q,Ctx,T,Ref,Wires,Up) ).

single(Q,Ctx,T,Ref,Wires,Up) :-
    ( verbal(T) -> clause(Q,T,Ref,Wires), Up=[] ; nominal(Q,T,Ctx,Ref,Wires,Up) ).

% Words joined side by side: the word, the words the parser joins to it, and the
% conjunctions between them. Only words of one kind are joined: verbs, or nominals.
joined(Q,T,[T|Rest],Words) :-
    findall(C,(child(Q,T,C),C.dep=="conj",same_kind(T,C),\+ inside_quote(Q,C)),Next),
    maplist(joined_tail(Q),Next,Tails,Bank),
    append(Tails,Rest),
    findall(W,(child(Q,T,C),C.dep=="cc",subtree(Q,C,Sub),member(W,Sub)),Own), append([Own|Bank],Words).
joined_tail(Q,T,Members,Words) :- joined(Q,T,Members,Words).
same_kind(A,B) :- ( verbal(A) -> verbal(B) ; \+ verbal(B) ).
is_joined(Q,T,C) :- C.dep=="conj", same_kind(T,C), \+ inside_quote(Q,C).
joins(Q,T) :- child(Q,T,C), is_joined(Q,T,C), !.

% ---- clauses
clause(Q,T,Id,[w(Id,clause,[a(form,Form),Verb|Fields])|Sub]) :-
    id(c,T,Id), form(Q,T,Form), tq(verb,T,Verb),
    children(Q,T,Cs),
    foldl(clause_edge(Q,T,Id),Cs,[]-[],Fields-Sub).

% The form of a clause, from the form of its verb and from what stands with it.
form(Q,T,Form) :-
    ( nonfinite(Q,T) -> Form=nonfinite
    ; question(Q,T) -> Form=interrogative
    ; subject(Q,T) -> Form=declarative
    ; T.tag=="VB" -> Form=imperative
    ; memberchk(T.tag,["VBG","VBN"]), \+ auxiliary(Q,T,_) -> Form=nonfinite
    ; T.dep=="ROOT", memberchk(T.tag,["VBP","VBD"]), \+ auxiliary(Q,T,_) -> Form=imperative
    ; Form=declarative ).

subject(Q,T) :- child(Q,T,S), memberchk(S.dep,["nsubj","nsubjpass","csubj","csubjpass","expl"]), !.
auxiliary(Q,T,A) :- child(Q,T,A), memberchk(A.dep,["aux","auxpass"]), A.tag\=="TO".
infinitive_marker(Q,T,M) :- child(Q,T,M), M.dep=="aux", M.tag=="TO".
question(Q,T) :-
    ( child(Q,T,S), memberchk(S.dep,["nsubj","nsubjpass","expl"]), auxiliary(Q,T,A), A.i<S.i
    ; T.pos=="AUX", child(Q,T,S), memberchk(S.dep,["nsubj","attr","expl"]), S.i>T.i, \+ ( child(Q,T,B), memberchk(B.dep,["nsubj","expl"]), B.i<T.i )
    ; member(P,Q.tokens), P.head=:=T.i, P.text=="?", memberchk(T.dep,["ROOT","conj"])
    ; child(Q,T,W), memberchk(W.tag,["WDT","WP","WP$","WRB"]), memberchk(T.dep,["ROOT","conj"]) ), !.
% A verb form that cannot make a sentence by itself: after "to", a participle with no
% auxiliary, a base form that depends on another verb, or one that shares the auxiliary
% or the "to" of the verb it is joined to.
nonfinite(Q,T) :-
    ( infinitive_marker(Q,T,_)
    ; memberchk(T.tag,["VBG","VBN"]), \+ auxiliary(Q,T,_), \+ subject(Q,T), T.dep\=="ROOT"
    ; T.tag=="VB", memberchk(T.dep,["xcomp","ccomp","pcomp","acl"]), \+ auxiliary(Q,T,_)
    ; T.tag=="VB", T.dep=="conj", \+ auxiliary(Q,T,_), \+ subject(Q,T),
      nth0(T.head,Q.tokens,H), verbal(H), ( auxiliary(Q,H,_) ; nonfinite(Q,H) ) ), !.

% clause_edge(+Q,+Verb,+ClauseId,+Child,+Fields0-Wires0,-Fields-Wires)
clause_edge(Q,T,Id,C,F0-W0,F-W) :-
    ( inside_quote(Q,C) -> Fs=[], Ws=[]
    ; edge(Q,T,Id,C,Fs,Ws) -> true
    ; rest(Q,Id,clause,C,Fs,Ws) ),
    append(F0,Fs,F), append(W0,Ws,W).

edge(_,T,_,C,Fs,[]) :- memberchk(C.dep,["aux","auxpass"]), !,
    ( C.tag=="TO" -> ( governed(T) -> Fs=[] ; tq(discourse,C,F), Fs=[F] ) ; tq(auxiliary,C,F), Fs=[F] ).
edge(_,_,_,C,[F],[]) :- C.dep=="neg", !, tq(negation,C,F).
edge(Q,T,_,C,Fs,[]) :- C.dep=="mark", !, ( governed(T) -> Fs=[] ; leaf(Q,C), tq(discourse,C,F), Fs=[F] ).
edge(Q,T,_,C,Fs,[]) :- C.dep=="cc", !, ( joins(Q,T) -> Fs=[] ; subtree(Q,C,Words), maplist(tq(discourse),Words,Fs) ).
edge(Q,T,_,C,[],[]) :- is_joined(Q,T,C), !.
edge(Q,_,Id,C,[ref(subject,Ref)|Up],Ws) :-
    memberchk(C.dep,["nsubj","nsubjpass","expl"]), \+ verbal(C), !, node(Q,C,ctx(Id,arg),Ref,Ws,Up).
edge(Q,T,Id,C,[ref(subject,Ref)|Up],Ws) :-
    % "what colour is the castle": after "be" with no subject, the nominal after it is the subject
    C.dep=="attr", T.pos=="AUX", C.i>T.i, \+ subject(Q,T), child(Q,T,W), W.i<T.i, memberchk(W.dep,["attr","dobj","advmod","acomp"]), !,
    node(Q,C,ctx(Id,arg),Ref,Ws,Up).
edge(Q,_,Id,C,Fs,Ws) :-
    memberchk(C.dep,["dobj","obj","iobj","attr","oprd","dative","npadvmod","nmod","appos"]),
    ( nominal_pos(C) ; quote_root(Q,C,_,_) ; C.dep=="dobj", \+ verbal(C) ), C.pos\=="ADP", !,
    node(Q,C,ctx(Id,arg),Ref,Ws,Up), Fs=[ref(complement,Ref)|Up].
edge(Q,_,Id,C,Fs,Ws) :-
    % a word that says how the subject or the object is, with the words that grade it
    memberchk(C.dep,["acomp","oprd","advmod","prt","npadvmod","amod","xcomp","ccomp","dep"]),
    \+ verbal(C), \+ nominal_pos(C), \+ small_clause(Q,C,_), !,
    ( complex_marker(Q,C,P) -> phrase(Q,Id,clause,P,C.i,F1,W1), beside(Q,Id,clause,C,P,F1-W1,Fs-Ws)
    ; said_to_listener(C), leaf(Q,C) -> tq(discourse,C,F), Fs=[F], Ws=[]
    ; tq(modifier,C,F), children(Q,C,Cs), foldl(modifier_edge(Q,Id),Cs,[F]-[],Fs-Ws) ).
edge(Q,_,Id,C,Fs,Ws) :-
    % "make the box red": the object and the word that says how it is
    memberchk(C.dep,["ccomp","xcomp"]), small_clause(Q,C,S), !,
    node(Q,S,ctx(Id,arg),Ref,W1,Up),
    children(Q,C,Cs0), exclude(same_token(S),Cs0,Cs),
    ( nominal_pos(C) ->
        nominal_without(Q,C,ctx(Id,arg),Cs,Ref2,W2,Up2), append([[ref(complement,Ref),ref(complement,Ref2)],Up,Up2],Fs), append(W1,W2,Ws)
    ; tq(modifier,C,F), foldl(modifier_edge(Q,Id),Cs,[ref(complement,Ref),F|Up]-W1,Fs-Ws) ).
edge(Q,_,_,C,[F],[]) :- memberchk(C.dep,["intj","discourse"]), leaf(Q,C), !, tq(discourse,C,F).
edge(Q,T,_,C,Fs,Ws) :-
    % "two inches from the edge": the phrase starts at the measure that stands right before it (Rule 4)
    C.dep=="prep", C.pos=="ADP", Before is C.i-1, child(Q,T,N), N.i=:=Before, nominal_pos(N),
    memberchk(N.dep,["npadvmod","dobj","obj","nmod","appos"]), child(Q,N,M), M.dep=="nummod",
    child(Q,T,Other), Other.i<N.i, memberchk(Other.dep,["dobj","obj","iobj","dative"]), !,
    id(n,N,Measure), phrase(Q,Measure,nominal,C,C.i,Fs,Ws).
edge(Q,_,Id,C,Fs,Ws) :- memberchk(C.dep,["prep","agent","dative"]), C.pos=="ADP", !, phrase(Q,Id,clause,C,C.i,Fs,Ws).
edge(Q,_,Id,C,[],[w(R,relation,[ref(from,Id),ref(to,Ref)|Markers])|Ws]) :-
    % a clause that depends on this one: "to" or a subordinator marks the relation
    verbal(C), memberchk(C.dep,["ccomp","xcomp","advcl","csubj","csubjpass","acl","relcl","parataxis","dep","pcomp","conj"]), !,
    id(r,C,R), node(Q,C,ctx(Id,other),Ref,Ws,_), markers(Q,C,Markers).

governed(T) :- memberchk(T.dep,["ccomp","xcomp","advcl","csubj","csubjpass","acl","relcl","pcomp"]).
same_token(A,B) :- A.i=:=B.i.
small_clause(Q,C,S) :- \+ verbal(C), child(Q,C,S), memberchk(S.dep,["nsubj","nsubjpass"]), \+ verbal(S), !.

% The words that mark a dependent clause: its "to" and its subordinators.
markers(Q,C,Markers) :-
    findall(M,(child(Q,C,M),(M.dep=="mark" ; M.dep=="aux",M.tag=="TO"),leaf(Q,M)),Ms),
    maplist(tq(marker),Ms,Markers).

% An adverb with a preposition right after it that depends on it: one marker ("next to").
complex_marker(Q,C,P) :-
    child(Q,C,P), P.dep=="prep", P.pos=="ADP", P.i=:=C.i+1,
    child(Q,P,O), memberchk(O.dep,["pobj","pcomp"]), !.

% The other words that depend on the adverb of such a marker ("right next to").
beside(Q,Owner,Type,C,P,Acc0,Acc) :-
    children(Q,C,Cs0), exclude(same_token(P),Cs0,Cs),
    foldl(leftover(Q,Owner,Type),Cs,Acc0,Acc).

% What depends on a modifier of the clause: grading words are modifiers too, a phrase
% with a marker starts at the clause.
modifier_edge(Q,Id,C,F0-W0,F-W) :-
    ( inside_quote(Q,C) -> Fs=[], Ws=[]
    ; C.dep=="prep", C.pos=="ADP" -> phrase(Q,Id,clause,C,C.i,Fs,Ws)
    ; C.dep=="cc" -> tq(modifier,C,X), Fs=[X], Ws=[]
    ; \+ verbal(C), \+ nominal_pos(C) -> tq(modifier,C,X), children(Q,C,Cs), foldl(modifier_edge(Q,Id),Cs,[X]-[],Fs-Ws)
    ; rest(Q,Id,clause,C,Fs,Ws) ),
    append(F0,Fs,F), append(W0,Ws,W).

% ---- a phrase with a marker: the relation starts where the parser attached the phrase
% phrase(+Q,+Owner,+OwnerType,+Preposition,+MarkerStart,-FieldsForOwner,-Wires)
phrase(Q,Owner,Type,P,Start,Fs,Ws) :-
    End0 is P.i+1,
    ( child(Q,P,O), memberchk(O.dep,["pobj","pcomp"]), \+ inside_quote(Q,O) ->
        End=End0, Object=O, children(Q,P,Cs0), exclude(same_token(O),Cs0,Others)
    ; child(Q,P,P2), P2.dep=="prep", P2.i=:=P.i+1, child(Q,P2,O), memberchk(O.dep,["pobj","pcomp"]) ->
        % two prepositions in a row are one marker: "out of"
        End is P2.i+1, Object=O, children(Q,P,Cs0), exclude(same_token(P2),Cs0,Others)
    ; Object=none, End=End0, children(Q,P,Others) ),
    ( Object==none ->
        own_word(Type,P,F), foldl(leftover(Q,Owner,Type),Others,[F]-[],Fs-Ws)
    ; id(r,P,R), node(Q,Object,ctx(Owner,pobj),Ref,W1,_),
      % "two inches from the edge": a measure that the parser hangs on the marker is a
      % nominal of its own, and the relation starts at it (Rule 4)
      ( Type==clause, member(M,Others), M.i<P.i, nominal_pos(M), child(Q,M,Num), Num.dep=="nummod" ->
          id(n,M,From) ; From=Owner ),
      % "not behind Jo": the negation belongs to this relation alone
      partition(negates,Others,Negs,Others1), maplist(tq(negation),Negs,NegFields),
      % "near Ben but not behind Jo": phrases joined side by side are relations joined side by side
      partition(joined_phrase(Q),Others1,Joined,Others2),
      ( Joined==[] -> Others3=Others2, Extra=[]
      ; partition(is_cc,Others2,Ccs,Others3),
        maplist(joined_relation(Q,Owner,Type),Joined,Rs,Bank), append(Bank,W2),
        id(k,P,K), findall(ref(conjunct,X),member(X,[R|Rs]),Conjuncts), maplist(tq(conjunction),Ccs,Conjunctions),
        append(Conjuncts,Conjunctions,KFields), Extra=[w(K,coordination,KFields)|W2] ),
      append([[ref(from,From),ref(to,Ref),q(marker,Start,End)],NegFields],RFields),
      append([[w(R,relation,RFields)],W1,Extra],W0),
      foldl(leftover(Q,Owner,Type),Others3,[]-W0,Fs-Ws) ).

negates(C) :- C.dep=="neg".
is_cc(C) :- C.dep=="cc".
joined_phrase(Q,C) :- C.dep=="conj", C.pos=="ADP", child(Q,C,O), memberchk(O.dep,["pobj","pcomp"]), !.
joined_relation(Q,Owner,Type,P,R,Ws) :- id(r,P,R), phrase(Q,Owner,Type,P,P.i,_,Ws).

own_word(clause,T,F) :- tq(modifier,T,F).
own_word(nominal,T,F) :- tq(dependent,T,F).
leftover(Q,Owner,Type,C,F0-W0,F-W) :-
    ( inside_quote(Q,C) -> Fs=[], Ws=[] ; rest(Q,Owner,Type,C,Fs,Ws) ),
    append(F0,Fs,F), append(W0,Ws,W).

% ---- nominals
nominal(Q,T,Ctx,Id,Wires,Up) :- children(Q,T,Cs), nominal_without(Q,T,Ctx,Cs,Id,Wires,Up).
nominal_without(Q,T,Ctx,Cs,Id,[w(Id,nominal,[Head|Fields])|Sub],Up) :-
    id(n,T,Id), tq(head,T,Head),
    foldl(nominal_edge(Q,T,Id,Ctx),Cs,f([],[],[]),f(Fields,Sub,Up)).

nominal_edge(Q,T,Id,Ctx,C,f(F0,W0,U0),f(F,W,U)) :-
    ( inside_quote(Q,C) -> Fs=[], Ws=[], Us=[]
    ; nedge(Q,T,Id,Ctx,C,Fs,Ws,Us) -> true
    ; rest(Q,Id,nominal,C,Fs,Ws), Us=[] ),
    append(F0,Fs,F), append(W0,Ws,W), append(U0,Us,U).

nedge(Q,T,_,_,C,[],[],[]) :- is_joined(Q,T,C), !.
nedge(Q,T,_,_,C,Fs,[],[]) :- C.dep=="cc", !, ( joins(Q,T) -> Fs=[] ; subtree(Q,C,Words), maplist(tq(dependent),Words,Fs) ).
nedge(_,T,_,_,C,[],[],[]) :- C.dep=="case", T.dep=="poss", !.
nedge(Q,_,Id,_,C,[],[w(R,relation,[ref(from,Id),ref(to,Ref)|Marker])|Ws],[]) :-
    % the possessive: the relation starts at what is owned, "'s" marks it
    C.dep=="poss", \+ memberchk(C.tag,["PRP$","WP$"]), ( nominal_pos(C) ; quote_root(Q,C,_,_) ), !,
    id(r,C,R), node(Q,C,ctx(none,other),Ref,Ws,_),
    findall(M,(child(Q,C,K),K.dep=="case",tq(marker,K,M)),Marker).
nedge(Q,T,_,ctx(Clause,arg),C,[],[],Fs) :-
    % a describing word after the nominal that is subject or complement belongs to the clause (Rule 5)
    Clause\==none, C.dep=="amod", C.i>T.i, \+ verbal(C), !,
    subtree(Q,C,Words), maplist(tq(modifier),Words,Fs).
nedge(Q,_,Id,_,C,Fs,Ws,[]) :-
    % "the box next to the circle": an adverb and its preposition are one marker
    C.dep=="advmod", complex_marker(Q,C,P), !, phrase(Q,Id,nominal,P,C.i,F1,W1), beside(Q,Id,nominal,C,P,F1-W1,Fs-Ws).
nedge(Q,_,_,_,C,Fs,[],[]) :-
    memberchk(C.dep,["det","predet","nummod","quantmod","compound","amod","poss","advmod","nmod","npadvmod","case","nn","flat","name","dep","punct"]),
    subtree(Q,C,Words), \+ ( member(X,Words), ( verbal(X), X.i=\=C.i ; X.dep=="prep", child(Q,X,_) ) ), !,
    maplist(tq(dependent),Words,Fs).
nedge(Q,_,Id,_,C,Fs,Ws,[]) :- C.dep=="prep", C.pos=="ADP", !, phrase(Q,Id,nominal,C,C.i,Fs,Ws).
nedge(Q,_,Id,_,C,[],[w(R,relation,[ref(from,Id),ref(to,Ref)|Markers])|Ws],[]) :-
    % a clause or a nominal that stands with this nominal
    memberchk(C.dep,["acl","relcl","appos","conj","dep","nmod","npadvmod","amod","ccomp","advcl","parataxis","compound"]),
    ( verbal(C) ; nominal_pos(C) ; quote_root(Q,C,_,_) ), !,
    id(r,C,R), node(Q,C,ctx(none,other),Ref,Ws,_),
    ( verbal(C) -> markers(Q,C,Markers) ; Markers=[] ).

% ---- whatever no rule above places: held where it stands
% a word alone modifies its owner; a word with its own words is tied to the owner
rest(Q,Owner,Type,C,Fs,Ws) :-
    ( leaf(Q,C), \+ verbal(C), \+ ( nominal_pos(C), Type==clause ) ->
        % a word said to the listener, or a conjunction that joins nothing here
        ( Type==clause, ( memberchk(C.pos,["INTJ","CCONJ","SCONJ"]) ; said_to_listener(C) ) -> tq(discourse,C,F) ; own_word(Type,C,F) ),
        Fs=[F], Ws=[]
    ; Type==clause, \+ verbal(C) ->
        node(Q,C,ctx(Owner,arg),Ref,Ws,Up), Fs=[ref(complement,Ref)|Up]
    ; id(r,C,R), node(Q,C,ctx(none,other),Ref,W1,_),
      ( verbal(C) -> markers(Q,C,Markers) ; Markers=[] ),
      Fs=[], Ws=[w(R,relation,[ref(from,Owner),ref(to,Ref)|Markers])|W1] ).
