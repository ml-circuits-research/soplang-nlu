:- module(native_syntax,[syntax_circuit/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).
:- use_module(library(aggregate)).

% The grammar of the Prolog strategy. It reads the tokens of one message with the classes
% of each word and writes the wires of one `syntax` circuit: clauses, nominals, relations
% and coordinations, each quoted value as a range of tokens.
%
% Every rule speaks of a word class, a word form or a position. No rule names a thing, an
% action or a phrase of a particular domain. The word lists live in src/english.mjs.
%
% Ranges are half open: S-E covers the tokens S .. E-1.

:- dynamic tk/5, lx/3, ft/4, wire/3, counter/2.

syntax_circuit(Packet,Wires) :-
    setup_call_cleanup(load(Packet), once(circuit(Wires)), unload).

load(Packet) :-
    unload,
    forall(nth0(I,Packet.tokens,[Raw,Low,Kind,Quote]),
      ( atom_string(L,Low), atom_string(K,Kind), assertz(tk(I,Raw,L,K,Quote)) )),
    forall(nth0(I,Packet.forms,Forms),
      forall(member([End,Classes,Features],Forms),
        ( forall(member(C,Classes),(atom_string(A,C),assertz(lx(I,End,A)))),
          forall(member([Key,Value],Features),
            (atom_string(KA,Key),atom_string(VA,Value),assertz(ft(I,End,KA,VA)))) ))).

unload :-
    retractall(tk(_,_,_,_,_)), retractall(lx(_,_,_)), retractall(ft(_,_,_,_)),
    retractall(wire(_,_,_)), retractall(counter(_,_)).

circuit(Wires) :-
    aggregate_all(count,tk(_,_,_,_,_),N),
    sentences(0,N,Sentences),
    maplist(sentence,Sentences,Bank),
    append(Bank,Tops),
    ( Tops == [] -> throw(no_reading('The message has no word.')) ; true ),
    maplist(emit_top,Tops),
    findall([Id,Type,Fields],wire(Id,Type,Fields),Wires).

% ----------------------------------------------------------------------------------------
% Words and their classes
% ----------------------------------------------------------------------------------------
low(I,L) :- tk(I,_,L,_,_).
quoted(I) :- tk(I,_,_,_,Q), Q>0.
mark(I) :- tk(I,_,_,punct,0).
mark(I,M) :- tk(I,_,M,punct,0).
c(I,C) :- J is I+1, lx(I,J,C), \+ quoted(I).
mw(I,E,C) :- lx(I,E,C), E>I+1.
f(I,K,V) :- J is I+1, ft(I,J,K,V).
sentence_mark(M) :- memberchk(M,['.','!','?',';','…']).
dash(M) :- memberchk(M,['—','–','-']).
personal_subject(I) :- low(I,L), memberchk(L,[i,you,he,she,it,we,they]).
third_person(I) :- low(I,L), \+ memberchk(L,[i,you,we,they,these,those]).
plural(I) :- f(I,number,plural).
name(I) :- f(I,name,true).
strong(I) :- f(I,verbal,strong).
base_verb(I) :- c(I,verb), f(I,vform,base).
participle(I) :- c(I,verb), ( f(I,vform,en) ; f(I,vform,ed) ).
ing(I) :- c(I,verb), f(I,vform,ing).
listed_adjective(I) :- c(I,adj), \+ c(I,verb).
article(I) :- low(I,L), memberchk(L,[a,an,the,this,that,these,those,my,your,his,her,its,our,their]).

% ----------------------------------------------------------------------------------------
% Sentences. A full stop, a question mark, an exclamation mark or a semicolon ends one.
% ----------------------------------------------------------------------------------------
sentences(At,End,[]) :- At>=End, !.
sentences(At,End,Sentences) :-
    ( mark(At,M), sentence_mark(M) -> Next is At+1, sentences(Next,End,Sentences)
    ; sentence_end(At,End,Stop),
      marks_after(Stop,End,After,Marks),
      ( memberchk('?',Marks) -> Q=true ; Q=false ),
      Sentences=[s(At,Stop,Q)|Rest], sentences(After,End,Rest) ).

sentence_end(At,End,At) :- At>=End, !.
sentence_end(At,_,At) :- mark(At,M), sentence_mark(M), !.
sentence_end(At,End,Stop) :- Next is At+1, sentence_end(Next,End,Stop).

marks_after(At,End,After,[M|Marks]) :-
    At<End, mark(At,M), sentence_mark(M), !, Next is At+1, marks_after(Next,End,After,Marks).
marks_after(At,_,At,[]).

% The units of a sentence are its clauses. Clauses side by side form one coordination; a
% clause after a subordinator, and a verbless part after a colon or a dash, are tied to
% their neighbour by a relation.
sentence(s(From,To,Q),Tops) :-
    units(From,To,Q,u([],[],[],none,[]),Tops).

% State: u(Members,Conjunctions,Fronted,Previous,Extra). Members and conjunctions are kept
% in reverse order. Fronted holds relations waiting for the next clause. Extra holds
% coordinations of clauses that stand inside another clause.
units(At,End,_,U,Tops) :-
    skip_marks(At,End,P,_), P>=End, !,
    finish_units(U,Tops).
units(At,End,Q,U,Tops) :-
    skip_marks(At,End,P,Marks),
    U=u(Members,Conjs,Fronted,Prev,Extra),
    ( Prev\==none, conj_at(P,P1,CR), P1<End -> true ; P1=P, CR=none ),
    ( % a subordinate clause
      subordinate_at(P1,End,Marker,P2), CR==none ->
        % before its main clause it ends at the first comma
        ( Prev==none, first_comma(P2,End,Comma), skip_marks(Comma,End,After,_), After<End -> SubEnd=Comma ; SubEnd=End ),
        clause(P2,SubEnd,sub,false,Stop,Sub,_),
        progress(P1,Stop),
        Rel=r(_,[Marker],[],Sub,fixed),
        ( Prev\==none, \+ fronted(Marks,Stop,End) ->
            add_part(Prev,rel(rg([Rel|_],_))), U1=U
        ; U1=u(Members,Conjs,[Rel|Fronted],Prev,Extra) ),
        units(Stop,End,Q,U1,Tops)
    ; % an infinitive before its clause: "to fix the details, edit the members"
      CR==none, infinitive_at(P1,End,V) ->
        To is P1+1,
        nonfinite(V,End,nmod,Stop,Sub),
        Rel=r(_,[P1-To],[],Sub,fixed),
        ( Prev\==none, \+ fronted(Marks,Stop,End) ->
            add_part(Prev,rel(rg([Rel|_],_))), U1=U
        ; U1=u(Members,Conjs,[Rel|Fronted],Prev,Extra) ),
        units(Stop,End,Q,U1,Tops)
    ; ( CR\==none, shares_auxiliary(Prev) -> Kind=shared
      ; CR\==none, shares_subject(Prev) -> Kind=past
      ; Kind=main ),
      clause(P1,End,Kind,Q,Stop,Cl,Open),
      progress(P1,Stop),
      attach_fronted(Fronted,Cl),
      tie(Marks,CR,Members,Conjs,Prev,Cl,Members1,Conjs1,More),
      append(More,Extra,Extra1),
      units(Stop,End,Q,u(Members1,Conjs1,[],Open,Extra1),Tops) ).

first_comma(At,End,At) :- At<End, mark(At,','), !.
first_comma(At,End,Comma) :- At<End, Next is At+1, first_comma(Next,End,Comma).

% The clause before a conjunction has an auxiliary with a base form, or is an infinitive:
% a base form after the conjunction shares that auxiliary or that "to" and makes no
% sentence by itself ("can we lose the shed and gain a greenhouse").
shares_auxiliary(cl(_,_,Form,Parts)) :-
    part_of(Parts,verb(V-_)), base_verb(V),
    ( Form==nonfinite -> true
    ; part_of(Parts,aux(A-_)), ( f(A,aux,modal) ; f(A,aux,do) ) ), !.

% The clause before a conjunction has a subject and a past form: a past form after the
% conjunction shares that subject ("the junior pulled the figures together and left the chart").
shares_subject(cl(_,_,_,Parts)) :-
    part_of(Parts,subj(_)), part_of(Parts,verb(V-_)), f(V,vform,ed), \+ f(V,vform,base), !.

progress(From,Stop) :-
    ( Stop>From -> true ; low(From,Word), throw(no_reading(Word)) ).

% A subordinate clause stands before its main clause when a comma follows it and more
% words come after the comma.
fronted(_,Stop,End) :-
    Stop<End, mark(Stop,','),
    skip_marks(Stop,End,P,_), P<End.

attach_fronted([],_).
attach_fronted([Rel|Rest],Cl) :- add_part(Cl,rel(rg([Rel|_],_))), attach_fronted(Rest,Cl).

% How a new clause joins what stands before it.
tie(_,_,[],Conjs,_,Cl,[Cl],Conjs,[]) :- !.
tie(_,none,[First|Rest],Conjs,_,Cl,[Cl|Rest],Conjs,[]) :-
    % a participle phrase before a clause stands with that clause: "compared to the rest, ..."
    First=cl(_,_,Form,_), Form==nonfinite, has_verb(Cl), Cl=cl(_,_,Other,_), Other\==nonfinite, !,
    add_part(Cl,rel(rg([r(_,[],[],First,fixed)|_],_))).
tie(Marks,CR,Members,Conjs,Prev,Cl,Members1,Conjs1,More) :-
    ( CR\==none ->
        % a conjunction joins the two; a verbless part that repeats the pattern of the
        % clause before it shares that clause's verb (Rule 3)
        ( shares_verb(Prev,Cl) ->
            add_part(Cl,ell(Prev)),
            ( member(M0,Members), M0==Prev -> Members1=[Cl|Members], Conjs1=[CR|Conjs], More=[]
            ; More=[co([Prev,Cl],[CR])], Members1=Members, Conjs1=Conjs )
        ; Cl=cl(_,_,ClForm,_), ClForm==nonfinite, Prev\==none, \+ ( member(M1,Members), M1==Prev ) ->
            % the two verbs that share an auxiliary stand inside another clause
            More=[co([Prev,Cl],[CR])], Members1=Members, Conjs1=Conjs
        ; Members1=[Cl|Members], Conjs1=[CR|Conjs], More=[] )
    ; verbless(Cl), \+ only_discourse(Cl), Prev\==none,
      ( memberchk(':',Marks) ; member(M,Marks), dash(M) ) ->
        % what follows a colon or a dash without a verb stands with the clause before it
        add_part(Prev,rel(rg([r(_,[],[],Cl,fixed)|_],_))),
        Members1=Members, Conjs1=Conjs, More=[]
    ; shares_verb(Prev,Cl) ->
        add_part(Cl,ell(Prev)),
        ( member(M0,Members), M0==Prev -> Members1=[Cl|Members], More=[]
        ; More=[co([Prev,Cl],[])], Members1=Members ),
        Conjs1=Conjs
    ; Members1=[Cl|Members], Conjs1=Conjs, More=[] ).

verbless(cl(_,_,_,Parts)) :- \+ part_of(Parts,verb(_)).
has_verb(cl(_,_,_,Parts)) :- part_of(Parts,verb(_)), !.
only_discourse(cl(_,_,_,Parts)) :- \+ ( part_of(Parts,P), P\=disc(_) ).
% Gapping: the part has no verb, the clause before it has one, and the part holds a
% modifier, alone or after a nominal, as that clause does.
shares_verb(Prev,Cl) :-
    Prev\==none, has_verb(Prev), verbless(Cl),
    Cl=cl(_,_,_,Parts),
    \+ ( part_of(Parts,P), P\=mod(_), P\=comp(_), P\=rel(_), P\=neg(_) ),
    ( part_of(Parts,neg(_)) -> true
    ; part_of(Parts,mod(_)), Prev=cl(_,_,_,Before), ( part_of(Before,mod(_)) ; part_of(Before,rel(_)) ) ), !.

finish_units(u([],_,[],_,Extra),Extra) :- !.
finish_units(u([],_,Fronted,_,Extra),[First|Extra]) :- !,
    % subordinate clauses with no main clause: each stays a clause, tied to the first;
    % the marker joins nothing, so it is held as a word said to the listener
    reverse(Fronted,[r(_,Markers,_,First,_)|Rest]),
    maplist(add_discourse(First),Markers),
    maplist(lone_subordinate(First),Rest).
finish_units(u([Only],Conjs,Fronted,_,Extra),[Only|Extra]) :- !,
    maplist(add_discourse(Only),Conjs),
    attach_fronted(Fronted,Only).
finish_units(u(Members,Conjs,Fronted,_,Extra),[co(Ordered,OrderedConjs)|Extra]) :-
    reverse(Members,Ordered), reverse(Conjs,OrderedConjs),
    Ordered=[First|_], attach_fronted(Fronted,First).

add_discourse(Cl,Range) :- add_part(Cl,disc(Range)).
add_negation(Cl,Range) :- add_part(Cl,neg(Range)).
add_modifier(Cl,Range) :- add_part(Cl,mod(Range)).
lone_subordinate(First,r(_,Markers,_,Other,_)) :-
    maplist(add_discourse(Other),Markers),
    add_part(First,rel(rg([r(_,[],[],Other,fixed)|_],_))).

skip_marks(At,End,P,[M|Marks]) :- At<End, mark(At,M), !, Next is At+1, skip_marks(Next,End,P,Marks).
skip_marks(At,End,P,Marks) :-
    % a quotation that holds no word is a mark too
    At<End, quoted(At), quote_end(At,E), \+ ( between(At,E,I), I<E, tk(I,_,_,word,_) ), !,
    skip_marks(E,End,P,Marks).
skip_marks(At,_,At,[]).

conj_at(P,P1,P-P1) :- mw(P,P1,conj), !.
conj_at(P,P1,P-P2) :-
    c(P,conj), P1a is P+1,
    % "and then", "and also": the second word joins as well
    ( c(P1a,conj), \+ low(P,then) -> P2 is P1a+1 ; P2=P1a ), P1=P2.

% A subordinator, with a clause after it.
subordinate_at(P,End,P-P1,P1) :-
    \+ quoted(P), \+ mw(P,_,adv),
    ( mw(P,P1,sub) -> true ; c(P,sub), \+ low(P,that), \+ low(P,so), P1 is P+1 ),
    P1<End,
    ( finite_start(P1,End,lenient) -> true
    ; % a reduced clause: "as drawn so far", "while keeping it", "if possible"
      \+ c(P,prep), ( ing(P1) ; participle(P1) ; listed_adjective(P1) ) -> true
    ; c(P,prep), participle(P1), \+ f(P1,vform,base), \+ c(P1,noun), low(P,as) ).

infinitive_at(P,End,V) :-
    low(P,to), \+ quoted(P), V is P+1, V<End, base_verb(V), \+ name(V),
    ( strong(V) -> true
    ; N is V+1, N<End,
      % a word that is as often a noun is the verb before its object or before an adverb
      ( c(N,det) ; c(N,pron) ; c(N,adv), \+ c(N,prep), \+ c(N,conj), N2 is N+1, \+ ( N2<End, head_word(N2) ) ) ).

% ----------------------------------------------------------------------------------------
% Where a new clause begins
% ----------------------------------------------------------------------------------------
clause_start(P,End) :-
    P<End,
    ( lead_word(P), N is P+1, skip_marks(N,End,N1,_), N1<End, clause_start(N1,End) -> true
    ; finite_start(P,End) -> true
    ; imperative_start(P,End) -> true
    ; question_start(P,End) ).

% A subject and its verb, a verb with its auxiliary, or an auxiliary before its subject.
finite_start(P,End) :- finite_start(P,End,strict).
finite_start(P,End,Mode) :-
    P<End,
    ( subject_pronoun_at(P), N is P+1, finite_verb_at(N,End,pronoun(P)) -> true
    ; question_start(P,End) -> true
    ; c(P,aux), f(P,aux,do), N is P+1, N<End, ( c(N,neg) ; base_verb(N), \+ c(N,pron) ) -> true
    ; noun_subject(P,End,Mode,_,_) ).

subject_pronoun_at(P) :-
    c(P,pron), low(P,L), \+ memberchk(L,[me,him,us,them,her,myself,yourself,itself]),
    \+ ( c(P,det), N is P+1, nominal_word(N) ).

question_start(P,End) :-
    P<End,
    ( c(P,aux), \+ c(P,noun), N is P+1, N<End,
      ( c(N,neg) -> N1 is N+1 ; N1=N ), N1<End,
      ( c(N1,pron) ; c(N1,det) ; name(N1) ) -> true
    ; c(P,wh), N is P+1, N<End,
      ( c(N,aux) ; low(N,about) ; c(P,wh), f(P,wh,det), nominal_word(N) ; mw(P,_,wh)
      ; low(P,how), ( c(N,adj) ; c(N,adv) ), N2 is N+1, N2<End, c(N2,aux) ) ).

% A command begins with the base form of a verb. A word that is mostly a noun counts as
% the verb only before a determiner or a pronoun; a word that is as often a noun counts
% unless a bare singular noun or "of" follows.
imperative_start(P,End) :-
    P<End, \+ quoted(P),
    ( c(P,neg), low(P,never) -> N is P+1, imperative_start(N,End)
    ; base_verb(P), \+ c(P,aux), \+ name(P) ->
        N is P+1, \+ ( N<End, low(N,of) ), \+ ( N<End, c(N,aux) ),
        ( strong(P) -> true
        ; f(P,verbal,balanced) -> \+ ( N<End, ( bare_singular_noun(N) ; c(N,conj), \+ c(N,adv) ) )
        ; N<End, ( article(N) ; object_pronoun(N) ) )
    ; c(P,aux), \+ f(P,aux,modal), base_verb(P) ->
        % "do it", "have a look", "be quiet"
        N is P+1, N<End, \+ c(N,neg), \+ subject_pronoun_only(N), \+ ( c(N,aux) )
    ; % a word nobody listed, before a determiner or a pronoun, stands where a verb stands
      f(P,unknown,true), c(P,noun), \+ c(P,adj), \+ plural(P), \+ name(P), \+ c(P,num),
      N is P+1, N<End, \+ mw(N,_,deg), ( article(N) ; object_pronoun(N) ) ).

object_pronoun(N) :- low(N,L), memberchk(L,[it,them,me,us,him,this,that,these,those,everything]).
subject_pronoun_only(N) :- low(N,L), memberchk(L,[i,he,she,we,they]).
bare_singular_noun(N) :-
    c(N,noun), \+ c(N,det), \+ c(N,pron), \+ c(N,num), \+ plural(N), \+ name(N), \+ c(N,prep), \+ c(N,adv).

% Words that open a clause without being part of its core: "please", "now", "then".
lead_word(P) :-
    \+ quoted(P),
    ( c(P,disc) ; mw(P,_,disc) ; c(P,adv), \+ c(P,prep), \+ c(P,noun), \+ low(P,there) ; low(P,just) ).

% ----------------------------------------------------------------------------------------
% The finite verb after a subject
% ----------------------------------------------------------------------------------------
% finite_verb_at(+At,+End,+Subject): a verb group that agrees with the subject starts here.
finite_verb_at(At,End,Subject) :-
    At<End, \+ quoted(At),
    ( ( c(At,neg) ; preverb(At) ), \+ c(At,aux) -> N is At+1, finite_verb_at(N,End,Subject)
    ; c(At,aux) -> \+ ( Subject=noun(_,_), c(At,noun) )
    ; c(At,clitic) -> Subject=pronoun(_)
    ; Subject=pronoun(P) ->
        c(At,verb), \+ ing(At),
        % the verb agrees with the pronoun: "it fits", "they fit"; a word that is first of
        % all an adverb or an adjective is no verb here ("move it left")
        \+ ( f(At,verbal,weak), ( c(At,adv) ; c(At,adj) ) ),
        ( third_person(P) -> ( f(At,vform,s) ; f(At,vform,ed) ) ; ( f(At,vform,base) ; f(At,vform,ed) ) ),
        ( personal_subject(P) -> true ; strong(At), ( \+ c(At,noun) -> true ; verb_evidence(At,End) ) ),
        \+ ( f(At,vform,en), \+ f(At,vform,ed), \+ f(At,vform,base), \+ f(At,vform,s) )
    ; Subject=noun(Head,Mode) ->
        c(At,verb), \+ ing(At), \+ f(At,verbal,weak),
        ( \+ c(At,noun) -> true ; Mode==lenient -> true ; verb_evidence(At,End) ),
        ( f(At,vform,s), \+ plural(Head) -> true
        ; f(At,vform,base), plural(Head), \+ name(Head) -> true
        ; f(At,vform,ed), \+ f(At,vform,base),
          % a past form that is no participle is finite; one that is both is finite when
          % the verb takes no object, when an object follows, or after a subordinator
          ( \+ f(At,vform,en) -> true
          ; f(At,frame,intrans) -> true
          ; Mode==lenient -> true
          ; N is At+1, N<End, ( article(N) ; c(N,pron), \+ c(N,det) ) ) ) ).

% A word that is a noun or a verb is the verb when what follows fits only a verb: an
% article, a pronoun, a clause, an adverb, or a particle that ends the clause.
verb_evidence(At,End) :-
    N is At+1, N<End, \+ quoted(N),
    ( article(N) -> true
    ; object_pronoun(N) -> true
    ; c(N,sub), \+ c(N,prep), \+ c(N,det) -> true
    ; c(N,wh) -> true
    ; c(N,part), N2 is N+1, ( N2>=End ; mark(N2) ; c(N2,conj) ) -> true
    ; c(N,adv), \+ c(N,noun), \+ c(N,prep), \+ c(N,adj), \+ c(N,conj) ).

preverb(At) :- c(At,adv), \+ c(At,prep), \+ c(At,noun), \+ c(At,adj) ; c(At,deg), \+ c(At,det), \+ c(At,prep) ; low(At,just) ; low(At,please).

% A nominal, with what follows it before the verb, and the finite verb after it.
noun_subject(P,End,Mode,Group,VerbAt) :-
    \+ c(P,prep), \+ c(P,conj), \+ c(P,aux),
    np(P,End,o(true,false),S,Nom),
    Nom=nom(_,_,_,Head,_), Head=H0-_, \+ c(H0,pron),
    Group=grp([Nom|_],_),
    subject_rest(S,End,Nom,VerbAt),
    finite_verb_at(VerbAt,End,noun(H0,Mode)).

subject_rest(S,End,Nom,VerbAt) :-
    S<End,
    ( prep_at(S,S1,Marker), np(S1,End,o(true,false),S2,Object) ->
        % before the verb, a phrase with a marker belongs to the nominal it follows
        add_rel(Nom,r(_,[Marker],[],grp([Object|_],_),fixed)),
        subject_rest(S2,End,Object,VerbAt)
    ; ( ing(S) ; participle(S), \+ f(S,vform,base) ), \+ c(S,aux), \+ gerund_noun(S),
      nonfinite(S,End,nmod,S2,Sub), S2<End, c(S2,aux) ->
        % "the arrow coming out of Flask can reach it"
        add_rel(Nom,r(_,[],[],Sub,fixed)), VerbAt=S2
    ; VerbAt=S ).

% ----------------------------------------------------------------------------------------
% The clause
% ----------------------------------------------------------------------------------------
% clause(+At,+End,+Kind,+Question,-Stop,-Clause,-Open). Open is the innermost clause that
% was still being read when the clause ended.
clause(At,End,Kind,Q,Stop,Cl,Open) :-
    Cl=cl(_,_,Form,_),
    leading(At,End,Cl,A1),
    ( A1>=End -> Form=fragment, Stop=End, Open=Cl
    ; core(A1,End,Kind,Q,Cl,V,A2) ->
        body(A2,End,Cl,ctx(Kind,V),st(none,none,none,false,none),Stop,Open)
    ; Form=fragment,
      body(A1,End,Cl,ctx(Kind,none),st(none,none,none,false,none),Stop,Open) ).

% Words before the core of the clause: words said to the listener, a conjunction that
% joins nothing inside the sentence, adverbs, and phrases with a marker.
leading(At,End,Cl,Stop) :-
    At<End,
    ( mark(At) -> Next is At+1, leading(Next,End,Cl,Stop)
    ; mw(At,E,disc) -> add_words(Cl,disc,At,E), leading(E,End,Cl,Stop)
    ; c(At,disc), \+ c(At,det), \+ core_word(At,End) -> N is At+1, add_part(Cl,disc(At-N)), leading(N,End,Cl,Stop)
    ; c(At,disc), c(At,det), N is At+1, ( N>=End ; mark(N) ) -> add_part(Cl,disc(At-N)), leading(N,End,Cl,Stop)
    ; c(At,conj), \+ c(At,prep), N is At+1, N<End ->
        % a conjunction with nothing before it joins nothing in this sentence
        ( c(At,adv) -> add_part(Cl,mod(At-N)) ; add_part(Cl,disc(At-N)) ), leading(N,End,Cl,Stop)
    ; mw(At,E,adv), opens_clause(E,End) -> add_words(Cl,mod,At,E), leading(E,End,Cl,Stop)
    ; lead_word(At), N is At+1, opens_clause(N,End) -> add_part(Cl,mod(At-N)), leading(N,End,Cl,Stop)
    ; fronted_phrases(At,End,Cl,S) -> leading(S,End,Cl,Stop)
    ; Stop=At ), !.
leading(At,_,_,At).

core_word(At,End) :- c(At,verb), N is At+1, N<End, ( c(N,pron) ; c(N,det) ), \+ low(At,please), \+ low(At,thanks).
opens_clause(N,End) :- skip_marks(N,End,P,_), P<End, ( clause_start(P,End) ; lead_word(P) ; c(P,prep), fronted_span(P,End,_) ), !.

% Phrases with a marker before the clause: "for the review on Friday I need ...".
fronted_phrases(At,End,Cl,Stop) :-
    fronted_span(At,End,_),
    fronted_parse(At,End,Cl,none,Stop).

fronted_span(At,End,Stop) :-
    prep_at(At,A1,_), \+ infinitive_at(At,End,_),
    np(A1,End,o(true,false),S,_),
    skip_marks(S,End,P,_), P<End,
    ( clause_start(P,End) -> Stop=P ; prep_at(P,_,_), fronted_span(P,End,Stop) ).

fronted_parse(At,End,Cl,Prev,Stop) :-
    prep_at(At,A1,Marker),
    np(A1,End,o(true,false),S,Nom),
    ( low(At,of), Prev\==none -> add_rel(Prev,r(_,[Marker],[],grp([Nom|_],_),fixed))
    ; add_part(Cl,rel(rg([r(_,[Marker],[],grp([Nom|_],_),fixed)|_],_))) ),
    skip_marks(S,End,P,_),
    ( prep_at(P,_,_), fronted_span(P,End,_) -> fronted_parse(P,End,Cl,Nom,Stop) ; Stop=P ).

% The core: the verb with its auxiliaries, its negation and its subject. It fixes the
% form of the clause. V is the token of the verb.
core(A,End,Kind,Q,Cl,V,Body) :-
    Cl=cl(_,_,Form,_),
    ( core_question(A,End,Cl,V,Body) -> Form=interrogative
    ; core_wh(A,End,Cl,V,Body) -> Form=interrogative
    ; core_do(A,End,Cl,V,Body) -> Form=imperative
    ; core_pronoun(A,End,Cl,V,Body) -> statement(Kind,Q,Form)
    ; core_imperative(A,End,Cl,V,Body) -> ( Kind==shared -> Form=nonfinite ; Form=imperative )
    ; core_noun(A,End,Kind,Cl,V,Body) -> statement(Kind,Q,Form)
    ; Kind==past, c(A,verb), f(A,vform,ed), \+ quoted(A) -> V=A, Body is A+1, add_part(Cl,verb(A-Body)), Form=declarative
    ; core_participle(A,End,Cl,V,Body) -> Form=nonfinite
    ; core_bare_auxiliary(A,End,Cl,V,Body) -> statement(Kind,Q,Form) ).

% A statement that ends with a question mark is a question by its build.
statement(Kind,true,interrogative) :- memberchk(Kind,[main,shared,past]), !.
statement(_,_,declarative).

% An auxiliary before the subject: "could you move it", "is the box red".
core_question(A,End,Cl,V,Body) :-
    c(A,aux), \+ quoted(A), A1 is A+1, A1<End,
    ( c(A1,neg) -> A2 is A1+1, Negs=[A1-A2] ; A2=A1, Negs=[] ),
    question_subject(A2,End,Subject,A3),
    ( verb_after(A,A3,End,Cl0,V,Body), Cl0=Cl ->
        add_part(Cl,aux(A-A1))
    ; f(A,aux,be) -> V=A, Body=A3, add_part(Cl,verb(A-A1))
    ; ( A3>=End ; mark(A3) ) -> V=A, Body=A3, add_part(Cl,verb(A-A1)) ),
    maplist(add_negation(Cl),Negs),
    add_part(Cl,subj(Subject)).

question_subject(A,End,grp([Nom|_],_),Stop) :-
    A<End,
    ( c(A,pron), \+ ( c(A,det), N is A+1, nominal_word(N) ) ->
        Stop is A+1, Nom=nom(_,_,_,A-Stop,_)
    ; np(A,End,o(true,false),Stop,Nom) ).

% The verb after the subject of a question, with further auxiliaries and adverbs.
verb_after(Aux,At,End,Cl,V,Body) :-
    At<End, \+ quoted(At),
    ( c(At,neg) -> N is At+1, add_part(Cl,neg(At-N)), verb_after(Aux,N,End,Cl,V,Body)
    ; low(At,please) -> N is At+1, add_part(Cl,disc(At-N)), verb_after(Aux,N,End,Cl,V,Body)
    ; preverb(At), N is At+1, N<End, \+ mark(N), follows_verb(Aux,N,End) -> add_part(Cl,mod(At-N)), verb_after(Aux,N,End,Cl,V,Body)
    ; c(At,aux), \+ f(At,aux,modal), N is At+1, N<End, later_verb(At,N,End) ->
        add_part(Cl,aux(At-N)), verb_after(At,N,End,Cl,V,Body)
    ; fits_auxiliary(Aux,At) -> V=At, Body is At+1, add_part(Cl,verb(At-Body))
    ; % after a modal and its subject stands a verb, also one nobody listed
      f(Aux,aux,M), memberchk(M,[modal,do]), f(At,unknown,true), c(At,noun), \+ plural(At), \+ name(At),
      N is At+1, ( N>=End ; article(N) ; object_pronoun(N) ; c(N,prep) ; c(N,part) ; name(N) ; c(N,num) ) ->
        V=At, Body=N, add_part(Cl,verb(At-N)) ).

follows_verb(Aux,At,End) :-
    At<End, ( fits_auxiliary(Aux,At) ; c(At,aux) ; preverb(At), N is At+1, follows_verb(Aux,N,End) ), !.

% The form of a verb that an auxiliary takes.
fits_auxiliary(Aux,At) :-
    c(At,verb), \+ quoted(At),
    ( f(Aux,aux,be) -> ( ing(At) ; participle(At), \+ listed_plain_adjective(At) ; c(At,clitic) )
    ; f(Aux,aux,have), \+ f(Aux,aux,modal) -> participle(At)
    ; c(Aux,clitic) -> ( ing(At) ; participle(At), \+ listed_plain_adjective(At) )
    ; ( f(At,vform,base) ; low(Aux,'\'d'), participle(At) ) ), !.

% An -ed word that the lexicon lists as an adjective of its own ("closed", "tired").
listed_plain_adjective(At) :- f(At,adj,listed).

later_verb(Aux,At,End) :-
    At<End,
    ( ( c(At,neg) ; preverb(At) ; low(At,please) ), \+ fits_auxiliary(Aux,At) -> N is At+1, later_verb(Aux,N,End)
    ; fits_auxiliary(Aux,At) -> true
    ; c(At,aux), \+ f(At,aux,modal), N is At+1, later_verb(At,N,End) ).

% A question word first: "what colour is the castle", "how many groups have I made".
core_wh(A,End,Cl,V,Body) :-
    wh_phrase(A,End,Wh,A1), A1<End,
    ( c(A1,aux), A2 is A1+1,
      ( c(A2,neg) -> A3 is A2+1, Negs=[A2-A3] ; A3=A2, Negs=[] ),
      question_subject(A3,End,Subject,A4),
      verb_after(A1,A4,End,Cl,V,Body) ->
        add_part(Cl,aux(A1-A2)), maplist(add_negation(Cl),Negs),
        add_part(Cl,subj(Subject)), place_wh(Wh,Cl,comp)
    ; c(A1,aux), f(A1,aux,be), A2 is A1+1, question_subject(A2,End,Subject,A3),
      \+ ( A3<End, c(A3,verb), ( ing(A3) ; participle(A3), \+ c(A3,adj) ) ) ->
        V=A1, Body=A3, add_part(Cl,verb(A1-A2)), add_part(Cl,subj(Subject)), place_wh(Wh,Cl,comp)
    ; Wh=nominal(_), verb_group(A1,End,Cl,V,Body) -> place_wh(Wh,Cl,subj)
    ; Wh=adverbs(_), verb_group(A1,End,Cl,V,Body), c(A1,aux) -> place_wh(Wh,Cl,subj) ).

wh_phrase(A,End,nominal(Nom),Stop) :-
    mw(A,E,wh), !,
    ( run(E,End,o(true,false),det,Items,S,Appos), Items\==[] ->
        build_np(A,E,Items,Nom0), np_tail(S,End,o(true,false),Nom0,Appos,S1,Nom)
    ; S1=E, H is E-1, Nom=nom(_,_,[A-H|_],H-E,_) ),
    wh_of(S1,End,Nom,Stop).
wh_phrase(A,End,nominal(Nom),Stop) :-
    c(A,wh), f(A,wh,det), A1 is A+1,
    run(A1,End,o(true,false),det,Items,S,Appos), Items\==[], !,
    build_np(A,A1,Items,Nom0), np_tail(S,End,o(true,false),Nom0,Appos,S1,Nom),
    wh_of(S1,End,Nom,Stop).
wh_phrase(A,End,nominal(Nom),Stop) :-
    c(A,wh), f(A,wh,pron), !, A1 is A+1, Nom=nom(_,_,_,A-A1,_),
    wh_of(A1,End,Nom,Stop).
wh_phrase(A,End,adverbs([A-A1|More]),Stop) :-
    c(A,wh), f(A,wh,adv), A1 is A+1,
    % "how big", "how far": the word that the question word grades stands with it
    ( low(A,how), A1<End, ( c(A1,adj) ; c(A1,adv) ), \+ c(A1,aux), A2 is A1+1, A2<End, c(A2,aux) ->
        More=[A1-A2], Stop=A2
    ; More=[], Stop=A1 ).

% "which of the boxes", "how many of them": the phrase with "of" belongs to the question word.
wh_of(S,End,Nom,Stop) :-
    ( S<End, low(S,of), \+ quoted(S), S1 is S+1, np(S1,End,o(true,false),Stop0,Object) ->
        add_rel(Nom,r(_,[S-S1],[],grp([Object|_],_),fixed)), Stop=Stop0
    ; Stop=S ).

place_wh(nominal(Nom),Cl,subj) :- add_part(Cl,subj(grp([Nom|_],_))).
place_wh(nominal(Nom),Cl,comp) :- add_part(Cl,comp(grp([Nom|_],_))).
place_wh(adverbs(Ranges),Cl,_) :- maplist(add_modifier(Cl),Ranges).

% "do not move it", "don't move it".
core_do(A,End,Cl,V,Body) :-
    c(A,aux), f(A,aux,do), low(A,L), memberchk(L,[do,does]), A1 is A+1, A1<End,
    c(A1,neg), negations(A1,End,A2,Negs), A2<End,
    base_verb(A2), \+ c(A2,pron),
    add_part(Cl,aux(A-A1)), maplist(add_negation(Cl),Negs),
    V=A2, Body is A2+1, add_part(Cl,verb(A2-Body)).

negations(At,End,Stop,[At-N|More]) :- At<End, c(At,neg), !, N is At+1, negations(N,End,Stop,More).
negations(At,_,At,[]).

% A pronoun and its verb: "I need a chart", "it is a hierarchy", "that would help".
core_pronoun(A,End,Cl,V,Body) :-
    subject_pronoun_at(A), A1 is A+1,
    finite_verb_at(A1,End,pronoun(A)),
    verb_group(A1,End,Cl,V,Body),
    add_part(Cl,subj(grp([nom(_,_,_,A-A1,_)|_],_))).

% A command.
core_imperative(A,End,Cl,V,Body) :-
    ( c(A,neg), low(A,never) -> A1 is A+1, add_part(Cl,neg(A-A1)) ; A1=A ),
    imperative_start(A1,End),
    V=A1, Body is A1+1, add_part(Cl,verb(A1-Body)).

% A nominal and its verb: "the title is too long", "the next stage begins on Friday".
core_noun(A,End,Kind,Cl,V,Body) :-
    ( Kind==sub -> Mode=lenient ; Mode=strict ),
    noun_subject(A,End,Mode,Group,VerbAt), !,
    verb_group(VerbAt,End,Cl,V,Body),
    add_part(Cl,subj(Group)).
core_noun(A,End,_,Cl,V,Body) :-
    % one word and an auxiliary: the word is the subject, whatever else it could be
    tk(A,_,_,word,0), \+ c(A,det), \+ c(A,prep), \+ c(A,conj), \+ c(A,aux), \+ c(A,wh), \+ c(A,neg),
    A1 is A+1, A1<End, c(A1,aux), \+ c(A1,noun),
    verb_group(A1,End,Cl,V,Body),
    add_part(Cl,subj(grp([nom(_,_,_,A-A1,_)|_],_))).

% A verb form that cannot make a sentence by itself: "keeping everything else".
core_participle(A,End,Cl,V,Body) :-
    A<End, \+ quoted(A),
    ( ing(A), \+ c(A,noun), \+ c(A,adj) -> true
    ; participle(A), \+ f(A,vform,base), \+ f(A,verbal,weak), \+ listed_plain_adjective(A) ),
    V=A, Body is A+1, add_part(Cl,verb(A-Body)).

% An auxiliary and its verb with no subject written: "should be bigger".
core_bare_auxiliary(A,End,Cl,V,Body) :-
    c(A,aux), f(A,aux,modal), A1 is A+1, later_verb(A,A1,End),
    verb_group(A,End,Cl,V,Body).

% The verb group: auxiliaries, negation and adverbs, then the verb. An auxiliary with no
% verb after it is the verb itself.
verb_group(At,End,Cl,V,Stop) :-
    At<End, N is At+1,
    ( c(At,neg) -> add_part(Cl,neg(At-N)), verb_group(N,End,Cl,V,Stop)
    ; ( c(At,aux) ; c(At,clitic) ), later_verb(At,N,End) -> add_part(Cl,aux(At-N)), verb_group_rest(At,N,End,Cl,V,Stop)
    ; ( c(At,aux) ; c(At,clitic) ) -> V=At, Stop=N, add_part(Cl,verb(At-N))
    ; preverb(At), N<End, \+ c(At,verb) -> add_part(Cl,mod(At-N)), verb_group(N,End,Cl,V,Stop)
    ; c(At,verb) -> V=At, Stop=N, add_part(Cl,verb(At-N)) ).

verb_group_rest(Aux,At,End,Cl,V,Stop) :-
    At<End, N is At+1,
    ( fits_auxiliary(Aux,At), \+ ( c(At,aux), \+ f(At,aux,modal), later_verb(At,N,End) ) -> V=At, Stop=N, add_part(Cl,verb(At-N))
    ; c(At,neg) -> add_part(Cl,neg(At-N)), verb_group_rest(Aux,N,End,Cl,V,Stop)
    ; low(At,please) -> add_part(Cl,disc(At-N)), verb_group_rest(Aux,N,End,Cl,V,Stop)
    ; c(At,aux), \+ f(At,aux,modal) -> add_part(Cl,aux(At-N)), verb_group_rest(At,N,End,Cl,V,Stop)
    ; preverb(At) -> add_part(Cl,mod(At-N)), verb_group_rest(Aux,N,End,Cl,V,Stop) ).

% A clause whose verb form cannot make a sentence: after "to", or a participle.
nonfinite(V,End,Kind,Stop,Cl) :-
    Cl=cl(_,_,nonfinite,_), B is V+1,
    add_part(Cl,verb(V-B)),
    body(B,End,Cl,ctx(Kind,V),st(none,none,none,false,none),Stop,_).

% ----------------------------------------------------------------------------------------
% After the verb: complements, phrases with a marker, modifiers and dependent clauses
% ----------------------------------------------------------------------------------------
% body(+At,+End,+Clause,+Context,+State,-Stop,-Open)
% Context: ctx(Kind,VerbToken). Kind is main, sub or comp for a clause that runs to the
% next clause, nmod for a clause that describes a nominal and ends at a comma.
% State: st(Last,Group,Role,Any,Relations). Last is the nominal read just before, Group
% the coordination it stands in, Any says that a nominal other than a pronoun was read,
% Relations is the group of the relation read last.
body(At,End,Cl,_,_,End,Cl) :- At>=End, !.
body(At,End,Cl,Ctx,St,Stop,Open) :-
    ( item(At,End,Cl,Ctx,St,Result) ->
        ( Result=go(Next,St1) -> Next>At, body(Next,End,Cl,Ctx,St1,Stop,Open)
        ; Result=halt(Stop,Inner), ( var(Inner) -> Open=Cl ; Open=Inner ) )
    ; Stop=At, Open=Cl ).

% --- punctuation inside a sentence
item(At,End,Cl,Ctx,St,Result) :-
    ( mark(At) ; quoted(At), quote_end(At,E), \+ ( between(At,E,I), I<E, tk(I,_,_,word,_) ) ), !,
    skip_marks(At,End,P,Marks),
    Ctx=ctx(Kind,_),
    ( P>=End -> Result=go(End,St)
    ; Kind==nmod -> Result=halt(At,_)
    ; ( memberchk(':',Marks) ; member(M,Marks), dash(M) ) -> Result=halt(At,_)
    ; boundary(P,End,Cl,St) -> Result=halt(At,_)
    ; adjunct_participle(P,End,Cl,St,Result0) -> Result=Result0
    ; listed_nominal(P,End,Cl,Ctx,St,Result0) -> Result=Result0
    ; St=st(_,_,_,Any,RG), Result=go(P,st(none,none,none,Any,RG)) ).

% --- a conjunction
item(At,End,Cl,Ctx,St,Result) :-
    conj_at(At,P,CR), \+ quoted(At), P<End, \+ mark(P), !,
    St=st(Last,Group,_,_,RG),
    ( clause_start(P,End) -> Result=halt(At,_)
    ; RG\==none, ( c(P,neg) -> P2 is P+1, Negs=[P-P2] ; P2=P, Negs=[] ),
      relation_phrase(P2,End,Cl,Ctx,St,Rel,S) ->
        % the second phrase starts where the first starts
        RG=rg(Rels,Conjs), Rels=[r(_,_,_,_,Mode)|_],
        Rel=r(_,Markers,Negs,Target,_),
        add_open(Rels,r(_,Markers,Negs,Target,Mode)), add_open(Conjs,CR),
        last_of(Target,St,S,Result)
    ; gapped(P,End,Cl) -> Result=halt(At,_)
    ; \+ low(At,so), \+ low(At,yet), npx(P,End,Ctx,S,Nom), \+ subject_of_clause(S,End,Nom),
      ( Last\==none -> G=Group ; existing_group(Cl,St,G) ) ->
        G=grp(Members,Cs), add_open(Members,Nom), add_open(Cs,CR),
        St=st(_,_,Role0,_,_), ( Last\==none -> Role=Role0 ; Role=comp ),
        note_member(St,Nom,G,Role,S,Result)
    ; low(At,but), relation_like(At,P,End,Cl,Ctx,St,Result0) -> Result=Result0
    ; Result=halt(At,_) ).

% --- words said to the listener
item(At,_,Cl,_,St,go(E,St)) :- mw(At,E,disc), !, add_words(Cl,disc,At,E).
item(At,_,Cl,_,St,go(N,St)) :- c(At,disc), \+ c(At,adv), \+ c(At,adj), !, N is At+1, add_part(Cl,disc(At-N)).
item(At,End,Cl,_,St,go(N,St)) :- low(At,please), N is At+1, ( N>=End ; mark(N) ; true ), !, add_part(Cl,disc(At-N)).

% --- "to" and a verb: the infinitive is a clause of its own, and "to" marks the relation
item(At,End,Cl,_,_,halt(Stop,Open)) :-
    infinitive_at(At,End,V), !,
    To is At+1,
    Sub=cl(_,_,nonfinite,_), B is V+1, add_part(Sub,verb(V-B)),
    add_part(Cl,rel(rg([r(_,[At-To],[],Sub,fixed)|_],_))),
    body(B,End,Sub,ctx(comp,V),st(none,none,none,false,none),Stop,Open).

% --- a subordinator and its clause
item(At,End,Cl,_,_,halt(Stop,Open)) :-
    subordinate_at(At,End,Marker,P), !,
    clause(P,End,sub,false,Stop,Sub,Open),
    add_part(Cl,rel(rg([r(_,[Marker],[],Sub,fixed)|_],_))).
% "that" after a verb opens a clause: "grumbling that the numbers were impossible"
item(At,End,Cl,_,St,halt(Stop,Open)) :-
    low(At,that), \+ quoted(At), St=st(none,_,_,_,_), P is At+1, finite_start(P,End), !,
    clause(P,End,sub,false,Stop,Sub,Open),
    add_part(Cl,rel(rg([r(_,[At-P],[],Sub,fixed)|_],_))).

% --- a clause that describes the nominal before it: "the figure that survived"
item(At,End,_,_,St,go(Stop,St)) :-
    St=st(Last,_,_,_,_), Last\==none, \+ pronoun_nominal(Last),
    c(At,rel), \+ quoted(At), P is At+1, P<End,
    relative_clause(At,P,End,Stop,Sub), !,
    add_rel(Last,r(_,[],[],Sub,fixed)).

% --- a question word that is the subject of a clause: "what's on the page"
item(At,End,Cl,_,_,halt(Stop,Open)) :-
    c(At,wh), f(At,wh,pron), \+ quoted(At), P is At+1, P<End,
    ( c(P,aux) ; c(P,clitic) ), !,
    Sub=cl(_,_,declarative,_),
    verb_group(P,End,Sub,V,B),
    add_part(Sub,subj(grp([nom(_,_,_,At-P,_)|_],_))),
    add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))),
    body(B,End,Sub,ctx(comp,V),st(none,none,none,false,none),Stop,Open).

