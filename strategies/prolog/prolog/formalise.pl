:- use_module(library(lists)).
:- use_module(library(pairs)).
:- use_module(library(apply)).
:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(library(pcre)).
:- use_module(properties).
:- use_module(native_property_frames).
:- use_module(topic_commands).
:- use_module(argument_sequences).
:- use_module(member_actions).
:- use_module(universal_inventory).
:- use_module(landmark_pairs).
:- use_module(set_exclusion).
:- use_module(verb_effects).
:- use_module(coordinated_effects).
:- use_module(roles).
:- use_module(language_frames).
:- use_module(syntax).
:- use_module(constituents).
:- initialization(main, main).

main :- repeat,
    read_line_to_string(user_input, Line),
    ( Line == end_of_file -> !
    ; catch((atom_json_dict(Line, Q, []), answer(Q, Answers),
             json_write_dict(current_output, Answers, [width(0)])),
            E, (print_message(error, E), halt(1))),
      nl, flush_output, fail ).

answer(Q, Analysis) :- get_dict(syntaxOnly,Q,Packet), !,
    catch((syntax_analysis(Packet,Parsed) ->
        constituent_graph(Packet,Graph), Analysis=Parsed.put(constituents,Graph) ; Analysis=_{error:"Syntax analysis produced no result"}),
      Error, (message_to_string(Error,Message), Analysis=_{error:Message})).
answer(Q, Plans) :- get_dict(landmarkPair,Q,Packet), !, landmark_pair_plans(Packet,Plans).
answer(Q, Plans) :- get_dict(setExclusion,Q,Packet), !, exclusion_plans(Packet,Plans).
answer(Q, Proofs) :- get_dict(languageOnly,Q,Packet), !, frame_proofs(Packet,Proofs).
answer(Q, _{candidates:Answers,orderings:Orderings,relativePlacements:RelativePlacements,frontedCandidates:Fronted,frameTargets:FrameTargets,splitTargets:SplitTargets,universalCandidates:Universal,proofs:Proofs,groundedPredicates:Grounded,topicCommands:Topics,sequences:Sequences,memberActions:Members,coordinatedEffects:Effects,verbEffects:VerbEffects,nativeProperties:NativeProperties}) :-
    topic_commands(Q,Topics),
    native_property_frames(Q,NativeProperties),
    verb_effects(Q,VerbEffects),
    coordinated_effects(Q,Effects),
    member_actions(Q,Members),
    argument_sequences(Q,Sequences),
    findall(Order, comparative_order(Q,Order), RawOrders), list_to_set(RawOrders,Orderings),
    frame_proofs(Q.language,Proofs),
    findall([Start,End,Act],
            ( member(Proof,Proofs), offsets(Q.tokens,Proof.predicate,Start,End),
              Act=Proof.act, memberchk([Start,End,[Act],true], Q.declaredActs) ), Matches),
    sort(Matches,Grounded),
    property_constraints(Q, ExtraHits), append(Q.hits,ExtraHits,Hits),
    findall(B, (member(P,Proofs), target_scope(Q.tokens,Q.targetRoles,P,B)), RawBounds), sort(RawBounds, Bounds),
    reset_role_cache, index_roles(Q.put(_{roleScopes:Bounds,groundedPredicates:Grounded}), Hits, WithProperties),
    findall(Placement, relative_placement(WithProperties,Placement), RawPlacements),
    list_to_set(RawPlacements,RelativePlacements),
    ( get_dict(frontedPlan, Q, Clause) ->
      findall(CleanFront,
              ( member(ActHit,WithProperties.actHits),
                ActHit=[Start,_,["act",Act,Mood,_],_], Start=:=Clause.predicate,
                memberchk(Mood,["","do","propose"]), memberchk(Act,Clause.acts),
                ScopedFront=WithProperties.put(_{actHits:[ActHit],frontedDestination:Clause}),
                lexical_candidate(ScopedFront,_,Front), sub_string(Front.sop,_,_,_," operator=relation "),
                clean_candidate(Front,CleanFront) ), Fronts),
      list_to_set(Fronts,Fronted)
    ; Fronted=[] ),
    findall(Candidate, frame_target_candidate(WithProperties,Proofs,Candidate), FrameTargetCandidates),
    list_to_set(FrameTargetCandidates,FrameTargets),
    findall(Candidate, split_target_candidate(WithProperties,Candidate), SplitCandidates),
    list_to_set(SplitCandidates,SplitTargets),
    universal_inventory_plans(WithProperties, Plans),
    findall(CleanUniversal,
            ( member(Plan, Plans), Target=Plan.targetHit,
              Scoped=WithProperties.put(_{actHits:[Plan.actHit],targetHits:[Target|WithProperties.targetHits],requiredTarget:Target}),
              lexical_candidate(Scoped, _, Candidate), clean_candidate(Candidate, CleanCandidate),
              CleanUniversal=CleanCandidate.put(requiresResult,Plan.requiresResult) ),
            RawUniversal),
    list_to_set(RawUniversal, Universal),
    findall(S-C, candidate(WithProperties, S, C), Pairs),
    keysort(Pairs, Ascending), reverse(Ascending, Ordered),
    unique_sops(Ordered, [], 12, Head),
    findall(Key-C, (member(_-C,Ordered),get_dict(binding,C,Key)), Tagged),
    keysort(Tagged, ByBinding), group_pairs_by_key(ByBinding, Groups),
    findall(C, member(_-[C|_],Groups), Reps),
    append(Head,Reps,Combined), maplist(clean_candidate,Combined,Clean),
    list_to_set(Clean, Answers).

