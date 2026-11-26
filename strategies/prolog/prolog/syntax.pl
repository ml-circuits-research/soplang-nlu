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
    has_predicate(Q,At,Cut),
    begins_predicate(Q,After,End).
boundary(Q,At,Cut,End,Cut,[],After,[Cut,After,Kind]) :-
    word_at(Q,Cut,","), Marker is Cut+1,
    joiner(Q,Marker,End,After,Kind),
    has_predicate(Q,At,Cut), begins_predicate(Q,After,End).

decimal_boundary(Q,".",At) :-
    Prior is At-1, After is At+1,
    token_pos(Q,Prior,"numeral"), token_pos(Q,After,"numeral").

joiner(Q,At,End,After,Kind) :-
    form_at(Q,At,F), F.end<End, member(Kind,F.joiner),
    memberchk(Kind,["coordination","sequence","contrast","addition"]),
    ( Kind=="coordination", has_form(Q,F.end,joiner,"sequence"),
      form_at(Q,F.end,Next), memberchk("sequence",Next.joiner) ->
        After=Next.end
    ; After=F.end ).

begins_predicate(Q,At,End) :-
    first_content(Q,At,End,Start),
    ( form_at(Q,Start,Verb), Verb.end=<End, Verb.acts\=[]
    ; has_form(Q,Start,pos,"verb"), Next is Start+1, Next<End,
      ( token_pos(Q,Next,"determiner") ; token_pos(Q,Next,"pronoun") )
    ; has_form(Q,Start,pos,"pronoun"), Next is Start+1, Next<End,
      form_at(Q,Next,Verb), Verb.end=<End, Verb.acts\=[] ), !.

first_content(Q,At,End,First) :-
    ( At<End, word_at(Q,At,W), memberchk(W,[",","—","–"]) ->
        Next is At+1, first_content(Q,Next,End,First)
    ; At<End, form_at(Q,At,F), F.end=<End, F.skip==true ->
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
    ( F.acts\=[]
    ; memberchk("verb",F.pos), \+ memberchk("adjective",F.pos) ),
    ( \+ memberchk("noun",F.pos) ; \+ inside_nominal(Q,At,Start) ), !.

inside_nominal(Q,At,Head) :-
    Last is Head-1,
    between(At,Last,Det), token_pos(Q,Det,"determiner"),
    Next is Det+1,
    modifier_series(Q,Next,Head,_,_), !.

subject_before(Q,At,End) :-
    noun_phrase(Q,At,End,_), !.
subject_before(Q,At,End) :-
    At<End, form_at(Q,At,F), F.end<End,
    ( F.auxiliary==true ; F.negation==true ; F.question==true ; F.skip==true ; memberchk("condition",F.joiner) ),
    subject_before(Q,F.end,End), !.

initial_auxiliary(Q,At,End) :-
    between(At,End,Start), form_at(Q,Start,F), F.end=<End,
    ( F.auxiliary==true ; F.negation==true ), !.

analyse_clause(Q,segment(At,End0,Term0,Cue),Clause) :-
    effective_end(Q,At,End0,Term0,End,Term),
    first_content(Q,At,End,First),
    ( main_predicate(Q,First,End,P,A,Acts) ->
        wh_marker(Q,First,P,Question),
        prefix_items(Q,First,P,Aux,BeforeNegation),
        post_negations(Q,A,End,OperandStart,AfterNegation),
        append(BeforeNegation,AfterNegation,Negation),
        subject_phrase(Q,First,P,Subject0),
        complement(Q,OperandStart,End,Acts,BodyEnd,Complement),
        operands(Q,OperandStart,BodyEnd,Objects0,Relations,Coordinations),
        ( Subject0==none, token_flag(Q,P,copula), Objects0=[Inverted|Others],
          (Question\=[] ; question_term(Q,Term)) -> Subject=Inverted, Objects=Others
        ; Subject=Subject0, Objects=Objects0 ),
        clause_type(Subject,Question,Term,Q,Kind)
    ; P=End, A=End, Acts=[], Aux=[], Negation=[], Complement=[],
      wh_marker(Q,First,End,Question),
      ( Question=[_,TopicAt] -> Kind="interrogative" ; Kind="fragment", TopicAt=First ),
      ( noun_phrase(Q,TopicAt,End,Subject) -> true ; Subject=none ),
      Objects=[], Relations=[], Coordinations=[] ),
    none_as_list(Subject, Subjects),
    Clause=_{from:At,to:End,predicate:[P,A],acts:Acts,form:Kind,question:Question,
      auxiliary:Aux,negation:Negation,terminator:Term,subjects:Subjects,objects:Objects,
      relations:Relations,coordinations:Coordinations,complement:Complement,join:Cue}.

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

subject_phrase(Q,At,End,Phrase) :-
    At<End, form_at(Q,At,F), F.end=<End,
    ( F.auxiliary==true ; F.negation==true ; F.question==true ; F.skip==true ; memberchk("condition",F.joiner) ), !,
    subject_phrase(Q,F.end,End,Phrase).
subject_phrase(Q,At,End,Phrase) :-
    At<End, noun_phrase(Q,At,End,Phrase), !.
subject_phrase(_,_,_,none).

clause_type(_,Q,_,_,"interrogative") :- Q\=[], !.
clause_type(Subject,_,Term,Q,"interrogative") :- Subject\==none, question_term(Q,Term), !.
clause_type(none,_,_,_,"imperative") :- !.
clause_type(_,_,_,_,"declarative").

question_term(Q,[At,_]) :- word_at(Q,At,"?").

complement(Q,At,End,Acts,Last,[Last,End]) :-
    Last is End-1, Last>=At,
    token_pos(Q,Last,"adjective"),
    ( Last=:=At ; memberchk("change",Acts) ; has_color(Q,Last) ), !.
complement(_,_,End,_,End,[]).

has_color(Q,At) :- form_at(Q,At,F), F.end=:=At+1, F.colors\=[].

operands(Q,At,End,Objects,Relations,Coordinations) :-
    slice_nominals(Q,At,End,Objects,ObjectEnd,Coordinations),
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
      phrase_end(Q,After,End,Stop), Stop>After, noun_phrase(Q,After,Stop,Phrase) ->
        ( memberchk("with",Form.preposition) -> Attachment="ambiguous" ; Attachment="clause" ),
        Relations=[_{cue:[At,After],kinds:Form.preposition,markers:Form.markers,entity:Phrase,attachment:Attachment}|Rest],
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
    ( letter_name(Q,First,End) -> Head=First, Mods=[], Colors=[], Kinds=[], Name=[First,End]
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
    F.auxiliary==false, F.negation==false, F.question==false, F.skip==false,
    \+ memberchk("pronoun",F.pos), \+ memberchk("determiner",F.pos).