% --- a question word and its clause: "where it is", "what you did"
item(At,End,Cl,_,St,halt(Stop,Open)) :-
    c(At,wh), \+ quoted(At), P is At+1, P<End,
    finite_start(P,End), \+ question_start(P,End), !,
    Sub=cl(_,_,declarative,_),
    ( f(At,wh,pron) -> add_part(Sub,comp(grp([nom(_,_,_,At-P,_)|_],_))) ; add_part(Sub,mod(At-P)) ),
    core(P,End,sub,false,Sub,V,B),
    body(B,End,Sub,ctx(comp,V),st(none,none,none,false,none),Stop,Open),
    St=st(Last,_,_,_,_),
    ( Last\==none, \+ pronoun_nominal(Last), f(At,wh,adv) -> add_rel(Last,r(_,[],[],Sub,fixed))
    ; add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))) ).

% --- negation of what follows
item(At,End,Cl,Ctx,St,Result) :-
    c(At,neg), \+ quoted(At), P is At+1, !,
    ( relation_phrase(P,End,Cl,Ctx,St,Rel,S) ->
        Rel=r(_,_,[At-P],Target,_), store_relation(Cl,St,Rel,St1), last_of(Target,St1,S,Result)
    ; add_part(Cl,neg(At-P)), Result=go(P,St) ).

