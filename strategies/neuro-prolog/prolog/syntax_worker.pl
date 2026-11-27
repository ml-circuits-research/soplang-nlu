:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(syntax_projection).
:- initialization(main,main).

% One parse per line: the tokens of the dependency parser come in, the wires go out.
main :-
    repeat,
    read_line_to_string(user_input, Line),
    ( Line == end_of_file -> !
    ; catch(( atom_json_dict(Line, Packet, []),
              ( syntax_wires(Packet,Wires) -> Answer=_{wires:Wires}
              ; Answer=_{error:"The projection found no place for the words of the parse."} )),
            Error,( term_string(Error,Text), Answer=_{error:Text} )),
      json_write_dict(current_output,Answer,[width(0)]),
      nl, flush_output, fail ).
