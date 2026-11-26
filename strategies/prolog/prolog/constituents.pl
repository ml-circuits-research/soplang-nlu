:- module(constituents, [constituent_graph/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).

% A chart cell retains the best derivation of a syntactic category over one
% source interval. Lower weights express stronger lexical/grammatical evidence.
% A new request always starts with an empty chart. No source text is retained.
:- dynamic cell/6, lex/3, frame/2.
constituent_graph(Q, Wires) :-
    setup_call_cleanup(true, parse_graph(Q,Wires), (retractall(cell(_,_,_,_,_,_)),retractall(lex(_,_,_)),retractall(frame(_,_)))).

parse_graph(Q,Wires) :-
    length(Q.tokens,N), N>0, N=<100,
    forall(nth0(I,Q.tokens,[Raw,Quoted]), (
        string_lower(Raw,Lower), assertz(lex(I,Raw,Lower)),
        nth0(I,Q.forms,Forms), forall((member(F,Forms),F.end=:=I+1,member(Family,F.frames)),assertz(frame(I,Family))), forall(member(F,Forms),
          forall(entry(I,Raw,Lower,Quoted,F,Category,Head,Tree,Cost),
            keep(I,F.end,Category,Head,Tree,Cost))))),
    forall(nth0(I,Q.tokens,[Mark,true]),add_quote(Q,I,Mark)),
    forall(between(1,N,Width), (Last is N-Width,
        forall(between(0,Last,I),(J is I+Width,fill(I,J))))),
    findall(Cost-T,cell(0,N,message,_,T,Cost),Found),
    keysort(Found,[_-Tree|_]), emit(Tree,_,0,_,Records,[]), maplist(wire_record,Records,Wires), !.
parse_graph(_,[]).

wire_record(wire(Id,Type,Attrs),[Id,Type,Attrs]).

keep(I,J,C,H,T,S) :-
    ( cell(I,J,C,_,_,Old), Old=<S -> true
    ; retractall(cell(I,J,C,_,_,_)), assertz(cell(I,J,C,H,T,S)) ).

fill(I,J) :-
    Last is J-1, First is I+1,
    forall(between(First,Last,K),
      forall((cell(I,K,A,H,X,S), cell(K,J,B,H2,Y,S2),
              combine(A,B,H,H2,X,Y,I,K,J,C,H3,T,Penalty)),
        (Cost is S+S2+Penalty,keep(I,J,C,H3,T,Cost)))),
    % Unary promotions are acyclic and ordered from lexical to clause.
    forall(member(A,[noun,proper,pron,adj,verb,vp,np,clause]),
      forall((cell(I,J,A,H,X,S), promote(A,H,X,C,T,P)),
        (Score is S+P,keep(I,J,C,H,T,Score)))).

add_quote(Q,I,Open) :-
    ( memberchk(Open-Close,["\""-"\"","“"-"”","'"-"'","‘"-"’"]),
      Start is I+1, nth0(K,Q.tokens,[Close,true]), K>Start,
      forall(between(Start,K,At),nth0(At,Q.tokens,[_,true])),
      \+ (between(Start,K,At),At<K,nth0(At,Q.tokens,[Close,true])) ->
        J is K+1,keep(I,J,np,I,n(entity,I,[q(name,I,J)]),0)
    ; true ).

% All literal fields are half-open intervals in the original strategy packet.
entry(I,_,W,false,F,Cat,I,Tree,P) :-
    J=F.end, J=:=I+1, atomic_entry(W,F,Cat,I,J,Tree,P).
entry(I,_,_,false,F,prep,I,span(I,J),0) :-
    J=F.end,F.preposition\=[], (J>I+1; lex(I,_,W), preposition(W)).
entry(I,_,_,false,F,det,I,span(I,J),0) :-
    J=F.end,J>I+1,memberchk("determiner",F.pos).
entry(I,_,_,false,F,discourse,I,span(I,J),1) :-
    J=F.end,J>I+1,F.skip==true,\+ (between(I,J,K),lex(K,_,W),memberchk(W,["is","are","would","should","will","you","i"])).

atomic_entry(_,_,subject_aux,I,_,clitic(I,K,L),0) :-
    split_clitic(I,Base,_,K,L),memberchk(Base,["i","you","he","she","it","we","they","that","there","who","what"]).
atomic_entry(_,_,poss,I,_,clitic(I,K,L),0) :-
    split_clitic(I,Base,"s",K,L), \+memberchk(Base,["he","she","it","that","what","who","there","let"]).
atomic_entry(W,_,wh,I,J,span(I,J),0) :- memberchk(W,["what","which","how","when","where","why","who","whose","whom"]).
atomic_entry(W,_,det,I,J,span(I,J),0) :- memberchk(W,["a","an","the","this","that","these","those","my","our","his","her","its","their","your","each","every","another","some","any","no","both","all"]).
atomic_entry(W,_,pron,I,J,n(entity,I,[q(pronoun,I,J)]),0) :- memberchk(W,["i","you","he","she","it","we","they","me","him","her","us","them","this","that","those","these","nothing","everything","something","one","there"]).
atomic_entry(W,F,noun,I,J,n(entity,I,[q(head,I,J)]),1) :- memberchk("noun",F.pos), content(W).
atomic_entry(W,F,unknown_nominal,I,J,n(entity,I,[q(head,I,J)]),5) :- F.word==true, F.pos=[], F.acts=[],content(W).
atomic_entry(W,F,proper,I,J,n(entity,I,[q(name,I,J)]),1) :-
    F.word==true, content(W), (I>0;F.acts=[]), lex(I,Raw,_),string_codes(Raw,[L|_]),code_type(L,upper).
atomic_entry(W,F,verb,I,J,n(clause,I,[q(predicate,I,J)]),P) :-
    content(W), (F.acts\=[] -> P=0 ; memberchk("verb",F.pos) -> P=2 ; F.copula==true -> P=0).
atomic_entry(W,F,unknown_verb,I,J,n(clause,I,[q(predicate,I,J)]),7) :-
    I=0,F.word==true,F.pos=[],F.acts=[],content(W).
atomic_entry(W,F,adj,I,J,span(I,J),1) :- memberchk("adjective",F.pos),content(W).
atomic_entry(W,F,adv,I,J,span(I,J),1) :-
    (F.adverb==true;memberchk("adverb",F.pos);memberchk(W,["again","now","then","back","together","away","down","up","left","right","there","here","today","tomorrow","yesterday","too","instead"])),\+ preposition(W).
atomic_entry(W,_,degree,I,J,span(I,J),0) :- memberchk(W,["more","less","most","least","slightly","very","too","much","quite","really","little","bit","way"]).
atomic_entry(_,F,num,I,J,span(I,J),0) :- memberchk("numeral",F.pos).
atomic_entry(W,F,aux,I,J,span(I,J),0) :- F.auxiliary==true;memberchk(W,["would","can","could","will","should","must","may","might","shall","ought"]).
atomic_entry(W,F,neg,I,J,span(I,J),0) :- F.negation==true;W=="not".
atomic_entry(W,_,prep,I,J,span(I,J),0) :- preposition(W).
atomic_entry("to",_,to,I,J,span(I,J),0).
atomic_entry(W,_,sub,I,J,span(I,J),0) :- memberchk(W,["whether","that","if","when","until","while","because","before","after","since","unless","although","as","so","than","where"]).
atomic_entry(W,_,relative,I,J,span(I,J),0) :- memberchk(W,["that","which","who","whom","where"]).
atomic_entry(W,_,join,I,J,span(I,J),0) :- memberchk(W,["and","or","then","but"]).
atomic_entry(W,_,term,I,J,span(I,J),0) :- memberchk(W,[".","?","!",";"]).
atomic_entry(W,_,sep,I,J,span(I,J),0) :- memberchk(W,[",","—","–",":"]).
atomic_entry(W,_,discourse,I,J,span(I,J),0) :- memberchk(W,["hey","please","okay","ok","well","actually"]).
atomic_entry(W,_,clause,I,J,n(clause,I,[a(form,fragment),q(expression,I,J),a(speech_act,gratitude)]),0) :- memberchk(W,["thanks","thx"]).

preposition(W) :- memberchk(W,["of","on","off","at","in","into","onto","out","with","without","to","for","from","between","beside","above","below","behind","under","underneath","over","across","along","around","through","against","inside","outside","near","next","by","per","as","like","before","after","until","since","than","toward","towards","within","beyond"]).
content(W) :- \+ preposition(W),\+memberchk(W,["a","an","the","my","your","his","her","our","their","each","every","those","these","this","that","and","or","but","because","although","while","if","unless","who","which","what","i","you","he","she","we","they","him","us","them","it","not","please","then","whether","whom","what","when","where","why","how","there","than","so","would","should","could","must","will","can","now","also","again","to","how","and","else"]).

put(n(Type,H,Attrs),Arg,n(Type,H,[Arg|Attrs])).
promote(noun,_,T,np,T,0).
promote(proper,_,T,np,T,0).
promote(pron,_,T,np,T,0).
promote(verb,_,T,vp,T,1).
promote(vp,_,T,clause,R,1) :- put(T,a(form,imperative),R).
promote(np,H,T,clause,n(clause,H,[a(form,fragment),arg(topic,T)]),7).
promote(clause,_,T,message,T,0).

% Nominal heads retain their dependents rather than quoting an opaque phrase.
combine(det,np,_,H,span(I,K),X,_,_,_,np,H,T,-2) :- put(X,q(determiner,I,K),T), \+ has(X,determiner), X=n(entity,_,_), \+has(X,pronoun).
combine(num,np,_,H,span(I,K),X,_,_,_,np,H,T,-1) :- put(X,q(quantity,I,K),T), X=n(entity,_,_), \+has(X,quantity),\+has(X,determiner).
combine(adj,np,_,H,span(I,K),X,_,_,_,np,H,T,0) :- X=n(entity,_,_),\+has(X,determiner),\+has(X,pronoun),put(X,q(modifier,I,K),T).
combine(degree,adj,_,H,X,Y,_,_,_,adjp,H,ap(X,Y),-1).
combine(adjp,np,_,H,ap(span(I,K),span(L,M)),X,_,_,_,np,H,T,-1) :- X=n(entity,_,_),\+has(X,determiner),put(X,q(modifier,L,M),N),put(N,q(degree,I,K),T).
combine(noun,np,_,H,_,X,I,K,_,np,H,T,3) :- X=n(entity,_,_),\+has(X,determiner),\+has(X,pronoun),\+has(X,name),put(X,q(compound,I,K),T).
combine(proper,proper,H,_,_,_,I,_,J,proper,H,n(entity,H,[q(name,I,J)]),0).
combine(prep,np,_,H,span(I,K),X,_,_,_,pp,H,pp(I,K,X),0).
combine(np,pp,H,_,X,pp(I,K,Y),_,_,_,np,H,T,P) :- lex(I,_,W),
    (W=="of" -> P= -4; memberchk(W,["with","near","behind","under","beside","between"]) -> P=0; P=3),
    prep_link(X,I,K,Y,T).
combine(vp,pp,H,_,X,pp(I,K,Y),_,_,_,vp,H,T,P) :- lex(I,_,W),(W=="of" -> P=6; P=0),prep_link(X,I,K,Y,T).
combine(verb,np,H,_,X,Y,_,_,_,vp,H,T,-2) :- (predicative(H,0),lex(H,_,W),memberchk(W,["am","is","are","was","were","be","become"]) -> put(X,arg(predicative_entity,Y),T); put(X,arg(direct_object,Y),T)).
combine(verb,adj,H,_,X,span(I,J),_,_,_,vp,H,T,P) :- predicative(H,P),put(X,q(result_complement,I,J),T).
combine(vp,adj,H,_,X,span(I,J),_,_,_,vp,H,T,-1) :- object_result(H), has(X,direct_object),\+has(X,result_complement),put(X,q(result_complement,I,J),T).
combine(vp,adjp,H,_,X,ap(span(I,K),span(L,M)),_,_,_,vp,H,T,-2) :-
    (object_result(H); predicative(H,_)),\+has(X,result_complement),put(X,q(result_complement,L,M),N),put(N,q(degree,I,K),T).
combine(vp,adv,H,_,X,span(I,J),_,_,_,vp,H,T,0) :- put(X,q(adverb,I,J),T).
combine(adv,vp,_,H,span(I,K),X,_,_,_,vp,H,T,1) :- put(X,q(adverb,I,K),T).
combine(aux,vp,_,H,span(I,K),X,_,_,_,vp,H,T,-2) :- put(X,q(auxiliary,I,K),T).
combine(neg,vp,_,H,span(I,K),X,_,_,_,vp,H,T,-2) :- put(X,q(negation,I,K),T).
combine(np,vp,_,H,X,Y,_,_,_,clause,H,T,-3) :- put(Y,a(form,declarative),N),put(N,arg(subject,X),T).
combine(aux,np,_,H,span(I,K),X,_,_,_,inverted,H,inv(I,K,X),1).
combine(inverted,vp,_,H,inv(I,K,X),Y,_,_,_,clause,H,T,-3) :-
    put(Y,a(form,interrogative),N),put(N,q(auxiliary,I,K),M),put(M,arg(subject,X),T).
combine(verb,vp,H,_,X,Y,_,_,_,vp,H,T,0) :- control(H),put(Y,a(form,nonfinite),N),put(X,arg(clausal_complement,N),T).
combine(to,vp,_,H,span(I,K),X,_,_,_,inf,H,T,-1) :- put(X,q(marker,I,K),N),put(N,a(form,nonfinite),T).
combine(vp,inf,H,_,X,Y,_,_,_,vp,H,T,-2) :- \+has(X,clausal_complement),control(H),put(X,arg(clausal_complement,Y),T).
combine(vp,vp,H,_,X,Y,_,_,_,vp,H,T,0) :- has(X,direct_object),control(H),\+has(X,clausal_complement),put(Y,a(form,nonfinite),N),put(X,arg(clausal_complement,N),T).
combine(vp,clause,H,_,X,Y,_,_,_,vp,H,T,0) :- finite_complement(H),has(Y,subject),\+has(X,clausal_complement),put(X,arg(clausal_complement,Y),T).
combine(np,vp,H,H2,X,Y,_,_,_,np,H,T,0) :- participle(H2),put(Y,a(form,nonfinite),N),put(X,rel(modifier,none,N),T).
combine(relative,vp,_,H,span(I,K),X,_,_,_,relative_clause,H,T,0) :- put(X,q(marker,I,K),N),put(N,a(form,declarative),T).
combine(relative,clause,_,H,span(I,K),X,_,_,_,relative_clause,H,T,1) :- has(X,subject),put(X,q(marker,I,K),T).
combine(np,relative_clause,H,_,X,Y,_,_,_,np,H,T,-2) :- put(X,rel(modifier,none,Y),T).
combine(sub,clause,_,H,span(I,K),X,_,_,_,subordinate,H,dep(I,K,X),0).
combine(clause,subordinate,H,_,X,dep(I,K,Y),_,_,_,clause,H,T,0) :- sub_link(X,I,K,Y,T).
combine(subordinate,clause,_,H,dep(I,K,Y),X,_,_,_,clause,H,T,1) :- sub_link(X,I,K,Y,T).
combine(join,np,_,H,span(I,K),X,_,_,_,join_np,H,j(I,K,X),0).
combine(np,join_np,H,_,X,j(I,K,Y),_,_,_,np,H,T,-1) :- coord(I,K,H,X,Y,T).
combine(join,clause,_,H,span(I,K),X,_,_,_,join_cl,H,j(I,K,X),0).
combine(clause,join_cl,H,_,X,j(I,K,Y),_,_,_,clause,H,T,-1) :- coord(I,K,H,X,Y,T).
combine(sep,join,_,H,_,_,I,_,J,join,H,span(I,J),0).
combine(join,join,H,_,_,_,I,_,J,join,H,span(I,J),0).
combine(discourse,clause,_,H,span(I,K),X,_,_,_,clause,H,T,-1) :- X=n(clause,_,_),put(X,q(filler,I,K),T).
combine(discourse,sep,H,_,_,_,I,_,J,discourse,H,span(I,J),0).
combine(clause,term,H,_,X,span(I,K),_,_,_,clause,H,T,-1) :- with_mark(X,q(terminator,I,K),T).
combine(term,term,H,_,_,_,I,_,J,term,H,span(I,J),0).
combine(clause,sep,H,_,X,span(I,K),_,_,_,clause,H,T,1) :- with_mark(X,q(separator,I,K),T).
combine(message,clause,H,_,X,Y,_,K,_,message,H,pair(X,Y),1) :-
    M is K-1,lex(M,_,W),memberchk(W,[".","!","?",";",",","—","–",":"]).
combine(np,num,H,_,X,span(I,K),_,_,_,np,H,T,0) :-
    X=n(entity,_,_),lex(H,_,W),memberchk(W,["level","stage","figure","page","row","column","axis","shape","step","section","chapter","slide","node","block","item","room","box","line","work"]),put(X,q(name,I,K),T).

combine(det,unknown_nominal,_,H,span(I,K),X,_,_,_,np,H,T,-1) :- put(X,q(determiner,I,K),T).
combine(adj,unknown_nominal,_,H,span(I,K),X,_,_,_,np,H,T,1) :- put(X,q(modifier,I,K),T).
combine(unknown_verb,np,H,_,X,Y,_,_,_,vp,H,T,0) :- (has(Y,determiner);has(Y,pronoun)),put(X,arg(direct_object,Y),T).
combine(vp,np,H,_,X,Y,_,_,_,vp,H,T,0) :-
    has(X,direct_object), \+has(X,predicative_entity), object_result(H),put(X,arg(predicative_entity,Y),T).
combine(vp,np,H,_,n(clause,H,A),Y,_,_,_,vp,H,n(clause,H,[arg(direct_object,Y),arg(indirect_object,Z)|R]),-2) :-
    frame(H,"double_object"), select(arg(direct_object,Z),A,R), has(Z,pronoun), \+memberchk(arg(indirect_object,_),R).
combine(vp,subordinate,H,_,X,dep(I,K,Y),_,_,_,vp,H,T,-3) :- lex(I,_,W),
    memberchk(W,["whether","that","if"]),finite_complement(H),Y=n(clause,_,_),\+has(Y,marker),
    put(Y,q(marker,I,K),N),put(X,arg(clausal_complement,N),T).
combine(vp,discourse,H,_,X,span(I,K),_,_,_,vp,H,T,1) :- put(X,q(filler,I,K),T).
combine(clause,discourse,H,_,X,span(I,K),_,_,_,clause,H,T,1) :- X=n(clause,_,_),put(X,q(filler,I,K),T).
combine(adv,pp,_,H,span(I,K),pp(K,M,Y),_,_,_,pp,H,pp(I,M,Y),0) :-
    lex(I,_,W),memberchk(W,["right","just","directly","well","far","back","over","way","straight"]).
combine(pp,clause,_,H,pp(I,K,Y),X,_,_,_,clause,H,T,1) :- X=n(clause,_,_),prep_link(X,I,K,Y,T).
combine(pp,sep,H,_,X,span(I,J),_,_,_,fronted,H,front(X,I,J),0).
combine(fronted,clause,_,H,front(pp(I,K,Y),M,E),X,_,_,_,clause,H,T,-1) :-
    X=n(clause,_,_),prep_link(X,I,K,Y,N),put(N,q(separator,M,E),T).
combine(sep,np,_,H,span(I,K),X,_,_,_,join_np,H,j(I,K,X),2).
combine(sep,join_np,_,H,span(I,_),j(_,K,X),_,_,_,join_np,H,j(I,K,X),0).
combine(num,join_np,H,_,span(I,K),j(A,B,Y),_,_,_,np,H,T,0) :-
    coord(A,B,H,n(entity,H,[q(head,I,K)]),Y,T).
combine(prep,num,_,H,span(I,K),span(L,M),_,_,_,pp,H,pp(I,K,n(entity,H,[q(head,L,M)])),1).
combine(verb,num,H,_,X,span(I,K),_,_,_,vp,H,T,0) :- put(X,arg(direct_object,n(entity,I,[q(head,I,K)])),T).
combine(sep,num,_,H,span(I,K),span(L,M),_,_,_,join_np,H,j(I,K,n(entity,H,[q(head,L,M)])),0).
combine(degree,adj,_,H,span(I,K),span(K,J),_,_,_,adj,H,span(I,J),3).
combine(verb,adv,H,_,X,span(I,K),_,_,_,bare_particle,H,T,0) :-
    lex(I,_,W),memberchk(W,["up","down","back","out","off","away","over","apart","together"]),
    put(X,q(particle,I,K),T).
combine(bare_particle,np,H,_,X,Y,_,_,_,vp,H,T,-1) :- put(X,arg(direct_object,Y),T).
combine(clause,join,H,_,X,_,_,K,J,postjoin,H,endjoin(X,K,J),0).
combine(postjoin,clause,H,_,endjoin(X,I,K),Y,_,_,_,clause,H,T,0) :- coord(I,K,H,X,Y,T).

combine(subject_aux,vp,_,H,clitic(I,K,L),X,_,_,_,clause,H,T,-4) :-
    put(X,a(form,declarative),N),put(N,piece(auxiliary,I,K,L),V),
    put(V,arg(subject,n(entity,I,[piece(pronoun,I,0,K)])),T).
combine(poss,np,_,H,clitic(I,K,L),X,_,_,_,np,H,T,-4) :-
    X=n(entity,_,_), \+has(X,possessor),put(X,piece(possessive_marker,I,K,L),N),
    put(N,arg(possessor,n(entity,I,[piece(head,I,0,K)])),T).
combine(wh,vp,_,H,span(I,K),X,_,_,_,clause,H,T,-1) :-
    put(X,a(form,interrogative),N),put(N,q(question,I,K),T).
combine(wh,clause,_,H,span(I,K),X,_,_,_,clause,H,T,-1) :-
    X=n(clause,H,A),select(a(form,_),A,R),put(n(clause,H,R),a(form,interrogative),N),put(N,q(question,I,K),T).
combine(wh,adj,_,H,span(I,K),span(K,J),_,_,_,whadj,H,whadj(I,K,J),0).
combine(whadj,clause,_,H,whadj(I,K,M),n(clause,H,A),_,_,_,clause,H,T,-2) :-
    select(a(form,_),A,R), T=n(clause,H,[a(form,interrogative),q(question,I,K),q(result_complement,K,M)|R]).
combine(np,adj,H,_,X,span(I,K),_,_,_,clause,H,n(clause,H,[a(form,fragment),arg(topic,X),q(result_complement,I,K)]),5).
combine(np,adjp,H,_,X,ap(span(I,K),span(L,M)),_,_,_,clause,H,n(clause,H,[a(form,fragment),arg(topic,X),q(degree,I,K),q(result_complement,L,M)]),4).
combine(verb,pp,H,_,X,pp(I,K,Y),_,_,_,vp,H,T,0) :- prep_link(X,I,K,Y,T).
split_clitic(I,Base,Suffix,K,L) :-
    lex(I,_,W), (sub_string(W,K,1,After,"'");sub_string(W,K,1,After,"’")),
    K>0, After>0, Start is K+1,sub_string(W,0,K,_,Base),sub_string(W,Start,After,0,Suffix),
    memberchk(Suffix,["s","m","d","ll","re","ve"]),L is After+1.

has(n(_,_,Args),Key) :- member(A,Args),arg(1,A,Key).
with_mark(n(clause,H,A),F,n(clause,H,[F|A])) :- F=..[_,Key|_], \+ (Key==terminator,has(n(clause,H,A),terminator)).
with_mark(n(coordination,H,[arg(member,B)|R]),F,n(coordination,H,[arg(member,C)|R])) :- with_mark(B,F,C).
coord(I,K,H,X,Y,n(coordination,H,[arg(member,Y),arg(member,X),q(cue,I,K),a(kind,Kind)])) :-
    \+ X=n(coordination,_,_),\+ Y=n(coordination,_,_),
    (between(I,K,A),A<K,lex(A,_,"or") -> Kind=alternative; between(I,K,A),A<K,lex(A,_,"then") -> Kind=sequence; Kind=conjunctive).
prep_link(X,I,K,Y,T) :- lex(I,_,W), (K=:=I+1 -> atom_string(Kind,W); Kind=prepositional), put(X,rel(Kind,span(I,K),Y),T).
sub_link(X,I,K,Y,T) :- lex(I,_,W),atom_string(Kind,W),put(X,rel(Kind,span(I,K),Y),T).
participle(H) :- lex(H,_,W), (sub_string(W,_,3,0,"ing");sub_string(W,_,2,0,"ed");memberchk(W,["shown","drawn","written","left","set","given","made","put"])).
control(H) :- frame(H,F),memberchk(F,["infinitive","object_infinitive","bare_infinitive","object_bare_infinitive"]).
control(H) :- lex(H,_,W),memberchk(W,["want","wants","need","needs","try","tries","like","prefer","help","let","lets","have","make","get","ask","tell","plan","wish","hope","allow","expect","start","begin","continue","stop","keep"]).
finite_complement(H) :- frame(H,"finite_clause").
finite_complement(H) :- lex(H,_,W),memberchk(W,["say","says","think","thinks","see","know","ensure","hope","mean","suppose","believe","remember","guess","check","show","tell"]).
predicative(H,1) :- frame(H,"predicative").
predicative(H,0) :- lex(H,_,W),memberchk(W,["is","am","are","was","were","be","seem","look","feel","remain","turn","become","stay"]).
object_result(H) :- frame(H,"object_predicative").
object_result(H) :- lex(H,_,W),memberchk(W,["make","makes","keep","paint","colour","color","turn","set","leave","draw","change","render","tint","dye"]).

% Emit schema fields and references in the engine. The JS adapter only quotes
% original spans and serializes these records in SOP syntax.
emit(pair(X,Y),Id,N,E,W,Z) :- !,emit(X,Id,N,M,W,V),emit(Y,_,M,E,V,Z).
emit(n(Type,_,Props),Id,N,E,[wire(Id,Type,Attrs)|W],Z) :-
    Id is N+1, emit_fields(Props,Id,Attrs,Id,E,W,Z).
emit_fields([],_,[],N,N,W,W).
emit_fields([piece(Key,I,K,L)|R],Id,[[Key,piece,I,K,L]|A],N,E,W,Z) :- emit_fields(R,Id,A,N,E,W,Z).
emit_fields([q(Key,I,J)|R],Id,[[Key,quote,I,J]|A],N,E,W,Z) :- emit_fields(R,Id,A,N,E,W,Z).
emit_fields([a(Key,V)|R],Id,[[Key,atom,V]|A],N,E,W,Z) :- emit_fields(R,Id,A,N,E,W,Z).
emit_fields([arg(Key,T)|R],Id,[[Key,ref,Child]|A],N,E,W,Z) :-
    emit(T,Child,N,M,W,V),emit_fields(R,Id,A,M,E,V,Z).
emit_fields([rel(Kind,Cue,T)|R],Id,A,N,E,[wire(Rel,relation,Attrs)|W],Z) :-
    Rel is N+1, Base=[[kind,atom,Kind],[from,ref,Id],[to,ref,Child]],
    (Cue=span(I,J)->Attrs=[[cue,quote,I,J]|Base];Attrs=Base),
    emit(T,Child,Rel,M,W,V),emit_fields(R,Id,A,M,E,V,Z).