% --- a particle that belongs to the verb, before the object: "take off the glasses"
item(At,End,Cl,ctx(_,V),St,go(N,St)) :-
    V\==none, At=:=V+1, low(At,Particle), f(V,phrasal,Particle), c(At,part),
    N is At+1, N<End, np(N,End,o(false,false),_,_), !,
    add_part(Cl,mod(At-N)).

% --- a phrase with a marker
item(At,End,Cl,Ctx,St,Result) :-
    relation_phrase(At,End,Cl,Ctx,St,Rel,S), !,
    Rel=r(_,_,_,Target,_),
    store_relation(Cl,St,Rel,St1), last_of(Target,St1,S,Result).

% --- a participle after a nominal describes it: "a bench hidden by the dog"
item(At,End,Cl,Ctx,St,Result) :-
    St=st(Last,_,_,_,_), \+ quoted(At),
    c(At,verb), ( ing(At), \+ gerund_noun(At) ; participle(At), \+ f(At,vform,base), \+ f(At,verbal,weak) ),
    \+ c(At,aux), N is At+1,
    ( Last\==none, \+ pronoun_nominal(Last) ->
        ( participle(At), \+ ing(At), result_participle(At,N,End,Ctx) ->
            add_part(Cl,mod(At-N)), Result=go(N,St)
        ; participle(At), \+ ing(At), listed_plain_adjective(At), \+ has_dependents(N,End) ->
            fail
        ; nonfinite(At,End,nmod,Stop,Sub),
          St=st(_,_,Role,_,_), Cl=cl(_,_,_,Parts),
          ( Role==pobj, part_of(Parts,comp(_)) ->
              % it describes that nominal or an earlier one: the relation starts at the clause
              add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_)))
          ; add_rel(Last,r(_,[],[],Sub,fixed)) ),
          Result=go(Stop,St) )
    ; Ctx=ctx(nmod,_), Last==none, ing(At), Cl=cl(_,_,nonfinite,_) ->
        % a second participle after the first describes the same nominal
        Result=halt(At,_)
    ; ing(At), Ctx=ctx(_,V), V\==none, \+ c(At,adj) ->
        % "keep moving", "start adding boxes"
        Sub=cl(_,_,nonfinite,_), add_part(Sub,verb(At-N)),
        add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))),
        body(N,End,Sub,ctx(comp,At),st(none,none,none,false,none),Stop,Open),
        Result=halt(Stop,Open) ), !.