comparative_order(Q, Sop) :-
    get_dict(ordering,Q,Plan),
    member(Command,Plan.commands),
    From is Command.start+1, End=Plan.end,
    once((member([From,To,Scale,First],Plan.extremes), memberchk(To,Plan.separators),
      SecondAt is To+1, member([SecondAt,End,Scale,Second],Plan.extremes),
      opposite_extremes(First,Second))),
    ordering_words(Q,Command.predicate,Predicate),
    ordering_words(Q,[Command.start,End],Order),
    ordering_object(Q,Command.object,Refers,Lookup),
    format(string(Sop),'@r w.request.request act=~s mode=~s mood=do predicate=~s~s~n@r.order w.request.constraint request=$r on=manner value=~s words=~s phase=result~s',
           [Command.act,Command.mode,Predicate,Refers,Order,Order,Lookup]).

opposite_extremes("up","down").
opposite_extremes("down","up").

ordering_words(Q, Range, Encoded) :-
    offsets(Q.tokens,Range,Start,End), span(Q.text,Start,End,Words), encode(Words,Encoded).

ordering_object(_, [At,At], "", "") :- !.
ordering_object(Q, Range, " refers=thing", Lookup) :-
    ordering_words(Q,Range,Words),
    format(string(Lookup),'~n@r.ref w.request.lookup request=$r key=thing words=~s',[Words]).

relative_placement(Q, _{sop:Sop,hasSource:HasSource}) :-
    get_dict(relativePlacement,Q,Plan),
    relative_placement_roles(Q.tokens,Plan,Name,Subject,Predicate,PlaceAt), PlaceAt<Plan.end,
    offsets(Q.tokens,Subject,SubjectStart,SubjectEnd),
    offsets(Q.tokens,Predicate,PredicateStart,PredicateEnd),
    placement_endpoints(Q,Plan,Name,PlaceAt,PlaceStart-PlaceEnd,Source),
    span(Q.text,SubjectStart,SubjectEnd,SubjectWords), encode(SubjectWords,Ref),
    span(Q.text,PredicateStart,PredicateEnd,PredicateWords), encode(PredicateWords,Verb),
    span(Q.text,PlaceStart,PlaceEnd,PlaceWords), encode(PlaceWords,Place), encode(Name,Act),
    format(string(Base),'@r w.request.request act=~s mood=do refers=thing predicate=~s~n@r.ref w.request.lookup request=$r key=thing words=~s~n@r.destination w.request.intent request=$r role=destination value=~s words=~s',
           [Act,Verb,Ref,Place,Place]),
    placement_source_evidence(Q,Source,Base,Sop,HasSource).

