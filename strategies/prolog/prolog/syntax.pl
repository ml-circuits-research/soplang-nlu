:- module(native_syntax,[syntax_analysis/2]).
:- use_module(library(lists)).
:- use_module(library(apply)).
:- use_module(library(pairs)).

syntax_analysis(Q, _{clauses:Clauses,attachments:Attachments}) :-
    length(Q.tokens, End),
    segments(Q,0,End,[],Segments),
    maplist(analyse_clause(Q),Segments,Clauses),
    findall(Score-Choice, attachment_choice(Clauses,Score,Choice), Choices),
    keysort(Choices,Ranked),
    pairs_values(Ranked,Order),
    first_two(Order,Attachments).

first_two([A,B|_],[A,B]) :- !.
first_two(Order,Order).

attachment_choice(Clauses,Score,_{cue:Cue,owner:Owner}) :-
    member(Clause,Clauses),
    ( clause_attachment_choice(Clause,Score,Cue,Owner)
    ; attachment_choice(Clause.embedded,Score,_{cue:Cue,owner:Owner}) ).

clause_attachment_choice(Clause,Score,Cue,Owner) :-
    member(Relation,Clause.relations), Relation.attachment=="ambiguous",
    Relation.cue=[Cue,_],
    ( last(Clause.objects,Object), Owner=Object.from, Score is Cue
    ; append(_, [Prior,Relation|_], Clause.relations),
      Prior.end=:=Cue, last(Prior.entities,Anchor), Owner=Anchor.from, Score is Cue+1 ).

nominal_attachments(Q,Relations,Objects,Attached) :-
    nominal_attachments(Q,Relations,Objects,Objects,Attached).

nominal_attachments(_,[],_,_,[]).
nominal_attachments(Q,[Relation|Tail],Objects,Owners,[Attached|AttachedTail]) :-
    ( Relation.kinds=["orientation"], last(Objects,Object) ->
        Attached=Relation.put(owner,Object.from)
    ; Relation.cue=[Cue,After], After=:=Cue+1, unquoted_word(Q,Cue,"of"), last(Owners,Head) ->
        Attached=Relation.put(owner,Head.from)
    ; Relation.cue=[Cue,After], After=:=Cue+1, unquoted_word(Q,Cue,"by"),
      last(Owners,Direction), Direction.head=[Side,_], unquoted_word(Q,Side,SideWord),
      memberchk(SideWord,["left","right","up","down"]),
      Relation.entities=[Measure], measurement(Q,Measure) ->
        Attached=Relation.put(_{kinds:["measure"],markers:[],attachment:"clause"})
    ; Attached=Relation ),
    nominal_attachments(Q,Tail,Objects,Relation.entities,AttachedTail).

measurement(Q,Phrase) :-
    Phrase.head=[At,_], unquoted_word(Q,At,Unit),
    memberchk(Unit,["step","steps","spot","spots","space","spaces","pixel","pixels","inch","inches",
      "foot","feet","centimeter","centimeters","centimetre","centimetres","meter","meters","metre","metres"]),
    ( Phrase.determiner=[Number,_] ; member([Number,_],Phrase.modifiers) ),
    token_pos(Q,Number,"numeral"), !.

form_at(Q,At,Form) :- nth0(At,Q.forms,Forms), member(Form,Forms).
word_at(Q,At,Raw) :- nth0(At,Q.tokens,[Raw,_]).
token_pos(Q,At,POS) :- form_at(Q,At,F), F.end=:=At+1, memberchk(POS,F.pos).
has_form(Q,At,Field,Value) :-
    form_at(Q,At,F), get_dict(Field,F,Bank), memberchk(Value,Bank).

segments(_,At,End,_,[]) :- At>=End, !.
segments(Q,At,End,Cue,[gratitude(At,Stop,BodyEnd,Term,Separators,Relations)|Tail]) :-
    gratitude_phrase(Q,At,Stop),
    gratitude_body(Q,Stop,End,BodyEnd,Relations),
    gratitude_edge(Q,BodyEnd,End,Term,After,Outgoing),
    ( Cue=[Start,At,"gratitude_boundary"] -> Separators=[[Start,At]|Outgoing]
    ; Cue=[], Separators=Outgoing ),
    !,
    segments(Q,After,End,[],Tail).
segments(Q,At,End,Cue,Segments) :-
    FirstEnd is End-1,
    ( once((between(At,FirstEnd,Cut), Cut>At, boundary(Q,At,Cut,End,Stop,Term,Next,Join))) ->
        Segments = [segment(At,Stop,Term,Cue)|Tail], segments(Q,Next,End,Join,Tail)
    ; Segments=[segment(At,End,[],Cue)] ).

boundary(Q,_,Cut,End,Stop,[Cut,After],After,[]) :-
    sentence_mark(Q,Cut,_),
    terminator_run(Q,Cut,End,After), Stop=Cut, After<End.
boundary(Q,_,Cut,End,Cut,[],Next,[Cut,Next,"gratitude_boundary"]) :-
    separator_at(Q,Cut), Next is Cut+1,
    gratitude_phrase(Q,Next,Stop), gratitude_body(Q,Stop,End,BodyEnd,_),
    gratitude_edge(Q,BodyEnd,End,_,_,_).
boundary(Q,At,Cut,End,Cut,[],Cut,[]) :-
    gratitude_phrase(Q,Cut,Stop), gratitude_body(Q,Stop,End,BodyEnd,_),
    effective_end(Q,Cut,End,[],BodyEnd,_),
    main_predicate(Q,At,Cut,_,OperandStart,Acts), OperandStart<Cut,
    complete_before_gratitude(Q,OperandStart,Cut,Acts).