% --- the base form of a verb right after a verb that takes one: "help move this"
item(At,End,Cl,ctx(_,V),_,halt(Stop,Open)) :-
    V\==none, At=:=V+1, f(V,frame,bareinf), base_verb(At), strong(At), \+ quoted(At), \+ c(At,aux), !,
    Sub=cl(_,_,nonfinite,_), N is At+1, add_part(Sub,verb(At-N)),
    add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))),
    body(N,End,Sub,ctx(comp,At),st(none,none,none,false,none),Stop,Open).

% --- a nominal
item(At,End,Cl,Ctx,St,Result) :-
    npx(At,End,Ctx,S,Nom), !,
    St=st(Last,_,_,_,_),
    ( \+ bare_infinitive(S,End,Ctx), subject_of_clause(S,End,Nom) ->
        % a nominal with its own finite verb opens a clause
        Sub=cl(_,_,declarative,_),
        verb_group(S,End,Sub,V,B),
        add_part(Sub,subj(grp([Nom|_],_))),
        ( Last\==none, \+ pronoun_nominal(Last) ->
            add_rel(Last,r(_,[],[],Sub,fixed)),
            body(B,End,Sub,ctx(nmod,V),st(none,none,none,false,none),Stop,_),
            Result=go(Stop,St)
        ; add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))),
          body(B,End,Sub,ctx(comp,V),st(none,none,none,false,none),Stop,Open),
          Result=halt(Stop,Open) )
    ; G=grp([Nom|_],_), add_part(Cl,comp(G)),
      ( bare_infinitive(S,End,Ctx) ->
          % "make the dog sit": the verb after the object is a clause of its own
          Sub=cl(_,_,nonfinite,_), B is S+1, add_part(Sub,verb(S-B)),
          add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))),
          body(B,End,Sub,ctx(comp,S),st(none,none,none,false,none),Stop,Open),
          Result=halt(Stop,Open)
      ; note_nominal(St,Nom,G,S,Result) ) ).