relative_placement_roles(Tokens, Plan, Act, [0,At], [At,End], End) :-
    member(Subject,Plan.subjects), member(Frame,Plan.frames), Act=Frame.act,
    member(Predicate,Frame.predicates), append(Subject,Predicate,Prefix),
    same_token_prefix(Prefix,Tokens), length(Subject,At), length(Prefix,End).
relative_placement_roles(Tokens, Plan, Act, [At,End], [0,At], End) :-
    member(Command,Plan.commands), Act=Command.act, Predicate=Command.predicate,
    member(Object,Plan.objects), append(Predicate,Object,Prefix),
    same_token_prefix(Prefix,Tokens), length(Predicate,At), length(Prefix,End).

placement_endpoints(Q, Plan, Act, At, Start-End, none) :-
    offsets(Q.tokens,[At,Plan.end],Start,End),
    once(relative_destination(Q,Plan,Act,At,Start,End)).
placement_endpoints(Q, Plan, Act, At, Place, Source) :-
    offsets(Q.tokens,[At,Plan.end],Start,End),
    once((member([A,B,["marker",Act,"source"|_],_],Q.hits), A>=Start, B<End)),
    findall(Destination-Origin, placement_pair(Q,Plan,Act,At,Start,End,Destination,Origin), Raw),
    sort(Raw,[Place-Source]).

placement_pair(Q, Plan, Act, At, Start, End, PlaceStart-End, Start-SourceEnd) :-
    Between is At+1, Last is Plan.end-1, between(Between,Last,PlaceAt),
    offsets(Q.tokens,[PlaceAt,Plan.end],PlaceStart,End),
    offsets(Q.tokens,[At,PlaceAt],Start,SourceEnd),
    placement_origin(Q,Act,Start,SourceEnd,before), relative_destination(Q,Plan,Act,PlaceAt,PlaceStart,End).
placement_pair(Q, Plan, Act, At, Start, End, Start-PlaceEnd, SourceStart-End) :-
    Between is At+1, Last is Plan.end-1, between(Between,Last,SourceAt),
    offsets(Q.tokens,[SourceAt,Plan.end],SourceStart,End),
    offsets(Q.tokens,[At,SourceAt],Start,PlaceEnd),
    placement_origin(Q,Act,SourceStart,End,after), relative_destination(Q,Plan,Act,At,Start,PlaceEnd).

placement_origin(Q, Act, Start, End, Order) :-
    member([Start,MarkerEnd,["marker",Act,"source"|_],_],Q.hits), MarkerEnd<End,
    ( relative_anchor(Q,Act,Start,MarkerEnd,End)
    ; Order==before, once((member([_,_,Anchor,_],Q.tokens), Anchor>=MarkerEnd)),
      member([Anchor,DetEnd,_],Q.determiners), DetEnd<End ),
    \+ ( member([A,B,["marker",Act,"source"|_],_],Q.hits), A>=MarkerEnd, B<End ).

placement_source_evidence(_,none,Sop,Sop,false).
placement_source_evidence(Q,Start-End,Base,Sop,true) :-
    span(Q.text,Start,End,SourceWords), encode(SourceWords,Source),
    format(string(Sop),'~s~n@r.source w.request.unread request=$r text=~s note="placement source"',[Base,Source]).

relative_destination(Q, Plan, _, At, Start, End) :-
    member([At,Stop],Plan.regionRanges), offsets(Q.tokens,[At,Stop],Start,End).
relative_destination(Q, Plan, Act, _, Start, End) :-
    member([Start,MarkerEnd,["marker",Act,"place",Relation,_],_],Q.hits),
    Relation\=="", MarkerEnd<End,
    once((member([_,_,Anchor,_],Q.tokens), Anchor>=MarkerEnd)), \+ memberchk(Anchor,Plan.temporalStarts),
    relative_anchor(Q,Act,Start,MarkerEnd,End),
    \+ ( member([A,B,["marker",Act,"source"|_],_],Q.hits), A>=MarkerEnd, B<End ).

same_token_prefix([], _).
same_token_prefix([Key|Keys], [[Key,_,_,_]|Tokens]) :- same_token_prefix(Keys,Tokens).