boundary(Q,At,Cut,End,Cut,[Cut,Next],Next,[At,CueEnd,Role,"fronted"]) :-
    word_at(Q,Cut,","), Next is Cut+1,
    subordinate_marker(Q,At,CueEnd,Role),
    has_predicate(Q,CueEnd,Cut), begins_predicate(Q,Next,End).
boundary(Q,At,Cut,End,Cut,[],After,[Cut,After,Role,"postposed"]) :-
    subordinate_marker(Q,Cut,After,Role),
    memberchk(Role,["reason","temporal","purpose"]),
    has_predicate(Q,At,Cut),
    main_predicate(Q,After,End,Predicate,_,_), Predicate>After,
    subject_before(Q,After,Predicate).
boundary(Q,At,Cut,End,Cut,[],After,[Cut,After,Kind]) :-
    first_content(Q,At,End,First), Cut>=First,
    joiner(Q,Cut,End,After,Kind),
    ( Kind=="sequence" ; has_predicate(Q,At,Cut) ),
    begins_predicate(Q,After,End).
boundary(Q,At,Cut,End,Cut,[],After,[Cut,After,Kind]) :-
    word_at(Q,Cut,","), Marker is Cut+1,
    joiner(Q,Marker,End,After,Kind),
    ( Kind=="sequence" ; has_predicate(Q,At,Cut) ),
    begins_predicate(Q,After,End).

subordinate_marker(Q,At,After,Kind) :-
    unquoted_word(Q,At,Word), Next is At+1,
    ( Word=="if" -> After=Next, Kind="condition"
    ; memberchk(Word,["while","when","once"]) -> After=Next, Kind="temporal"
    ; Word=="because" -> After=Next, Kind="reason"
    ; Word=="so", unquoted_word(Q,Next,"that"), After is Next+1, Kind="purpose" ).

% A recipient alone leaves room for a nominal thanks as the direct object.
complete_before_gratitude(Q,At,End,Acts) :-
    ( once((member(Act,Acts), memberchk(Act,Q.recipientActs))) ->
        operands(Q,At,End,Acts,[_],[_|_],[],_)
    ; slice_nominals(Q,At,End,[_|_],End,_) ).

gratitude_phrase(Q,At,Stop) :-
    unquoted_word(Q,At,First), Next is At+1,
    ( memberchk(First,["thanks","thx"]) -> Stop=Next
    ; First=="thank",
      ( unquoted_word(Q,Next,"you") -> Stop is Next+1
      ; unquoted_word(Q,Next,Hyphen), memberchk(Hyphen,["-","‐","‑"]),
        You is Next+1, unquoted_word(Q,You,"you"), Stop is You+1 ) ).

gratitude_body(Q,At,End,Stop,Relations) :-
    gratitude_complements(Q,At,End,Stop,Relations), !.
gratitude_body(_,At,_,At,[]).

gratitude_complements(Q,At,End,Stop,Relations) :-
    unquoted_word(Q,At,Cue), gratitude_role(Cue,Kind),
    Start is At+1, Start<End, Last is End-1,
    ( once((between(Start,Last,Edge), gratitude_complement_edge(Q,Edge))) -> Limit=Edge
    ; Limit=End ),
    ( slice_nominals(Q,Start,Limit,Entities,Limit,Coordinations), Entities\=[] ->
        Relations=[_{cue:[At,Start],kinds:[Kind],markers:[],entities:Entities,
          coordinations:Coordinations,attachment:"clause",end:Limit}|Rest]
    ; Relations=Rest ),
    ( gratitude_complements(Q,Limit,End,Stop,Rest) -> true
    ; Stop=Limit, Rest=[] ).

gratitude_complement_edge(Q,At) :-
    unquoted_word(Q,At,Raw),
    ( memberchk(Raw,[".","!","?",";"]) ; separator_at(Q,At) ; gratitude_role(Raw,_) ).

gratitude_role("for","reason").
gratitude_role("to","recipient").

unquoted_word(Q,At,Lower) :-
    nth0(At,Q.tokens,[Raw,false]), string_lower(Raw,Lower).

separator_at(Q,At) :-
    unquoted_word(Q,At,Raw), memberchk(Raw,[",","—","–",":"]).

gratitude_edge(_,End,End,[],End,[]).
gratitude_edge(Q,Stop,End,Term,After,Separators) :-
    Stop<End, unquoted_word(Q,Stop,Raw), Next is Stop+1,
    ( sentence_mark(Q,Stop,Raw) -> terminator_run(Q,Stop,End,After), Term=[Stop,After], Separators=[]
    ; separator_at(Q,Stop) -> Term=[], After=Next, Separators=[[Stop,Next]]
    ; begins_predicate(Q,Stop,End) -> Term=[], After=Stop, Separators=[] ).

sentence_mark(Q,At,Raw) :-
    unquoted_word(Q,At,Raw), memberchk(Raw,[".","!","?",";"]).

terminator_run(Q,At,End,After) :-
    ( At<End, sentence_mark(Q,At,_) ->
        Next is At+1, terminator_run(Q,Next,End,After)
    ; After=At ).

joiner(Q,At,End,After,Kind) :-
    form_at(Q,At,F), F.end<End, member(LexicalKind,F.joiner),
    memberchk(LexicalKind,["coordination","sequence","contrast","addition","disjunctive"]),
    ( LexicalKind=="coordination", form_at(Q,F.end,Next), Next.end<End,
      memberchk("sequence",Next.joiner) ->
        After=Next.end, Kind="sequence"
    ; After=F.end,
      ( unquoted_word(Q,At,Marker), memberchk(Marker,["but","yet"]) -> Kind="contrast"
      ; Kind=LexicalKind ) ).