% --- a question word that stands alone
item(At,_,Cl,_,St,go(N,St)) :-
    c(At,wh), \+ quoted(At), N is At+1, !,
    ( f(At,wh,adv) -> add_part(Cl,mod(At-N)) ; add_part(Cl,comp(grp([nom(_,_,_,At-N,_)|_],_))) ).

% --- a word that is neither a nominal nor a marker (Rule 5)
item(At,End,Cl,_,St,go(Stop,St1)) :-
    modifier_at(At,End,Stop), !,
    St=st(Last,_,Role,_,_),
    ( Role==pobj, Last\==none, describes(At,Stop), \+ pronoun_nominal(Last) ->
        % after the nominal that ends a marked relation, the word depends on that nominal
        each_token(At,Stop,add_dependent(Last)), St1=St
    ; add_words(Cl,mod,At,Stop), St1=St ).

% --- a verb form where only a nominal can stand: after a verb that takes a bare
% infinitive it is a clause, elsewhere it names a thing
item(At,End,Cl,Ctx,St,Result) :-
    \+ quoted(At), c(At,verb), \+ c(At,aux), N is At+1,
    ( base_verb(At), Ctx=ctx(_,V), V\==none, f(V,frame,bareinf), St=st(none,_,_,false,_) ->
        Sub=cl(_,_,nonfinite,_), add_part(Sub,verb(At-N)),
        add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))),
        body(N,End,Sub,ctx(comp,At),st(none,none,none,false,none),Stop,Open),
        Result=halt(Stop,Open)
    ; Nom=nom(_,_,_,At-N,_), G=grp([Nom|_],_), add_part(Cl,comp(G)),
      note_nominal(St,Nom,G,N,Result) ), !.

% ----------------------------------------------------------------------------------------
% Helpers of the body
% ----------------------------------------------------------------------------------------
npx(At,End,ctx(_,V),Stop,Nom) :-
    ( V\==none, f(V,frame,bareinf) -> Bare=true ; Bare=false ),
    np(At,End,o(Bare,true),Stop,Nom).

% After a comma, a new clause begins, alone or after a conjunction.
boundary(P,End,Cl,St) :-
    St=st(_,_,_,_,_),
    ( conj_at(P,P1,_), P1<End ->
        ( clause_start(P1,End) -> true
        ; subordinate_at(P1,End,_,_) -> true
        ; gapped(P1,End,Cl) )
    ; clause_start(P,End) -> true
    ; subordinate_at(P,End,_,_) -> true
    ; gapped(P,End,Cl) ).

