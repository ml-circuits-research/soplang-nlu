:- module(dependencies,[dependency_graph/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).
:- use_module(library(pairs)).

dependency_graph(Q,Json) :-
    findall(Wires,(member(T,Q.tokens),T.dep=="ROOT",word(T),\+ quote_range(Q,T,_,_),project_root(Q,T,Wires)),Trees),
    findall(Wires,(member(T,Q.tokens),T.dep\=="ROOT",gratitude(Q,T,_,_,_),project_gratitude(Q,T,Wires)),Edges),
    append(Trees,Roots), append(Edges,Detached), append(Roots,Detached,Initial),
    ( Initial=[] -> InitialWires=[wire(root,clause,0,[atom(form,fragment)])]
    ; InitialWires=Initial ),
    add_gaps(Q,InitialWires,Wires),
    maplist(json_wire,Wires,Json).

token(Q,I,T) :- nth0(I,Q.tokens,T).
child(Q,Parent,T) :- member(T,Q.tokens), T.head=:=Parent.i, T.i=\=Parent.i.
children(Q,Parent,Roles,Children) :-
    findall(T,(child(Q,Parent,T),memberchk(T.dep,Roles)),Children).
last_token(Q,I) :- length(Q.tokens,Count), I is Count-1.
text(T,Lower) :- string_lower(T.text,Lower).
previous(Q,T,P) :- I is T.i-1,token(Q,I,P).
next(Q,T,N) :- I is T.i+1,token(Q,I,N).
token_id(Prefix,T,ID) :- format(atom(ID),'~w~d',[Prefix,T.i]).
span(T,S,E) :- S=T.i,E is T.i+1.
quoted(Key,T,q(Key,S,E)) :- span(T,S,E).
predicate(T) :- memberchk(T.pos,["VERB","AUX"]).
nominal(T) :- memberchk(T.pos,["NOUN","PROPN","PRON","NUM"]).
determiner(T) :- memberchk(T.pos,["DET","PRON"]).
word(T) :- \+ memberchk(T.pos,["PUNCT","SPACE","SYM"]).
lower(T,Lower) :- text(T,S), atom_string(Lower,S).

project_root(Q,T,Wires) :-
    ( gratitude(Q,T,_,_,_) -> project_gratitude(Q,T,Wires)
    ; project(Q,T,top,_,Wires) ).

project(Q,T,Context,Ref,Wires) :-
    ( quote_range(Q,T,Start,End) ->
        token_id(l,T,Ref), Wires=[wire(Ref,entity,Start,[q(literal,Start,End)])]
    ; conjoined(Q,T,Context,Members,Cues) ->
        token_id(g,T,Ref),
        maplist(project_single(Q,Context),Members,MemberRefs,Trees),
        maplist(member_ref,MemberRefs,Links),
        coordination_kind(Q,Cues,Kind),
        append([[atom(kind,Kind)],Links,Cues],Fields),
        append(Trees,MemberWires),
        maplist(without_claims(Cues),MemberWires,Children),
        Wires=[wire(Ref,coordination,T.i,Fields)|Children]
    ; project_single(Q,Context,T,Ref,Wires) ).

project_single(Q,Context,T,Ref,Wires) :-
    ( Context==entity -> entity(Q,T,Ref,Wires)
    ; Context==clause -> clause(Q,T,Ref,Wires)
    ; predicate(T) -> clause(Q,T,Ref,Wires)
    ; child(Q,T,Cop), Cop.dep=="cop" -> clause(Q,T,Ref,Wires)
    ; token_id(c,T,Ref),
      entity(Q,T,Entity,Contents),
      findall(M,(child(Q,T,Join),Join.dep=="cc",Join.i<T.i,
        text(Join,Word),memberchk(Word,["and","or","but"]),quoted(marker,Join,M)),Markers),
      append([atom(form,fragment),ref(topic,Entity)],Markers,Fields),
      Wires=[wire(Ref,clause,T.i,Fields)|Contents] ).

member_ref(Ref,ref(member,Ref)).
coordination_kind(Q,Cues,Kind) :-
    ( member(q(cue,S,E),Cues), between(S,E,I), I<E, token(Q,I,T), text(T,Word), memberchk(Word,["then",";"]) -> Kind=sequence
    ; member(q(cue,S,E),Cues), between(S,E,I), I<E, token(Q,I,T), text(T,X),memberchk(X,["or","nor"]) -> Kind=disjunctive
    ; member(q(cue,S,E),Cues), between(S,E,I), I<E, token(Q,I,T), text(T,X),memberchk(X,["but","yet"]) -> Kind=contrast
    ; member(q(cue,S,E),Cues), between(S,E,I), I<E, token(Q,I,T), text(T,"so") -> Kind=consequence
    ; Kind=conjunctive ).

conjoined(Q,T,Context,Members,Cues) :-
    findall(M-Cue,coordination_member(Q,T,Context,M,Cue),Pairs),
    Pairs\=[], pairs_keys_values(Pairs,Conj,Cues),
    findall(I-M,(member(M,[T|Conj]),I=M.i),Ranked),keysort(Ranked,Sorted),pairs_values(Sorted,Members).

coordination_member(Q,T,Context,M,Cue) :-
    child(Q,T,M),same_class(T,Context,M),coordinated_edge(Q,T,M,Cue),
    \+ promoted_imperative(Q,T,M).
coordination_member(Q,T,Context,M,Cue) :-
    child(Q,T,Subordinate), child(Q,Subordinate,M),
    same_class(T,Context,M),promoted_imperative(Q,Subordinate,M),
    join_cue(Q,Subordinate,M,Cue).

% A bare imperative after a marked subordinate is coordinated with the matrix
% when the overt break is contrastive or sequential.
promoted_imperative(Q,Subordinate,Member) :-
    memberchk(Subordinate.dep,["advcl","ccomp"]),
    child(Q,Subordinate,Marker),Marker.dep=="mark",
    Member.dep=="conj", Member.tag=="VB", \+ finite_subject(Q,Member),
    children(Q,Member,["aux","auxpass"],[]),
    join_cue(Q,Subordinate,Member,q(cue,Start,End)),
    Last is End-1, between(Start,Last,I),token(Q,I,Cue),text(Cue,Word),
    memberchk(Word,["but","then","yet"]), !.

coordinated_edge(Q,T,M,Cue) :-
    join_cue(Q,T,M,Cue),
    ( M.dep=="conj"
    ; predicate(T),predicate(M),memberchk(M.dep,["dep","advcl","parataxis"]),
      Cue=q(cue,S,E), Last is E-1,
      between(S,Last,I), token(Q,I,Marker),text(Marker,Word),
      ( Word==";" ; M.i>T.i, memberchk(Word,["then","but","yet"]) ),
      children(Q,M,["mark"],[]) ), !.

without_claims(Cues,wire(ID,Type,At,Fields),wire(ID,Type,At,Kept)) :-
    exclude(overlaps_claim(Cues),Fields,Kept).
overlaps_claim(Cues,q(_,S,E)) :-
    member(q(_,A,B),Cues),S<B,A<E.

same_class(_,clause,T) :- predicate(T), !.
same_class(Head,entity,T) :-
    ( nominal(T) ; Head.pos=="ADJ",T.pos=="ADJ" ), !.
same_class(Head,top,T) :- (predicate(Head) -> predicate(T) ; nominal(T)).

join_cue(Q,Parent,Member,q(cue,Start,End)) :-
    Min is min(Parent.i,Member.i), Max is max(Parent.i,Member.i)-1,
    findall(I-T,(between(Min,Max,I),token(Q,I,T),join_token(T)),Marks),
    preferred_join_marker(Marks,I-T), span(T,Begin,End0),
    ( text(T,"then"), J is I-1,token(Q,J,Join),text(Join,"and") -> Before=J
    ; Before=Begin ),
    J0 is Before-1,
    ( token(Q,J0,Comma), Comma.text=="," -> Start=J0 ; Start=Before ),
    ( text(T,"and"),next(Q,T,After),text(After,"then") -> End is After.i+1 ; End=End0 ).

preferred_join_marker(Marks,Best) :-
    exclude(comma_mark,Marks,Explicit), Explicit\=[], last(Explicit,Best), !.
preferred_join_marker(Marks,Best) :- last(Marks,Best).
comma_mark(_-T) :- T.text==",".

join_token(T) :- memberchk(T.dep,["cc","advmod","punct"]),
    text(T,Word),memberchk(Word,["and","or","nor","but","yet","so","then",",",";"]).

clause(Q,T,ID,[wire(ID,clause,T.i,Fields)|Children]) :-
    token_id(c,T,ID),
    clause_core(Q,T,Core),
    child_projection(Q,T,ID,clause,Banks,Trees),
    append(Banks,Args0), append(Trees,Children),
    findall(Adverb,relocated_adverb(Q,T,Adverb),Modifiers), append(Args0,Modifiers,Args),
    select_single_slots(Args,Chosen),
    append(Core,Chosen,Fields).

clause_core(Q,T,[atom(form,Form)|Fields]) :-
    clause_form(Q,T,Form),
    ( child(Q,T,Cop),Cop.dep=="cop" ->
        quoted(predicate,Cop,Predicate), word_claim(Q,result_complement,T,Result), Fields=[Predicate,Result]
    ; word_claim(Q,predicate,T,Predicate),Fields=[Predicate] ).

clause_form(Q,T,nonfinite) :-
    memberchk(T.dep,["xcomp","pcomp","acl","relcl","ccomp","advcl"]),
    ( memberchk(T.tag,["VBG","VBN"]), \+ finite_subject(Q,T)
    ; T.tag=="VB", child(Q,T,Marker), text(Marker,"to"), Member=Marker.dep, memberchk(Member,["aux","mark"])
    ; T.tag=="VB", T.dep=="xcomp", \+ finite_subject(Q,T) ), !.
clause_form(Q,T,interrogative) :-
    ( child(Q,T,S),memberchk(S.dep,["nsubj","nsubjpass","csubj"]),
      child(Q,T,A),memberchk(A.dep,["aux","auxpass"]), A.i<S.i
    ; child(Q,T,Mark),Mark.dep=="punct",Mark.text=="?"
    ; memberchk(T.dep,["ROOT","conj"]), child(Q,T,Wh),wh_token(Wh) ), !.
clause_form(Q,T,declarative) :- finite_subject(Q,T), !.
clause_form(_,T,imperative) :-
    ( T.tag=="VB" ; T.dep=="ROOT",T.tag=="VBD",text(T,T.lemma) ), !.
clause_form(_,T,nonfinite) :- memberchk(T.tag,["VBG","VBN"]), !.
clause_form(_,_,declarative).

finite_subject(Q,T) :-
    child(Q,T,S),memberchk(S.dep,["nsubj","nsubjpass","csubj","csubjpass","expl"]), !.
wh_token(T) :- memberchk(T.tag,["WDT","WP","WP$","WRB"]).

% Clause and nominal edges share the same constructors. Unrecognized edges
% are left for the source accounting pass.
child_projection(Q,T,ID,Type,Banks,Trees) :-
    findall(Fields-Wires,
      ( child(Q,T,C), \+ protected_token(Q,C),
        edge(Q,Type,T,ID,C,Fields,Wires) ), Pairs),
    pairs_keys_values(Pairs,Banks,Trees).

edge(Q,clause,T,_,C,[q(negation,S,E),atom(polarity,negative)],[]) :-
    C.dep=="neg", negative_span(Q,T,C,S,E), !.
edge(Q,clause,T,_,C,Fields,[]) :-
    memberchk(C.dep,["aux","auxpass"]),!,
    ( contracted_aux(Q,T,C) -> Fields=[]
    ; text(C,"to"), C.tag=="TO" -> quoted(marker,C,Field),Fields=[Field]
    ; quoted(auxiliary,C,Field),Fields=[Field] ).
edge(_,clause,_,_,C,[Field],[]) :-
    memberchk(C.dep,["advmod","npadvmod"]), wh_token(C),quoted(question,C,Field), !.
edge(Q,clause,T,_,C,[Field],[]) :-
    C.dep=="advmod", C.pos=="ADJ", memberchk(C.tag,["JJR","JJS"]),
    child(Q,T,Object), memberchk(Object.dep,["dobj","obj"]),quoted(result_complement,C,Field), !.
edge(Q,Type,_,ID,C,[],Wires) :-
    C.dep=="advmod", adjacent_preposition(Q,C,Prep),
    multiword_cue_start(Q,C,Start), pp_with_cue(Q,Type,ID,Prep,Start,Wires), !.
edge(Q,clause,T,_,C,[],[]) :-
    C.dep=="advmod", text(C,"else"), previous(Q,C,P), child(Q,T,P), indefinite_pronoun(P), !.
edge(_,clause,_,_,C,[Field],[]) :-
    C.dep=="advmod", memberchk(C.pos,["ADV","PART"]), quoted(adverb,C,Field), !.
edge(Q,clause,T,ID,C,[],[Link|Wires]) :-
    C.dep=="prt",C.pos=="ADP",
    child(Q,T,Wh),Wh.dep=="pobj",wh_token(Wh),Wh.i<T.i,
    project(Q,Wh,entity,Ref,Wires), pp_kind(Q,C,Wh,Kind),
    quoted(cue,C,Cue), relation_wire(C,Kind,ID,Ref,[Cue],Link), !.
edge(_,clause,_,_,C,[Field],[]) :-
    C.dep=="prt",quoted(particle,C,Field), !.
edge(Q,clause,_,_,C,[Field],[]) :-
    C.dep=="prep", children(Q,C,["pobj","pcomp"],[]),
    text(C,Word),memberchk(Word,["back","down","off","out","over","up"]),quoted(particle,C,Field), !.
edge(Q,clause,_,ID,C,[],[Link|Wires]) :-
    C.dep=="npadvmod", nominal(C), temporal_nominal(Q,C),
    project(Q,C,entity,Ref,Wires), relation_wire(C,time,ID,Ref,[],Link), !.
edge(_,clause,_,_,C,[Field],[]) :-
    C.dep=="mark",quoted(marker,C,Field), !.
edge(_,clause,_,_,C,[Field],[]) :-
    polite(C), quoted(filler,C,Field), !.
edge(Q,clause,_,ID,C,[],[Link|Wires]) :-
    memberchk(C.dep,["csubj","csubjpass"]), predicate(C),
    project(Q,C,clause,Ref,Wires),
    relation_wire(C,clausal_subject,ID,Ref,[],Link), !.
edge(Q,clause,_,_,C,[ref(Role,Ref)],Wires) :-
    memberchk(C.dep,["nsubj","nsubjpass","expl","dobj","obj","iobj","dative"]),
    nominal(C), !,
    argument_role(C.dep,Role), project(Q,C,entity,Ref,Wires).
edge(Q,clause,T,ID,C,[ref(direct_object,Object)|Fields],Wires) :-
    memberchk(C.dep,["ccomp","xcomp"]),
    result_word(T,C), children(Q,C,["nsubj","nsubjpass","obj","compound"],[Target]), nominal(Target),
    project(Q,Target,entity,Object,TargetWires),
    predicative_phrase(Q,C,ID,Fields,Attachments),
    append(TargetWires,Attachments,Wires), !.
edge(_,clause,_,_,C,[Field],[]) :-
    memberchk(C.dep,["acomp","oprd"]), C.pos=="ADJ", quoted(result_complement,C,Field), !.
edge(Q,clause,_,_,C,[ref(predicative_entity,Ref)],Wires) :-
    memberchk(C.dep,["attr","oprd"]), nominal(C),
    project(Q,C,entity,Ref,Wires), !.
edge(Q,clause,T,_,C,[ref(clausal_complement,Ref)],Wires) :-
    memberchk(C.dep,["ccomp","xcomp"]), predicate(C),
    project(Q,C,clause,Ref,Parsed),
    ( bare_infinitival_control(Q,T,C) ->
        token_id(c,C,ClauseID), maplist(nonfinite_clause(ClauseID),Parsed,Wires)
    ; Wires=Parsed ), !.
edge(Q,clause,_,ID,C,[],Wires) :-
    memberchk(C.dep,["advcl","parataxis"]), predicate(C),
    dependent_clause(Q,ID,C,Wires), !.
edge(Q,clause,_,ID,C,[],[Link|Wires]) :-
    C.dep=="advcl", predicate(C), memberchk(C.tag,["VBG","VBN"]), children(Q,C,["mark","nsubj","nsubjpass"],[]),
    project(Q,C,clause,Ref,Wires), relation_wire(C,accompanying,ID,Ref,[],Link), !.
edge(Q,Type,T,ID,C,[],Wires) :-
    memberchk(C.dep,["prep","agent","dative"]),C.pos=="ADP",
    pp(Q,Type,T,ID,C,Wires), !.
edge(Q,entity,T,ID,C,Fields,Wires) :-
    entity_edge(Q,T,ID,C,Fields,Wires).

bare_infinitival_control(Q,Parent,Child) :-
    memberchk(Parent.lemma,["let","make","have","help"]),
    Child.tag=="VB",children(Q,Child,["aux","auxpass","mark"],[]),
    child(Q,Child,Subject),Subject.dep=="nsubj",Subject.i>Parent.i,Subject.i<Child.i,
    ( Subject.tag=="PRP", text(Subject,Pronoun),memberchk(Pronoun,["me","you","him","her","it","us","them"])
    ; Subject.pos=="PROPN" ), !.

nonfinite_clause(ClauseID,wire(ID,clause,At,Fields),wire(ID,clause,At,[atom(form,nonfinite)|Rest])) :-
    ID==ClauseID, !, exclude(field_is(form),Fields,Rest).
nonfinite_clause(_,Wire,Wire).

argument_role("nsubj",subject).
argument_role("nsubjpass",subject).
argument_role("expl",subject).
argument_role("dobj",direct_object).
argument_role("obj",direct_object).
argument_role("iobj",indirect_object).
argument_role("dative",indirect_object).

negative_span(Q,T,C,S,E) :-
    span(C,I,E),
    ( text(C,Word), memberchk(Word,["n't","n’t"]),
      previous(Q,C,A),A.end=:=C.start,child(Q,T,A),memberchk(A.dep,["aux","auxpass"]) ->
        S=A.i
    ; S=I ).
contracted_aux(Q,T,A) :-
    next(Q,A,N),child(Q,T,N),N.dep=="neg",negative_span(Q,T,N,S,_),S=:=A.i.

result_word(Parent,Child) :-
    memberchk(Parent.lemma,["make","set","paint","color","colour","turn","keep","leave","render","want"]),
    ( Child.pos=="ADJ"
    ; text(Child,Color),memberchk(Color,["black","blue","brown","gray","green","grey","orange","pink","purple",
      "red","white","yellow","cyan","magenta","teal","violet"]) ).

predicative_phrase(Q,T,ID,[Result|Degrees],Wires) :-
    word_claim(Q,result_complement,T,Result),
    findall(Degree,(child(Q,T,D),degree_expression(Q,D,Degree)),Degrees),
    findall(PP,(child(Q,T,P),P.dep=="prep",pp(Q,clause,T,ID,P,PP)),Phrases),
    append(Phrases,Wires).

degree_expression(_,D,Field) :-
    D.dep=="advmod", D.pos=="ADV", quoted(degree,D,Field), !.
degree_expression(Q,D,q(degree,Start,End)) :-
    D.dep=="npadvmod", text(D,"bit"),
    child(Q,D,Little), Little.dep=="amod", text(Little,"little"), Little.i=:=D.i-1,
    child(Q,D,A), A.dep=="det", text(A,"a"), A.i=:=Little.i-1,
    Start=A.i, End is D.i+1.

indefinite_pronoun(T) :-
    T.pos=="PRON",text(T,Word),
    memberchk(Word,["everything","anything","something","nothing","everybody","anybody","somebody","nobody",
      "everyone","anyone","someone","noone"]).

polite(T) :- text(T,Word),memberchk(Word,["please","hey","ok","okay","well"]),memberchk(T.dep,["intj","discourse","advmod"]).

entity(Q,T,ID,Wires) :-
    token_id(e,T,ID),
    ( quote_range(Q,T,S,E) -> Wires=[wire(ID,entity,T.i,[q(literal,S,E)])]
    ; date_span(Q,T,S,E) -> Wires=[wire(ID,entity,T.i,[q(head,S,E)])]
    ; temporal_zone(Q,T,Time) ->
        quoted(head,Time,Value),quoted(modifier,T,Zone),
        Wires=[wire(ID,entity,T.i,[Value,Zone])]
    ; nominal_head(Q,T,Identity,Owned),
      child_projection(Q,T,ID,entity,Banks,Trees),
      append(Banks,Base),append(Trees,Children),
      ( indefinite_pronoun(T),next(Q,T,Else),text(Else,"else") ->
          quoted(modifier,Else,Qualifier),Args0=[Qualifier|Base]
      ; Args0=Base ),
      exclude(inside_owned(Owned),Args0,Args),
      select_single_slots(Args,Modifiers),
      Wires=[wire(ID,entity,T.i,[Identity|Modifiers])|Children] ).

nominal_head(Q,T,q(name,Start,End),[Start,End]) :-
    T.pos=="PROPN", compound_name_start(Q,T,Start), Start<T.i,
    End is T.i+1, !.
nominal_head(Q,T,Identity,[]) :-
    ( T.pos=="PRON" -> Field=pronoun
    ; T.pos=="PROPN" -> Field=name
    ; Field=head ), word_claim(Q,Field,T,Identity).

compound_name_start(Q,T,Start) :-
    previous(Q,T,P),P.pos=="PROPN",child(Q,T,P),
    memberchk(P.dep,["compound","flat","name"]), !, compound_name_start(Q,P,Start).
compound_name_start(_,T,T.i).

inside_owned([Start,End],q(_,I,J)) :- I>=Start,J=<End.

entity_edge(Q,T,_,C,[Field],[]) :-
    C.dep=="predet", child(Q,T,D),D.dep=="det", D.i=:=C.i+1,
    End is D.i+1, Field=q(determiner,C.i,End), !.
entity_edge(Q,T,_,C,[],[]) :-
    C.dep=="det", previous(Q,C,P),child(Q,T,P),P.dep=="predet", !.
entity_edge(_,_,_,C,[Field],[]) :-
    memberchk(C.dep,["det","predet"]), determiner(C), quoted(determiner,C,Field), !.
entity_edge(Q,_,_,C,[Field|Degrees],[]) :-
    memberchk(C.dep,["nummod","quantmod"]), quoted(quantity,C,Field),
    findall(D,(child(Q,C,A),A.dep=="advmod",quoted(degree,A,D)),Degrees), !.
entity_edge(Q,_,ID,C,[],[Link|Wires]) :-
    C.dep=="amod", C.pos=="ADJ", conjoined(Q,C,entity,_,_),
    project(Q,C,entity,Ref,Wires),
    relation_wire(C,modifier,ID,Ref,[],Link), !.
entity_edge(Q,_,_,C,[Field|Degrees],[]) :-
    C.dep=="amod", ( C.pos=="ADJ" ; memberchk(C.tag,["VBG","VBN"]) ),
    word_claim(Q,modifier,C,Field),
    findall(D,(child(Q,C,A),A.dep=="advmod",quoted(degree,A,D)),Degrees), !.
entity_edge(Q,_,_,C,Fields,[]) :-
    memberchk(C.dep,["compound","flat","name"]), word(C), compound_fields(Q,C,Fields), !.
entity_edge(_,_,_,C,[Field],[]) :-
    C.dep=="advmod", text(C,Word),memberchk(Word,["only","solely"]), quoted(modifier,C,Field), !.
entity_edge(Q,_,_,C,[ref(possessor,Ref)|Markers],Wires) :-
    C.dep=="poss", nominal(C), !,
    project(Q,C,entity,Ref,Wires),
    findall(M,(child(Q,C,P),P.dep=="case",quoted(possessive_marker,P,M)),Markers).
entity_edge(_,_,_,C,[Field],[]) :-
    C.dep=="poss", C.pos=="DET", quoted(determiner,C,Field), !.
entity_edge(Q,_,ID,C,[],[Link,Wire]) :-
    memberchk(C.dep,["acl","relcl"]), nominal_annotation(Q,C,Target,Kind,Wire),
    quoted(cue,C,Cue), relation_wire(C,Kind,ID,Target,[Cue],Link), !.
entity_edge(Q,_,ID,C,[],Wires) :-
    memberchk(C.dep,["acl","relcl"]),predicate(C),
    project(Q,C,clause,Ref,Child),
    relation_wire(C,"modifier",ID,Ref,[],Link), Wires=[Link|Child], !.
entity_edge(Q,_,ID,C,[],Wires) :-
    C.dep=="appos",nominal(C), project(Q,C,entity,Ref,Child),
    relation_wire(C,"apposition",ID,Ref,[],Link),Wires=[Link|Child], !.

nominal_annotation(Q,C,Target,content,wire(Target,entity,Start,[q(literal,Start,End)])) :-
    memberchk(C.lemma,["contain","say","read"]),
    next(Q,C,Open),quote_range(Q,Open,Start,End),Open.i=:=Start,
    token_id(l,Open,Target), !.
nominal_annotation(Q,C,Target,label,wire(Target,entity,Start,[q(name,Start,End)])) :-
    memberchk(C.lemma,["call","name","label","title"]),
    children(Q,C,["oprd","attr","dobj","obj"],[Name]),nominal(Name),
    Start is C.i+1, Start=<Name.i, End is Name.i+1,
    forall((between(Start,Name.i,I),token(Q,I,Part)),word(Part)),
    token_id(l,Name,Target).

compound_fields(Q,T,[Field|Tail]) :-
    word_claim(Q,compound,T,Field),
    findall(Bank,(child(Q,T,C),compound_child_fields(Q,C,Bank)),Banks),
    append(Banks,Tail).

compound_child_fields(Q,C,Fields) :-
    memberchk(C.dep,["compound","flat","name"]),word(C),compound_fields(Q,C,Fields).
compound_child_fields(Q,C,[Field]) :-
    C.dep=="amod", C.pos=="ADJ", word_claim(Q,modifier,C,Field).

relocated_adverb(Q,Parent,Field) :-
    member(C,Q.tokens), C.dep=="advmod", text(C,Word),memberchk(Word,["instead","again","also"]),
    C.head=\=Parent.i,
    adjunct_ancestor(Q,C,Parent),
    quoted(adverb,C,Field).
adjunct_ancestor(Q,T,Parent) :-
    token(Q,T.head,H), H.i=\=T.i,
    ( H.i=:=Parent.i ; \+ predicate(H),adjunct_ancestor(Q,H,Parent) ).

multiword_cue_start(Q,C,Start) :-
    previous(Q,C,P),child(Q,C,P),P.dep=="advmod",
    text(P,Word),memberchk(Word,["right","just","directly","immediately"]), !,
    Start=P.i.
multiword_cue_start(_,C,C.i).

adjacent_preposition(Q,C,Prep) :-
    text(C,Word),memberchk(Word,["next","straight","directly","just","right"]),
    next(Q,C,Prep),child(Q,C,Prep),Prep.dep=="prep", !.

pp(Q,Type,_,ID,C,Wires) :-
    multiword_cue_start(Q,C,Start), pp_with_cue(Q,Type,ID,C,Start,Wires).

pp_with_cue(Q,_,ID,C,Start,[Link|Contents]) :-
    children(Q,C,["pobj","pcomp"],[Endpoint|_]),
    ( predicate(Endpoint) -> Context=clause ; Context=entity ),
    project(Q,Endpoint,Context,Ref,Contents),
    ( previous(Q,C,Lead), Start<C.i, text(Lead,"next"),text(C,"to") -> Kind=near
    ; pp_kind(Q,C,Endpoint,Kind) ),
    End is C.i+1,
    relation_wire(C,Kind,ID,Ref,[q(cue,Start,End)],Link).

pp_kind(_,C,_,agent) :- C.dep=="agent", !.
pp_kind(Q,C,Endpoint,time) :-
    text(C,Cue),memberchk(Cue,["on","at","until","before","after","from","to"]),
    ( temporal_word(Endpoint) ; date_span(Q,Endpoint,_,_) ), !.
pp_kind(_,C,Endpoint,duration) :-
    text(C,"for"),memberchk(Endpoint.lemma,["second","minute","hour","day","week","month","year"]), !.
pp_kind(_,C,_,Kind) :- lower(C,Kind), atom_chars(Kind,Letters), maplist(alpha,Letters).
alpha(C) :- char_type(C,alpha).

date_span(Q,Token,Start,End) :-
    Start=Token.i,
    ( Token.pos=="NUM", sub_string(Token.text,4,1,_,"-"), string_length(Token.text,10) ->
        End is Start+1
    ; digit_count(Token,4), next(Q,Token,DashA), adjacent(Token,DashA), DashA.text=="-",
      next(Q,DashA,Month), adjacent(DashA,Month), digit_count(Month,2),
      next(Q,Month,DashB), adjacent(Month,DashB), DashB.text=="-",
      next(Q,DashB,Day), adjacent(DashB,Day), digit_count(Day,2),
      End is Day.i+1 ), !.

adjacent(A,B) :- A.end=:=B.start.
digit_count(T,N) :- string_length(T.text,N),string_chars(T.text,Digits),maplist(digit,Digits).
digit(C) :- char_type(C,digit).
temporal_zone(Q,T,Time) :-
    text(T,Zone),memberchk(Zone,["utc","gmt","am","pm"]),
    previous(Q,T,Time),Time.pos=="NUM",sub_string(Time.text,_,_,_,":").

temporal_nominal(_,T) :- temporal_word(T), !.
temporal_nominal(Q,T) :-
    memberchk(T.lemma,["morning","afternoon","evening","night","week","month","year"]),
    child(Q,T,Cue), text(Cue,Word),memberchk(Word,["tomorrow","today","yesterday","this","next","last"]), !.

temporal_word(T) :-
    text(T,Word),memberchk(Word,["monday","tuesday","wednesday","thursday","friday","saturday","sunday",
      "today","tomorrow","yesterday","utc","gmt"]), !.
temporal_word(T) :- T.pos=="NUM",sub_string(T.text,_,_,_,":"), !.
temporal_word(T) :- T.pos=="NUM",sub_string(T.text,_,_,_,"-").

relation_wire(T,Kind,From,To,Cues,wire(ID,relation,T.i,Fields)) :-
    token_id(r,T,ID),
    append([atom(kind,Kind),ref(from,From),ref(to,To)],Cues,Fields).

dependent_clause(Q,ID,T,[Link|Wires]) :-
    children(Q,T,["mark"],[Marker|_]),
    subordinate_kind(Marker,Kind),
    project(Q,T,clause,Ref,Raw),
    token_id(c,T,ClauseID),
    strip_wire_field(Raw,ClauseID,marker,Wires),
    subordinate_span(Q,T,Marker,Cue), relation_wire(T,Kind,ID,Ref,[Cue],Link).

subordinate_span(Q,Clause,Marker,q(cue,Start,End)) :-
    span(Marker,Start,Stop),
    ( text(Marker,"so"),next(Q,Marker,That), text(That,"that"),
      child(Q,Clause,That),That.dep=="mark" -> End is Stop+1
    ; End=Stop ).

subordinate_kind(T,Kind) :-
    text(T,Word),
    ( Word=="because" -> Kind=reason
    ; memberchk(Word,["while","when","once","after","before"]) -> Kind=temporal
    ; Word=="if" -> Kind=condition
    ; Word=="although" -> Kind=concession
    ; Word=="since" -> Kind=since
    ; Word=="so" -> Kind=purpose ), !.

strip_wire_field([],_,_,[]).
strip_wire_field([wire(ID,Type,At,Fields)|More],Target,Key,[wire(ID,Type,At,Clean)|Tail]) :-
    ( ID==Target -> exclude(field_is(Key),Fields,Clean) ; Clean=Fields ),
    strip_wire_field(More,Target,Key,Tail).
field_is(Key,Field) :- arg(1,Field,Key).

select_single_slots([],[]).
select_single_slots([F|Tail],[F|Chosen]) :-
    arg(1,F,Key),
    ( memberchk(Key,[subject,direct_object,indirect_object,predicative_entity,clausal_complement,
       result_complement,determiner,quantity,possessor,possessive_marker,marker,question,polarity]) ->
        exclude(field_is(Key),Tail,Rest)
    ; Rest=Tail ),
    select_single_slots(Rest,Chosen).

protected_token(Q,T) :- gratitude(Q,T,_,_,_), !.
protected_token(Q,T) :-
    hyphenated(Q,T,Start,End),
    hyphenated_head(Q,Start,End,Head), T.i=\=Head, !.
protected_token(Q,T) :-
    First is max(0,T.i-4), Last is T.i-1, between(First,Last,Start),
    token(Q,Start,Candidate),date_span(Q,Candidate,Start,End),T.i<End, !.

% A hyphenated orthographic word claims its contiguous source once, under
% the dependency token whose head leaves that word.
word_claim(Q,Key,T,q(Key,Start,End)) :-
    hyphenated(Q,T,Start,End),hyphenated_head(Q,Start,End,T.i), !.
word_claim(_,Key,T,Field) :- quoted(Key,T,Field).

hyphenated(Q,T,Start,End) :-
    ( hyphen(T), previous(Q,T,Word), hyphen_word(Word)
    ; hyphen_word(T), Word=T ),
    hyphen_start(Q,Word,Start), hyphen_end(Q,Word,End),
    End-Start>=3.

hyphen_start(Q,T,Start) :-
    previous(Q,T,Dash),hyphen(Dash),adjacent(Dash,T),
    previous(Q,Dash,Word),hyphen_word(Word),adjacent(Word,Dash), !,
    hyphen_start(Q,Word,Start).
hyphen_start(_,T,T.i).

hyphen_end(Q,T,End) :-
    next(Q,T,Dash),hyphen(Dash),adjacent(T,Dash),
    next(Q,Dash,Word),hyphen_word(Word),adjacent(Dash,Word), !,
    hyphen_end(Q,Word,End).
hyphen_end(_,T,End) :- End is T.i+1.

hyphen(T) :- memberchk(T.text,["-","‐","‑"]).
hyphen_word(T) :- word(T),string_chars(T.text,Letters),member(Letter,Letters),char_type(Letter,alpha), !.
hyphenated_head(Q,Start,End,Head) :-
    Last is End-1,
    findall(I,(between(Start,Last,I),token(Q,I,W),hyphen_word(W),
      ( W.head<Start ; W.head>=End ; W.head=:=I )),[Head]).

quote_pair("\"","\"").
quote_pair("“","”").
quote_pair("‘","’").
quote_pair("'","'").

quote_range(Q,T,Start,End) :-
    member(Open,Q.tokens),Open.i=<T.i,quote_pair(Open.text,Close),
    member(Shut,Q.tokens),Shut.i>Open.i,Shut.text==Close,
    \+ (member(Inner,Q.tokens),Inner.i>Open.i,Inner.i<Shut.i,Inner.text==Close),
    T.i<Shut.i, Start=Open.i, End is Shut.i+1, !.

gratitude(Q,T,Start,End,Separator) :-
    \+ quote_range(Q,T,_,_),
    Start=T.i,
    ( text(T,Word),memberchk(Word,["thanks","thx"]),End is Start+1
    ; text(T,"thank"),next(Q,T,You),text(You,"you"),End is Start+2 ),
    ( T.dep=="ROOT", detached_right(Q,End), Separator=[]
    ; previous(Q,T,P),memberchk(P.text,[",","—","–"]),span(P,L,R),Separator=[q(separator,L,R)]
    ; Start=:=0,detached_right(Q,End),Separator=[] ), !.

detached_right(Q,At) :-
    ( \+ token(Q,At,_) ; token(Q,At,T),(T.pos=="PUNCT";text(T,"for");text(T,"to")) ).

project_gratitude(Q,T,[wire(ID,clause,Start,Fields)|Contents]) :-
    gratitude(Q,T,Start,End,Separator),
    token_id(c,T,ID),
    ( token(Q,End,Cue),Cue.pos=="ADP",text(Cue,Word),memberchk(Word,["for","to"]),
      children(Q,Cue,["pobj","pcomp"],[Target|_]) ->
        ( predicate(Target) -> Context=clause ; Context=entity ),
        project(Q,Target,Context,Ref,Child),
        quoted(cue,Cue,Claim), (Word=="for" -> Kind=reason ; Kind=recipient),
        relation_wire(Cue,Kind,ID,Ref,[Claim],Relation),
        Contents=[Relation|Child]
    ; Contents=[] ),
    append([atom(form,fragment),q(expression,Start,End),atom(speech_act,gratitude)],Separator,Fields).

add_gaps(Q,Wires,Updated) :-
    findall(S-E,(member(wire(_,_,_,Fields),Wires),member(q(_,S,E),Fields)),Owned),
    findall(I-Key,(member(T,Q.tokens),I=T.i,T.pos\=="SPACE",\+ owned(I,Owned),gap_kind(T,Key)),Pending),
    gap_fields(Pending,Q,Wires,Claims),
    maplist(attach_claims(Claims),Wires,Updated).

owned(I,Ranges) :- member(S-E,Ranges),I>=S,I<E,!.
gap_kind(T,terminator) :- memberchk(T.text,[".","!","?",";"]), !.
gap_kind(T,separator) :- memberchk(T.text,[",","—","–",":","(",")","[","]"]), !.
gap_kind(_,unresolved).

gap_fields([],_,_,[]).
gap_fields([S-Key|Tail],Q,Wires,[ID-q(Field,S,E)|Rest]) :-
    E0 is S+1,
    ( memberchk(Key,[terminator,unresolved]) -> gap_run(Tail,Key,E0,E,Remaining)
    ; E=E0,Remaining=Tail ),
    gap_owner(Q,S,Key,Wires,ID),
    Field=Key,
    gap_fields(Remaining,Q,Wires,Rest).

gap_run([I-Key|Rest],Key,I,End,Tail) :- !,
    After is I+1,gap_run(Rest,Key,After,End,Tail).
gap_run(Tail,_,End,End,Tail).

gap_owner(_,I,terminator,Wires,ID) :-
    findall(At-Ref,(member(wire(Ref,clause,At,_),Wires),At<I),Ahead),
    keysort(Ahead,Sorted),last(Sorted,_-ID), !.
gap_owner(Q,I,_,Wires,ID) :-
    token(Q,I,T),
    ( member(wire(ID,clause,At,_),Wires),At=:=T.head -> true
    ; findall(D-Ref,(member(wire(Ref,clause,At,_),Wires),D is abs(I-At)),ByDist),
      keysort(ByDist,[_-ID|_]) ), !.
gap_owner(_,_,_,[wire(ID,_,_,_)|_],ID).

attach_claims(Claims,wire(ID,Type,At,Fields),wire(ID,Type,At,Updated)) :-
    findall(F,member(ID-F,Claims),Available),
    findall(q(terminator,S,E),member(q(terminator,S,E),Available),Terms),
    ( append(Earlier,[Final],Terms) ->
        exclude(field_is(terminator),Available,Other),
        maplist(as_separator,Earlier,Separators),
        append([Fields,Other,Separators,[Final]],Updated)
    ; append(Fields,Available,Updated) ).
as_separator(q(terminator,S,E),q(separator,S,E)).

json_wire(wire(ID,Type,_,Fields),[ID,Type,Json]) :- maplist(json_field,Fields,Json).
json_field(q(Key,S,E),[Key,quote,S,E]).
json_field(ref(Key,ID),[Key,ref,ID]).
json_field(atom(Key,Value),[Key,atom,Value]).