relative_anchor(Q, Act, Start, MarkerEnd, End) :-
    once((append(_,AnchorTokens,Q.tokens), AnchorTokens=[[_,_,Anchor,_]|_], Anchor>=MarkerEnd)),
    ( member([Anchor,B,_,_],Q.referenceHits), relative_anchor_tail(Q,B,End)
    ; member(Reference,Q.relativePlacement.references), same_token_prefix(Reference,AnchorTokens),
      length(Reference,Width), offsets(AnchorTokens,[0,Width],_,B), relative_anchor_tail(Q,B,End)
    ; relative_title(AnchorTokens,End)
    ; ( member([A,B,["target",_,Family|_],_],Q.targetHits)
      ; member([A,B,["target",_,Family|_],_],Q.frameTargets) ),
      A>=Anchor, B=<End, native_nominal_prefix(Q,Act,Family,Anchor,A), relative_anchor_tail(Q,B,End)
    ; span(Q.text,Start,MarkerEnd,Marker), sub_string(Marker,_,1,_," "),
      member([Anchor,DetEnd,_],Q.determiners), DetEnd<End ).

relative_anchor_tail(_, End, End).
relative_anchor_tail(Q, Head, End) :-
    Head<End, once((member([_,_,At,_],Q.tokens), At>=Head)),
    member([At,MarkerEnd,["marker","*","spatial",Relation,_],_],Q.hits), Relation\=="", MarkerEnd<End.

relative_title([[_,Raw,_,Stop]|Rest], End) :-
    string_chars(Raw,[First|_]), char_type(First,upper),
    ( Stop=:=End ; Stop<End, relative_title(Rest,End) ).

% Inventory vocabulary contributes only to the argument proved by a native
% frame. Keep that path outside the bounded ordinary lexical search.
frame_target_candidate(Q, Proofs, Clean) :-
    frame_target_context(Q,Proofs,Proof,FrameQ), Act=Proof.act,
    offsets(Q.tokens,Proof.predicate,PS,PE),
    member(Argument,Proof.roles), offsets(Q.tokens,Argument.range,First,End),
    member([Start,End,Entry,Role],Q.frameTargets), Role=Argument.role,
    Entry=["target",Act,Family|_], Start>=First, native_nominal_prefix(FrameQ,Act,Family,First,Start),
    ( get_dict(frameFamilies,FrameQ,Families) -> memberchk(Family,Families) ; true ),
    Head=[PS,PE,["act",Act,"do",0],0],
    Hit=[Start,End,Entry,0],
    Scoped=FrameQ.put(_{actHits:[Head],targetHits:[Hit|FrameQ.targetHits],requiredTarget:Hit}),
    lexical_candidate(Scoped,_,Candidate), clean_candidate(Candidate,Clean).

frame_target_context(Q, Proofs, Proof, Q) :- member(Proof,Proofs).
frame_target_context(Q, _, Proof, Scoped) :-
    member(Plan,Q.sourceFrames), frame_proofs(Plan.language,Proofs), member(Proof,Proofs),
    memberchk(Proof.act,Plan.acts),
    Scoped=Q.put(_{scopes:[[0,Plan.boundary,"action",""]],frameFamilies:Plan.families}).

split_target_candidate(Q, Clean) :-
    member(Plan,Q.splitPlans), member(Act,Plan.acts),
    member([Start,End,Entry],Q.splitNominals),
    Entry=["target",Act,Family,"existing"|_], End=:=Plan.nounEnd,
    Start>=Plan.nounStart,
    Head=[Plan.start,Plan.headEnd,["act",Act,"do",0],0],
    Hit=[Start,End,Entry,0],
    Scope=Q.put(_{actHits:[Head],targetHits:[Hit|Q.targetHits],requiredTarget:Hit,
                  groundedPredicates:[],scopes:[[Plan.start,Plan.particleStart,"action",""]],
                  splitPredicate:Plan}),
    native_nominal_prefix(Scope,Act,Family,Plan.nounStart,Start),
    lexical_candidate(Scope,_,Candidate), clean_candidate(Candidate,Base),
    findall(Filler,(nth1(I,Plan.fillers,Words), encode(Words,Encoded),
      format(string(Filler),'@r1.f~d w.request.filler text=~s',[I,Encoded])),Fillers),
    ( once((member([A,B],Q.splitNumbers), A>=Plan.nounStart, B=<Start)) -> NeedsNumber=true ; NeedsNumber=false ),
    atomics_to_string([Base.sop|Fillers],"\n",Sop), Clean=Base.put(_{sop:Sop,needsNumber:NeedsNumber}).