% The part after a conjunction or a comma repeats the pattern of this clause without its
% verb: a modifier alone, or a nominal and a modifier.
gapped(P,End,Cl) :-
    has_verb(Cl), Cl=cl(_,_,_,Parts),
    ( c(P,neg), P1 is P+1, P1<End, \+ c(P1,verb), \+ c(P1,aux),
      ( np(P1,End,o(false,false),_,_) ; modifier_at(P1,End,_) ) -> true
    ; once(part_of(Parts,mod(_))),
      ( modifier_at(P,End,_), \+ np(P,End,o(false,false),_,_) -> true
      ; np(P,End,o(false,false),S,Nom), \+ pronoun_nominal(Nom), S<End, \+ mark(S),
        modifier_at(S,End,_), \+ relation_start(S,End) ) ).

relation_start(S,End) :- prep_at(S,S1,_), S1<End, np(S1,End,o(false,false),_,_).

% After a comma, an -ing form opens a clause that stands with the clause before it.
adjunct_participle(P,End,Cl,St,go(Stop,st(none,none,none,Any,RG))) :-
    ing(P), \+ gerund_noun(P), \+ c(P,adj), \+ c(P,aux),
    N is P+1, \+ ( N<End, nominal_word(N), \+ c(N,det), \+ c(N,pron), \+ c(N,adv), \+ c(N,prep) ),
    St=st(_,_,_,Any,RG),
    nonfinite(P,End,nmod,Stop,Sub),
    add_part(Cl,rel(rg([r(_,[],[],Sub,fixed)|_],_))).

% After a comma, a nominal continues the list of complements of the clause.
listed_nominal(P,End,Cl,Ctx,St,Result) :-
    ( conj_at(P,P1,CR) -> true ; P1=P, CR=none ),
    P1<End, npx(P1,End,Ctx,S,Nom),
    \+ subject_of_clause(S,End,Nom),
    ( CR==none -> list_group(Cl,St,G) ; existing_group(Cl,St,G) ),
    G=grp(Members,Conjs), add_open(Members,Nom),
    ( CR==none -> true ; add_open(Conjs,CR) ),
    St=st(_,_,_,_,RG),
    ( pronoun_nominal(Nom) -> Any=false ; Any=true ),
    Result=go(S,st(Nom,G,comp,Any,RG)).

% The list a nominal after a comma joins: the last complement of the clause, or else the
% nominal read last, or else a new complement.
list_group(Cl,St,G) :-
    Cl=cl(_,_,_,Parts),
    ( last_part(Parts,comp(G0)) -> G=G0
    ; St=st(_,G1,_,_,_), G1\==none -> G=G1
    ; G=grp(_,_), add_part(Cl,comp(G)) ).

last_part(Parts,_) :- var(Parts), !, fail.
last_part([P|Rest],Found) :- ( last_part(Rest,Found) -> true ; P=comp(_), Found=P ).

note_nominal(St,Nom,G,S,Result) :-
    St=st(Last,_,Role0,_,_),
    ( Last\==none, Role0==comp, measure(Nom) -> Role=measure ; Role=comp ),
    note_member(St,Nom,G,Role,S,Result).
note_member(st(_,_,_,Any0,RG),Nom,G,Role,S,go(S,st(Nom,G,Role,Any,RG))) :-
    ( pronoun_nominal(Nom) -> Any=Any0 ; Any=true ).

% The list that a nominal after a conjunction joins when no nominal stands just before it.
existing_group(Cl,St,G) :-
    Cl=cl(_,_,_,Parts),
    ( last_part(Parts,comp(G0)) -> G=G0 ; St=st(_,G1,_,_,_), G1\==none, G=G1 ).

% "but" before a nominal that joins no list marks a relation: "nothing moves but the light".
relation_like(At,P,End,Cl,Ctx,St,Result) :-
    npx(P,End,Ctx,S,Nom),
    Rel=r(_,[At-P],[],grp([Nom|_],_),fixed),
    store_relation(Cl,St,Rel,St1), last_of(grp([Nom|_],_),St1,S,Result).

last_of(Target,st(_,_,_,Any0,RG),S,go(S,st(Last,G,pobj,Any,RG))) :-
    ( Target=grp(Members,_), nonvar(Members) ->
        last_member(Members,Last), G=Target, ( pronoun_nominal(Last) -> Any=Any0 ; Any=true )
    ; Last=none, G=none, Any=Any0 ).

last_member(Members,_) :- var(Members), !, fail.
last_member([M|Rest],Last) :- ( nonvar(Rest), Rest=[_|_] -> last_member(Rest,Last) ; Last=M ).

pronoun_nominal(nom(_,_,Deps,H-E,_)) :- var(Deps), E=:=H+1, ( c(H,pron), \+ c(H,noun), \+ c(H,num) ; c(H,clitic) ), !.

% A nominal followed by its own finite verb is the subject of a clause.
subject_of_clause(S,End,nom(_,_,_,Head,_)) :-
    Head=H-E, S<End,
    ( E=:=H+1, c(H,pron), \+ c(H,noun) -> subject_pronoun_at(H), finite_verb_at(S,End,pronoun(H))
    ; Last is E-1, finite_verb_at(S,End,noun(Last,strict)) ).

% After the object of a verb that takes a bare infinitive stands the base form of a verb.
bare_infinitive(S,End,ctx(_,V)) :-
    V\==none, f(V,frame,bareinf), S<End, \+ quoted(S),
    ( base_verb(S), \+ f(S,verbal,weak), \+ c(S,aux),
      % a word that also says how things are, standing last, is that word: "make the title bold"
      \+ ( f(S,adj,listed), N is S+1, ( N>=End ; mark(N) ) ) -> true
    ; low(S,be) ).

% A participle alone after the object of a verb that takes a describing word: "keep it selected".
result_participle(At,N,End,ctx(_,V)) :-
    V\==none, f(V,frame,opred), \+ has_dependents(N,End), \+ ing(At).
has_dependents(N,End) :- N<End, \+ mark(N), ( prep_at(N,_,_) ; np(N,End,o(false,false),_,_) ; c(N,adv), \+ c(N,conj) ), !.

gerund_noun(At) :- c(At,noun), \+ f(At,unknown,true).

% Modifiers: adjectives, adverbs, degree words and particles that start no nominal.
modifier_at(At,End,Stop) :-
    At<End, \+ quoted(At),
    ( mw(At,E,deg) -> ( E<End, ( c(E,adj) ; c(E,adv) ), \+ nominal_after(E,End) -> Stop is E+1 ; Stop=E )
    ; mw(At,Stop,adv) -> true
    ; c(At,deg), N is At+1, N<End, ( c(N,adj) ; c(N,adv) ), \+ nominal_after(N,End), \+ c(At,prep) -> Stop is N+1
    ; ( c(At,adj) ; c(At,adv) ; c(At,part) ; c(At,deg) ) -> Stop is At+1
    ; c(At,prep), \+ low(At,of) -> Stop is At+1 ).

% the adjective is followed by the noun it describes
nominal_after(E,End) :- N is E+1, N<End, c(N,noun), \+ c(N,prep), \+ c(N,adv).

describes(At,Stop) :- Stop=:=At+1, c(At,adj), \+ c(At,prep).

% ----------------------------------------------------------------------------------------
% Phrases with a marker
% ----------------------------------------------------------------------------------------
prep_at(At,Stop,At-Stop) :- \+ quoted(At), ( mw(At,Stop,prep) -> true ; c(At,prep), Stop is At+1 ).

% relation_phrase(+At,+End,+Clause,+Context,+State,-Relation,-Stop)
relation_phrase(At,End,_,Ctx,St,r(_,[Marker],_,Target,Mode),Stop) :-
    prep_at(At,P,Marker), P<End, \+ mark(P),
    \+ infinitive_at(At,End,_),
    St=st(Last,_,Role,Any,_),
    ( ing(P), \+ gerund_noun(P), \+ c(P,adj) ->
        % "by adding a box": the marker ends at a clause
        nonfinite(P,End,comp,Stop,Target)
    ; c(P,wh), P1 is P+1, P1<End, finite_start(P1,End), \+ question_start(P1,End) ->
        % "of what we talked about": the marker ends at a clause
        Target=cl(_,_,declarative,_),
        ( f(P,wh,pron) -> add_part(Target,comp(grp([nom(_,_,_,P-P1,_)|_],_))) ; add_part(Target,mod(P-P1)) ),
        core(P1,End,sub,false,Target,V,B),
        body(B,End,Target,ctx(comp,V),st(none,none,none,false,none),Stop,_)
    ; npx(P,End,Ctx,Stop,Nom) -> Target=grp([Nom|_],_)
    ; % a marker ends at a nominal: a word that could not start one is taken as one
      \+ c(P,prep), \+ c(P,conj), \+ c(P,aux), \+ c(P,det), \+ c(P,wh), \+ c(P,neg), \+ c(P,sub), \+ low(P,to),
      tk(P,_,_,word,0), ( c(P,adj) ; c(P,adv) ; c(P,verb) ; c(P,num) ) ->
        Stop is P+1, Target=grp([nom(_,_,_,P-Stop,_)|_],_) ),
    ( low(At,of), Last\==none -> Mode=at(Last)
    ; Role==measure, Last\==none -> Mode=at(Last)
    ; low(At,than) -> Mode=fixed
    ; Last\==none, \+ pronoun_nominal(Last) -> Mode=lazy(Last,Any)
    ; Mode=lazy(none,Any) ).

% A measure (Rule 4): a nominal that starts with a numeral and stands right after another
% complement, as in "put the lamp two inches from the edge".
measure(nom(_,_,Deps,H-_,_)) :- nonvar(Deps), Deps=[D-_|_], c(D,num), \+ c(H,num), !.

store_relation(Cl,st(Last,G,Role,Any,_),Rel,st(Last,G,Role,Any,RG)) :-
    Rel=r(_,_,_,_,Mode),
    RG=rg([Rel|_],_),
    ( Mode=at(Owner) -> add_rel_group(Owner,RG) ; add_part(Cl,rel(RG)) ).

% A clause after a relative word: the word is its subject, its complement or a modifier.
relative_clause(At,P,End,Stop,Sub) :-
    Sub=cl(_,_,declarative,_),
    ( f(At,wh,adv) ; low(At,where) ; low(At,when) ), finite_start(P,End), \+ question_start(P,End) ->
        add_part(Sub,mod(At-P)), core(P,End,sub,false,Sub,V,B),
        body(B,End,Sub,ctx(nmod,V),st(none,none,none,false,none),Stop,_)
    ; Sub=cl(_,_,declarative,_),
      finite_verb_at(P,End,pronoun(At)), ( c(P,aux) ; c(P,verb), strong(P) ; c(P,neg) ; preverb(P) ) ->
        verb_group(P,End,Sub,V,B), add_part(Sub,subj(grp([nom(_,_,_,At-P,_)|_],_))),
        body(B,End,Sub,ctx(nmod,V),st(none,none,none,false,none),Stop,_)
    ; Sub=cl(_,_,declarative,_),
      finite_start(P,End), \+ question_start(P,End),
      add_part(Sub,comp(grp([nom(_,_,_,At-P,_)|_],_))), core(P,End,sub,false,Sub,V,B),
      body(B,End,Sub,ctx(nmod,V),st(none,none,none,false,none),Stop,_).

