:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(dependencies).
:- initialization(main,main).

main :-
    repeat,
    read_line_to_string(user_input, Line),
    ( Line == end_of_file -> !
    ; catch((atom_json_dict(Line, Packet, []),
             ( dependency_graph(Packet,Wires) -> Answer=_{wires:Wires}
             ; Answer=_{error:"Dependency projection failed"} )),
            Error,(message_to_string(Error,Message),Answer=_{error:Message})),
      json_write_dict(current_output,Answer,[width(0)]),
      nl, flush_output, fail ).
