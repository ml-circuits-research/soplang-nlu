:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(library(time)).
:- use_module(syntax).
:- initialization(main, main).

% One message per line: the tokens with their word classes come in, the wires go out.
main :-
    repeat,
    read_line_to_string(user_input, Line),
    ( Line == end_of_file -> !
    ; catch(answer(Line, Answer), Fatal, ( term_string(Fatal, Text), Answer = _{error:Text} )),
      json_write_dict(current_output, Answer, [width(0)]),
      nl, flush_output, fail ).

answer(Line, Answer) :-
    atom_json_dict(Line, Packet, []),
    catch(( call_with_time_limit(20, syntax_circuit(Packet, Wires)) -> Outcome = wires(Wires) ; Outcome = none ),
          Error, Outcome = error(Error)),
    ( Outcome = wires(Found) -> Answer = _{wires:Found}
    ; Outcome = none -> Answer = _{error:"The grammar found no reading."}
    ; Outcome = error(no_reading(Word)) -> format(string(Text), "No rule places the word \"~w\".", [Word]), Answer = _{error:Text}
    ; Outcome = error(time_limit_exceeded) -> Answer = _{error:"The grammar did not finish in time."}
    ; Outcome = error(Other), term_string(Other, Text), Answer = _{error:Text} ).