% ----------------------------------------------------------------------------------------
% Nominals
% ----------------------------------------------------------------------------------------
% np(+At,+End,+Options,-Stop,-Nominal). Options: o(BareInfinitive,QuestionWords).
np(At,End,Opt,Stop,Nom) :-
    At<End,
    ( quoted(At) -> quote_end(At,E), once(( between(At,E,I), I<E, tk(I,_,_,word,_) )),
        Nom0=nom(_,_,_,At-E,_), S0=E, Appos=none
    ; determined(At,End,Opt,S0,Nom0,Appos) -> true
    ; pronoun(At,End,S0,Nom0) -> Appos=none
    ; bare(At,End,Opt,S0,Nom0,Appos) ),
    np_tail(S0,End,Opt,Nom0,Appos,Stop,Nom).

quote_end(At,E) :- tk(At,_,_,_,Q), quote_run(At,Q,E).
quote_run(At,Q,E) :- ( tk(At,_,_,_,Q) -> N is At+1, quote_run(N,Q,E) ; E=At ).

% A determiner and the words after it.
determined(At,End,Opt,Stop,Nom,Appos) :-
    determiners(At,End,Opt,D),
    run(D,End,Opt,det,Items1,Stop1,Appos1),
    numbered(Items1,Stop1,Appos1,End,Opt,Items0,Stop0,Appos0),
    ( Items0\==[] -> Items=Items0, Stop=Stop0, Appos=Appos0
    ; % an article always has a head: the next word is that head, whatever else it could be
      D=:=At+1, article(At), \+ low(At,that), \+ low(At,this), \+ low(At,these), \+ low(At,those), \+ low(At,her),
      tk(D,_,_,word,0), \+ c(D,det), \+ c(D,aux), \+ function_run(D), D1 is D+1,
      run(D1,End,Opt,noun,More,Stop,Appos), Items=[D-noun|More] ),
    build_np(At,D,Items,Nom).

% "the Work 6 calendar": after a determiner, a number between two nouns belongs to the nominal.
numbered(Items,Stop,none,End,Opt,AllItems,AllStop,Appos) :-
    Items\==[], Stop<End, c(Stop,num), \+ quoted(Stop), last(Items,L-noun), L=:=Stop-1,
    % a numeral before a plural noun counts that noun: "the lamp two inches" is two nominals
    N is Stop+1, N<End, c(N,noun), \+ c(N,num), \+ plural(N),
    run(N,End,Opt,noun,More,AllStop,Appos), More\==[], !,
    append(Items,[Stop-num|More],AllItems).
numbered(Items,Stop,Appos,_,_,Items,Stop,Appos).

determiners(At,End,o(_,Wh),D) :-
    \+ quoted(At),
    ( mw(At,D,det) -> true
    ; c(At,wh), Wh==true, f(At,wh,det), D is At+1 -> true
    ; c(At,det), f(At,det,pre), N is At+1, N<End, c(N,det), \+ f(N,det,pre), \+ low(N,that) -> D is N+1
    ; c(At,det), \+ c(At,wh), D is At+1 ),
    D<End.

% A pronoun.
pronoun(At,End,Stop,nom(_,_,Deps,At-N,_)) :-
    \+ quoted(At), \+ mw(At,_,pron), N is At+1,
    ( c(At,clitic), P is At-1, P>=0, low(P,let) -> Stop=N
    ; c(At,pron), \+ low(At,there), \+ ( c(At,num), N<End, nominal_word(N) ),
      % a quantity word before a marker other than "of" is an adverb: "all along the wall"
      \+ ( c(At,deg), \+ ( N<End, low(N,of) ) ),
      \+ ( low(At,all), N<End, c(N,prep), \+ low(N,of) ) ->
        ( f(At,pron,indefinite), N<End, low(N,else) -> Stop is N+1, Deps=[N-Stop|_] ; Stop=N ) ).
pronoun(At,_,Stop,nom(_,_,[At-M|_],M-Stop,_)) :-
    mw(At,Stop,pron), Stop=:=At+2, M is At+1.


% Words with no determiner.
bare(At,End,Opt,Stop,Nom,Appos) :-
    run(At,End,Opt,none,Items,Stop,Appos), Items\==[],
    ( member(I-_,Items), ( c(I,noun), \+ c(I,adj) ; c(I,num) ; name(I) ) -> true ),
    Items=[First-_|_], \+ ( c(First,deg), \+ c(First,noun), \+ c(First,num), \+ c(First,adj) ),
    build_np(At,At,Items,Nom).

% The words of a nominal after its determiner. An item is Token-Kind.
% Prior is the kind of the item before: det, adj, num, noun or none.
run(At,End,Opt,Prior,Items,Stop,Appos) :-
    ( At<End, run_item(At,End,Opt,Prior,Kind,Next) ->
        ( Kind=stop -> Items=[], Stop=At, Appos=none
        ; Kind=appos -> Items=[], Stop=At, Appos=at(At)
        ; Items=[At-Kind|Rest],
          ( Kind=noun -> Prior1=noun ; Prior==noun -> Prior1=noun ; Prior1=Kind ),
          run(Next,End,Opt,Prior1,Rest,Stop,Appos) )
    ; Items=[], Stop=At, Appos=none ).

run_item(At,End,Opt,Prior,Kind,Next) :-
    \+ quoted(At), tk(At,_,_,word,_), \+ function_run(At), Next is At+1,
    ( closed_word(At) -> fail
    ; c(At,num) ->
        ( Prior==noun -> ( Next<End, head_word(Next), \+ c(Next,num) -> Kind=stop ; Kind=appos )
        ; Kind=num )
    ; name(At), Prior==noun, Prev is At-1, \+ name(Prev), \+ ( Next<End, c(Next,noun), \+ name(Next), \+ c(Next,prep), \+ c(Next,adv) ) ->
        % a name after a common noun names the same thing again: "the entry Power"
        Kind=appos
    ; c(At,noun), c(At,adj), \+ name(At), Next<End, head_word(Next) ->
        % a word that is a modifier or a noun describes the noun after it: "the top row"
        Kind=adj
    ; c(At,noun), c(At,adj), \+ name(At), ( \+ c(At,verb) ; f(At,verbal,weak) ), memberchk(Prior,[noun,none]) ->
        % after a noun or with no determiner, and with no noun after it, it is no nominal:
        % it says how something is ("move the box left", "facing right")
        fail
    ; c(At,noun) -> noun_item(At,End,Opt,Prior,Kind)
    ; c(At,adj), Prior\==noun -> Kind=adj
    ; c(At,adj), listed_adjective(At), Next<End, c(Next,noun), \+ function_run(Next), \+ c(At,adv) -> Kind=adj
    ; c(At,deg), Prior\==noun, Next<End, c(Next,adj) -> Kind=adj
    ; c(At,adv), f(At,unknown,true), memberchk(Prior,[det,adj,num]), Next<End, head_word(Next) ->
        % between a determiner and its noun stands an adjective, whatever its ending: "an elderly woman"
        Kind=adj
    ; c(At,verb), ( ing(At) ; participle(At) ), Prior\==noun, Next<End, head_candidate(Next) -> Kind=adj
    ; c(At,verb), \+ c(At,aux), memberchk(Prior,[det,adj,num]), Opt=o(false,_) ->
        % after a determiner, an adjective or a numeral a verb form names a thing:
        % "the move", "the following"
        Kind=noun
    ; ( c(At,deg) ; c(At,adv) ), memberchk(Prior,[det,adj,num]), \+ c(At,prep), \+ c(At,conj), \+ c(At,det),
      \+ ( Next<End, head_word(Next) ) ->
        % so does a word that is otherwise an adverb: "the way", "the back"
        Kind=noun
    ; ing(At), \+ c(At,aux), Prior==noun, ( Next>=End ; mark(Next) ; c(Next,conj) ) ->
        % an -ing form with nothing after it names a thing: "ID planning"
        Kind=noun
    ; c(At,verb), \+ c(At,aux), \+ ing(At), \+ f(At,adj,listed), Prior==noun, Opt=o(false,_), Prev is At-1,
      ( plural(Prev), \+ name(Prev) -> f(At,vform,s), \+ f(At,vform,base) ; f(At,vform,base), \+ plural(Prev) ) ->
        % a verb form that cannot agree with the noun before it is a noun itself:
        % "the order scatter", "the bookings counts"
        Kind=noun
    ; c(At,conj), Prior==adj, Next<End, c(Next,adj), N2 is Next+1, N2<End, head_word(N2) -> Kind=adj ).

% Several words that stand as one marker, adverb or conjunction start no nominal.
function_run(At) :- mw(At,_,C), memberchk(C,[prep,adv,deg,conj,sub,disc]), !.

closed_word(At) :-
    ( c(At,det) ; c(At,pron) ; c(At,prep) ; c(At,aux) ; c(At,wh) ; c(At,neg) ; c(At,sub) ; c(At,to) ; c(At,clitic) ; c(At,disc) ),
    \+ c(At,noun), \+ c(At,adj), \+ c(At,num), !.
closed_word(At) :- c(At,conj), \+ c(At,noun), \+ c(At,adj).

noun_item(At,End,Opt,Prior,Kind) :-
    Next is At+1,
    ( c(At,adv), Prior==noun, \+ ( Next<End, head_word(Next) ) ->
        % a direction word after a noun is an adverb: "move the box left"
        fail
    ; c(At,adv), Prior==none, \+ ( Next<End, head_word(Next) ), \+ name(At) -> fail
    ; Opt=o(true,_), Prior==noun, base_verb(At), \+ f(At,verbal,weak), \+ name(At), \+ ( Next<End, head_word(Next) ) ->
        % after a verb that takes a bare infinitive, the base form of a verb is that verb
        fail
    ; Prior==noun, c(At,verb), f(At,vform,s), \+ f(At,verbal,weak), Prev is At-1, \+ plural(Prev), verb_evidence(At,End) ->
        % "the window looks out": the word after the noun is its verb
        fail
    ; ing(At), f(At,unknown,true), Prior==noun, Next<End, \+ mark(Next), \+ c(Next,conj) -> fail
    ; plural_tail(At,End,Prior) -> fail
    ; Kind=noun ).

% A plural noun closes its nominal when what follows is a noun and an adjective that
% together say how it is: "the bars sea green".
plural_tail(At,End,noun) :-
    Prev is At-1, plural(Prev), \+ name(Prev), \+ plural(At), \+ name(At),
    Next is At+1, Next<End, listed_adjective(Next), \+ c(Next,noun),
    N2 is Next+1, \+ ( N2<End, head_word(N2) ).

% A word that can close a nominal after a describing word: a verb form too ("the turning place").
head_candidate(At) :- head_word(At), !.
head_candidate(At) :- \+ quoted(At), c(At,verb), \+ c(At,aux), \+ ing(At), \+ participle(At).

% A word that can close a nominal.
% A participle is none: it opens a clause of its own ("a diamond labelled Rain").
head_word(At) :-
    \+ quoted(At), \+ function_run(At),
    ( c(At,noun) ; c(At,adj), \+ closed_word(At), ( \+ c(At,verb) ; f(At,adj,listed) ) ; c(At,num) ), \+ mark(At).