clean_candidate(C, Clean) :- (del_dict(binding,C,_,Clean) -> true ; Clean=C).

% A separated object span can guide search before the bounded candidate list
% is formed. A one-argument frame spanning the entire tail adds no preference.
target_scope(Tokens,TargetRoles,Proof,[Act,PS,PE,Start,End]) :-
    Proof.roles=[_,_|_], member(R,Proof.roles), memberchk(R.role,TargetRoles),
    offsets(Tokens,Proof.predicate,PS,PE), offsets(Tokens,R.range,Start,End), Act=Proof.act.

offsets(Tokens,[First,After],Start,End) :-
    Last is After-1, nth0(First,Tokens,[_,_,Start,_]), nth0(Last,Tokens,[_,_,_,End]).

scope_fit(Scopes,Act,PS,PE,S,E,Bonus) :-
    ( member([Act,PS,PE,_,_],Scopes),
      \+ (member([Act,PS,PE,A,B],Scopes), (S<A ; E>B)) -> Bonus=2
    ; Bonus=0 ).

unique_sops([], _, _, []).
unique_sops([_|_], _, 0, []) :- !.
unique_sops([_-C|Rest], Seen, N, Answers) :-
    ( memberchk(C.sop, Seen) -> unique_sops(Rest, Seen, N, Answers)
    ; Answers = [C|Tail], Next is N-1, unique_sops(Rest, [C.sop|Seen], Next, Tail) ).

candidate(Q, Score, Candidate) :- lexical_candidate(Q, Score, Candidate).

lexical_candidate(Q, score(Tier, Score, 0), Candidate) :-
    member([Start,End,["act",Act,Mood,N],ActPrior], Q.actHits),
    predicate_admitted(Q, Start, End, Act),
    request_window(Q,Start-End,Act,WindowStart-WindowEnd,Intent,Question),
    Scoped = Q.put(scopeEnd,WindowEnd),
    predicate_evidence(Q,Start,End,Predicate,ExtraBounds),
    encode(Act, A), encode(Predicate, P),
    ( Mood == "" -> M = "" ; format(string(M), ' mood=~s', [Mood]) ),
    ( Question == "" -> Query = "" ; format(string(Query),' question=~s',[Question]) ),
    format(string(Req), '@r1 w.request.request act=~s~s predicate=~s~s', [A,M,P,Query]),
    ( ( get_dict(requiredTarget,Q,Hit) -> true ; member(Hit,Q.targetHits) ),
      Hit = [S,E,["target",Licence,Family,Declared,Sort,K],_],
      (Licence == "*" -> true ; Licence == Act),
      S >= WindowStart, E =< WindowEnd,
      target_mode(Declared,Act,Mode),
      span(Q.text, S, E, Surface),
      target_determiner(Q,Act,Family,S,Start-End,DetStart-Det),
      direct_target(Q, Act, Start-End, S-E, DetStart),
      target(Family, Mode, Sort, Surface, Det, T),
      attached_roles(Scoped, Act, Family, Mode, E, Attached, AttachmentBounds, Blocked, AttachmentFit, FirstConstraint),
      constraint_wires(Q, Act, Family, Mode, Intent, WindowStart-WindowEnd, Start-End, S-E, Blocked, FirstConstraint, More, Covered, Tier),
      role_fit(Q, Act, Start-End, Mode, Det, E, Covered, RoleFit),
      determiner_bounds(Q, DetStart, S, Det, DetBounds),
      append([Start-End,S-E|AttachmentBounds], Covered, BoundEvidence),
      append(DetBounds, BoundEvidence, Bounds),
      append([Req,T|Attached], More, Wires),
      length(More, Evidence), Gap is max(0,max(S-End,Start-E)),
      scope_fit(Q.roleScopes,Act,Start,End,S,E,ScopeFit),
      Extra is 5 + Evidence + RoleFit + AttachmentFit + ScopeFit + log(1+K)/2 - log(1+Gap)/2
    ; \+ get_dict(requiredTarget,Q,_), direct_reference(Q,Act,End,RS-RE), RE =< WindowEnd,
      format(string(ReferenceRequest),'~s refers=thing',[Req]),
      span(Q.text, RS, RE, Reference), encode(Reference, RefWords),
      format(string(ReferenceLookup),'@r1.ref w.request.lookup request=$r1 key=thing words=~s',[RefWords]),
      attached_roles(Scoped,Act,none,"existing",RE,Attached,Used,_,Fit,_),
      Bounds = [Start-End,RS-RE|Used], Wires = [ReferenceRequest,ReferenceLookup|Attached], Extra is 4 + Fit, Tier=1
    ; \+ get_dict(requiredTarget,Q,_), Bounds = [Start-End], Wires = [Req], Extra = 0, Tier=1 ),
    append(Bounds,ExtraBounds,CompleteBounds), sort(CompleteBounds, Sorted), string_length(Q.text, Length),
    residuals(Sorted, Q.text, 0, Length, 1, Unread),
    append(Wires, Unread, All), atomics_to_string(All, "\n", Sop),
    findall(1,(member([_,_,B,F],Q.tokens), once((member(L-R,Sorted),B>=L,F=<R))),CoveredTokens),
    length(CoveredTokens,Grounded), length(Q.tokens,Total), Coverage is Grounded / max(1,Total),
    Base=_{sop:Sop,source:lexicon,support:N},
    ( nonvar(Family), memberchk([S,E,Families],Q.ambiguousTargets), memberchk(Family,Families)
    -> Candidate=Base.put(binding,[Start,End,Act,S,E,Family]) ; Candidate=Base ),
    Score is 12*Coverage + Extra + ActPrior + log(1+N) + min(12,End-Start)/4 - Start/3.