begins_predicate(Q,At,End) :-
    first_content(Q,At,End,First),
    after_leading_auxiliary(Q,First,End,Start),
    ( form_at(Q,Start,Verb), Verb.end=<End, Verb.acts\=[]
    ; has_form(Q,Start,pos,"verb"), Next is Start+1, Next<End,
      ( token_pos(Q,Next,"determiner") ; token_pos(Q,Next,"pronoun")
      ; nominal_slice(Q,Next,End,_,_) )
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

lexical_predicate(Q,F,At,First,End,62) :-
    F.copula==true, At>First, F.end<End,
    wh_front(Q,First,At,At,_,_), noun_phrase(Q,F.end,End,_),
    !.
lexical_predicate(Q,F,At,First,_,55) :-
    F.participle==true, At>First, subject_before(Q,First,At),
    Last is At-1, between(First,Last,Auxiliary), token_flag(Q,Auxiliary,copula), !.

% The overt subject and predicative operand license copula before lexical ambiguity.
lexical_predicate(Q,F,At,First,End,49) :-
    F.copula==true, At>First, F.end<End,
    subject_before(Q,First,At),
    ( token_pos(Q,F.end,"adjective") ; preposition(Q,F.end,End,_,_) ),
    !.

% A finite form with an overt subject and object is distinct from a discourse formula.
lexical_predicate(Q,F,At,First,End,24) :-
    At>First, F.end=:=At+1, F.end<End,
    unquoted_word(Q,At,Word), memberchk(Word,["thank","thanks","thanked"]),
    subject_before(Q,First,At), noun_phrase(Q,F.end,End,_), !.
lexical_predicate(Q,F,At,First,End,Base) :-
    F.frames\=[], F.auxiliary==false, F.skip==false,
    frame_complement(Q,F.frames,F.end,End,_,_,_,_),
    ( At=:=First -> Base=64
    ; subject_before(Q,First,At) -> Base=59
    ; fail ), !.
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
    subject_arguments(Q,At,End,[_|_],_,_).

initial_auxiliary(Q,At,End) :-
    between(At,End,Start), form_at(Q,Start,F), F.end=<End,
    ( F.auxiliary==true ; F.negation==true ; F.question==true ), !.

analyse_clause(_,gratitude(At,ExpressionEnd,End,Term,Separators,Relations),Clause) :-
    Clause=_{from:At,to:End,predicate:[End,End],acts:[],form:"fragment",
      expression:[At,ExpressionEnd],speechAct:"gratitude",separators:Separators,
      question:[],auxiliary:[],negation:[],terminator:Term,subjects:[],subjectCoordinations:[],
      objects:[],indirect:[],relations:Relations,coordinations:[],complement:[],join:[],
      adverb:[],particle:[],embedded:[]}.
analyse_clause(Q,segment(At,End0,Term0,Cue),Clause) :-
    effective_end(Q,At,End0,Term0,End,Term),
    clause_opening(Q,At,End,CoreStart,Opening,Separators),
    first_content(Q,CoreStart,End,First),
    ( main_predicate(Q,First,End,P,A,PlainActs) ->
        wh_marker(Q,First,P,Question),
        prefix_items(Q,CoreStart,P,Aux,BeforeNegation),
        post_negations(Q,A,End,NegEnd,AfterNegation),
        append(BeforeNegation,AfterNegation,Negation),
        wh_front(Q,First,P,SubjectStart,WhPhrase,WhRange),
        subject_arguments(Q,SubjectStart,P,Subjects0,SubjectRelations,SubjectJoins0),
        ( Subjects0=[Subject0|_] -> true ; Subject0=none ),
        clause_adverbs(Q,CoreStart,P,PrefixAdverbs),
        edge_adverbs(Q,P,NegEnd,End,AfterAdverbs,BeforeAdverbs,BodyAdverbs),
        particle(Q,P,AfterAdverbs,BeforeAdverbs,PlainActs,OperandStart,OperandEnd,Particle,OperandActs),
        evidenced_acts(Q,P,OperandActs,Acts),
        form_at(Q,P,PredicateForm), PredicateForm.end=:=A,
        ( frame_complement(Q,PredicateForm.frames,OperandStart,OperandEnd,ChildStart,Marker,ChildForm,Controller),
          analyse_complement(Q,ChildStart,OperandEnd,Term,Marker,ChildForm,Child) ->
            ( Marker=[VisibleEnd,_] -> true ; VisibleEnd=ChildStart ),
            Embedded=[Child], VisibleTerm=[], Complement0=[], Degree=[], Predicative=[], Indirect=[],
            Objects0=Controller, Relations0=SubjectRelations, Coordinations=[]
        ; Subject0\==none, token_flag(Q,P,clauseTaker), embedded_clause(Q,OperandStart,OperandEnd,Term,Child) ->
            Embedded=[Child], VisibleEnd=OperandStart, VisibleTerm=[], Complement0=[], Degree=[], Predicative=[], Indirect=[],
            Objects0=[], Relations0=SubjectRelations, Coordinations=[]
        ; Embedded=[], VisibleEnd=End, VisibleTerm=Term,
          predicate_complement(Q,PredicateForm.frames,P,OperandStart,OperandEnd,Acts,
            BodyEnd,Complement0,Degree,Predicative,ResultRelations),
          operands(Q,OperandStart,BodyEnd,OperandActs,Indirect,Objects0,BodyRelations,Coordinations),
          complement_relations(Q,Complement0,OperandEnd,ComplementRelations),
          nominal_attachments(Q,BodyRelations,Objects0,AttachedBody),
          append([SubjectRelations,AttachedBody,ComplementRelations,ResultRelations],Relations0) ),
        ( Subject0==none, token_flag(Q,P,copula), Objects0=[Inverted|Others],
          (Question\=[] ; question_term(Q,Term)) ->
            Subject=Inverted, Objects=Others,
            ( WhRange\=[], Complement0=[] -> Complement=WhRange ; Complement=Complement0 )
        ; Subject0==none, WhPhrase\==none ->
            Subject=WhPhrase, Objects=Objects0, Complement=Complement0
        ; Subject=Subject0, Complement=Complement0,
          ( WhPhrase\==none, Objects0=[] -> Objects=[WhPhrase] ; Objects=Objects0 ) ),
        ( Subject\==none, token_flag(Q,P,participle), auxiliary_copula(Q,Aux) ->
          maplist(passive_relation(Q),Relations0,Relations)
        ; Relations=Relations0 ),
        ( Subject0==none -> none_as_list(Subject,Subjects), SubjectCoordinations=[]
        ; Subjects=Subjects0, SubjectCoordinations=SubjectJoins0 ),
        modifier_adverbs(Q,OperandStart,Relations,AdjunctAdverbs),
        append([PrefixAdverbs,BodyAdverbs,AdjunctAdverbs],Adverbs),
        clause_type(Subject,Question,Term,Q,First,Aux,Kind)
    ; P=End, A=End, Acts=[], Aux=[], Negation=[], Complement=[], Degree=[], Predicative=[], Adverbs=[], Particle=[], Indirect=[],
      Embedded=[], VisibleEnd=End, VisibleTerm=Term,
      wh_marker(Q,First,End,Question),
      ( Question=[_,TopicAt] -> Kind="interrogative" ; Kind="fragment", TopicAt=First ),
      ( noun_phrase(Q,TopicAt,End,Topic) -> Subjects=[Topic], SubjectCoordinations=[]
      ; slice_nominals(Q,TopicAt,End,Topics,End,TopicCoordinations) ->
          Subjects=Topics, SubjectCoordinations=TopicCoordinations
      ; Subjects=[], SubjectCoordinations=[] ),
      Objects=[], Relations=[], Coordinations=[] ),
    append(Opening,Relations,AllRelations),
    Clause=_{from:At,to:VisibleEnd,predicate:[P,A],acts:Acts,form:Kind,question:Question,separators:Separators,
      auxiliary:Aux,negation:Negation,terminator:VisibleTerm,subjects:Subjects,subjectCoordinations:SubjectCoordinations,
      objects:Objects,indirect:Indirect,
      relations:AllRelations,coordinations:Coordinations,complement:Complement,degree:Degree,predicative:Predicative,join:Cue,
      adverb:Adverbs,particle:Particle,embedded:Embedded}.

% A marked fronted adjunct must consist of consecutive, fully grounded PPs.
clause_opening(Q,At,End,Core,Relations,[[Cut,Core]]) :-
    first_content(Q,At,End,Start), Start<End,
    preposition(Q,Start,End,_,_),
    Last is End-2, between(Start,Last,Cut), Cut>Start,
    unquoted_word(Q,Cut,","),
    Core is Cut+1, begins_predicate(Q,Core,End),
    prepositions(Q,Start,Cut,Relations), Relations\=[],
    consecutive_relations(Relations,Start,Cut),
    !.
clause_opening(_,At,_,At,[],[]).

consecutive_relations([],End,End).
consecutive_relations([Relation|Tail],At,End) :-
    Relation.cue=[At,_], consecutive_relations(Tail,Relation.end,End).

% The send alias licenses a recipient frame for give. It does not establish dispatch.
evidenced_acts(Q,At,Acts,Evidenced) :-
    unquoted_word(Q,At,Word), memberchk(Word,["give","gives","gave","given","giving"]), !,
    exclude(=("send"),Acts,Evidenced).
evidenced_acts(_,_,Acts,Acts).

% A valency is positive lexical evidence. Complement shape must also be overt.
frame_complement(Q,Frames,At,End,Start,[Marker,Start],"nonfinite",[Object]) :-
    memberchk("object_infinitive",Frames),
    Last is End-2, between(At,Last,Marker), Marker>At,
    unquoted_word(Q,Marker,"to"), Start is Marker+1,
    base_verb_at(Q,Start), noun_phrase(Q,At,Marker,Object), !.
frame_complement(Q,Frames,At,End,Start,[At,Start],"nonfinite",[]) :-
    memberchk("infinitive",Frames),
    At<End, unquoted_word(Q,At,"to"), Start is At+1, Start<End, base_verb_at(Q,Start), !.
frame_complement(Q,Frames,At,End,Start,[],"nonfinite",[Object]) :-
    memberchk("object_bare_infinitive",Frames),
    Last is End-1, between(At,Last,Start), Start>At,
    base_verb_at(Q,Start), noun_phrase(Q,At,Start,Object),
    \+ ( token_pos(Q,At,"determiner"), nominal_slice(Q,At,End,_,NominalEnd), NominalEnd>Start ),
    !.
frame_complement(Q,Frames,At,End,Start,[At,Start],"finite",[]) :-
    memberchk("finite_clause",Frames),
    At<End, unquoted_word(Q,At,"that"), Start is At+1,
    Last is End-1, between(Start,Last,Predicate), Predicate>Start,
    finite_verb_at(Q,Predicate,End), subject_before(Q,Start,Predicate), !.

base_verb_at(Q,At) :-
    form_at(Q,At,F),
    F.auxiliary==false, F.negation==false, F.skip==false,
    ( F.base==true ; F.acts\=[] ; F.copula==true ), !.
finite_verb_at(Q,At,End) :-
    form_at(Q,At,F), F.end=<End,
    ( F.base==true ; F.acts\=[] ; F.copula==true ; memberchk("verb",F.pos) ), !.

analyse_complement(Q,Start,End,Term,Marker,Type,Clause) :-
    analyse_clause(Q,segment(Start,End,Term,[]),Parsed),
    Parsed.predicate=[Before,After], Before<After,
    ( Type=="finite" -> Parsed.subjects\=[], Clause=Parsed.put(marker,Marker)
    ; Parsed.subjects=[], Clause=Parsed.put(_{form:"nonfinite",marker:Marker}) ).

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

edge_adverbs(Q,Predicate,At,End,First,Last,Adverbs) :-
    leading_adverbs(Q,At,End,First,Leading),
    trailing_adverbs(Q,Predicate,First,End,Last,Trailing),
    append(Leading,Trailing,Adverbs).

leading_adverbs(Q,At,End,First,[[At,Next]|Rest]) :-
    At<End, token_flag(Q,At,adverb), !,
    Next is At+1, leading_adverbs(Q,Next,End,First,Rest).
leading_adverbs(_,At,_,At,[]).

trailing_adverbs(Q,Predicate,At,End,Last,Adverbs) :-
    Before is End-1, Before>=At,
    tail_adverb(Q,Predicate,At,Before), !,
    trailing_adverbs(Q,Predicate,At,Before,Last,Rest), append(Rest,[[Before,End]],Adverbs).
trailing_adverbs(_,_,_,End,End,[]).

tail_adverb(Q,Predicate,At,Before) :-
    Prior is Before-1,
    \+ ( Prior>=At, ( token_pos(Q,Prior,"determiner") ; has_form(Q,Prior,preposition,_) ) ),
    \+ ( unquoted_word(Q,Before,"alone"), unquoted_word(Q,Predicate,Verb), memberchk(Verb,["leave","keep"]) ),
    ( token_flag(Q,Before,adverb)
    ; Before>At, unquoted_word(Q,Before,Direction), memberchk(Direction,["left","right","up","down"]),
      unquoted_word(Q,Predicate,Movement), memberchk(Movement,["move","shift","slide","turn","swing","push","pull"]),
      noun_phrase(Q,At,Before,_) ).

modifier_adverbs(Q,At,Relations,Adverbs) :-
    findall([Start,Cue],(
      member(Relation,Relations), Relation.cue=[Cue,_],
      Start is Cue-1, Start>=At,
      pp_degree_word(Q,Start),
      \+ ( member(Other,Relations), member(Operand,Other.entities), Operand.from=<Start, Start<Operand.to )
    ),Adverbs).

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
    Last is End0-1,
    between(At,Last,End), sentence_mark(Q,End,_),
    terminator_run(Q,End,End0,End0), !.
effective_end(_,_,End,Term,End,Term).

none_as_list(none,[]) :- !.
none_as_list(Phrase,[Phrase]).

wh_marker(Q,At,End,[At,E]) :-
    At<End, form_at(Q,At,F), F.end=<End, F.question==true, E=F.end, !.
wh_marker(_,_,_,[]).

wh_front(Q,At,Predicate,After,Phrase,[Start,After]) :-
    unquoted_word(Q,At,Wh), memberchk(Wh,["which","what","whose"]),
    wh_marker(Q,At,Predicate,[At,Start]),
    between(Start,Predicate,After), After>Start,
    ( After=:=Predicate ; token_flag(Q,After,auxiliary) ),
    noun_phrase(Q,Start,After,Phrase), !.
wh_front(_,At,_,At,none,[]).

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

subject_arguments(Q,At,End,Subjects,Relations,Coordinations) :-
    subject_start(Q,At,End,Start),
    ( once((between(Start,End,Stop), Stop>Start,
        slice_nominals(Q,Start,Stop,Subjects,Stop,Coordinations), Coordinations\=[],
        auxiliary_tail(Q,Stop,End))) ->
        Relations=[]
    ; subject_phrase(Q,Start,End,Subject,Relations),
      none_as_list(Subject,Subjects), Coordinations=[] ).

subject_start(Q,At,End,Start) :-
    At<End, subordinate_marker(Q,At,After,_), After<End, !,
    subject_start(Q,After,End,Start).
subject_start(Q,At,End,Start) :-
    At<End, form_at(Q,At,F), F.end=<End,
    ( F.auxiliary==true ; F.negation==true ; F.question==true ; F.skip==true ;
      F.adverb==true, \+ memberchk("pronoun",F.pos) ; memberchk("condition",F.joiner) ), !,
    subject_start(Q,F.end,End,Start).
subject_start(_,At,_,At).

subject_phrase(Q,At0,End,Phrase,Relations) :-
    subject_start(Q,At0,End,At),
    At<End,
    once((between(At,End,Stop), Stop>At, subject_nominal(Q,At,Stop,Phrase,Relations),
      auxiliary_tail(Q,Stop,End))), !.
subject_phrase(_,_,_,none,[]).

subject_nominal(Q,At,End,Phrase,Relations) :-
    nominal_slice(Q,At,End,Phrase,Stop),
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

clause_type(_,Q,_,_,_,_,"interrogative") :- Q\=[], !.
clause_type(Subject,_,_,_,First,[[First,_]|_],"interrogative") :-
    Subject\==none, Subject.from>First, !.
clause_type(Subject,_,Term,Q,_,_,"interrogative") :- Subject\==none, question_term(Q,Term), !.
clause_type(none,_,_,_,_,_,"imperative") :- !.
clause_type(_,_,_,_,_,_,"declarative").

question_term(Q,[At,End]) :-
    Last is End-1, between(At,Last,Mark), word_at(Q,Mark,"?"), !.

predicate_complement(Q,Frames,P,At,End,Acts,Body,Complement,Degree,Predicative,Relations) :-
    ( nominal_result(Q,Frames,P,At,End,Body,Predicative,Relations) ->
        Complement=[], Degree=[]
    ; Predicative=[], Relations=[],
      complement(Q,At,End,Frames,Acts,Boundary,Complement),
      degree_before(Q,At,Boundary,Complement,Body,Degree) ).

nominal_result(Q,Frames,P,At,End,Body,Predicative,Relations) :-
    Last is End-1, between(At,Last,Body), Body>At,
    noun_phrase(Q,At,Body,Object),
    ( memberchk("object_predicative",Frames),
      token_pos(Q,Body,"determiner"),
      noun_phrase(Q,Body,End,Predicative) -> Relations=[]
    ; unquoted_word(Q,P,Verb), memberchk(Verb,["call","name","rename","label"]),
      annotation_target(Q,"label",Body,End,End,Target) ->
        Predicative=Target.put(_{head:[],determiner:[],modifiers:[],pronoun:[],kinds:[],colors:[],from:Body,to:End}),
        Relations=[]
    ; memberchk("object_predicative",Frames), Start is Body+1, Start<End,
      predicative_cue(Q,P,Body,Start), noun_phrase(Q,Start,End,Predicative),
      Relations=[_{cue:[Body,Start],kinds:["result"],markers:[],entities:[],coordinations:[],
        attachment:"object",owner:Object.from,predicative:true,end:End}] ), !.

predicative_cue(Q,_,At,_) :- unquoted_word(Q,At,"into").
predicative_cue(Q,P,At,Start) :-
    unquoted_word(Q,P,"set"), unquoted_word(Q,At,"to"), token_flag(Q,Start,decimalValue).

degree_before(Q,At,Boundary,[Boundary,_],Start,[[Start,Boundary]]) :-
    Last is Boundary-1, Last>=At, Last>0,
    ( unquoted_word(Q,Last,Word),
      memberchk(Word,["slightly","much","far","somewhat","rather","very","quite","significantly","substantially"]) ->
        Start=Last
    ; Start is Boundary-2, Start>=At,
      unquoted_word(Q,Start,Lead), unquoted_word(Q,Last,Tail),
      memberchk([Lead,Tail],[["a","little"],["a","bit"],["a","lot"],["one","size"]]) ), !.
degree_before(_,_,End,_,End,[]).

complement(Q,At,End,_,_,End,[]) :-
    nominal_slice(Q,At,End,Phrase,End), get_dict(annotations,Phrase,_), !.
complement(Q,At,End,_,_,Start,[Start,Than]) :-
    Last is End-1, between(At,Last,Start), token_flag(Q,Start,comparative),
    Than is Start+1, Than<End, has_form(Q,Than,preposition,"than"), !.
complement(Q,At,End,Frames,Acts,Last,[Last,End]) :-
    Last is End-1, Last>=At,
    predicative_adjective(Q,Last,Frames),
    Prior is Last-1,
    \+ ( Prior>=At, ( token_pos(Q,Prior,"determiner") ; has_form(Q,Prior,preposition,_) ) ),
    ( Last=:=At ; memberchk("change",Acts) ; has_color(Q,Last)
    ; memberchk("object_predicative",Frames), nominal_slice(Q,At,Last,_,Last) ), !.
complement(_,_,End,_,_,End,[]).

predicative_adjective(Q,At,_) :- token_pos(Q,At,"adjective"), !.
predicative_adjective(Q,At,Frames) :-
    memberchk("object_predicative",Frames),
    ( token_flag(Q,At,participle) ; unquoted_word(Q,At,"alone") ).

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
    nominal_slice(Q,At,End,Noun,E), !,
    ( nominal_joiner(Q,E,End,After,Kind), slice_nominals(Q,After,End,Rest,Stop,Tail), Rest=[First|_] ->
        Links=[_{from:Noun.from,to:First.from,cue:[E,After],kind:Kind}|Tail]
    ; Rest=[], Stop=E, Links=[] ).
slice_nominals(_,At,_,[],At,[]).

nominal_joiner(Q,At,End,After,Kind) :- joiner(Q,At,End,After,Kind).
nominal_joiner(Q,At,End,After,Kind) :-
    word_at(Q,At,","), Next is At+1, Next<End,
    ( joiner(Q,Next,End,After,Kind) -> true
    ; After=Next, Kind="coordination" ).

nominal_slice(Q,At,End,Noun,Stop) :-
    Last is End-1,
    between(At,Last,Cut), Cut>At,
    noun_phrase(Q,At,Cut,Head),
    nominal_annotations(Q,Head,Cut,End,Stop,Annotations), !,
    Noun=Head.put(_{to:Stop,annotations:Annotations}).
nominal_slice(Q,At,End,Noun,Stop) :-
    Last is End-1,
    between(At,Last,Stop), Stop>At,
    nominal_boundary(Q,Stop,End),
    noun_phrase(Q,At,Stop,Noun), !.
nominal_slice(Q,At,End,Noun,End) :- noun_phrase(Q,At,End,Noun).

nominal_boundary(Q,At,End) :-
    ( preposition(Q,At,End,_,_) ; joiner(Q,At,End,_,_) ; word_at(Q,At,",")
    ; pp_degree_word(Q,At), Next is At+1, preposition(Q,Next,End,_,_)
    ; orientation_modifier(Q,At,End,_) ).

pp_degree_word(Q,At) :-
    unquoted_word(Q,At,Word), memberchk(Word,["slightly","directly","straight","exactly","roughly","approximately"]).

nominal_annotations(Q,Head,At,End,Stop,[Annotation|Tail]) :-
    ( unquoted_word(Q,At,Marker), nominal_annotation_marker(Marker,Kind),
      Start is At+1, Start<End,
      annotation_target(Q,Kind,Start,End,After,Target),
      Annotation=_{cue:[At,Start],kind:Kind,target:Target}
    ; textual_head(Q,Head), quoted_literal(Q,At,End,After),
      Annotation=_{cue:[],kind:"content",target:_{literal:[At,After]}} ),
    ( nominal_annotations(Q,Head,After,End,Stop,Tail) -> true
    ; Stop=After, Tail=[] ).

nominal_annotation_marker("called","label").
nominal_annotation_marker("named","label").
nominal_annotation_marker("titled","label").
nominal_annotation_marker("labelled","label").
nominal_annotation_marker("labeled","label").
nominal_annotation_marker("containing","content").
nominal_annotation_marker("saying","content").
nominal_annotation_marker("reading","content").

textual_head(Q,Head) :-
    Head.head=[At,Stop], Stop=:=At+1, unquoted_word(Q,At,Word),
    memberchk(Word,["word","words","text","phrase","label","string","title"]).

annotation_target(Q,Kind,At,End,After,Target) :-
    quoted_literal(Q,At,End,After), !,
    ( Kind=="content" -> Target=_{literal:[At,After]}
    ; Target=_{name:[At,After]} ).
annotation_target(Q,"label",At,End,After,_{name:[At,After]}) :-
    Last is End-1,
    ( once((between(At,Last,Edge), Edge>At, annotation_boundary(Q,Edge,End))) -> After=Edge
    ; After=End ),
    After=<At+8, NameLast is After-1,
    forall(between(At,NameLast,Token), label_word(Q,Token)).

annotation_boundary(Q,At,End) :-
    ( preposition(Q,At,End,_,_) ; nominal_joiner(Q,At,End,_,_) ;
      separator_at(Q,At) ; unquoted_word(Q,At,Marker), nominal_annotation_marker(Marker,_) ).

label_word(Q,At) :-
    unquoted_word(Q,At,_), form_at(Q,At,F), F.end=:=At+1, F.word==true,
    F.auxiliary==false, F.negation==false, F.question==false,
    \+ memberchk("pronoun",F.pos).

quoted_literal(Q,At,End,After) :-
    At<End, nth0(At,Q.tokens,[Open,true]),
    quote_pair(Open,Close), Start is At+2, Last is End-1,
    between(Start,Last,Finish), nth0(Finish,Q.tokens,[Close,true]), !,
    After is Finish+1.

quote_pair("\"","\"").
quote_pair("“","”").
quote_pair("'","'").
quote_pair("‘","’").

phrase_end(Q,At,End,Stop) :-
    Last is End-1,
    ( once((between(At,Last,P), P>At,
        ( preposition(Q,P,End,_,_) ; joiner(Q,P,End,_,_) ; word_at(Q,P,",") ))) ->
        Stop=P ; Stop=End ).

prepositions(_,At,End,[]) :- At>=End, !.
prepositions(Q,At,End,Relations) :-
    ( orientation_modifier(Q,At,End,Orientation) ->
        Relations=[Orientation|Tail], prepositions(Q,Orientation.end,End,Tail)
    ; preposition(Q,At,End,After,Form),
      \+ orientation_modifier(Q,After,End,_),
      slice_nominals(Q,After,End,Phrases,Stop,Coordinations), Stop>After, Phrases\=[] ->
        ( member(Kind,Form.preposition), memberchk(Kind,["with","near","in","on"]) ->
            Attachment="ambiguous"
        ; Attachment="clause" ),
        preposition_roles(Q,At,After,Phrases,Form,Kinds,Markers),
        Relations=[_{cue:[At,After],kinds:Kinds,markers:Markers,entities:Phrases,
          coordinations:Coordinations,attachment:Attachment,end:Stop}|Rest],
        prepositions(Q,Stop,End,Rest)
    ; Next is At+1, prepositions(Q,Next,End,Relations) ).

orientation_modifier(Q,At,End,Relation) :-
    unquoted_word(Q,At,"facing"),
    Value is At+1, Value<End, unquoted_word(Q,Value,Direction),
    memberchk(Direction,["left","right","up","down","north","south","east","west","forward","backward"]),
    Stop is Value+1,
    Head=_{from:Value,to:Stop,head:[Value,Stop],determiner:[],modifiers:[],pronoun:[],name:[],kinds:[],colors:[]},
    Relation=_{cue:[At,Value],kinds:["orientation"],markers:[],entities:[Head],coordinations:[],
      attachment:"clause",end:Stop}.

preposition_roles(Q,At,After,[Phrase],_,[Kind],[]) :-
    After=:=At+1, unquoted_word(Q,At,Cue), temporal_role(Cue,Kind),
    Phrase.head=[Value,_], calendrical_head(Q,Value), !.
preposition_roles(Q,At,After,[Phrase],_,["duration"],[]) :-
    After=:=At+1, unquoted_word(Q,At,"for"), duration_phrase(Q,Phrase), !.
preposition_roles(Q,At,After,[Phrase],_,["by"],[]) :-
    After=:=At+1, unquoted_word(Q,At,"by"), Phrase.head=[Value,_],
    unquoted_word(Q,Value,Dimension),
    memberchk(Dimension,["theme","category","type","department","year","month","region","size","color","colour"]),
    !.
preposition_roles(_,_,_,_,Form,Form.preposition,Form.markers).

calendrical_head(Q,At) :- token_flag(Q,At,temporalValue), !.
calendrical_head(Q,At) :-
    unquoted_word(Q,At,Date),
    memberchk(Date,["monday","tuesday","wednesday","thursday","friday","saturday","sunday","today","tomorrow","yesterday"]).

duration_phrase(Q,Phrase) :-
    Phrase.head=[At,_], unquoted_word(Q,At,Unit),
    memberchk(Unit,["second","seconds","minute","minutes","hour","hours","day","days","week","weeks",
      "month","months","year","years"]),
    ( Phrase.determiner=[Number,_] ; member([Number,_],Phrase.modifiers) ),
    token_pos(Q,Number,"numeral"), !.

temporal_role("at","time").
temporal_role("on","time").
temporal_role("to","time").
temporal_role("from","start_time").
temporal_role("until","end_time").

preposition(Q,At,End,After,Form) :-
    form_at(Q,At,Form), Form.end<End, Form.preposition\=[], After=Form.end.

noun_phrase(Q,At,End,_{from:At,to:End,head:[At,End],determiner:[],modifiers:[],pronoun:[],name:[],kinds:[],colors:[]}) :-
    End=:=At+1, token_flag(Q,At,decimalValue), !.
noun_phrase(Q,At,End,_{from:At,to:End,head:[At,After],determiner:[],modifiers:Modifiers,pronoun:[],name:[],kinds:[],colors:[]}) :-
    After is At+1, token_flag(Q,At,temporalValue),
    ( After=:=End -> Modifiers=[]
    ; End=:=After+1, token_flag(Q,At,clockValue),
      unquoted_word(Q,After,Zone), memberchk(Zone,["utc","gmt","am","pm"]),
      Modifiers=[[After,End]] ), !.
noun_phrase(Q,At,End,_{from:At,to:End,head:[],determiner:[],modifiers:[],pronoun:[],name:[First,Last],kinds:[],colors:[]}) :-
    First is At+1, Last is End-1, First<Last,
    nth0(At,Q.tokens,[Open,true]), nth0(Last,Q.tokens,[Close,true]),
    memberchk([Open,Close], [["\"","\""],["“","”"],["'","'"],["‘","’"]]),
    !.
noun_phrase(Q,At,End,_{from:At,to:End,head:[At,End],determiner:[],modifiers:[],pronoun:[At,End],name:[],kinds:[],colors:[]}) :-
    At<End, form_at(Q,At,F), F.end=:=End, memberchk("pronoun",F.pos),
    \+ memberchk("possessive",F.pronoun), !.
noun_phrase(Q,At,End,_{from:At,to:End,head:[Head,End],determiner:Det,modifiers:Mods,pronoun:[],name:Name,kinds:Kinds,colors:Colors}) :-
    At<End, \+ bare_article(Q,At,End),
    noun_determiner(Q,At,End,Det,First), First<End,
    ( ( letter_name(Q,First,End) ; Det=[], First>0, name_span(Q,First,End) ) ->
        Head=First, Mods=[], Colors=[], Kinds=[], Name=[First,End]
    ; nominal_structure(Q,First,End,Det,Head,Kinds,Mods,Colors) -> Name=[]
    ; name_span(Q,First,End) -> Head=First, Mods=[], Colors=[], Kinds=[], Name=[First,End]
    ), !.

bare_article(Q,At,End) :-
    End=:=At+1,
    nth0(At,Q.tokens,[Raw,false]), Raw\=="A", string_lower(Raw,Article),
    memberchk(Article,["a","an","the"]).

nominal_structure(Q,First,End,Det,Head,Kinds,Mods,Colors) :-
    noun_head(Q,First,End,Head,Kinds),
    nominal_modifiers(Q,First,Head,Det,Mods,Colors).
nominal_structure(Q,First,End,Det,Head,[],Mods,Colors) :-
    Det\=[],
    Head is End-1, Head>=First,
    unknown_nominal_word(Q,Head),
    modifier_series(Q,First,Head,Mods,Colors).

nominal_modifiers(Q,First,Head,_,Mods,Colors) :-
    modifier_series(Q,First,Head,Mods,Colors).
nominal_modifiers(Q,First,Head,Det,Mods,Colors) :-
    Det\=[], First<Head,
    % The overt determiner and a recognized head license one unknown nominal modifier.
    Last is Head-1, between(First,Last,Unknown),
    unknown_nominal_word(Q,Unknown), Next is Unknown+1,
    modifier_series(Q,First,Unknown,Before,LeftColors),
    modifier_series(Q,Next,Head,After,RightColors),
    append(Before,[[Unknown,Next]|After],Mods), append(LeftColors,RightColors,Colors).

unknown_nominal_word(Q,At) :-
    unquoted_word(Q,At,_),
    form_at(Q,At,F), F.end=:=At+1, F.word==true,
    F.pos=[], F.acts=[], F.preposition=[], F.joiner=[],
    F.auxiliary==false, F.negation==false, F.question==false, F.skip==false, F.adverb==false.

noun_determiner(Q,At,End,[At,After],After) :-
    form_at(Q,At,F), F.end<End,
    ( memberchk("determiner",F.pos) ; memberchk("possessive",F.pronoun) ),
    After=F.end, !.
noun_determiner(_,At,_,[],At).

noun_head(Q,First,End,Start,Kinds) :-
    Last is End-1,
    between(First,Last,Start), form_at(Q,Start,F), F.end=:=End,
    ( F.kinds\=[] ; memberchk("noun",F.pos)
    ; directional_head(Q,First,End,Start) ; interrogative_head(Q,First,End,Start) ), Kinds=F.kinds.

interrogative_head(Q,Start,End,Start) :-
    End=:=Start+1, Prior is Start-1, token_flag(Q,Prior,question),
    unquoted_word(Q,Start,Dimension),
    memberchk(Dimension,["color","colour","size","shape","name","number","height","width","length","type","kind"]).

directional_head(Q,Start,End,Start) :-
    End=:=Start+1, Prior is Start-1,
    unquoted_word(Q,Prior,"the"), unquoted_word(Q,Start,Side),
    memberchk(Side,["left","right"]).

modifier_series(_,At,At,[],[]) :- !.
modifier_series(Q,At,End,[[At,Next]|Modifiers],Colors) :-
    At<End, form_at(Q,At,F), Next=F.end, Next=<End,
    \+ memberchk("pronoun",F.pos), \+ memberchk("determiner",F.pos),
    F.auxiliary==false, F.negation==false, F.question==false, F.skip==false,
    \+ token_pos(Q,At,"preposition"),
    ( memberchk("adjective",F.pos) ; memberchk("numeral",F.pos) ; Next=:=At+1, F.kinds\=[]
    ; memberchk("noun",F.pos), \+ memberchk("verb",F.pos) ),
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
