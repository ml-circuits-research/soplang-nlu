:- module(native_syntax,[syntax_analysis/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).
:- use_module(library(pairs)).

syntax_analysis(Q, _{clauses:Clauses}) :-
    length(Q.tokens, End),
    segments(Q,0,End,[],Segments),
    maplist(analyse_clause(Q),Segments,Clauses).

form_at(Q,At,Form) :- nth0(At,Q.forms,Forms), member(Form,Forms).
word_at(Q,At,Raw) :- nth0(At,Q.tokens,[Raw,_]).
token_pos(Q,At,POS) :- form_at(Q,At,F), F.end=:=At+1, memberchk(POS,F.pos).
has_form(Q,At,Field,Value) :-
    form_at(Q,At,F), get_dict(Field,F,Bank), memberchk(Value,Bank).

segments(_,At,End,_,[]) :- At>=End, !.
segments(Q,At,End,Cue,Segments) :-
    FirstEnd is End-1,
    ( once((between(At,FirstEnd,Cut), Cut>At, boundary(Q,At,Cut,End,Stop,Term,Next,Join))) ->
        Segments = [segment(At,Stop,Term,Cue)|Tail], segments(Q,Next,End,Join,Tail)
    ; Segments=[segment(At,End,[],Cue)] ).

boundary(Q,_,Cut,End,Stop,[Cut,After],After,[]) :-
    nth0(Cut,Q.tokens,[Raw,false]), memberchk(Raw,[".","!","?",";"]),
    Next is Cut+1, Next<End,
    \+ decimal_boundary(Q,Raw,Cut), Stop=Cut, After=Next.
boundary(Q,At,Cut,End,Cut,[Cut,Next],Next,[At,CueEnd,"condition"]) :-
    word_at(Q,Cut,","), Next is Cut+1,
    form_at(Q,At,F), memberchk("condition",F.joiner), CueEnd=F.end,
    has_predicate(Q,CueEnd,Cut), begins_predicate(Q,Next,End).
boundary(Q,At,Cut,End,Cut,[],After,[Cut,After,Kind]) :-
    joiner(Q,Cut,End,After,Kind),
    ( Kind=="sequence" ; has_predicate(Q,At,Cut) ),
    begins_predicate(Q,After,End).
boundary(Q,At,Cut,End,Cut,[],After,[Cut,After,Kind]) :-
    word_at(Q,Cut,","), Marker is Cut+1,
    joiner(Q,Marker,End,After,Kind),
    ( Kind=="sequence" ; has_predicate(Q,At,Cut) ),
    begins_predicate(Q,After,End).

decimal_boundary(Q,".",At) :-
    Prior is At-1, After is At+1,
    token_pos(Q,Prior,"numeral"), token_pos(Q,After,"numeral").

joiner(Q,At,End,After,Kind) :-
    form_at(Q,At,F), F.end<End, member(Kind,F.joiner),
    memberchk(Kind,["coordination","sequence","contrast","addition","disjunctive"]),
    ( Kind=="coordination", has_form(Q,F.end,joiner,"sequence"),
      form_at(Q,F.end,Next), memberchk("sequence",Next.joiner) ->
        After=Next.end
    ; After=F.end ).

begins_predicate(Q,At,End) :-
    first_content(Q,At,End,First),
    after_leading_auxiliary(Q,First,End,Start),
    ( form_at(Q,Start,Verb), Verb.end=<End, Verb.acts\=[]
    ; has_form(Q,Start,pos,"verb"), Next is Start+1, Next<End,
      ( token_pos(Q,Next,"determiner") ; token_pos(Q,Next,"pronoun") )
    ; has_form(Q,Start,pos,"pronoun"), Next is Start+1, Next<End,
      form_at(Q,Next,Verb), Verb.end=<End, Verb.acts\=[] ), !.

after_leading_auxiliary(Q,At,End,First) :-
    At<End, form_at(Q,At,F), F.end<End,
    (F.auxiliary==true ; F.negation==true), !,
    after_leading_auxiliary(Q,F.end,End,First).
after_leading_auxiliary(_,At,_,At).

first_content(Q,At,End,First) :-
    ( At<End, word_at(Q,At,W), memberchk(W,[",","—","–"]) ->
        Next is At+1, first_content(Q,Next,End,First)
    ; At<End, form_at(Q,At,F), F.end=<End, (F.skip==true ; F.adverb==true, F.question==false) ->
        first_content(Q,F.end,End,First)
    ; First=At ).

has_predicate(Q,At,End) :- once(main_predicate(Q,At,End,_,_,_)).

main_predicate(Q,At,End,Start,After,Acts) :-
    first_content(Q,At,End,First), Last is End-1,
    findall(Score-[S,Finish,Senses],
      ( between(First,Last,S), form_at(Q,S,F), Finish=F.end, Senses=F.acts, Finish=<End,
        lexical_predicate(Q,F,S,First,End,Base),
        Width is F.end-S, Score is Base+3*Width-2*(S-First) ),
      Options),
    keysort(Options,Ascending), last(Ascending,_-[Start,After,Acts]).

lexical_predicate(Q,F,At,First,End,Base) :-
    F.skip==false, F.negation==false,
    ( F.acts\=[] -> Evidence=30
    ; memberchk("verb",F.pos) -> Evidence=10
    ; F.copula==true -> Evidence=16 ),
    ( F.auxiliary==true -> F.copula==true, \+ stronger_verb(Q,F.end,End) ; true ),
    ( At=:=First -> \+ memberchk("pronoun",F.pos), Base is Evidence+10
    ; ( \+ memberchk("noun",F.pos) ; \+ inside_nominal(Q,First,At) ),
      ( F.acts\=[], \+ memberchk("noun",F.pos) -> Base is Evidence+5
      ; subject_before(Q,First,At) -> Base is Evidence+1
      ; initial_auxiliary(Q,First,At) -> Base=Evidence
      ; fail ) ).

stronger_verb(Q,At,End) :-
    Last is End-1, between(At,Last,Start), form_at(Q,Start,F), F.end=<End,
    F.auxiliary==false,
    ( F.acts\=[] ; F.participle==true
    ; memberchk("verb",F.pos), \+ memberchk("adjective",F.pos) ),
    ( \+ memberchk("noun",F.pos) ; \+ inside_nominal(Q,At,Start) ), !.

inside_nominal(Q,At,Head) :-
    Last is Head-1,
    between(At,Last,Det), token_pos(Q,Det,"determiner"),
    Next is Det+1,
    nominal_prefix(Q,Next,Head), !.

nominal_prefix(_,End,End).
nominal_prefix(Q,At,End) :-
    At<End, form_at(Q,At,F), F.end=<End,
    ( memberchk("adjective",F.pos) ; memberchk("numeral",F.pos) ),
    nominal_prefix(Q,F.end,End).

subject_before(Q,At,End) :-
    subject_phrase(Q,At,End,Phrase,_), Phrase\==none.

initial_auxiliary(Q,At,End) :-
    between(At,End,Start), form_at(Q,Start,F), F.end=<End,
    ( F.auxiliary==true ; F.negation==true ; F.question==true ), !.

analyse_clause(Q,segment(At,End0,Term0,Cue),Clause) :-
    effective_end(Q,At,End0,Term0,End,Term),
    first_content(Q,At,End,First),
    ( main_predicate(Q,First,End,P,A,PlainActs) ->
        wh_marker(Q,First,P,Question),
        prefix_items(Q,At,P,Aux,BeforeNegation),
        post_negations(Q,A,End,NegEnd,AfterNegation),
        append(BeforeNegation,AfterNegation,Negation),
        subject_phrase(Q,First,P,Subject0,SubjectRelations),
        clause_adverbs(Q,At,P,PrefixAdverbs),
        edge_adverbs(Q,NegEnd,End,AfterAdverbs,BeforeAdverbs,BodyAdverbs),
        append(PrefixAdverbs,BodyAdverbs,Adverbs),
        particle(Q,P,AfterAdverbs,BeforeAdverbs,PlainActs,OperandStart,OperandEnd,Particle,Acts),
        ( Subject0\==none, token_flag(Q,P,clauseTaker), embedded_clause(Q,OperandStart,OperandEnd,Term,Child) ->
            Embedded=[Child], VisibleEnd=OperandStart, VisibleTerm=[], Complement=[], Indirect=[],
            Objects0=[], Relations0=SubjectRelations, Coordinations=[]
        ; Embedded=[], VisibleEnd=End, VisibleTerm=Term,
          complement(Q,OperandStart,OperandEnd,Acts,BodyEnd,Complement),
          operands(Q,OperandStart,BodyEnd,Acts,Indirect,Objects0,BodyRelations,Coordinations),
          complement_relations(Q,Complement,OperandEnd,ComplementRelations),
          append([SubjectRelations,BodyRelations,ComplementRelations],Relations0) ),
        ( Subject0==none, token_flag(Q,P,copula), Objects0=[Inverted|Others],
          (Question\=[] ; question_term(Q,Term)) -> Subject=Inverted, Objects=Others
        ; Subject=Subject0, Objects=Objects0 ),
        ( Subject\==none, token_flag(Q,P,participle), auxiliary_copula(Q,Aux) ->
          maplist(passive_relation(Q),Relations0,Relations)
        ; Relations=Relations0 ),
        none_as_list(Subject,Subjects), SubjectCoordinations=[],
        clause_type(Subject,Question,Term,Q,Kind)
    ; P=End, A=End, Acts=[], Aux=[], Negation=[], Complement=[], Adverbs=[], Particle=[], Indirect=[],
      Embedded=[], VisibleEnd=End, VisibleTerm=Term,
      wh_marker(Q,First,End,Question),
      ( Question=[_,TopicAt] -> Kind="interrogative" ; Kind="fragment", TopicAt=First ),
      ( noun_phrase(Q,TopicAt,End,Topic) -> Subjects=[Topic], SubjectCoordinations=[]
      ; slice_nominals(Q,TopicAt,End,Topics,End,TopicCoordinations) ->
          Subjects=Topics, SubjectCoordinations=TopicCoordinations
      ; Subjects=[], SubjectCoordinations=[] ),
      Objects=[], Relations=[], Coordinations=[] ),
    Clause=_{from:At,to:VisibleEnd,predicate:[P,A],acts:Acts,form:Kind,question:Question,
      auxiliary:Aux,negation:Negation,terminator:VisibleTerm,subjects:Subjects,subjectCoordinations:SubjectCoordinations,
      objects:Objects,indirect:Indirect,
      relations:Relations,coordinations:Coordinations,complement:Complement,join:Cue,
      adverb:Adverbs,particle:Particle,embedded:Embedded}.

embedded_clause(Q,At,End,Term,Clause) :-
    At<End,
    main_predicate(Q,At,End,Predicate,_,_),
    Predicate>At,
    subject_phrase(Q,At,Predicate,Subject,[]), Subject\==none,
    analyse_clause(Q,segment(At,End,Term,[]),Clause).

clause_adverbs(Q,At,End,Adverbs) :-
    Last is End-1,
    findall([Start,After],
      ( between(At,Last,Start), token_flag(Q,Start,adverb),
        \+ token_flag(Q,Start,question), \+ token_flag(Q,Start,negation), After is Start+1 ),
      Adverbs).

edge_adverbs(Q,At,End,First,Last,Adverbs) :-
    leading_adverbs(Q,At,End,First,Leading),
    trailing_adverbs(Q,First,End,Last,Trailing),
    append(Leading,Trailing,Adverbs).

leading_adverbs(Q,At,End,First,[[At,Next]|Rest]) :-
    At<End, token_flag(Q,At,adverb), !,
    Next is At+1, leading_adverbs(Q,Next,End,First,Rest).
leading_adverbs(_,At,_,At,[]).

trailing_adverbs(Q,At,End,Last,Adverbs) :-
    Before is End-1, Before>=At, token_flag(Q,Before,adverb), !,
    trailing_adverbs(Q,At,Before,Last,Rest), append(Rest,[[Before,End]],Adverbs).
trailing_adverbs(_,_,End,End,[]).

particle(Q,P,At,End,_,OperandStart,OperandEnd,[Start,After],Acts) :-
    member([P,Start,After,Acts],Q.particles), Start>=At, After=<End,
    ( Start=:=At, After<End, phrase_end(Q,After,End,Stop), noun_phrase(Q,After,Stop,_),
        OperandStart=After, OperandEnd=End
    ; After=:=End, Start>At, noun_phrase(Q,At,Start,_),
        OperandStart=At, OperandEnd=Start ),
    !.
particle(_,_,At,End,Acts,At,End,[],Acts).

auxiliary_copula(Q,Aux) :- member([At,_],Aux), token_flag(Q,At,copula), !.

passive_relation(Q,Relation,Agent) :-
    Relation.cue=[At,_], word_at(Q,At,Raw), string_lower(Raw,"by"), !,
    Agent=Relation.put(kinds,["agent"]).
passive_relation(_,Relation,Relation).

effective_end(Q,At,End0,[],End,[End,End0]) :-
    End is End0-1, End>=At, nth0(End,Q.tokens,[Raw,false]),
    memberchk(Raw,[".","!","?",";"]), !.
effective_end(_,_,End,Term,End,Term).

none_as_list(none,[]) :- !.
none_as_list(Phrase,[Phrase]).

wh_marker(Q,At,End,[At,E]) :-
    At<End, form_at(Q,At,F), F.end=<End, F.question==true, E=F.end, !.
wh_marker(_,_,_,[]).

prefix_items(_,At,End,[],[]) :- At>=End, !.
prefix_items(Q,At,End,Aux,Negation) :-
    Next is At+1,
    prefix_items(Q,Next,End,RestAux,RestNegation),
    ( token_flag(Q,At,negation) -> Aux=RestAux, Negation=[[At,Next]|RestNegation]
    ; token_flag(Q,At,auxiliary) -> Aux=[[At,Next]|RestAux], Negation=RestNegation
    ; Aux=RestAux, Negation=RestNegation ).

token_flag(Q,At,Key) :-
    form_at(Q,At,F), F.end=:=At+1, get_dict(Key,F,true), !.

post_negations(Q,At,End,Start,[[At,Next]|Rest]) :-
    At<End, token_flag(Q,At,negation), !,
    Next is At+1, post_negations(Q,Next,End,Start,Rest).
post_negations(_,At,_,At,[]).

subject_phrase(Q,At,End,Phrase,Relations) :-
    At<End, form_at(Q,At,F), F.end=<End,
    ( F.auxiliary==true ; F.negation==true ; F.question==true ; F.skip==true ;
      F.adverb==true, \+ memberchk("pronoun",F.pos) ; memberchk("condition",F.joiner) ), !,
    subject_phrase(Q,F.end,End,Phrase,Relations).
subject_phrase(Q,At,End,Phrase,Relations) :-
    At<End,
    once((between(At,End,Stop), Stop>At, subject_nominal(Q,At,Stop,Phrase,Relations),
      auxiliary_tail(Q,Stop,End))), !.
subject_phrase(_,_,_,none,[]).

subject_nominal(Q,At,End,Phrase,Relations) :-
    phrase_end(Q,At,End,Stop), noun_phrase(Q,At,Stop,Phrase),
    prepositions(Q,Stop,End,Prepositions),
    ( Stop=:=End -> true
    ; Prepositions=[First|_], First.cue=[Stop,_],
      last(Prepositions,Last), Last.end=:=End ),
    maplist(as_subject,Prepositions,Relations).

as_subject(Relation,SubjectRelation) :- SubjectRelation=Relation.put(attachment,"subject").

auxiliary_tail(_,End,End).
auxiliary_tail(Q,At,End) :-
    At<End,
    ( token_flag(Q,At,auxiliary) ; token_flag(Q,At,negation) ; token_flag(Q,At,adverb) ),
    Next is At+1, auxiliary_tail(Q,Next,End).

clause_type(_,Q,_,_,"interrogative") :- Q\=[], !.
clause_type(Subject,_,Term,Q,"interrogative") :- Subject\==none, question_term(Q,Term), !.
clause_type(none,_,_,_,"imperative") :- !.
clause_type(_,_,_,_,"declarative").

question_term(Q,[At,_]) :- word_at(Q,At,"?").

complement(Q,At,End,_,Start,[Start,Than]) :-
    Last is End-1, between(At,Last,Start), token_flag(Q,Start,comparative),
    Than is Start+1, Than<End, has_form(Q,Than,preposition,"than"), !.
complement(Q,At,End,Acts,Last,[Last,End]) :-
    Last is End-1, Last>=At,
    token_pos(Q,Last,"adjective"),
    ( Last=:=At ; memberchk("change",Acts) ; has_color(Q,Last) ), !.
complement(_,_,End,_,End,[]).

has_color(Q,At) :- form_at(Q,At,F), F.end=:=At+1, F.colors\=[].

complement_relations(Q,[_,At],End,Relations) :- !, prepositions(Q,At,End,Relations).
complement_relations(_,_,_,[]).

operands(Q,At,End,Acts,Indirect,Objects,Relations,Coordinations) :-
    ( member(Act,Acts), memberchk(Act,Q.recipientActs),
      Last is End-1, between(At,Last,Cut), Cut>At,
      token_pos(Q,Cut,"determiner"), noun_phrase(Q,At,Cut,Recipient),
      slice_nominals(Q,Cut,End,Objects,ObjectEnd,Coordinations), Objects\=[] ->
        Indirect=[Recipient]
    ; Indirect=[], slice_nominals(Q,At,End,Objects,ObjectEnd,Coordinations) ),
    prepositions(Q,ObjectEnd,End,Relations).

slice_nominals(Q,At,End,[Noun|Rest],Stop,Links) :-
    phrase_end(Q,At,End,E), E>At, noun_phrase(Q,At,E,Noun), !,
    ( joiner(Q,E,End,After,Kind), slice_nominals(Q,After,End,Rest,Stop,Tail), Rest=[First|_] ->
        Links=[_{from:Noun.from,to:First.from,cue:[E,After],kind:Kind}|Tail]
    ; Rest=[], Stop=E, Links=[] ).
slice_nominals(_,At,_,[],At,[]).

phrase_end(Q,At,End,Stop) :-
    Last is End-1,
    ( once((between(At,Last,P), P>At,
        ( preposition(Q,P,End,_,_) ; joiner(Q,P,End,_,_) ; word_at(Q,P,",") ))) ->
        Stop=P ; Stop=End ).

prepositions(_,At,End,[]) :- At>=End, !.
prepositions(Q,At,End,Relations) :-
    ( preposition(Q,At,End,After,Form),
      slice_nominals(Q,After,End,Phrases,Stop,Coordinations), Stop>After, Phrases\=[] ->
        ( member(Kind,Form.preposition), memberchk(Kind,["with","near","in","on"]) ->
            Attachment="ambiguous"
        ; Attachment="clause" ),
        Relations=[_{cue:[At,After],kinds:Form.preposition,markers:Form.markers,entities:Phrases,
          coordinations:Coordinations,attachment:Attachment,end:Stop}|Rest],
        prepositions(Q,Stop,End,Rest)
    ; Next is At+1, prepositions(Q,Next,End,Relations) ).

preposition(Q,At,End,After,Form) :-
    form_at(Q,At,Form), Form.end<End, Form.preposition\=[], After=Form.end, !.

noun_phrase(Q,At,End,_{from:At,to:End,head:[],determiner:[],modifiers:[],pronoun:[],name:[First,Last],kinds:[],colors:[]}) :-
    First is At+1, Last is End-1, First<Last,
    nth0(At,Q.tokens,[Open,true]), nth0(Last,Q.tokens,[Close,true]),
    memberchk([Open,Close], [["\"","\""],["“","”"],["'","'"],["‘","’"]]),
    !.
noun_phrase(Q,At,End,_{from:At,to:End,head:[At,End],determiner:[],modifiers:[],pronoun:[At,End],name:[],kinds:[],colors:[]}) :-
    At<End, form_at(Q,At,F), F.end=:=End, memberchk("pronoun",F.pos),
    \+ memberchk("possessive",F.pronoun), !.
noun_phrase(Q,At,End,_{from:At,to:End,head:[Head,End],determiner:Det,modifiers:Mods,pronoun:[],name:Name,kinds:Kinds,colors:Colors}) :-
    At<End, noun_determiner(Q,At,End,Det,First), First<End,
    ( ( letter_name(Q,First,End) ; Det=[], First>0, name_span(Q,First,End) ) ->
        Head=First, Mods=[], Colors=[], Kinds=[], Name=[First,End]
    ; noun_head(Q,First,End,Head,Kinds), modifier_series(Q,First,Head,Mods,Colors) -> Name=[]
    ; name_span(Q,First,End) -> Head=First, Mods=[], Colors=[], Kinds=[], Name=[First,End]
    ), !.

noun_determiner(Q,At,End,[At,After],After) :-
    form_at(Q,At,F), F.end<End,
    ( memberchk("determiner",F.pos) ; memberchk("possessive",F.pronoun) ),
    After=F.end, !.
noun_determiner(_,At,_,[],At).

noun_head(Q,First,End,Start,Kinds) :-
    Last is End-1,
    between(First,Last,Start), form_at(Q,Start,F), F.end=:=End,
    ( F.kinds\=[] ; memberchk("noun",F.pos) ), Kinds=F.kinds.

modifier_series(_,At,At,[],[]) :- !.
modifier_series(Q,At,End,[[At,Next]|Modifiers],Colors) :-
    At<End, form_at(Q,At,F), Next=F.end, Next=<End,
    ( memberchk("adjective",F.pos) ; memberchk("numeral",F.pos) ; Next=:=At+1, F.kinds\=[] ),
    modifier_series(Q,Next,End,Modifiers,Rest),
    append(F.colors,Rest,Colors).

letter_name(Q,First,End) :-
    End is First+1, word_at(Q,First,Word), string_length(Word,1),
    string_lower(Word,Lower), Word\==Lower.

name_span(Q,First,End) :-
    ( First>0 ; form_at(Q,End,Following),
      (Following.acts\=[] ; memberchk("verb",Following.pos) ; Following.copula==true) ),
    Last is End-1, First=<Last,
    nth0(First,Q.tokens,[Word,false]), sub_string(Word,0,1,_,Head),
    string_lower(Head,Lower), Head\==Lower,
    forall(between(First,Last,At), possible_name_word(Q,At)).

possible_name_word(Q,At) :-
    nth0(At,Q.tokens,[_Term,false]),
    form_at(Q,At,F), F.end=:=At+1, F.word==true,
    F.auxiliary==false, F.negation==false, F.question==false, F.skip==false, F.adverb==false,
    \+ memberchk("pronoun",F.pos), \+ memberchk("determiner",F.pos).