predicate_evidence(Q, Start, End, Predicate, Bounds) :-
    ( get_dict(splitPredicate,Q,Plan) ->
        span(Q.text,Start,Plan.end,Predicate), string_length(Q.text,Length),
        Bounds=[0-Start,Plan.particleStart-Length]
    ; span(Q.text,Start,End,Predicate), Bounds=[] ).

% Preserve the whole proved predicate, including fixed multiword verbs.
% Other independently proved spans and declared senses outside it still compete.
predicate_admitted(Q, Start, End, Act) :-
    ( Q.groundedPredicates == [] -> true
    ; memberchk([Start,End,Grounded], Q.groundedPredicates) -> Act == Grounded
    ; \+ ( member([Left,Right,_], Q.groundedPredicates), Start>=Left, End=<Right ),
      memberchk([Start,End,Declared,_], Q.declaredActs), memberchk(Act,Declared) ).

request_window(Q,S-E,Act,A-B,Intent,Question) :-
    ( get_dict(scopes,Q,Scopes) ->
        member([A,B,Intent,Question],Scopes), S >= A, E =< B,
        ( Intent == "question" -> Act == "ask" ; Intent == "removal" -> Act == "remove" ; true )
    ; A=0, string_length(Q.text,B), Intent="action", Question="" ).

constraint_wires(Q, Act, Family, Mode, Intent, A-B, PS-PE, TS-TE, Blocked, First, Wires, Bounds, Tier) :-
    ( Q.allowConstraints == true ->
      findall(priority(Len,N)-hit(S,E,PhaseBody),
              ( member([S,E,["constraint",Licence,Family,Body,N],_], Q.constraintHits),
                (Licence == "*" -> true ; Licence == Act),
                S >= A, E =< B,
                (S >= PE ; E =< PS), (S >= TE ; E =< TS),
                \+ (member(L-R,Blocked), S < R, E > L),
                ( is_list(Body) -> (Intent == "action" ; Intent == "proposal"), S >= TE, PhaseBody=Body
                ; (Intent == "question" ; Intent == "removal") -> set_phase(Body,"selector",Phased), PhaseBody=[Phased]
                ; constraint_phase(Q, Act, Family, Mode, TS-TE, S-E, Body, Phased), PhaseBody=[Phased] ),
                Len is E-S ), Records),
      sort(Records, Sorted), reverse(Sorted, Ranked),
      choose_constraints(Ranked, [], Selected), sort(Selected, Chronological),
      numbered_constraints(Chronological, First, Wires, Bounds),
      ( member(hit(_,_,[_,_|_]),Chronological) -> Tier=3.5 ; Tier=1 )
    ; Wires=[], Bounds=[], Tier=1 ).