nominal_word(At) :- \+ quoted(At), tk(At,_,_,word,_), ( c(At,noun) ; c(At,adj) ; c(At,num) ), \+ closed_word(At).

% The last word is the head; the others, with the determiners, depend on it.
build_np(At,D,Items,nom(_,_,Deps,H-E,_)) :-
    append(Before,[H-_],Items), E is H+1,
    findall(I-J,( between(At,D,I), I<D, J is I+1 ),Dets),
    findall(I-J,( member(I-_,Before), J is I+1 ),Mods),
    append(Dets,Mods,All),
    ( All==[] -> true ; append(All,_,Deps) ).

% After a nominal: the possessive "'s" and a nominal that names the same thing again.
np_tail(S,End,Opt,Nom0,Appos,Stop,Nom) :-
    ( Appos==none, S<End, quoted(S), \+ pronoun_nominal(Nom0), \+ quoted_nominal(Nom0),
      quote_end(S,E), once(( between(S,E,I), I<E, tk(I,_,_,word,_) )) ->
        % "the title 'Sales'": the quotation names the nominal again
        add_rel(Nom0,r(_,[],[],grp([nom(_,_,_,S-E,_)|_],_),fixed)), Stop=E, Nom=Nom0
    ; Appos==none, S<End, mark(S,':'), label(Nom0), S1 is S+1, S1<End, ( name(S1) ; c(S1,num) ; quoted(S1) ),
      np(S1,End,Opt,S2,Value), \+ subject_of_clause(S2,End,Value) ->
        % "x: 120": a bare word, a colon and its value
        add_rel(Nom0,r(_,[],[],grp([Value|_],_),fixed)), Stop=S2, Nom=Nom0
    ; Appos=at(A), bare(A,End,Opt,S1,Second,Appos1) ->
        % "x 120", "the entry Power": two nominals that stand together
        add_rel(Nom0,r(_,[],[],grp([Second|_],_),fixed)),
        np_tail(S1,End,Opt,Second,Appos1,Stop,_), Nom=Nom0
    ; S<End, c(S,clitic), \+ pronoun_nominal(Nom0), P is S+1, P<End, nominal_word(P),
      run(P,End,Opt,det,Items,S1,Appos1), Items\==[] ->
        build_np(P,P,Items,Owned),
        add_rel(Owned,r(_,[S-P],[],grp([Nom0|_],_),fixed)),
        np_tail(S1,End,Opt,Owned,Appos1,Stop,Nom)
    ; Stop=S, Nom=Nom0 ).

quoted_nominal(nom(_,_,_,H-_,_)) :- quoted(H).
label(nom(_,_,Deps,H-E,_)) :- var(Deps), E=:=H+1, \+ quoted(H), \+ c(H,pron), \+ c(H,num), H>0.

% ----------------------------------------------------------------------------------------
% Open lists: a clause and a nominal grow while the sentence is read
% ----------------------------------------------------------------------------------------
add_open(List,Item) :- var(List), !, List=[Item|_].
add_open([_|Rest],Item) :- add_open(Rest,Item).
close_open(List) :- var(List), !, List=[].
close_open([]).
close_open([_|Rest]) :- close_open(Rest).
part_of(Parts,_) :- var(Parts), !, fail.
part_of([P|Rest],Part) :- ( Part=P ; part_of(Rest,Part) ).

add_part(cl(_,_,_,Parts),Part) :- add_open(Parts,Part).
add_words(Cl,Key,At,E) :- each_token(At,E,add_word(Cl,Key)).
add_word(Cl,Key,Range) :- Part=..[Key,Range], add_part(Cl,Part).
each_token(At,E,_) :- At>=E, !.
each_token(At,E,Goal) :- N is At+1, call(Goal,At-N), each_token(N,E,Goal).
add_rel(nom(_,_,_,_,Rels),Rel) :- add_open(Rels,rg([Rel|_],_)).
add_rel_group(nom(_,_,_,_,Rels),RG) :- add_open(Rels,RG).
add_dependent(nom(_,_,Deps,_,_),Range) :- add_open(Deps,Range).

% ----------------------------------------------------------------------------------------
% Writing the wires
% ----------------------------------------------------------------------------------------
fresh(Letter,Id) :-
    ( retract(counter(Letter,N)) -> true ; N=0 ), N1 is N+1, assertz(counter(Letter,N1)),
    format(atom(Id),'~w~d',[Letter,N1]).

emit_top(Node) :- emit_node(Node,_).

emit_node(co(Members,Conjs),Id) :- !,
    maplist(emit_node,Members,Ids),
    ( Ids=[Id] -> true
    ; fresh(k,Id),
      findall([conjunct,ref,M],member(M,Ids),Refs),
      findall([conjunction,quote,S,E],member(S-E,Conjs),Words),
      append(Refs,Words,Fields), assertz(wire(Id,coordination,Fields)) ).
emit_node(Cl,Id) :- Cl=cl(_,_,_,_), !, emit_clause(Cl,Id).
emit_node(Group,Id) :- Group=grp(_,_), !, emit_group(Group,Id).
emit_node(Nom,Id) :- emit_nominal(Nom,Id).

emit_clause(cl(Id,Done,Form0,Parts),Id) :-
    ( Done==true -> true
    ; Done=true, close_open(Parts), fresh(c,Id),
      ( memberchk(verb(_),Parts) -> ( var(Form0) -> Form=declarative ; Form=Form0 ) ; Form=fragment ),
      ( var(Form0) -> Form0=Form ; true ),
      include(is_complement,Parts,CompParts), maplist(complement_group,CompParts,Comps),
      phrase_owners(Parts,Owners),
      emit_parts(Parts,Id,Form,c(Comps,Owners),Fields0),
      assertz(wire(Id,clause,[[form,atom,Form]|Fields0])) ).

is_complement(comp(_)).
complement_group(comp(G),G) :- G=grp(Members,Conjs), close_open(Members), close_open(Conjs).

% The nominals that a phrase with a marker directly follows in this clause.
phrase_owners([],[]).
phrase_owners([Part|Rest],Owners) :-
    ( Part=rel(rg(Rels,Conjs)) ->
        close_open(Rels), close_open(Conjs),
        findall(Prev,( member(r(_,_,_,_,Mode),Rels), nonvar(Mode), Mode=lazy(Prev,_), Prev\==none ),Found),
        append(Found,More,Owners)
    ; Owners=More ),
    phrase_owners(Rest,More).

emit_parts([],_,_,_,[]).
emit_parts([Part|Rest],Id,Form,Comps,Fields) :-
    ( Part=rel(RG) -> emit_relations(RG,Id,clause(Form,Comps)), Fields=More
    ; Part=subj(G) -> emit_group(G,Ref), Fields=[[subject,ref,Ref]|More]
    ; Part=comp(G) -> emit_group(G,Ref), Fields=[[complement,ref,Ref]|More]
    ; Part=ell(Other) -> emit_clause(Other,Ref),
        ( Form==fragment -> Fields=[[ellipsis,ref,Ref]|More] ; Fields=More )
    ; Part=verb(S-E) -> ( Form==fragment -> Fields=More ; Fields=[[verb,quote,S,E]|More] )
    ; Part=aux(S-E) -> Fields=[[auxiliary,quote,S,E]|More]
    ; Part=neg(S-E) -> Fields=[[negation,quote,S,E]|More]
    ; Part=mod(S-E) -> Fields=[[modifier,quote,S,E]|More]
    ; Part=disc(S-E) -> Fields=[[discourse,quote,S,E]|More] ),
    emit_parts(Rest,Id,Form,Comps,More).

emit_group(grp(Members,Conjs),Id) :-
    close_open(Members), close_open(Conjs),
    maplist(emit_nominal,Members,Ids),
    ( Ids=[Id] -> true
    ; fresh(k,Id),
      findall([conjunct,ref,M],member(M,Ids),Refs),
      findall([conjunction,quote,S,E],member(S-E,Conjs),Words),
      append(Refs,Words,Fields), assertz(wire(Id,coordination,Fields)) ).

emit_nominal(nom(Id,Done,Deps,S-E,Rels),Id) :-
    ( Done==true -> true
    ; Done=true, close_open(Deps), close_open(Rels), fresh(n,Id),
      findall([dependent,quote,A,B],member(A-B,Deps),Fields0),
      append(Fields0,[[head,quote,S,E]],Fields),
      assertz(wire(Id,nominal,Fields)),
      maplist(emit_owned(Id),Rels) ).
emit_owned(Id,RG) :- emit_relations(RG,Id,nominal).

% The relations of one group. A relation starts at its owner, unless the place of the
% phrase settles another start (see start/5).
emit_relations(rg(Rels,Conjs),Owner,Context) :-
    close_open(Rels), close_open(Conjs),
    maplist(emit_relation(Owner,Context),Rels,Ids),
    ( Ids=[_,_|_] ->
        fresh(k,K),
        findall([conjunct,ref,M],member(M,Ids),Refs),
        findall([conjunction,quote,S,E],member(S-E,Conjs),Words),
        append(Refs,Words,Fields), assertz(wire(K,coordination,Fields))
    ; true ).

emit_relation(Owner,Context,r(Id,Markers,Negs,Target,Mode),Id) :-
    fresh(r,Id),
    ( var(Negs) -> Negs=[] ; true ),
    start(Mode,Owner,Context,From,Ambiguous),
    emit_node(Target,To),
    findall([marker,quote,S,E],member(S-E,Markers),MarkerFields),
    findall([negation,quote,S,E],member(S-E,Negs),NegFields),
    ( Ambiguous==true -> Tail=[[attachment,atom,ambiguous]] ; Tail=[] ),
    append([[[from,ref,From],[to,ref,To]],MarkerFields,NegFields,Tail],Fields),
    assertz(wire(Id,relation,Fields)).

% Where a relation with a marker starts (Rule 2).
%  - "of", a measure, and what the grammar fixed: at the nominal or clause given.
%  - In a verbless clause: at the nominal the phrase follows.
%  - After a member of a list of complements that is not the last, or after the last
%    when an earlier member has such a phrase too: at that member.
%  - After a nominal other than a pronoun: at the clause, marked ambiguous.
%  - Otherwise at the clause: no nominal could take the phrase.
start(fixed,Owner,_,Owner,false).
start(at(Nom),_,_,From,false) :- emit_nominal(Nom,From).
start(lazy(Prev,Any),Owner,Context,From,Ambiguous) :-
    ( Context=clause(fragment,_), Prev\==none -> emit_nominal(Prev,From), Ambiguous=false
    ; Context=clause(_,c(Comps,Owners)), Prev\==none, member(grp(Members,_),Comps),
      Members=[_,_|_], nth0(Index,Members,M), M==Prev,
      ( length(Members,Count), Index<Count-1 -> true
      ; % after the last member: at that member when an earlier member has a phrase too
        member(Other,Owners), Other\==Prev, member(M2,Members), M2==Other ) ->
        emit_nominal(Prev,From), Ambiguous=false
    ; Any==true -> From=Owner, Ambiguous=true
    ; Prev\==none -> From=Owner, Ambiguous=true
    ; From=Owner, Ambiguous=false ).