choose_constraints([], Acc, Acc).
choose_constraints([_-hit(S,E,Body)|Rest], Acc, Out) :-
    ( member(hit(A,B,_),Acc), S < B, E > A -> Next=Acc
    ; Next=[hit(S,E,Body)|Acc] ),
    choose_constraints(Rest,Next,Out).

numbered_constraints([], _, [], []).
numbered_constraints([hit(S,E,Bodies)|Rest], N, Wires, [S-E|Spans]) :-
    numbered_bodies(Bodies,N,Wires,Lines,Next),
    numbered_constraints(Rest,Next,Lines,Spans).

numbered_bodies([], N, Lines, Lines, N).
numbered_bodies([Body|Bodies], N, [Line|Wires], Lines, Next) :-
    format(string(Line),'@r1.c~d w.request.constraint request=$r1 ~s',[N,Body]),
    Following is N+1,
    numbered_bodies(Bodies,Following,Wires,Lines,Next).

target_mode("auto","make","new") :- !.
target_mode("auto",_,"existing") :- !.
target_mode(Mode,_,Mode).

determiner_bounds(_, _, _, "", []) :- !.
determiner_bounds(Q, Start, Target, Det, [Start-End]) :-
    member([Start,End,Det],Q.determiners), End =< Target, !.

target(Family, Mode, Sort, Surface, Det, Wire) :-
    encode(Family, F), encode(Surface, S),
    ( Sort == "" -> format(string(T), 'family_words=~s', [S])
    ; encode(Sort, Kind),
      ( Sort == Surface -> format(string(T), 'sort=~s', [Kind])
      ; format(string(T), 'sort=~s sort_words=~s', [Kind,S]) ) ),
    ( Sort == "", Mode \== "new" ->
      Lookup = "\n@r1.l1 w.request.lookup request=$r1 target=$r1.t key=thing from=page"
    ; Lookup = "" ),
    ( Det == "" -> D = "" ; format(string(D),' determiner=~s',[Det]) ),
    ( Mode == "existing", Sort == "" -> Fill = " fill=context"
    ; Mode == "existing" -> Fill = " fill=description"
    ; Fill = "" ),
    format(string(Wire), '@r1.t w.request.target request=$r1 family=~s mode=~s~s~s ~s~s', [F,Mode,D,Fill,T,Lookup]).

span(Text, Start, End, Value) :- Length is End-Start, sub_string(Text, Start, Length, _, Value).
residuals([], Text, Start, End, N, Lines) :- unread(Text,Start,End,N,Lines).
residuals([S-E|Tail], Text, From, End, N, Lines) :-
    GapEnd is max(S,From), NextStart is max(E,From),
    unread(Text,From,GapEnd,N,Here), length(Here,K), Next is N+K,
    residuals(Tail,Text,NextStart,End,Next,Rest), append(Here,Rest,Lines).
unread(Text,S,E,N,Lines) :-
    span(Text,S,E,Raw), re_replace("^\\s+|\\s+$"/g, "", Raw, Trim),
    ( re_match("[\\p{L}\\p{N}]", Trim) ->
      encode(Trim,V), format(string(Line),'@r1.u~d w.request.unread request=$r1 text=~s',[N,V]), Lines=[Line]
    ; Lines=[] ).

safe_atom(Raw) :- re_match("^[\\p{L}\\p{N}_][\\p{L}\\p{N}_.-]*$",Raw).
encode(Raw,Value) :- ( safe_atom(Raw) -> Value=Raw ; json_string(Raw,Value) ).
json_string(Raw,Value) :- atom_json_term(Value, Raw, [as(string)]).
